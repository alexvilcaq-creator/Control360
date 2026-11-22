from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from uuid import uuid4

from django.db import connections
from django.test import TestCase, TransactionTestCase
from rest_framework.test import APIClient

from accounts.models import User
from clientes.models import Customer
from config.api import Conflict
from inventario.services import adjust_stock
from notificaciones.models import Notification
from productos.models import Category, Location, Product
from trabajadores.models import Worker
from .models import Order
from .services import change_order, place_order


def fixtures():
    admin = User.objects.create_user("gestion", role="admin")
    seller = User.objects.create_user("vendedor", role="seller")
    operator = User.objects.create_user("almacen", role="warehouse")
    worker = Worker.objects.create(user=operator, document="B-001", position="Operario")
    customer = Customer.objects.create(name="Cliente ficticio", document="C-001")
    category = Category.objects.create(name="Herramientas")
    location = Location.objects.create(zone="B", aisle="4", shelf="2")
    first = Product.objects.create(sku="SKU-1", name="Taladro", price="105.50",
                                   category=category, location=location, minimum_stock=3)
    second = Product.objects.create(sku="SKU-2", name="Martillo", price="12",
                                    category=category, location=location)
    adjust_stock(product_id=first.pk, delta=6, reason="Apertura", actor=admin)
    adjust_stock(product_id=second.pk, delta=2, reason="Apertura", actor=admin)
    return admin, seller, worker, customer, first, second


class OrderAPITests(TestCase):
    def setUp(self):
        self.admin, self.seller, self.worker, self.customer, self.first, self.second = fixtures()
        self.client = APIClient()
        self.client.force_authenticate(self.seller)
        self.path = "/api/v1/orders/"

    def create_order(self, quantity=4):
        return self.client.post(self.path, {
            "customer": self.customer.pk, "total": "0.01",
            "items": [{"product": self.first.pk, "quantity": quantity},
                      {"product": self.second.pk, "quantity": 1}],
        }, format="json")

    def transition(self, pk, action, **extra):
        return self.client.post(f"{self.path}{pk}/transition/", {"action": action, **extra}, format="json")

    def test_order_lifecycle_keeps_stock_reserved_and_scopes_visibility(self):
        created = self.create_order()
        self.assertEqual(created.status_code, 201, created.data)
        pk = created.data["id"]
        self.assertEqual(created.data["total"], "434.00")
        self.assertEqual(created.data["items"][0]["location"], "B / 4 / 2")
        self.assertEqual(Product.objects.get(pk=self.first.pk).stock, 2)
        self.assertTrue(Notification.objects.filter(recipient=self.admin, kind="low_stock").exists())
        self.assertTrue(Notification.objects.filter(recipient=self.worker.user, kind="new_order", order_id=pk).exists())

        other = User.objects.create_user("otra", role="seller")
        self.client.force_authenticate(other)
        self.assertEqual(self.client.get(f"{self.path}{pk}/").status_code, 404)
        self.assertEqual(self.client.get("/api/v1/customers/").status_code, 200)
        self.assertEqual(self.client.get("/api/v1/reports/").status_code, 403)
        self.client.force_authenticate(self.worker.user)
        self.assertEqual(self.client.get("/api/v1/customers/").status_code, 403)
        self.assertEqual(self.client.get(self.path + "?search=SKU-1").data["count"], 1)
        self.assertEqual(self.transition(pk, "accept").status_code, 200)
        self.assertEqual(self.transition(pk, "accept").status_code, 409)
        self.assertEqual(self.transition(pk, "prepare").status_code, 200)
        self.assertEqual(self.transition(pk, "ready").status_code, 200)
        self.assertEqual(self.transition(pk, "deliver").status_code, 403)
        self.client.force_authenticate(self.seller)
        result = self.transition(pk, "deliver")
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.data["status"], "delivered")
        self.assertEqual(len(result.data["history"]), 5)
        self.assertEqual(Product.objects.get(pk=self.first.pk).stock, 2)
        own = self.client.get("/api/v1/notifications/").data["results"]
        self.assertEqual({row["kind"] for row in own}, {
            "order_accepted", "order_preparing", "order_ready", "order_delivered",
        })
        foreign = Notification.objects.filter(recipient=self.admin).first()
        self.assertEqual(self.client.post(f"/api/v1/notifications/{foreign.pk}/read/").status_code, 404)
        self.assertEqual(self.client.post("/api/v1/notifications/read-all/").status_code, 204)
        self.assertEqual(self.client.get("/api/v1/notifications/unread/").data["unread"], 0)

        self.client.force_authenticate(self.admin)
        dashboard = self.client.get("/api/v1/dashboard/")
        self.assertEqual(dashboard.status_code, 200, dashboard.data)
        self.assertEqual(dashboard.data["orders_today"], 1)
        self.assertEqual(sum(row["count"] for row in dashboard.data["trend"]), 1)
        report = self.client.get("/api/v1/reports/?group=week")
        self.assertEqual(report.status_code, 200, report.data)
        self.assertEqual(report.data["top_products"][0]["quantity"], 4)
        self.assertEqual(report.data["workers"][0]["ready"], 1)
        csv = self.client.get("/api/v1/reports/export/?group=month")
        self.assertEqual(csv.status_code, 200)
        self.assertIn("SKU-1", csv.content.decode("utf-8"))

    def test_creation_rolls_back_and_cancellation_returns_stock_once(self):
        missing = self.client.post(self.path, {
            "customer": self.customer.pk, "items": [{"product": self.first.pk, "quantity": 2},
                                                    {"product": self.second.pk, "quantity": 3}],
        }, format="json")
        self.assertEqual(missing.status_code, 409)
        self.assertEqual(Order.objects.count(), 0)
        self.assertEqual(Product.objects.get(pk=self.first.pk).stock, 6)
        self.assertEqual(self.first.movements.count(), 1)
        self.assertFalse(Notification.objects.exists())
        created = self.create_order()
        pk = created.data["id"]
        self.assertEqual(self.transition(pk, "cancel", note="Solicitud del cliente").status_code, 200)
        self.assertEqual(self.transition(pk, "cancel", note="Reintentado").status_code, 409)
        self.assertEqual(Product.objects.get(pk=self.first.pk).stock, 6)
        self.assertEqual(self.first.movements.count(), 3)

    def test_retry_does_not_reserve_again_and_key_is_tied_to_the_payload(self):
        payload = {
            "customer": self.customer.pk, "request_key": str(uuid4()),
            "items": [{"product": self.first.pk, "quantity": 4}],
        }
        original = self.client.post(self.path, payload, format="json")
        self.assertEqual(original.status_code, 201)
        replay = self.client.post(self.path, payload, format="json")
        self.assertEqual(replay.data["id"], original.data["id"])
        self.assertEqual(Order.objects.count(), 1)
        self.assertEqual(Product.objects.get(pk=self.first.pk).stock, 2)
        payload["items"][0]["quantity"] = 1
        self.assertEqual(self.client.post(self.path, payload, format="json").status_code, 409)

    def test_admin_assignment_and_retired_product(self):
        created = self.create_order()
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.transition(created.data["id"], "assign", worker_id=self.worker.pk).status_code, 200)
        self.first.is_active = False
        self.first.save(update_fields=["is_active"])
        self.client.force_authenticate(self.seller)
        self.assertEqual(self.create_order(quantity=1).status_code, 409)
        self.assertEqual(self.client.get(f"/api/v1/products/{self.first.pk}/").status_code, 404)


