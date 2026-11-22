from django.db import transaction
from rest_framework.exceptions import APIException, NotFound

from notificaciones.services import notify
from productos.models import Product
from .models import Movement


class StockConflict(APIException):
    status_code = 409
    default_detail = "El movimiento dejaría el stock fuera del rango permitido."


def apply_movement(product, *, delta, reason, actor):
    """Usar dentro de una transacción con la fila del producto bloqueada."""
    previous = product.stock
    balance = previous + delta
    if not 0 <= balance <= 2147483647:
        raise StockConflict(f"Existencias insuficientes o fuera de rango para {product.sku}.")
    product.stock = balance
    product.save(update_fields=["stock", "updated_at"])
    movement = Movement.objects.create(product=product, delta=delta, balance=balance,
                                       reason=reason, actor=actor)
    if product.is_active and previous > product.minimum_stock >= balance:
        notify("low_stock", f"{product.name} llegó a {balance} unidades disponibles.",
               roles=["admin"], product=product)
    return movement


@transaction.atomic
def adjust_stock(*, product_id, delta, reason, actor):
    try:
        product = Product.objects.select_for_update().get(pk=product_id)
    except Product.DoesNotExist as error:
        raise NotFound("El producto no existe.") from error
    return apply_movement(product, delta=delta, reason=reason, actor=actor)
