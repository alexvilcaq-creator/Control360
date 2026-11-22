from django.contrib import admin

from config.admin import AuditAdmin
from .models import Order, OrderEvent, OrderItem


@admin.register(Order)
class OrderAdmin(AuditAdmin):
    list_display = ["id", "customer", "seller", "assignee", "status", "total", "created_at"]
    list_filter = ["status", "created_at"]
    search_fields = ["=id", "customer__name", "seller__username"]
    list_select_related = ["customer", "seller", "assignee__user"]


@admin.register(OrderItem)
class OrderItemAdmin(AuditAdmin):
    list_display = ["order_id", "sku", "name", "quantity", "unit_price"]
    search_fields = ["=order_id", "sku", "name"]


@admin.register(OrderEvent)
class OrderEventAdmin(AuditAdmin):
    list_display = ["order_id", "actor", "previous", "status", "created_at"]
    list_filter = ["status", "created_at"]
    search_fields = ["=order_id", "actor__username"]
    list_select_related = ["actor"]
