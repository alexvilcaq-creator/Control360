from collections import defaultdict
from datetime import datetime, timedelta

from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied

from config.api import Conflict
from trabajadores.models import Worker
from .models import Attendance, Schedule

DAY = timedelta(days=1)


def scheduled_bounds(schedule, date):
    shift = schedule.shift
    end_date = date if shift.ends_at > shift.starts_at else date + DAY
    return (timezone.make_aware(datetime.combine(date, shift.starts_at)),
            timezone.make_aware(datetime.combine(end_date, shift.ends_at)))


def schedule_for(worker, date):
    return worker.schedules.filter(effective_from__lte=date).select_related("shift").first()


@transaction.atomic
def clock(user, action, *, now=None):
    now = timezone.localtime(now or timezone.now())
    date = now.date()
    worker = Worker.objects.select_for_update().filter(user=user).first()
    if worker is None:
        raise PermissionDenied("Tu cuenta necesita un perfil de almacén asociado.")
    opened = worker.attendance.filter(clock_out__isnull=True).order_by("-date").first()
    if action == "out":
        if not opened:
            raise Conflict("No tienes una entrada abierta.")
        opened.extra_minutes = max(0, int((now - max(opened.expected_out, opened.clock_in)).total_seconds() // 60))
        opened.clock_out = now
        opened.save(update_fields=["clock_out", "extra_minutes"])
        return opened
    if opened:
        raise Conflict("Registra la salida de tu jornada anterior.")
    # Una entrada tras medianoche puede pertenecer al turno nocturno del día anterior.
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
    start, end = scheduled_bounds(schedule, date)
    delay = max(0, int((now - start).total_seconds() // 60))
    late = delay if delay > schedule.shift.grace_minutes else 0
    return Attendance.objects.create(worker=worker, schedule=schedule, date=date, expected_in=start,
                                     expected_out=end, clock_in=now, late_minutes=late)


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
