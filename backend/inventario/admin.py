from django.contrib import admin

from config.admin import AuditAdmin
from .models import IncidentEvent, InventoryIncident, Movement


@admin.register(Movement)
class MovementAdmin(admin.ModelAdmin):
    list_display = ["product", "actor", "delta", "balance", "created_at"]
    list_filter = ["created_at"]
    search_fields = ["product__sku", "actor__username", "reason"]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(InventoryIncident)
class IncidentAdmin(AuditAdmin):
    list_display = ["id", "kind", "status", "product", "reporter", "created_at"]
    list_filter = ["kind", "status", "created_at"]
    search_fields = ["product__sku", "product__name", "reporter__username", "description"]
    list_select_related = ["product", "reporter"]


@admin.register(IncidentEvent)
class IncidentEventAdmin(AuditAdmin):
    list_display = ["incident", "reviewer", "status", "created_at"]
    list_filter = ["status", "created_at"]
    search_fields = ["=incident_id", "reviewer__username", "note"]
