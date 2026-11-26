from datetime import datetime, time, timedelta
from decimal import Decimal
from uuid import NAMESPACE_URL, uuid5

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from accounts.models import User
from asistencias.models import Schedule, Shift
from asistencias.services import approve, clock
from clientes.models import Customer
from inventario.services import adjust_stock
from pedidos.models import Order, Payment
from pedidos.payments import register_payment
from pedidos.services import change_order, place_order
from productos.models import Category, Location, Product
from trabajadores.models import Worker


PRODUCTS = (
    ("BEB-001", "Agua mineral 600 ml", "2.50", 20, 164, 0, 0),
    ("BEB-002", "Gaseosa 1.5 L", "7.50", 20, 4, 0, 0),
    ("BEB-003", "Jugo de naranja 1 L", "8.50", 10, 73, 0, 1),
    ("ABA-001", "Arroz extra 1 kg", "6.00", 20, 118, 1, 2),
    ("ABA-002", "Aceite vegetal 1 L", "11.50", 10, 77, 1, 3),
    ("ABA-003", "Azúcar rubia 1 kg", "5.00", 10, 8, 1, 3),
    ("LIM-001", "Jabón líquido 1 L", "12.00", 10, 2, 2, 4),
    ("LIM-002", "Detergente en polvo 1 kg", "16.00", 15, 95, 2, 5),
    ("LIM-003", "Desinfectante 900 ml", "9.00", 10, 7, 2, 4),
    ("HOG-001", "Papel higiénico x 4", "8.00", 12, 3, 3, 6),
    ("HOG-002", "Toallas de cocina x 2", "10.00", 10, 84, 3, 7),
    ("HOG-003", "Bolsas multiuso x 20", "6.50", 10, 35, 3, 8),
)
CUSTOMERS = ("Carlos Ramos", "Lucía Torres", "Diego Huamán", "Ana Quispe", "Renzo Soto")
EMPLOYEES = ("Mateo Vega", "Julia Pérez", "Bruno Díaz", "María Rojas", "Elena Flores",
             "Luis García", "Sara Ruiz", "Pablo Silva", "Valeria León", "Andrés Cruz")


def barcode_for(sequence):
    prefix = f"2000000000{sequence:02}"
    checksum = sum(int(digit) * (1 if i % 2 == 0 else 3) for i, digit in enumerate(prefix))
    return prefix + str(-checksum % 10)


def demo_products(admin, categories, locations):
    created_products = {}
    for index, (sku, name, price, minimum, stock, category, location) in enumerate(PRODUCTS):
        barcode = barcode_for(index + 1)
        if Product.objects.filter(sku=sku).exists() or Product.objects.filter(barcode=barcode).exists():
            continue
        product = Product.objects.create(
            sku=sku, barcode=barcode, name=name, price=Decimal(price), minimum_stock=minimum,
            category=categories[category], location=locations[location],
        )
        adjust_stock(product_id=product.pk, delta=stock, reason="Apertura del catálogo de demostración", actor=admin)
        created_products[index] = product
    return created_products


def demo_team(users, general, morning, today):
    now = timezone.localtime()
    yesterday = today - timedelta(days=1)
    team = {}
    for index, name in enumerate(EMPLOYEES):
        number = index + 1
        document = f"DEMO-{number:02}"
        role = User.Role.SELLER if index == 9 else User.Role.WAREHOUSE
        primary_account = users["seller"] if index == 9 else users["warehouse"] if index == 0 else None
        if Worker.objects.filter(document=document).exists():
            continue
        # Una demo anterior puede tener una ficha original vinculada a la misma cuenta.
        if primary_account and not Worker.objects.filter(user=primary_account).exists():
            account = primary_account
        else:
            username = f"operacion_demo_{number:02}"
            if User.objects.filter(username=username).exists():
                continue
            first, last = name.split(maxsplit=1)
            account = User.objects.create_user(username=username, first_name=first, last_name=last, role=role)
        worker = Worker.objects.create(
            user=account, document=document, joined_on=yesterday,
            position="Vendedor" if index == 9 else "Auxiliar" if index == 8 else "Operario de almacén",
        )
        team[index] = worker
        has_sample_attendance = 0 < index < 9
        if (has_sample_attendance and yesterday.weekday() in morning.workdays
                and (morning.starts_at, morning.ends_at) == (time(6), time(14))):
            Schedule.objects.create(worker=worker, shift=morning, effective_from=yesterday)
            previous = clock(account, "in", now=timezone.make_aware(datetime.combine(yesterday, time(6))))
            clock(account, "out", now=timezone.make_aware(datetime.combine(yesterday, time(14, 30))))
            if index <= 3:
                approve(previous.pk, 30)
        Schedule.objects.create(worker=worker, shift=general, effective_from=today)
        if (has_sample_attendance and today.weekday() in general.workdays
                and (general.starts_at, general.ends_at) == (time(0), time(23, 59))):
            sample_time = timezone.make_aware(datetime.combine(today, time(0, index * 2)))
            clock(account, "in", now=min(sample_time, now))
    return team


