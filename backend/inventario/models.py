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


class InventoryIncident(models.Model):
    class Kind(models.TextChoices):
        DAMAGED = "damaged", "Producto dañado"
        DISCREPANCY = "discrepancy", "Diferencia de inventario"
        LOST = "lost", "Producto extraviado"
        LOCATION = "location", "Ubicación incorrecta"
        OTHER = "other", "Otros problemas"

    class Status(models.TextChoices):
        OPEN = "open", "Abierta"
        REVIEW = "review", "En revisión"
        RESOLVED = "resolved", "Resuelta"

    reporter = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    product = models.ForeignKey("productos.Product", null=True, blank=True, on_delete=models.PROTECT)
    kind = models.CharField(max_length=15, choices=Kind.choices)
    description = models.CharField(max_length=500)
    status = models.CharField(max_length=8, choices=Status.choices, default=Status.OPEN)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        indexes = [models.Index(fields=["status", "-created_at"])]


class IncidentEvent(models.Model):
    incident = models.ForeignKey(InventoryIncident, related_name="history", on_delete=models.PROTECT)
    reviewer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    status = models.CharField(max_length=8, choices=InventoryIncident.Status.choices)
    note = models.CharField(max_length=500)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at", "pk"]
