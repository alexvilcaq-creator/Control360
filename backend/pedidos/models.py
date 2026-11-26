from django.conf import settings
from django.db import models


class Order(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "Pendiente"
        ACCEPTED = "accepted", "Aceptado"
        PREPARING = "preparing", "En preparación"
        READY = "ready", "Listo para entregar"
        DELIVERED = "delivered", "Entregado"
        CANCELLED = "cancelled", "Cancelado"

    customer = models.ForeignKey("clientes.Customer", on_delete=models.PROTECT)
    seller = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="orders_sold")
    assignee = models.ForeignKey("trabajadores.Worker", null=True, blank=True,
                                 on_delete=models.PROTECT, related_name="orders_assigned")
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.PENDING)
    request_key = models.UUIDField(null=True, blank=True, editable=False)
    total = models.DecimalField(max_digits=22, decimal_places=2)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [models.Index(fields=["status", "-created_at"])]
        constraints = [
            models.UniqueConstraint(fields=["seller", "request_key"], name="seller_unique_order_request"),
            models.CheckConstraint(condition=models.Q(total__gte=0), name="order_nonnegative_total"),
            models.CheckConstraint(
                condition=(
                    models.Q(status="pending", assignee__isnull=True) |
                    models.Q(status__in=["accepted", "preparing", "ready", "delivered"], assignee__isnull=False) |
                    models.Q(status="cancelled")
                ), name="order_status_assignment",
            ),
        ]

    def __str__(self):
        return f"Pedido #{self.pk}"


class OrderItem(models.Model):
    order = models.ForeignKey(Order, related_name="items", on_delete=models.PROTECT)
    product = models.ForeignKey("productos.Product", on_delete=models.PROTECT)
    sku = models.CharField(max_length=50)
    name = models.CharField(max_length=160)
    quantity = models.PositiveIntegerField()
    unit_price = models.DecimalField(max_digits=12, decimal_places=2)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["order", "product"], name="unique_order_product"),
            models.CheckConstraint(condition=models.Q(quantity__gt=0, unit_price__gte=0),
                                   name="order_item_quantity_price"),
        ]


class OrderEvent(models.Model):
    order = models.ForeignKey(Order, related_name="history", on_delete=models.PROTECT)
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    previous = models.CharField(max_length=12, choices=Order.Status.choices, blank=True)
    status = models.CharField(max_length=12, choices=Order.Status.choices)
    note = models.CharField(max_length=200, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at", "pk"]


class Payment(models.Model):
    class Method(models.TextChoices):
        CASH = "cash", "Efectivo"
        CARD = "card", "Tarjeta"
        YAPE = "yape", "Yape"
        PLIN = "plin", "Plin"

    class Status(models.TextChoices):
        PAID = "paid", "Pagado"
        VOIDED = "voided", "Anulado"

    order = models.OneToOneField(Order, related_name="payment", on_delete=models.PROTECT)
    cashier = models.ForeignKey(settings.AUTH_USER_MODEL, related_name="payments_received", on_delete=models.PROTECT)
    method = models.CharField(max_length=8, choices=Method.choices)
    status = models.CharField(max_length=8, choices=Status.choices, default=Status.PAID)
    amount = models.DecimalField(max_digits=22, decimal_places=2)
    cash_received = models.DecimalField(max_digits=22, decimal_places=2, null=True, blank=True)
    change = models.DecimalField(max_digits=22, decimal_places=2, null=True, blank=True)
    reference = models.CharField(max_length=60, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    voided_at = models.DateTimeField(null=True, blank=True)
    voided_by = models.ForeignKey(settings.AUTH_USER_MODEL, related_name="payments_voided",
                                  null=True, blank=True, on_delete=models.PROTECT)
    void_reason = models.CharField(max_length=250, blank=True)

    class Meta:
        constraints = [
            models.CheckConstraint(condition=models.Q(amount__gte=0), name="payment_nonnegative_amount"),
            models.CheckConstraint(condition=(
                models.Q(method="cash", cash_received__isnull=False, change__isnull=False,
                         cash_received__gte=models.F("amount"), change=models.F("cash_received") - models.F("amount")) |
                (models.Q(method__in=["card", "yape", "plin"], cash_received__isnull=True, change__isnull=True))
            ), name="payment_cash_breakdown"),
            models.CheckConstraint(condition=(
                models.Q(status="paid", voided_at__isnull=True, voided_by__isnull=True, void_reason="") |
                (models.Q(status="voided", voided_at__isnull=False, voided_by__isnull=False) & ~models.Q(void_reason=""))
            ), name="payment_void_audit"),
        ]
