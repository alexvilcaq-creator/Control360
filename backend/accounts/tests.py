import secrets

from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from .models import User


@override_settings(CORS_ALLOWED_ORIGINS=["http://localhost:5173"],
                   CSRF_TRUSTED_ORIGINS=["http://localhost:5173"])
class SessionTests(TestCase):
    def setUp(self):
        self.password = secrets.token_urlsafe(24)
        self.user = User.objects.create_user("bodega", password=self.password, role=User.Role.WAREHOUSE)
        self.client = APIClient(enforce_csrf_checks=True)

    def test_session_requires_csrf_and_returns_the_persisted_role(self):
        url = "/api/v1/auth/"
        credentials = {"username": self.user.username, "password": self.password, "role": "admin"}
        anonymous = self.client.get(url + "me/")
        self.assertEqual(anonymous.status_code, 401)
        self.assertIn("no-store", anonymous["Cache-Control"])
        self.assertEqual(self.client.post(url + "login/", credentials).status_code, 403)
        token = self.client.get(url + "csrf/").data["csrfToken"]
        headers = {"HTTP_X_CSRFTOKEN": token, "HTTP_ORIGIN": "http://localhost:5173"}
        bad = self.client.post(url + "login/", {**credentials, "password": "incorrecta"}, **headers)
        self.assertEqual(bad.status_code, 401)
        auth = self.client.post(url + "login/", credentials, **headers)
        self.assertEqual(auth.status_code, 200)
        self.assertEqual(auth.data["user"]["role"], "warehouse")
        self.assertNotEqual(self.user.password, self.password)
        session = self.client.get(url + "me/")
        self.assertEqual(session.data["id"], self.user.pk)
        self.assertIn("no-store", session["Cache-Control"])
        self.assertEqual(self.client.post(url + "logout/", **headers).status_code, 403)
        headers["HTTP_X_CSRFTOKEN"] = auth.data["csrfToken"]
        self.assertEqual(self.client.post(url + "logout/", **headers).status_code, 204)
        self.assertEqual(self.client.get(url + "me/").status_code, 401)

    def test_cors_returns_credentials_only_for_allowed_origin(self):
        path = "/api/v1/auth/csrf/"
        response = self.client.get(path, HTTP_ORIGIN="http://localhost:5173")
        self.assertEqual(response["Access-Control-Allow-Origin"], "http://localhost:5173")
        self.assertEqual(response["Access-Control-Allow-Credentials"], "true")
        response = self.client.get(path, HTTP_ORIGIN="https://unrelated.example")
        self.assertNotIn("Access-Control-Allow-Origin", response)


class DemoUserTests(TestCase):
    def test_demo_command_stores_hashes_and_preserves_existing_accounts(self):
        from io import StringIO
        from unittest.mock import patch

        from django.core.management import call_command

        passwords = {role: secrets.token_urlsafe(24) for role in User.Role.values}
        prompts = [value for password in passwords.values() for value in (password, password)]
        with patch("accounts.management.commands.create_demo_users.getpass.getpass", side_effect=prompts):
            call_command("create_demo_users", stdout=StringIO())
        for role, password in passwords.items():
            user = User.objects.get(username=f"demo_{role}")
            self.assertEqual(user.role, role)
            self.assertTrue(user.check_password(password))
        with patch("accounts.management.commands.create_demo_users.getpass.getpass") as prompt:
            call_command("create_demo_users", stdout=StringIO())
            prompt.assert_not_called()
        self.assertEqual(User.objects.count(), 3)


class AccountAdministrationTests(TestCase):
    def test_only_admin_manages_accounts_and_staff_flags_are_ignored(self):
        seller = User.objects.create_user("ventas", role="seller")
        admin = User.objects.create_user("gestion", role="admin")
        client = APIClient()
        path = "/api/v1/accounts/"
        password = secrets.token_urlsafe(24)
        data = {
            "username": "operario", "email": "operario@example.invalid", "password": password,
            "role": "warehouse", "is_active": True, "is_superuser": True, "is_staff": True,
        }
        client.force_authenticate(seller)
        self.assertEqual(client.post(path, data, format="json").status_code, 403)
        client.force_authenticate(admin)
        response = client.post(path, data, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        worker = User.objects.get(username="operario")
        self.assertNotIn("password", response.data)
        self.assertFalse(worker.is_superuser)
        self.assertFalse(worker.is_staff)
        self.assertTrue(worker.check_password(password))
        self.assertEqual(client.patch(f"{path}{admin.pk}/", {"role": "seller"}, format="json").status_code, 400)
        self.assertEqual(client.post(path, {**data, "username": "otra"}, format="json").status_code, 400)
        self.assertEqual(client.patch(f"{path}{worker.pk}/", {"is_active": False}, format="json").status_code, 200)
        worker.refresh_from_db()
        self.assertFalse(worker.is_active)
