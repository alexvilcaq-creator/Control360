from rest_framework import serializers

from .models import Movement


class AdjustmentSerializer(serializers.Serializer):
    delta = serializers.IntegerField(min_value=-2147483647, max_value=2147483647)
    reason = serializers.CharField(max_length=200)

    def validate_delta(self, value):
        if value == 0:
            raise serializers.ValidationError("Indica una cantidad distinta de cero.")
        return value


class MovementSerializer(serializers.ModelSerializer):
    actor_name = serializers.CharField(source="actor.username", default=None, read_only=True)
    sku = serializers.CharField(source="product.sku", read_only=True)

    class Meta:
        model = Movement
        fields = ["id", "product", "sku", "actor_name", "delta", "balance", "reason", "created_at"]
