from django.contrib import admin

from config.admin import AuditAdmin
from .models import Notification


@admin.register(Notification)
class NotificationAdmin(AuditAdmin):
    list_display = ["recipient", "kind", "message", "created_at", "read_at"]
    list_filter = ["kind", "created_at"]
    search_fields = ["recipient__username", "message"]
    list_select_related = ["recipient"]
