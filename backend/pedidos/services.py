from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework.exceptions import NotFound, PermissionDenied

from accounts.permissions import role_for
from config.api import Conflict
from inventario.services import apply_movement
from notificaciones.services import notify
from productos.models import Product
from trabajadores.models import Worker
from .models import Order, OrderEvent, OrderItem

Status = Order.Status
NEXT_STATUS = {
    Status.ACCEPTED: Status.PREPARING,
    Status.PREPARING: Status.READY,
    Status.READY: Status.DELIVERED,
}
ACTION_LABELS = {
    "accept": "Aceptar", "assign": "Asignar", "prepare": "Iniciar preparación", "ready": "Marcar listo",
    "deliver": "Confirmar entrega", "cancel": "Cancelar pedido",
}
CODES = {Status.PREPARING: "prepare", Status.READY: "ready", Status.DELIVERED: "deliver"}
TRANSITION_ROLES = {
    "accept": {"warehouse"}, "assign": {"admin"}, "prepare": {"admin", "warehouse"},
    "ready": {"admin", "warehouse"}, "deliver": {"admin", "seller"}, "cancel": {"admin", "seller"},
}


def actions_for(order, actor):
    role = role_for(actor)
    seller = role == "seller" and actor.pk == order.seller_id
    assigned = role == "warehouse" and order.assignee and order.assignee.user_id == actor.pk
    actions = []
    if order.status == Status.PENDING:
        if role == "warehouse":
            actions.append("accept")
        if role == "admin":
            actions.append("assign")
    following = NEXT_STATUS.get(order.status)
    if (following == Status.DELIVERED and (role == "admin" or seller) or
            following in (Status.PREPARING, Status.READY) and (role == "admin" or assigned)):
        actions.append(CODES[following])
    if ((role == "admin" and order.status not in (Status.DELIVERED, Status.CANCELLED)) or
            (seller and order.status == Status.PENDING)):
        actions.append("cancel")
    return actions


def locked_products(ids):
    return Product.objects.select_for_update().filter(pk__in=ids).order_by("pk").in_bulk()


def _find_request(actor, key, customer, quantities):
    if key is None:
        return None
    order = Order.objects.filter(seller=actor, request_key=key).first()
    if order and (
        order.customer_id != customer.pk or dict(order.items.values_list("product_id", "quantity")) != quantities
    ):
        raise Conflict("La clave de solicitud ya corresponde a un pedido con otros datos.")
    return order


def place_order(*, customer, items, actor, request_key=None):
    quantities = {item["product"]: item["quantity"] for item in items}
    existing = _find_request(actor, request_key, customer, quantities)
    if existing:
        return existing
    try:
        return _create_order(customer, quantities, actor, request_key)
    except IntegrityError:
        # Si dos cargas distintas compiten por la misma clave, la restricción
        # de MySQL elige una y la transacción fallida queda revertida.
        existing = _find_request(actor, request_key, customer, quantities)
        if existing:
            return existing
        raise


@transaction.atomic
def _create_order(customer, quantities, actor, request_key):
    products = locked_products(quantities)
    existing = _find_request(actor, request_key, customer, quantities)
    if existing:
        return existing
    if len(products) != len(quantities) or any(not product.is_active for product in products.values()):
        raise Conflict("Uno de los productos ya no está disponible para pedidos.")
    total = sum(product.price * quantities[pk] for pk, product in products.items())
    order = Order.objects.create(customer=customer, seller=actor, total=total, request_key=request_key)
    lines = []
    for pk, product in products.items():
        quantity = quantities[pk]
        apply_movement(product, delta=-quantity, reason=f"Reserva del pedido #{order.pk}", actor=actor)
        lines.append(OrderItem(order=order, product=product, sku=product.sku, name=product.name,
                               quantity=quantity, unit_price=product.price))
    OrderItem.objects.bulk_create(lines)
    OrderEvent.objects.create(order=order, actor=actor, status=Status.PENDING)
    notify("new_order", f"El pedido #{order.pk} está pendiente de preparación.",
           roles=["admin", "warehouse"], order=order)
    return order


def _assignee(action, actor, worker_id):
    workers = Worker.objects.select_for_update().select_related("user")
    worker = (workers.filter(user=actor).first() if action == "accept" else
              workers.filter(pk=worker_id).first())
    if not worker or not worker.employed_on(timezone.localdate()) or not worker.user.is_active:
        raise Conflict("Selecciona un trabajador con una cuenta y un vínculo laboral activos.")
    return worker


@transaction.atomic
def change_order(*, order_id, action, actor, worker_id=None, note=""):
    try:
        order = Order.objects.select_for_update().get(pk=order_id)
    except Order.DoesNotExist as error:
        raise NotFound() from error
    role = role_for(actor)
    if role not in TRANSITION_ROLES[action]:
        raise PermissionDenied()
    if action not in actions_for(order, actor):
        raise Conflict("El pedido cambió de estado o la acción no está disponible para tu rol.")
    previous = order.status
    if action in ("assign", "accept"):
        order.assignee = _assignee(action, actor, worker_id)
        order.status = Status.ACCEPTED
    elif action == "cancel":
        quantities = dict(order.items.values_list("product_id", "quantity"))
        for pk, product in locked_products(quantities).items():
            apply_movement(product, delta=quantities[pk], reason=f"Reversa del pedido #{order.pk}", actor=actor)
        order.status = Status.CANCELLED
    else:
        order.status = NEXT_STATUS[previous]
    order.save(update_fields=["status", "assignee", "updated_at"])
    OrderEvent.objects.create(order=order, actor=actor, previous=previous, status=order.status, note=note)
    notify(
        f"order_{order.status}",
        f"Pedido #{order.pk} · {order.get_status_display()}.",
        roles=["admin"], user_ids=[order.seller_id, order.assignee.user_id if order.assignee_id else None],
        order=order,
    )
    return order
