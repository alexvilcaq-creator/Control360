from django.conf import settings
from django.db import models


class Notification(models.Model):
    recipient = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    kind = models.CharField(max_length=30)
    message = models.CharField(max_length=240)
    order = models.ForeignKey("pedidos.Order", null=True, blank=True, on_delete=models.SET_NULL)
    product = models.ForeignKey("productos.Product", null=True, blank=True, on_delete=models.SET_NULL)
    created_at = models.DateTimeField(auto_now_add=True)
    read_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [models.Index(fields=["recipient", "read_at", "-created_at"])]