def demo_orders(admin, products, customers, team, now):
    stocked = (0, 2, 3, 4, 7, 10, 11)
    stages = ("delivered", "ready", "pending", "accepted", "preparing")
    midnight = now.replace(hour=0, minute=0, second=0, microsecond=0)
    for index in range(24):
        product = products.get(stocked[index % len(stocked)])
        customer = customers.get(index % len(CUSTOMERS))
        if not product or not customer:
            continue
        key = uuid5(NAMESPACE_URL, f"control360-django/dw-demo/orders/{index}")
        if Order.objects.filter(request_key=key).exists():
            continue
        order = place_order(customer=customer, items=[{"product": product.pk, "quantity": 4 + index % 7}],
                            actor=admin, request_key=key)
        target = "pending" if index < 11 else stages[index % len(stages)]
        worker = team.get(index % 7)
        when = max(midnight + timedelta(microseconds=index), now - timedelta(minutes=(24 - index) * 10))
        if target != "pending" and worker:
            order = change_order(order_id=order.pk, action="assign", actor=admin, worker_id=worker.pk)
            for action in ("prepare", "ready", "deliver"):
                if order.status == target:
                    break
                if action == "deliver":
                    payment = register_payment(order, admin, "cash", cash_received=order.total)
                    Payment.objects.filter(pk=payment.pk).update(created_at=when)
                order = change_order(order_id=order.pk, action=action, actor=admin)
        Order.objects.filter(pk=order.pk).update(created_at=when, updated_at=when)
        order.history.update(created_at=when)


class Command(BaseCommand):
    help = "Carga los datos ficticios de Control360-DW en el esquema local de Empresariales."

    @transaction.atomic
    def handle(self, **options):
        users = {}
        for role in User.Role.values:
            user = User.objects.filter(username=f"demo_{role}", role=role, is_active=True, is_superuser=False).first()
            if not user:
                raise CommandError("Ejecuta create_demo_users con las tres cuentas de demostración habilitadas.")
            users[role] = user
        # Serializa dos cargas del mismo escenario y conserva los registros ya existentes.
        User.objects.select_for_update().get(pk=users["admin"].pk)
        now = timezone.localtime()
        today = now.date()
        categories = [Category.objects.get_or_create(name=name)[0]
                      for name in ("Bebidas", "Abarrotes", "Limpieza", "Hogar")]
        locations = [Location.objects.get_or_create(zone=zone, aisle=str(aisle), shelf="1")[0]
                     for zone in ("A", "B", "C") for aisle in range(1, 4)]
        customers = {}
        for index, name in enumerate(CUSTOMERS):
            customer, created = Customer.objects.get_or_create(
                document=f"CLIENTE-DEMO-{index + 1}", defaults={"name": name, "created_by": users["seller"]},
            )
            if created:
                customers[index] = customer

        general, _ = Shift.objects.get_or_create(name="Turno general", defaults={
            "starts_at": time(0), "ends_at": time(23, 59), "grace_minutes": 15, "workdays": list(range(7)),
        })
        morning, _ = Shift.objects.get_or_create(name="Turno mañana", defaults={
            "starts_at": time(6), "ends_at": time(14), "grace_minutes": 10, "workdays": list(range(5)),
        })
        products = demo_products(users["admin"], categories, locations)
        team = demo_team(users, general, morning, today)
        demo_orders(users["admin"], products, customers, team, now)
        self.stdout.write(self.style.SUCCESS("Escenario DW disponible en la base de demostración de Django."))