class OrderConcurrencyTests(TransactionTestCase):
    def test_one_worker_can_accept_an_order(self):
        _, seller, first_worker, customer, product, _ = fixtures()
        other = User.objects.create_user("operario2", role="warehouse")
        Worker.objects.create(user=other, document="B-002", position="Operario")
        order = place_order(customer=customer, items=[{"product": product.pk, "quantity": 1}], actor=seller)
        barrier = Barrier(2)

        def accept(actor):
            try:
                barrier.wait(timeout=5)
                change_order(order_id=order.pk, action="accept", actor=actor)
                return 200
            except Conflict:
                return 409
            finally:
                connections.close_all()

        with ThreadPoolExecutor(max_workers=2) as pool:
            self.assertCountEqual(list(pool.map(accept, [first_worker.user, other])), [200, 409])
        order.refresh_from_db()
        self.assertEqual(order.status, Order.Status.ACCEPTED)
        self.assertEqual(order.history.count(), 2)
        self.assertEqual(Product.objects.get(pk=product.pk).stock, 5)

    def test_parallel_retries_share_the_same_order(self):
        _, seller, _, customer, product, _ = fixtures()
        key = uuid4()
        barrier = Barrier(2)

        def submit(_):
            try:
                barrier.wait(timeout=5)
                return place_order(customer=customer, items=[{"product": product.pk, "quantity": 2}],
                                   actor=seller, request_key=key).pk
            finally:
                connections.close_all()

        with ThreadPoolExecutor(max_workers=2) as pool:
            order_ids = list(pool.map(submit, range(2)))
        self.assertEqual(order_ids[0], order_ids[1])
        self.assertEqual(Order.objects.count(), 1)
        self.assertEqual(Product.objects.get(pk=product.pk).stock, 4)
