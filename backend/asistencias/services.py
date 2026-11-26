from collections import defaultdict
from datetime import datetime, timedelta

from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError

from accounts.permissions import role_for
from config.api import Conflict
from notificaciones.services import notify
from trabajadores.models import Worker
from .models import Attendance, AttendanceCorrection, AttendanceRequest, Schedule

DAY = timedelta(days=1)


def scheduled_bounds(schedule, date):
    shift = schedule.shift
    end_date = date if shift.ends_at > shift.starts_at else date + DAY
    return (timezone.make_aware(datetime.combine(date, shift.starts_at)),
            timezone.make_aware(datetime.combine(end_date, shift.ends_at)))


def schedule_for(worker, date):
    return worker.schedules.filter(effective_from__lte=date).select_related("shift").first()


def _worker(user):
    worker = Worker.objects.select_for_update().filter(user=user).first()
    if worker is None:
        raise PermissionDenied("Tu cuenta necesita una ficha de trabajador y un turno asignado.")
    return worker


def _entry_plan(worker, now):
    if worker.attendance.filter(clock_out__isnull=True).exists():
        raise Conflict("Solicita la salida de tu jornada anterior.")
    date = now.date()
    yesterday = date - DAY
    previous = schedule_for(worker, yesterday)
    if previous and worker.employed_on(yesterday) and yesterday.weekday() in previous.shift.workdays:
        start, end = scheduled_bounds(previous, yesterday)
        if start <= now < end and end.date() == date:
            date = yesterday
    schedule = schedule_for(worker, date)
    if not worker.employed_on(date) or not schedule or date.weekday() not in schedule.shift.workdays:
        raise Conflict("No tienes un turno asignado para esta fecha.")
    if worker.attendance.filter(date=date).exists():
        raise Conflict("La entrada para este turno ya está registrada.")
    return date, schedule


def _open_entry(worker):
    entry = worker.attendance.filter(clock_out__isnull=True).order_by("-date").first()
    if not entry:
        raise Conflict("No tienes una entrada aprobada pendiente de salida.")
    return entry


