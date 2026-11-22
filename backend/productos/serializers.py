from decimal import Decimal

from rest_framework import serializers

from .models import Category, Location, Product


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ["id", "name"]


class LocationSerializer(serializers.ModelSerializer):
    label = serializers.CharField(source="__str__", read_only=True)

    class Meta:
        model = Location
        fields = ["id", "zone", "aisle", "shelf", "label"]


class ProductSerializer(serializers.ModelSerializer):
    is_active = serializers.BooleanField(default=True)
    price = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal("0"))
    category_name = serializers.CharField(source="category.name", read_only=True)
    location_label = serializers.CharField(source="location.__str__", read_only=True)

    class Meta:
        model = Product
        fields = ["id", "sku", "name", "description", "category", "category_name",
                  "location", "location_label", "price", "stock", "minimum_stock", "is_active", "updated_at"]
        read_only_fields = ["stock", "updated_at"]

    def update(self, instance, validated_data):
        for field, value in validated_data.items():
            setattr(instance, field, value)
        instance.save(update_fields=[*validated_data, "updated_at"])
        instance.refresh_from_db()
        return instance
