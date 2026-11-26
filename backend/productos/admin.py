from django.contrib import admin

from .models import Category, Location, Product


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ["name"]
    search_fields = ["name"]


@admin.register(Location)
class LocationAdmin(admin.ModelAdmin):
    list_display = ["zone", "aisle", "shelf"]
    list_filter = ["zone"]
    search_fields = ["zone", "aisle", "shelf"]


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ["sku", "name", "category", "location", "price", "stock"]
    list_filter = ["category", "location__zone"]
    search_fields = ["sku", "barcode", "name"]
    readonly_fields = ["stock"]

    def save_model(self, request, obj, form, change):
        if change:
            fields = [name for name in form.changed_data if name != "stock"]
            obj.save(update_fields=[*fields, "updated_at"])
        else:
            super().save_model(request, obj, form, change)
