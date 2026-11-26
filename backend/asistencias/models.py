from django.db import models


def weekdays():
    return [0, 1, 2, 3, 4]


class Shift(models.Model):
    name = models.CharField(max_length=100, unique=True)
    starts_at = models.TimeField()
    ends_at = models.TimeField()
    workdays = models.JSONField(default=weekdays)
    grace_minutes = models.PositiveSmallIntegerField(default=5)
    overtime_minimum = models.PositiveSmallIntegerField(default=15)

    class Meta:
        constraints = [
            models.CheckConstraint(condition=~models.Q(starts_at=models.F("ends_at")),
                                   name="shift_different_start_end"),
        ]

    def __str__(self):
        return self.name


class Schedule(models.Model):
    worker = models.ForeignKey("trabajadores.Worker", related_name="schedules", on_delete=models.PROTECT)
    shift = models.ForeignKey(Shift, on_delete=models.PROTECT, related_name="schedules")
    effective_from = models.DateField()

    class Meta:
        ordering = ["-effective_from", "-pk"]
        constraints = [models.UniqueConstraint(fields=["worker", "effective_from"],
                                               name="worker_unique_schedule_date")]


class Attendance(models.Model):
    worker = models.ForeignKey("trabajadores.Worker", on_delete=models.PROTECT, related_name="attendance")
    schedule = models.ForeignKey(Schedule, on_delete=models.PROTECT)
    date = models.DateField(db_index=True)
    expected_in = models.DateTimeField()
    expected_out = models.DateTimeField()
    clock_in = models.DateTimeField()
    clock_out = models.DateTimeField(null=True, blank=True)
    late_minutes = models.PositiveIntegerField(default=0)
    extra_minutes = models.PositiveIntegerField(default=0)
    approved_overtime = models.PositiveIntegerField(default=0)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["worker", "date"], name="worker_unique_attendance_date"),
            models.CheckConstraint(condition=models.Q(approved_overtime__lte=models.F("extra_minutes")),
                                   name="approved_within_extra"),
            models.CheckConstraint(condition=models.Q(clock_out__isnull=True) |
                                   models.Q(clock_out__gte=models.F("clock_in")), name="attendance_clock_order"),
        ]


class AttendanceRequest(models.Model):
    class Action(models.TextChoices):
        IN = "in", "Entrada"
        OUT = "out", "Salida"

    class Status(models.TextChoices):
        PENDING = "pending", "Pendiente"
        APPROVED = "approved", "Aprobada"
        REJECTED = "rejected", "Rechazada"

    worker = models.ForeignKey("trabajadores.Worker", on_delete=models.PROTECT, related_name="punch_requests")
    schedule = models.ForeignKey(Schedule, on_delete=models.PROTECT)
    attendance = models.ForeignKey(Attendance, null=True, blank=True, on_delete=models.PROTECT)
    date = models.DateField()
    action = models.CharField(max_length=3, choices=Action.choices)
    status = models.CharField(max_length=8, choices=Status.choices, default=Status.PENDING)
    requested_at = models.DateTimeField()
    decided_at = models.DateTimeField(null=True, blank=True)
    reviewed_by = models.ForeignKey("accounts.User", null=True, blank=True, on_delete=models.PROTECT)
    note = models.CharField(max_length=500, blank=True)

    class Meta:
        indexes = [models.Index(fields=["worker", "status"]), models.Index(fields=["status", "-requested_at"])]


class AttendanceCorrection(models.Model):
    attendance = models.ForeignKey(Attendance, related_name="corrections", on_delete=models.PROTECT)
    actor = models.ForeignKey("accounts.User", on_delete=models.PROTECT)
    reason = models.CharField(max_length=500)
    before = models.JSONField()
    after = models.JSONField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-pk"]
