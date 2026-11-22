from django.contrib import admin

from config.admin import AuditAdmin
from .models import Worker


@admin.register(Worker)
class WorkerAdmin(AuditAdmin):
    list_display = ["user", "document", "position", "joined_on", "ended_on"]
    list_filter = ["joined_on", "ended_on"]
    search_fields = ["document", "position", "user__username", "user__email"]
    list_select_related = ["user"]
