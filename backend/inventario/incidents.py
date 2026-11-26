from django.db import transaction
from rest_framework import filters, mixins, serializers, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from accounts.permissions import RolePermission, role_for
from config.api import Conflict
from notificaciones.services import notify
from .models import IncidentEvent, InventoryIncident


class IncidentEventSerializer(serializers.ModelSerializer):
    reviewer_name = serializers.CharField(source="reviewer.username", read_only=True)

    class Meta:
        model = IncidentEvent
        fields = ["id", "reviewer_name", "status", "note", "created_at"]


class IncidentSerializer(serializers.ModelSerializer):
    reporter_name = serializers.CharField(source="reporter.username", read_only=True)
    product_name = serializers.CharField(source="product.name", read_only=True, default=None)
    history = IncidentEventSerializer(many=True, read_only=True)

    class Meta:
        model = InventoryIncident
        fields = ["id", "reporter_name", "product", "product_name", "kind", "description", "status",
                  "created_at", "history"]
        read_only_fields = ["status", "created_at"]

    def validate(self, attrs):
        if attrs["kind"] != InventoryIncident.Kind.OTHER and not attrs.get("product"):
            raise serializers.ValidationError({"product": "Selecciona el producto afectado."})
        return attrs


class ReviewInput(serializers.Serializer):
    status = serializers.ChoiceField(choices=[InventoryIncident.Status.REVIEW, InventoryIncident.Status.RESOLVED])
    note = serializers.CharField(max_length=500)


class IncidentViewSet(mixins.CreateModelMixin, mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    permission_classes = [RolePermission]
    allowed_roles = ["admin", "warehouse"]
    action_roles = {"review": ["admin"]}
    serializer_class = IncidentSerializer
    filter_backends = [filters.SearchFilter]
    search_fields = ["description", "product__name", "product__sku", "reporter__username"]

    def get_queryset(self):
        queryset = InventoryIncident.objects.select_related("reporter", "product").prefetch_related("history__reviewer")
        if role_for(self.request.user) != "admin":
            queryset = queryset.filter(reporter=self.request.user)
        state = self.request.query_params.get("status")
        if self.action == "list" and state:
            if state not in InventoryIncident.Status.values:
                raise serializers.ValidationError({"status": "Estado de incidencia inválido."})
            queryset = queryset.filter(status=state)
        return queryset.order_by("-created_at", "-pk")

    @transaction.atomic
    def perform_create(self, serializer):
        incident = serializer.save(reporter=self.request.user)
        notify("incident_reported", f"Se registró la incidencia #{incident.pk}: {incident.get_kind_display()}.",
               roles=["admin"], product=incident.product)

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def review(self, request, pk=None):
        data = ReviewInput(data=request.data)
        data.is_valid(raise_exception=True)
        incident = InventoryIncident.objects.select_for_update().get(pk=self.get_object().pk)
        state = data.validated_data["status"]
        if incident.status == InventoryIncident.Status.RESOLVED or incident.status == state:
            raise Conflict("La incidencia ya está en ese estado o quedó resuelta.")
        incident.status = state
        incident.save(update_fields=["status"])
        IncidentEvent.objects.create(incident=incident, reviewer=request.user, **data.validated_data)
        notify("incident_reviewed", f"Incidencia #{incident.pk}: {incident.get_status_display()}.",
               user_ids=[incident.reporter_id], product=incident.product)
        return Response(self.get_serializer(incident).data)
