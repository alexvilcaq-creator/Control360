from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

from django.db import IntegrityError, connections, transaction
from django.test import TestCase, TransactionTestCase
from rest_framework.test import APIClient

from accounts.models import User
from inventario.models import Movement
from inventario.services import StockConflict, adjust_stock
from .models import Category, Location, Product


class CatalogTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_user("gestion", role=User.Role.ADMIN)
        self.seller = User.objects.create_user("ventas", role=User.Role.SELLER)
        self.location = Location.objects.create(zone="A", aisle="03", shelf="2")
        self.category = Category.objects.create(name="Ferretería")
        self.payload = {
            "sku": "F-001", "name": "Llave", "category": self.category.pk,
            "location": self.location.pk, "price": "14500.00", "minimum_stock": 3,
        }
        self.url = "/api/v1/products/"

    def test_catalog_permissions_validation_and_protected_relations(self):
        self.assertEqual(self.client.get(self.url).status_code, 401)
        self.client.force_authenticate(self.admin)
        invalid = self.client.post(self.url, {**self.payload, "price": "-1"})
        self.assertEqual(invalid.status_code, 400)
        product = self.client.post(self.url, self.payload)
        self.assertEqual(product.status_code, 201)
        self.assertEqual(self.client.post(self.url, self.payload).status_code, 400)
        self.assertEqual(self.client.delete(f"/api/v1/categories/{self.category.pk}/").status_code, 409)
        self.client.force_authenticate(self.seller)
        self.assertEqual(self.client.post(self.url, self.payload).status_code, 403)
        response = self.client.get(self.url, {"search": "F-001", "stock": "low", "category": self.category.pk})
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["location_label"], "A / 03 / 2")
        self.assertEqual(self.client.get(self.url, {"category": "no-numérica"}).status_code, 400)
        self.assertEqual(self.client.get(self.url + "99999/").status_code, 404)

    def test_adjustments_are_atomic_audited_and_exclusive_to_admin(self):
        self.client.force_authenticate(self.admin)
        product_id = self.client.post(self.url, {**self.payload, "stock": 80}).data["id"]
        product_url = self.url + f"{product_id}/"
        movement_url = product_url + "movements/"
        adjustment = {"delta": 5, "reason": "Recepción"}
        self.assertEqual(Product.objects.get(pk=product_id).stock, 0)
        result = self.client.post(movement_url, adjustment)
        self.assertEqual(result.status_code, 201)
        self.assertEqual(result.data["balance"], 5)
        self.assertEqual(self.client.post(movement_url, {**adjustment, "delta": -6}).status_code, 409)
        self.assertEqual(self.client.post(movement_url, {**adjustment, "delta": 0}).status_code, 400)
        self.assertEqual(Movement.objects.get().actor, self.admin)
        updated = self.client.patch(product_url, {"name": "Llave fija", "stock": 0})
        self.assertEqual(updated.data["stock"], 5)
        self.assertEqual(self.client.get("/api/v1/summary/").data, {
            "products": 1, "low_stock": 0, "out_of_stock": 0,
        })
        self.assertEqual(self.client.delete(product_url).status_code, 409)
        self.client.force_authenticate(self.seller)
        self.assertEqual(self.client.post(movement_url, adjustment).status_code, 403)
        self.assertEqual(self.client.get(movement_url).data["count"], 1)

    def test_database_rejects_negative_price(self):
        payload = {**self.payload, "category": self.category, "location": self.location, "price": -1}
        with self.assertRaises(IntegrityError), transaction.atomic():
            Product.objects.create(**payload)

    def test_product_can_be_created_without_location_and_assigned_later(self):
        self.client.force_authenticate(self.admin)
        payload = dict(self.payload)
        payload.pop("location")
        created = self.client.post(self.url, payload, format="json")
        self.assertEqual(created.status_code, 201, created.data)
        self.assertIsNone(created.data["location_label"])
        path = f"{self.url}{created.data['id']}/"
        self.assertEqual(self.client.patch(path, {"location": self.location.pk}, format="json").data["location_label"], "A / 03 / 2")
        updated = self.client.patch(path, {"location": None}, format="json")
        self.assertIsNone(updated.data["location"])
        self.assertIsNone(updated.data["location_label"])


class ConcurrentStockTests(TransactionTestCase):
    def test_only_one_withdrawal_can_spend_the_same_units(self):
        admin = User.objects.create_user("inventario", role=User.Role.ADMIN)
        product = Product.objects.create(
            sku="LOCK-01", name="Producto de prueba", price="1.00",
            category=Category.objects.create(name="Pruebas"),
            location=Location.objects.create(zone="A", aisle="1", shelf="1"),
        )
        adjust_stock(product_id=product.pk, delta=5, reason="Apertura", actor=admin)
        barrier = Barrier(2)

        def withdraw():
            try:
                barrier.wait(timeout=5)
                adjust_stock(product_id=product.pk, delta=-4, reason="Salida", actor=admin)
                return 201
            except StockConflict:
                return 409
            finally:
                connections.close_all()

        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(lambda _: withdraw(), range(2)))
        self.assertCountEqual(results, [201, 409])
        product.refresh_from_db()
        self.assertEqual(product.stock, 1)
        self.assertEqual(product.movements.count(), 2)
