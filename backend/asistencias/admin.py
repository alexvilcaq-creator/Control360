from django.contrib import admin

from config.admin import AuditAdmin
from .models import Attendance, Schedule, Shift


@admin.register(Shift)
class ShiftAdmin(AuditAdmin):
    list_display = ["name", "starts_at", "ends_at", "grace_minutes", "overtime_minimum"]
    search_fields = ["name"]


@admin.register(Schedule)
class ScheduleAdmin(AuditAdmin):
    list_display = ["worker", "shift", "effective_from"]
    list_filter = ["shift", "effective_from"]
    search_fields = ["worker__user__username", "shift__name"]
    list_select_related = ["worker__user", "shift"]


@admin.register(Attendance)
class AttendanceAdmin(AuditAdmin):
    list_display = ["worker", "date", "clock_in", "clock_out", "late_minutes", "extra_minutes", "approved_overtime"]
    list_filter = ["date"]
    search_fields = ["worker__user__username", "worker__document"]
    list_select_related = ["worker__user"]
