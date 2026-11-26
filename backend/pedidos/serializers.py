from decimal import Decimal
import re

from rest_framework import serializers

from clientes.models import Customer
from accounts.permissions import role_for
from .models import Order, OrderEvent, OrderItem, Payment
from .services import ACTION_LABELS, actions_for, place_order


class ItemInput(serializers.Serializer):
    product = serializers.IntegerField(min_value=1, max_value=9223372036854775807)
    quantity = serializers.IntegerField(min_value=1, max_value=99999)


class OrderInput(serializers.Serializer):
    request_key = serializers.UUIDField(required=False)
    customer = serializers.PrimaryKeyRelatedField(queryset=Customer.objects.all())
    items = ItemInput(many=True, allow_empty=False, max_length=30)

    def validate_items(self, items):
        if len({item["product"] for item in items}) != len(items):
            raise serializers.ValidationError("Agrupa las cantidades del mismo producto en una sola línea.")
        return items

    def create(self, validated_data):
        return place_order(**validated_data, actor=self.context["request"].user)


class TransitionInput(serializers.Serializer):
    action = serializers.ChoiceField(choices=list(ACTION_LABELS))
    worker_id = serializers.IntegerField(min_value=1, max_value=9223372036854775807, required=False)
    note = serializers.CharField(max_length=200, required=False, allow_blank=True)

    def validate(self, attrs):
        if attrs["action"] == "assign" and "worker_id" not in attrs:
            raise serializers.ValidationError({"worker_id": "Selecciona un trabajador."})
        if attrs["action"] == "cancel" and not attrs.get("note"):
            raise serializers.ValidationError({"note": "Indica el motivo de la cancelación."})
        return attrs


class OrderItemSerializer(serializers.ModelSerializer):
    location = serializers.CharField(source="product.location.__str__", read_only=True)

    class Meta:
        model = OrderItem
        fields = ["product", "sku", "name", "quantity", "unit_price", "location"]


class EventSerializer(serializers.ModelSerializer):
    actor = serializers.CharField(source="actor.username", read_only=True)

    class Meta:
        model = OrderEvent
        fields = ["id", "actor", "previous", "status", "note", "created_at"]


class OrderSerializer(serializers.ModelSerializer):
    customer_name = serializers.CharField(source="customer.name")
    seller_name = serializers.CharField(source="seller.username")
    assignee_name = serializers.CharField(source="assignee.__str__", default=None)
    actions = serializers.SerializerMethodField()

    class Meta:
        model = Order
        fields = ["id", "customer_name", "seller_name", "assignee_name", "status", "total",
                  "created_at", "updated_at", "actions"]

    def get_actions(self, order):
        return actions_for(order, self.context["request"].user)


class OrderDetailSerializer(OrderSerializer):
    items = OrderItemSerializer(many=True)
    history = EventSerializer(many=True)
    payment = serializers.SerializerMethodField()

    class Meta(OrderSerializer.Meta):
        fields = [*OrderSerializer.Meta.fields, "items", "history", "payment"]

    def get_payment(self, order):
        if role_for(self.context["request"].user) == "warehouse":
            return None
        payment = getattr(order, "payment", None)
        return PaymentSerializer(payment).data if payment else None


class PaymentInput(serializers.Serializer):
    method = serializers.ChoiceField(choices=Payment.Method.choices)
    cash_received = serializers.DecimalField(max_digits=22, decimal_places=2, min_value=Decimal("0"),
                                            allow_null=True, required=False, default=None)
    reference = serializers.CharField(max_length=60, allow_blank=True, required=False, default="")

    def validate_reference(self, value):
        digits = re.sub(r"[\s-]", "", value)
        if digits.isdecimal() and 13 <= len(digits) <= 19:
            raise serializers.ValidationError("Usa una referencia interna, como OP-1234.")
        return value


class CheckoutInput(OrderInput):
    request_key = serializers.UUIDField()
    payment = PaymentInput()


class PaymentSerializer(serializers.ModelSerializer):
    number = serializers.SerializerMethodField()
    customer = serializers.CharField(source="order.customer.name", read_only=True)
    seller = serializers.CharField(source="order.seller.username", read_only=True)
    cashier_name = serializers.CharField(source="cashier.username", read_only=True)
    voided_by_name = serializers.CharField(source="voided_by.username", read_only=True, default=None)

    class Meta:
        model = Payment
        fields = ["id", "number", "order", "customer", "seller", "cashier_name", "method", "status",
                  "amount", "cash_received", "change", "reference", "created_at", "voided_at",
                  "voided_by_name", "void_reason"]

    def get_number(self, payment):
        return f"C360-{payment.pk:06d}"


class PaymentVoidInput(serializers.Serializer):
    reason = serializers.CharField(max_length=250)
