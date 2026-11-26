from django.contrib import admin

from config.admin import AuditAdmin
from .models import Attendance, AttendanceCorrection, AttendanceRequest, Schedule, Shift


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


@admin.register(AttendanceRequest)
class AttendanceRequestAdmin(AuditAdmin):
    list_display = ["worker", "action", "status", "requested_at", "decided_at", "reviewed_by"]
    list_filter = ["action", "status", "date"]
    search_fields = ["worker__user__username", "worker__document", "reviewed_by__username"]


@admin.register(AttendanceCorrection)
class AttendanceCorrectionAdmin(AuditAdmin):
    list_display = ["attendance", "actor", "reason", "created_at"]
    list_filter = ["created_at"]
    search_fields = ["attendance__worker__user__username", "actor__username", "reason"]
