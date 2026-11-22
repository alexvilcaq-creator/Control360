from django.conf import settings
from django.db import models
from django.utils import timezone


class Worker(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="worker")
    document = models.CharField(max_length=35, unique=True)
    position = models.CharField(max_length=120)
    joined_on = models.DateField(default=timezone.localdate)
    ended_on = models.DateField(null=True, blank=True)

    class Meta:
        constraints = [models.CheckConstraint(
            condition=models.Q(ended_on__isnull=True) | models.Q(ended_on__gte=models.F("joined_on")),
            name="worker_employment_dates",
        )]

    def employed_on(self, date):
        return self.joined_on <= date and (self.ended_on is None or date <= self.ended_on)

    def __str__(self):
        return self.user.get_full_name() or self.user.username
