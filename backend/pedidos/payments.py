from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError

from accounts.permissions import role_for
from config.api import Conflict
from .models import Order, Payment


@transaction.atomic
def register_payment(order, actor, method, cash_received=None, reference=""):
    order = Order.objects.select_for_update().get(pk=order.pk)
    role = role_for(actor)
    if role != "admin" and (role != "seller" or order.seller_id != actor.pk):
        raise PermissionDenied()
    existing = Payment.objects.filter(order=order).first()
    if existing:
        if (existing.method, existing.cash_received, existing.reference) == (method, cash_received, reference):
            return existing
        raise Conflict("El pedido ya tiene un cobro registrado con otros datos.")
    if order.status == Order.Status.CANCELLED:
        raise Conflict("El pedido está cancelado.")
    change = None
    if method == Payment.Method.CASH:
        if cash_received is None or cash_received < order.total:
            raise ValidationError({"cash_received": "El efectivo debe cubrir el total del pedido."})
        change = cash_received - order.total
    elif cash_received is not None:
        raise ValidationError({"cash_received": "Envía efectivo solo para un pago en efectivo."})
    return Payment.objects.create(order=order, cashier=actor, method=method, amount=order.total,
                                  cash_received=cash_received, change=change, reference=reference)


def void_order_payment(order, actor, reason):
    """El llamador debe mantener bloqueado el pedido durante la transacción."""
    payment = Payment.objects.filter(order=order, status=Payment.Status.PAID).first()
    if payment:
        payment.status = Payment.Status.VOIDED
        payment.voided_by = actor
        payment.voided_at = timezone.now()
        payment.void_reason = reason
        payment.save(update_fields=["status", "voided_by", "voided_at", "void_reason"])
    return payment


@transaction.atomic
def void_payment(payment, actor, reason):
    if role_for(actor) != "admin":
        raise PermissionDenied()
    order = Order.objects.select_for_update().get(pk=payment.order_id)
    result = void_order_payment(order, actor, reason)
    if result is None:
        raise Conflict("Este cobro ya está anulado.")
    return result
