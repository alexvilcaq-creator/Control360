from rest_framework import filters, viewsets

from accounts.permissions import RolePermission
from .models import Customer
from .serializers import CustomerSerializer


class CustomerViewSet(viewsets.ModelViewSet):
    permission_classes = [RolePermission]
    allowed_roles = ["admin", "seller"]
    action_roles = {"destroy": ["admin"]}
    queryset = Customer.objects.order_by("name", "pk")
    serializer_class = CustomerSerializer
    filter_backends = [filters.SearchFilter]
    search_fields = ["name", "document", "email"]

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)
