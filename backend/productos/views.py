from django.db.models import Count, F, Q
from django.db.models.deletion import ProtectedError
from rest_framework import filters, status, viewsets
from rest_framework.decorators import action, api_view
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from accounts.permissions import CatalogPermission, role_for
from inventario.serializers import AdjustmentSerializer, MovementSerializer
from inventario.services import adjust_stock
from .models import Category, Location, Product
from .serializers import CategorySerializer, LocationSerializer, ProductSerializer


class CatalogViewSet(viewsets.ModelViewSet):
    permission_classes = [CatalogPermission]
    filter_backends = [filters.SearchFilter]

    def destroy(self, request, *args, **kwargs):
        try:
            return super().destroy(request, *args, **kwargs)
        except ProtectedError:
            return Response({"detail": "El registro tiene referencias activas o historial."},
                            status=status.HTTP_409_CONFLICT)


class CategoryViewSet(CatalogViewSet):
    queryset = Category.objects.order_by("name", "pk")
    serializer_class = CategorySerializer
    search_fields = ["name"]


class LocationViewSet(CatalogViewSet):
    queryset = Location.objects.order_by("zone", "aisle", "shelf", "pk")
    serializer_class = LocationSerializer
    search_fields = ["zone", "aisle", "shelf"]


class ProductViewSet(CatalogViewSet):
    queryset = Product.objects.select_related("category", "location").order_by("-updated_at", "-pk")
    serializer_class = ProductSerializer
    search_fields = ["sku", "barcode", "name", "description", "category__name", "location__zone"]
    filter_backends = [*CatalogViewSet.filter_backends, filters.OrderingFilter]
    ordering_fields = ["id"]

    def get_queryset(self):
        queryset = super().get_queryset()
        if role_for(self.request.user) == "seller":
            queryset = queryset.filter(is_active=True)
        if self.action != "list":
            return queryset
        category = self.request.query_params.get("category")
        if category:
            if not category.isascii() or not category.isdecimal() or len(category) > 18:
                raise ValidationError({"category": "Indica el ID numérico de una categoría."})
            queryset = queryset.filter(category_id=int(category))
        active = self.request.query_params.get("active")
        if active in ("true", "false"):
            queryset = queryset.filter(is_active=active == "true")
        if self.request.query_params.get("stock") == "out":
            queryset = queryset.filter(stock=0)
        if self.request.query_params.get("stock") == "available":
            queryset = queryset.filter(stock__gt=0, is_active=True)
        if self.request.query_params.get("stock") == "low":
            queryset = queryset.filter(stock__lte=F("minimum_stock"))
        return queryset

    @action(detail=False)
    def scan(self, request):
        code = request.query_params.get("code", "").strip()
        if not code or len(code) > 64:
            raise ValidationError({"code": "Ingresa un código de hasta 64 caracteres."})
        products = self.get_queryset().filter(is_active=True)
        product = products.filter(barcode=code).first() or products.filter(sku=code).first()
        if not product:
            return Response({"detail": "Código sin productos activos asociados."}, status=404)
        return Response(self.get_serializer(product).data)

    @action(detail=True, methods=["post", "get"], url_path="movements")
    def movements(self, request, pk=None):
        product = self.get_object()
        if request.method == "POST":
            data = AdjustmentSerializer(data=request.data)
            data.is_valid(raise_exception=True)
            movement = adjust_stock(product_id=product.pk, actor=request.user, **data.validated_data)
            return Response(MovementSerializer(movement).data, status=status.HTTP_201_CREATED)
        queryset = product.movements.select_related("actor", "product")
        page = self.paginate_queryset(queryset)
        return self.get_paginated_response(MovementSerializer(page, many=True).data)


@api_view(["GET"])
def summary(request):
    return Response(Product.objects.filter(is_active=True).aggregate(
        products=Count("pk"),
        low_stock=Count("pk", filter=Q(stock__lte=F("minimum_stock"))),
        out_of_stock=Count("pk", filter=Q(stock=0)),
    ))
