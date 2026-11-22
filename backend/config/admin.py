from django.contrib import admin


class AuditAdmin(admin.ModelAdmin):
    """Las transiciones auditadas se realizan mediante los servicios de la API."""

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
