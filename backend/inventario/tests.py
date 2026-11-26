from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import User
from notificaciones.models import Notification
from pedidos.tests import fixtures


class IncidentTests(TestCase):
    def test_reporting_and_review_keep_stock_unchanged(self):
        admin, seller, worker, _, product, _ = fixtures()
        client = APIClient()
        client.force_authenticate(worker.user)
        product.barcode = "0012345"
        product.save(update_fields=["barcode"])
        self.assertEqual(client.get("/api/v1/products/scan/?code=0012345").data["id"], product.pk)
        created = client.post("/api/v1/incidents/", {
            "kind": "damaged", "product": product.pk, "description": "Empaque roto", "status": "resolved",
        }, format="json")
        self.assertEqual(created.status_code, 201, created.data)
        self.assertEqual(created.data["status"], "open")
        path = f"/api/v1/incidents/{created.data['id']}/"
        self.assertEqual(client.post(path + "review/", {"status": "resolved", "note": "Prueba"}).status_code, 403)
        self.assertEqual(client.patch(f"/api/v1/products/{product.pk}/", {"stock": 0}).status_code, 403)
        client.force_authenticate(User.objects.create_user("otro-almacen", role="warehouse"))
        self.assertEqual(client.get(path).status_code, 404)
        client.force_authenticate(seller)
        self.assertEqual(client.get("/api/v1/incidents/").status_code, 403)
        client.force_authenticate(admin)
        self.assertEqual(client.post(path + "review/", {"status": "review", "note": "Separado"}).status_code, 200)
        row = client.post(path + "review/", {"status": "resolved", "note": "Registrado en control"})
        self.assertEqual(row.status_code, 200)
        self.assertEqual(len(row.data["history"]), 2)
        self.assertEqual(client.post(path + "review/", {"status": "review", "note": "Otra"}).status_code, 409)
        self.assertTrue(Notification.objects.filter(recipient=admin, kind="incident_reported").exists())
        self.assertTrue(Notification.objects.filter(recipient=worker.user, kind="incident_reviewed").exists())
        product.refresh_from_db()
        self.assertEqual(product.stock, 6)
