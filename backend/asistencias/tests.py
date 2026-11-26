from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, time, timedelta
from threading import Barrier
from unittest.mock import patch

from django.db import connections
from django.test import TestCase, TransactionTestCase
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User
from config.api import Conflict
from notificaciones.models import Notification
from trabajadores.models import Worker
from .models import Attendance, Schedule, Shift
from .services import clock, request_punch


def timestamp(day, hour, minute=0):
    return timezone.make_aware(datetime.combine(day, time(hour, minute)))


class AttendanceTests(TestCase):
    def setUp(self):
        self.day = date(2026, 10, 5)
        self.admin = User.objects.create_user("gestion", role="admin")
        self.operator = User.objects.create_user("operario", role="warehouse")
        self.worker = Worker.objects.create(user=self.operator, joined_on=self.day,
                                            document="W-002", position="Auxiliar")
        self.shift = Shift.objects.create(name="Día", starts_at=time(8), ends_at=time(17),
                                          grace_minutes=5, overtime_minimum=15)
        self.schedule = Schedule.objects.create(worker=self.worker, shift=self.shift, effective_from=self.day)
        self.client = APIClient()
        self.client.force_authenticate(self.operator)
        self.path = "/api/v1/attendance/"

    def punch(self, action, at):
        with patch("asistencias.services.timezone.now", return_value=at):
            return self.client.post(self.path + "punch/", {"action": action}, format="json")

    def decide(self, punch, decision="approved", note=""):
        return self.client.post(f"/api/v1/attendance-requests/{punch}/decide/",
                                {"decision": decision, "note": note}, format="json")

    def test_punch_calendar_absence_and_overtime_approval(self):
        opened = self.punch("in", timestamp(self.day, 8, 11))
        self.assertEqual(opened.status_code, 201, opened.data)
        self.assertEqual(opened.data["status"], "pending")
        self.assertFalse(Attendance.objects.exists())
        self.assertFalse(self.client.get(self.path + "open/").data["open"])
        self.assertEqual(self.punch("in", timestamp(self.day, 8, 12)).status_code, 409)
        self.assertEqual(self.decide(opened.data["id"]).status_code, 403)
        self.assertTrue(Notification.objects.filter(recipient=self.admin, kind="attendance_requested").exists())
        self.client.force_authenticate(self.admin)
        with patch("asistencias.services.timezone.now", return_value=timestamp(self.day, 9)):
            approved = self.decide(opened.data["id"])
        self.assertEqual(approved.status_code, 200, approved.data)
        self.assertNotEqual(approved.data["requested_at"], approved.data["decided_at"])
        entry = Attendance.objects.get(pk=approved.data["attendance"])
        self.assertEqual(entry.late_minutes, 11)
        self.assertEqual(self.decide(opened.data["id"]).status_code, 409)
        self.client.force_authenticate(self.operator)
        self.assertTrue(self.client.get(self.path + "open/").data["open"])
        closed = self.punch("out", timestamp(self.day, 17, 38))
        self.assertEqual(closed.status_code, 201)
        entry.refresh_from_db()
        self.assertIsNone(entry.clock_out)
        path = f"{self.path}{entry.pk}/overtime/"
        self.assertEqual(self.client.post(path, {"minutes": 20}).status_code, 403)
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.decide(closed.data["id"]).status_code, 200)
        entry.refresh_from_db()
        self.assertEqual(entry.extra_minutes, 38)
        self.assertEqual(entry.approved_overtime, 0)
        self.assertEqual(self.client.post(path, {"minutes": 39}).status_code, 409)
        self.assertEqual(self.client.post(path, {"minutes": 14}).status_code, 409)
        self.assertEqual(self.client.post(path, {"minutes": 25}).data["approved_overtime"], 25)
        tomorrow = self.day + timedelta(days=1)
        report_period = {"start": self.day, "end": tomorrow}
        with patch("asistencias.services.timezone.now", return_value=timestamp(tomorrow, 18)):
            calendar = self.client.get(self.path + "calendar/", report_period)
            report = self.client.get("/api/v1/reports/", report_period)
        self.assertEqual(calendar.status_code, 200, calendar.data)
        self.assertEqual(calendar.data["days"][str(tomorrow)]["absent"], 1)
        self.assertEqual(report.data["attendance"], {"present": 1, "absent": 1, "late": 1, "overtime": 25})
        self.assertEqual(self.client.patch(f"/api/v1/shifts/{self.shift.pk}/", {"grace_minutes": 20}).status_code, 409)
        self.assertEqual(Attendance.objects.count(), 1)
        self.assertEqual(Notification.objects.filter(recipient=self.operator, kind="attendance_approved").count(), 2)

    def test_seller_can_request_rejection_is_audited_and_correction_is_private(self):
        seller = User.objects.create_user("ventas", role="seller")
        self.client.force_authenticate(self.admin)
        created = self.client.post("/api/v1/workers/", {
            "user": seller.pk, "document": "W-003", "position": "Vendedor", "joined_on": self.day,
        })
        self.assertEqual(created.status_code, 201, created.data)
        worker = Worker.objects.get(user=seller)
        Schedule.objects.create(worker=worker, shift=self.shift, effective_from=self.day)
        self.client.force_authenticate(seller)
        with patch("asistencias.services.timezone.now", return_value=timestamp(self.day, 8)):
            state = self.client.get(self.path + "state/")
        self.assertTrue(state.data["can_request"])
        denied = self.punch("in", timestamp(self.day, 8, 2))
        self.client.force_authenticate(self.operator)
        self.assertEqual(self.client.get(f"/api/v1/attendance-requests/{denied.data['id']}/").status_code, 404)
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.decide(denied.data["id"], "rejected").status_code, 400)
        self.assertEqual(self.decide(denied.data["id"], "rejected", "No llegó al local").status_code, 200)
        self.assertFalse(Attendance.objects.exists())
        self.client.force_authenticate(seller)
        accepted = self.punch("in", timestamp(self.day, 8, 12))
        self.client.force_authenticate(self.admin)
        result = self.decide(accepted.data["id"])
        path = self.path + f"{result.data['attendance']}/"
        corrected = self.client.post(path + "correct/", {
            "clock_in": timestamp(self.day, 8, 4), "clock_out": timestamp(self.day, 17),
            "reason": "Hora confirmada por el supervisor",
        })
        self.assertEqual(corrected.status_code, 200, corrected.data)
        audit = self.client.get(path + "corrections/").data["results"][0]
        self.assertEqual(audit["before"]["late_minutes"], 12)
        self.assertEqual(audit["after"]["late_minutes"], 0)
        self.assertEqual(audit["actor"], self.admin.username)
        self.client.force_authenticate(seller)
        self.assertEqual(self.client.get(path + "corrections/").status_code, 403)
        self.assertTrue(Notification.objects.filter(recipient=seller, kind="attendance_rejected").exists())

    def test_night_shift_uses_the_previous_day_and_only_its_owner_can_see_it(self):
        self.shift.starts_at, self.shift.ends_at = time(22), time(6)
        self.shift.save()
        tomorrow = self.day + timedelta(days=1)
        record = clock(self.operator, "in", now=timestamp(tomorrow, 1))
        self.assertEqual(record.date, self.day)
        self.assertEqual(record.expected_out, timestamp(tomorrow, 6))
        clock(self.operator, "out", now=timestamp(tomorrow, 6))
        other = User.objects.create_user("otro", role="warehouse")
        self.client.force_authenticate(other)
        self.assertEqual(self.client.get(f"{self.path}{record.pk}/").status_code, 404)


class ConcurrentAttendanceTests(TransactionTestCase):
    def test_two_requests_cannot_open_two_pending_slots(self):
        now = timezone.localtime()
        actor = User.objects.create_user("ventas-paralelo", role="seller")
        worker = Worker.objects.create(user=actor, document="W-004", position="Vendedor",
                                       joined_on=now.date())
        shift = Shift.objects.create(name="Turno diario", starts_at=time(8), ends_at=time(17),
                                     workdays=list(range(7)))
        Schedule.objects.create(worker=worker, shift=shift, effective_from=now.date())
        barrier = Barrier(2)

        def send(_):
            try:
                barrier.wait(timeout=5)
                request_punch(actor, "in")
                return 201
            except Conflict:
                return 409
            finally:
                connections.close_all()

        with ThreadPoolExecutor(max_workers=2) as pool:
            self.assertCountEqual(list(pool.map(send, range(2))), [201, 409])
        self.assertEqual(worker.punch_requests.count(), 1)
        self.assertFalse(worker.attendance.exists())
