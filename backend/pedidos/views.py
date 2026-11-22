from django.db.models import Prefetch, Q
from rest_framework import filters, mixins, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.response import Response

from accounts.permissions import RolePermission, role_for
from .models import Order, OrderEvent, OrderItem
from .serializers import OrderDetailSerializer, OrderInput, OrderSerializer, TransitionInput
from .services import change_order


def visible_orders(user):
    orders = Order.objects.all()
    role = role_for(user)
    if role == "seller":
        return orders.filter(seller=user)
    if role == "warehouse":
        return orders.filter(Q(status=Order.Status.PENDING) | Q(assignee__user=user))
    return orders


class OrderViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    permission_classes = [RolePermission]
    allowed_roles = ["admin", "seller", "warehouse"]
    action_roles = {"create": ["admin", "seller"]}
    filter_backends = [filters.SearchFilter]
    search_fields = ["=id", "customer__name", "items__sku"]
    serializer_class = OrderSerializer

    def get_queryset(self):
        queryset = visible_orders(self.request.user).select_related(
            "customer", "seller", "assignee__user",
        ).order_by("-created_at", "-pk")
        if self.action != "list":
            return queryset.prefetch_related(
                Prefetch("items", queryset=OrderItem.objects.select_related("product__location").order_by("pk")),
                Prefetch("history", queryset=OrderEvent.objects.select_related("actor")),
            )
        status = self.request.query_params.get("status")
        if status:
            if status not in Order.Status.values:
                raise ValidationError({"status": "Estado de pedido inválido."})
            queryset = queryset.filter(status=status)
        if role_for(self.request.user) == "warehouse" and self.request.query_params.get("mine") == "true":
            queryset = queryset.filter(assignee__user=self.request.user)
        return queryset

    def get_serializer_class(self):
        return OrderDetailSerializer if self.action == "retrieve" else OrderSerializer

    def create(self, request):
        data = OrderInput(data=request.data, context=self.get_serializer_context())
        data.is_valid(raise_exception=True)
        order = data.save()
        return Response(OrderDetailSerializer(order, context=self.get_serializer_context()).data, status=201)

    @action(detail=True, methods=["post"])
    def transition(self, request, pk=None):
        # Un pedido que otro operario acaba de tomar aún devuelve un conflicto de concurrencia.
        data = TransitionInput(data=request.data)
        data.is_valid(raise_exception=True)
        if data.validated_data["action"] != "accept" or role_for(request.user) != "warehouse":
            self.get_object()
        if not pk.isascii() or not pk.isdecimal() or len(pk) > 19 or int(pk) > 9223372036854775807:
            raise NotFound()
        order = change_order(order_id=int(pk), actor=request.user, **data.validated_data)
        return Response(OrderDetailSerializer(order, context=self.get_serializer_context()).data)
