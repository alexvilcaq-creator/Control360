from uuid import uuid4

from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import User
from .models import Order, Payment
from .tests import fixtures


class PaymentTests(TestCase):
    def setUp(self):
        self.admin, self.seller, self.worker, self.customer, self.first, self.second = fixtures()
        self.client = APIClient()
        self.client.force_authenticate(self.seller)
        self.body = {
            "customer": self.customer.pk, "request_key": str(uuid4()),
            "items": [{"product": self.first.pk, "quantity": 2}],
            "payment": {"method": "cash", "cash_received": "250.00"},
        }

    def test_checkout_retries_and_cancellation_preserve_inventory_and_payment_history(self):
        invalid = {**self.body, "payment": {"method": "cash", "cash_received": "10.00"}}
        denied = self.client.post("/api/v1/orders/checkout/", invalid, format="json")
        self.assertEqual(denied.status_code, 400, denied.data)
        self.assertFalse(Order.objects.exists())
        self.first.refresh_from_db()
        self.assertEqual(self.first.stock, 6)
        result = self.client.post("/api/v1/orders/checkout/", self.body, format="json")
        self.assertEqual(result.status_code, 201, result.data)
        self.assertEqual(result.data["payment"]["amount"], "211.00")
        self.assertEqual(result.data["payment"]["change"], "39.00")
        replay = self.client.post("/api/v1/orders/checkout/", self.body, format="json")
        self.assertEqual(replay.data["payment"]["id"], result.data["payment"]["id"])
        self.assertEqual(Payment.objects.count(), 1)
        self.first.refresh_from_db()
        self.assertEqual(self.first.stock, 4)
        different = {**self.body, "payment": {"method": "yape"}}
        self.assertEqual(self.client.post("/api/v1/orders/checkout/", different, format="json").status_code, 409)
        payment_id = result.data["payment"]["id"]
        order_id = result.data["order"]["id"]
        self.assertEqual(self.client.post(f"/api/v1/payments/{payment_id}/void/", {"reason": "Prueba"}).status_code, 403)
        another = User.objects.create_user("otro-vendedor", role="seller")
        self.client.force_authenticate(another)
        self.assertEqual(self.client.get(f"/api/v1/payments/{payment_id}/").status_code, 404)
        self.client.force_authenticate(self.worker.user)
        self.assertEqual(self.client.get("/api/v1/payments/").status_code, 403)
        self.assertIsNone(self.client.get(f"/api/v1/orders/{order_id}/").data["payment"])
        self.client.force_authenticate(self.seller)
        cancelled = self.client.post(f"/api/v1/orders/{order_id}/transition/", {"action": "cancel", "note": "Se desistió"})
        self.assertEqual(cancelled.status_code, 200, cancelled.data)
        self.assertEqual(Payment.objects.get().status, "voided")
        self.first.refresh_from_db()
        self.assertEqual(self.first.stock, 6)

    def test_manual_methods_and_admin_reports(self):
        for method in ("card", "yape", "plin"):
            order = self.client.post("/api/v1/orders/", {
                "customer": self.customer.pk, "items": [{"product": self.first.pk, "quantity": 1}],
            }, format="json")
            payment = self.client.post(f"/api/v1/orders/{order.data['id']}/payment/", {
                "method": method, "reference": "OP-301",
            }, format="json")
            self.assertEqual(payment.status_code, 201, payment.data)
            self.assertEqual(payment.data["method"], method)
            self.assertIsNone(payment.data["change"])
        self.client.force_authenticate(self.admin)
        data = self.client.get("/api/v1/reports/").data
        self.assertEqual({item["method"] for item in data["payments"]}, {"card", "yape", "plin"})
        row = Payment.objects.get(method="plin")
        result = self.client.post(f"/api/v1/payments/{row.pk}/void/", {"reason": "Conciliación"})
        self.assertEqual(result.status_code, 200, result.data)
        self.assertEqual(result.data["voided_by_name"], self.admin.username)

    def test_dashboard_and_reports_work_without_mysql_timezone_tables(self):
        from unittest.mock import patch

        from django.db import connection

        self.assertEqual(self.client.post("/api/v1/orders/checkout/", self.body, format="json").status_code, 201)
        self.client.force_authenticate(self.admin)
        with patch.object(connection.features, "has_zoneinfo_database", False):
            dashboard = self.client.get("/api/v1/dashboard/")
            self.assertEqual(dashboard.status_code, 200, dashboard.data)
            self.assertEqual(sum(row["count"] for row in dashboard.data["trend"]), 1)
            for group in ("week", "month"):
                report = self.client.get("/api/v1/reports/", {"group": group})
                self.assertEqual(report.status_code, 200, report.data)
                self.assertEqual(sum(row["count"] for row in report.data["trend"]), 1)