def _late_minutes(clock_in, expected_in, grace):
    delay = max(0, int((clock_in - expected_in).total_seconds() // 60))
    return delay if delay > grace else 0


def _extra_minutes(clock_in, clock_out, expected_out):
    if clock_out is None:
        return 0
    return max(0, int((clock_out - max(expected_out, clock_in)).total_seconds() // 60))


def _record_entry(worker, date, schedule, now):
    start, end = scheduled_bounds(schedule, date)
    return Attendance.objects.create(
        worker=worker, schedule=schedule, date=date, expected_in=start, expected_out=end, clock_in=now,
        late_minutes=_late_minutes(now, start, schedule.shift.grace_minutes),
    )


def _record_exit(entry, now):
    if now < entry.clock_in:
        raise Conflict("La salida solicitada quedó antes de la entrada corregida.")
    entry.clock_out = now
    entry.extra_minutes = _extra_minutes(entry.clock_in, now, entry.expected_out)
    entry.save(update_fields=["clock_out", "extra_minutes"])
    return entry


@transaction.atomic
def clock(user, action, *, now=None):
    """Registra datos históricos de demostración; la API usa solicitudes."""
    now = timezone.localtime(now or timezone.now())
    worker = _worker(user)
    if action == "out":
        return _record_exit(_open_entry(worker), now)
    date, schedule = _entry_plan(worker, now)
    return _record_entry(worker, date, schedule, now)


def attendance_state(worker):
    now = timezone.localtime()
    opened = worker.attendance.filter(clock_out__isnull=True).select_related("schedule__shift").first()
    pending = worker.punch_requests.filter(status=AttendanceRequest.Status.PENDING).exists()
    date, plan = (opened.date, opened.schedule) if opened else (now.date(), None)
    can_request = bool(opened)
    if not opened:
        try:
            date, plan = _entry_plan(worker, now)
            can_request = True
        except Conflict:
            plan = schedule_for(worker, date) if worker.employed_on(date) else None
    details = None
    if plan:
        shift = plan.shift
        details = {"name": shift.name, "starts_at": shift.starts_at, "ends_at": shift.ends_at,
                   "workdays": shift.workdays, "working_today": date.weekday() in shift.workdays}
    return {"linked": True, "schedule": details, "open": bool(opened), "pending": pending,
            "can_request": can_request and not pending}


@transaction.atomic
def request_punch(user, action):
    worker = _worker(user)
    if worker.punch_requests.filter(status=AttendanceRequest.Status.PENDING).exists():
        raise Conflict("Ya tienes una solicitud pendiente de revisión.")
    now = timezone.localtime()
    entry = _open_entry(worker) if action == AttendanceRequest.Action.OUT else None
    date, schedule = (entry.date, entry.schedule) if entry else _entry_plan(worker, now)
    punch = AttendanceRequest.objects.create(worker=worker, schedule=schedule, attendance=entry,
                                             date=date, action=action, requested_at=now)
    notify("attendance_requested", f"{str(worker)[:140]} solicitó su {punch.get_action_display().lower()}.", roles=["admin"])
    return punch


@transaction.atomic
def decide_punch(punch, actor, decision, note):
    worker = Worker.objects.select_for_update().get(pk=punch.worker_id)
    if role_for(actor) != "admin" or actor.pk == worker.user_id:
        raise PermissionDenied("Solo otro administrador puede revisar esta solicitud.")
    punch = AttendanceRequest.objects.select_for_update().select_related("schedule__shift").get(pk=punch.pk)
    if punch.status != AttendanceRequest.Status.PENDING:
        raise Conflict("Esta solicitud ya fue revisada.")
    if decision == "approved":
        if punch.action == AttendanceRequest.Action.IN:
            if worker.attendance.filter(Q(date=punch.date) | Q(clock_out__isnull=True)).exists():
                raise Conflict("Ya existe una marcación confirmada para esa jornada.")
            punch.attendance = _record_entry(worker, punch.date, punch.schedule, punch.requested_at)
        else:
            entry = worker.attendance.filter(pk=punch.attendance_id, clock_out__isnull=True).first()
            if not entry:
                raise Conflict("La jornada se cerró antes de aprobar esta solicitud.")
            _record_exit(entry, punch.requested_at)
    punch.status = decision
    punch.note = note
    punch.decided_at = timezone.now()
    punch.reviewed_by = actor
    punch.save(update_fields=["status", "note", "decided_at", "reviewed_by", "attendance"])
    notify(f"attendance_{decision}", f"Tu solicitud de {punch.get_action_display().lower()} fue {punch.get_status_display().lower()}.",
           user_ids=[worker.user_id])
    return punch


def _attendance_snapshot(entry):
    return {
        "clock_in": entry.clock_in.isoformat(),
        "clock_out": entry.clock_out.isoformat() if entry.clock_out else None,
        "late_minutes": entry.late_minutes,
        "extra_minutes": entry.extra_minutes,
        "approved_overtime": entry.approved_overtime,
    }


@transaction.atomic
def correct_attendance(entry, actor, clock_in, clock_out, reason):
    worker = Worker.objects.select_for_update().get(pk=entry.worker_id)
    if role_for(actor) != "admin" or actor.pk == worker.user_id:
        raise PermissionDenied()
    entry = worker.attendance.select_for_update().select_related("schedule__shift").get(pk=entry.pk)
    in_shift_day = timezone.localdate(clock_in) == entry.date
    overnight = entry.date < timezone.localdate(clock_in) and clock_in < entry.expected_out
    if not (in_shift_day or overnight):
        raise ValidationError("La entrada debe pertenecer a la jornada que estás corrigiendo.")
    now = timezone.now()
    if clock_in > now or (clock_out and (clock_out < clock_in or clock_out > now)):
        raise ValidationError("Las horas deben estar en orden y corresponder a marcaciones pasadas.")
    conflicts = worker.attendance.exclude(pk=entry.pk).filter(Q(clock_out__isnull=True) | Q(clock_out__gt=clock_in))
    if clock_out:
        conflicts = conflicts.filter(clock_in__lt=clock_out)
    if conflicts.exists():
        raise Conflict("La corrección se superpone con otra jornada.")
    before = _attendance_snapshot(entry)
    entry.clock_in, entry.clock_out = clock_in, clock_out
    shift = entry.schedule.shift
    entry.late_minutes = _late_minutes(clock_in, entry.expected_in, shift.grace_minutes)
    entry.extra_minutes = _extra_minutes(clock_in, clock_out, entry.expected_out)
    overtime = min(entry.approved_overtime, entry.extra_minutes)
    entry.approved_overtime = overtime if overtime >= shift.overtime_minimum else 0
    after = _attendance_snapshot(entry)
    if before == after:
        raise ValidationError("Indica al menos una marcación distinta para corregir.")
    entry.save(update_fields=after.keys())
    AttendanceCorrection.objects.create(attendance=entry, actor=actor, before=before, after=after, reason=reason)
    notify("attendance_corrected", f"Administración corrigió tu asistencia del {entry.date}.", user_ids=[worker.user_id])
    return entry


@transaction.atomic
def approve(attendance_id, minutes):
    entry = Attendance.objects.select_for_update().select_related("schedule__shift").get(pk=attendance_id)
    if not entry.clock_out:
        raise Conflict("Cierra la asistencia antes de aprobar horas extras.")
    if minutes > entry.extra_minutes or (minutes and minutes < entry.schedule.shift.overtime_minimum):
        raise Conflict("La aprobación debe respetar el mínimo del turno y el tiempo adicional registrado.")
    entry.approved_overtime = minutes
    entry.save(update_fields=["approved_overtime"])
    return entry


def attendance_period(workers, start, end, *, now=None):
    """Combina marcaciones reales y faltas calculadas con la programación histórica."""
    now = now or timezone.now()
    workers = list(workers)
    ids = [worker.pk for worker in workers]
    existing = {(row.worker_id, row.date): row for row in Attendance.objects.filter(
        worker_id__in=ids, date__range=(start, end),
    ).select_related("schedule__shift", "worker__user")}
    schedules = defaultdict(list)
    for schedule in Schedule.objects.filter(worker_id__in=ids, effective_from__lte=end).select_related(
        "shift"
    ).order_by("effective_from"):
        schedules[schedule.worker_id].append(schedule)
    for worker in workers:
        changes = iter(schedules[worker.pk])
        upcoming = next(changes, None)
        active = None
        date = start
        while date <= end:
            while upcoming and upcoming.effective_from <= date:
                active, upcoming = upcoming, next(changes, None)
            record = existing.get((worker.pk, date))
            if record:
                yield worker, date, record, None
            elif active and worker.employed_on(date) and date.weekday() in active.shift.workdays:
                _, expected_out = scheduled_bounds(active, date)
                if expected_out <= now:
                    yield worker, date, None, active
            date += DAY


def employed_workers(start, end):
    return Worker.objects.filter(joined_on__lte=end).filter(
        Q(ended_on__isnull=True) | Q(ended_on__gte=start)
    ).select_related("user").order_by("id")
