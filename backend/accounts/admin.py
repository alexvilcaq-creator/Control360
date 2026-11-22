from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import User


@admin.register(User)
class ControlUserAdmin(UserAdmin):
    list_display = (*UserAdmin.list_display, "role")
    list_filter = (*UserAdmin.list_filter, "role")
    fieldsets = (*UserAdmin.fieldsets, ("Control360", {"fields": ("role",)}))
    add_fieldsets = (*UserAdmin.add_fieldsets, ("Control360", {"fields": ("role",)}))
