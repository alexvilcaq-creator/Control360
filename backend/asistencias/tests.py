from datetime import date, datetime, time, timedelta
from unittest.mock import patch

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User
from trabajadores.models import Worker
from .models import Attendance, Schedule, Shift
from .services import clock


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

    def test_punch_calendar_absence_and_overtime_approval(self):
        opened = self.punch("in", timestamp(self.day, 8, 11))
        self.assertEqual(opened.status_code, 201, opened.data)
        self.assertEqual(opened.data["late_minutes"], 11)
        self.assertTrue(self.client.get(self.path + "open/").data["open"])
        self.assertEqual(self.punch("in", timestamp(self.day, 8, 12)).status_code, 409)
        closed = self.punch("out", timestamp(self.day, 17, 38))
        self.assertEqual(closed.status_code, 200)
        self.assertEqual(closed.data["extra_minutes"], 38)
        self.assertEqual(closed.data["approved_overtime"], 0)
        self.assertEqual(self.punch("in", timestamp(self.day, 18)).status_code, 409)
        path = f'{self.path}{opened.data["id"]}/overtime/'
        self.assertEqual(self.client.post(path, {"minutes": 20}).status_code, 403)
        self.client.force_authenticate(self.admin)
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
        shift_path = f"/api/v1/shifts/{self.shift.pk}/"
        self.assertEqual(self.client.patch(shift_path, {"grace_minutes": 20}).status_code, 409)
        self.assertEqual(Attendance.objects.count(), 1)

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
