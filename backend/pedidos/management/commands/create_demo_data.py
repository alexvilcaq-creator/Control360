from datetime import datetime, time, timedelta
from decimal import Decimal

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from accounts.models import User
from asistencias.models import Schedule, Shift
from asistencias.services import approve, clock
from clientes.models import Customer
from inventario.services import adjust_stock
from pedidos.services import change_order, place_order
from productos.models import Category, Location, Product
from trabajadores.models import Worker


class Command(BaseCommand):
    help = "Carga un escenario ficticio en una base de demostración, con inventario, pedidos y asistencia."

    @transaction.atomic
    def handle(self, **options):
        users = {}
        for role in User.Role.values:
            user = User.objects.filter(username=f"demo_{role}", role=role,
                                       is_active=True, is_superuser=False).first()
            if not user:
                raise CommandError("Ejecuta create_demo_users con las tres cuentas de demostración habilitadas.")
            users[role] = user
        today = timezone.localdate()
        yesterday = today - timedelta(days=1)
        category, _ = Category.objects.get_or_create(name="Accesorios (demo)")
        location, _ = Location.objects.get_or_create(zone="DEMO-A", aisle="2", shelf="4")

        products = []
        for sku, name, price, opening, minimum in (
            ("C360-DEMO-01", "Teclado mecánico", "189900", 6, 3),
            ("C360-DEMO-02", "Ratón inalámbrico", "57900", 18, 4),
            ("C360-DEMO-03", "Cable USB-C", "23900", 3, 5),
        ):
            product, created = Product.objects.get_or_create(sku=sku, defaults={
                "name": name, "price": Decimal(price), "category": category, "location": location,
                "minimum_stock": minimum,
            })
            if created:
                adjust_stock(product_id=product.pk, delta=opening,
                             reason="Inventario de demostración", actor=users["admin"])
            products.append(product)

        worker, worker_created = Worker.objects.get_or_create(user=users["warehouse"], defaults={
            "document": "C360-DEMO-OPERARIO", "position": "Operario de almacén", "joined_on": today - timedelta(days=7),
        })
        shift, _ = Shift.objects.get_or_create(name="Jornada de demostración", defaults={
            "starts_at": time(8), "ends_at": time(17), "workdays": list(range(7)),
        })
        if worker_created:
            Schedule.objects.create(worker=worker, shift=shift, effective_from=worker.joined_on)
            entry = clock(worker.user, "in", now=timezone.make_aware(datetime.combine(yesterday, time(8, 12))))
            clock(worker.user, "out", now=timezone.make_aware(datetime.combine(yesterday, time(17, 30))))
            approve(entry.pk, 20)

        customer, customer_created = Customer.objects.get_or_create(
            document="C360-DEMO-CLIENTE", defaults={"name": "Cliente de demostración", "created_by": users["seller"]},
        )
        if customer_created:
            delivered = place_order(customer=customer, items=[{"product": products[0].pk, "quantity": 2}],
                                    actor=users["seller"])
            for action, actor in (("accept", worker.user), ("prepare", worker.user),
                                  ("ready", worker.user), ("deliver", users["seller"])):
                change_order(order_id=delivered.pk, action=action, actor=actor)
            place_order(customer=customer, items=[{"product": products[0].pk, "quantity": 1},
                                                  {"product": products[1].pk, "quantity": 2}],
                        actor=users["seller"])
        self.stdout.write(self.style.SUCCESS("Escenario de demostración disponible."))
