from django.conf import settings
from django.db import models


class Movement(models.Model):
    product = models.ForeignKey("productos.Product", on_delete=models.PROTECT, related_name="movements")
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL)
    delta = models.IntegerField()
    balance = models.PositiveIntegerField()
    reason = models.CharField(max_length=200)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-pk"]
        constraints = [models.CheckConstraint(
            condition=~models.Q(delta=0), name="movement_nonzero_delta",
        )]
