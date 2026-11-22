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
