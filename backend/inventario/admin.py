from django.contrib import admin

from .models import Movement


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
