from django.utils import timezone
from rest_framework import filters, serializers, viewsets

from accounts.models import User
from accounts.permissions import RolePermission
from .models import Worker


class WorkerSerializer(serializers.ModelSerializer):
    user = serializers.PrimaryKeyRelatedField(queryset=User.objects.filter(role="warehouse", is_superuser=False))
    name = serializers.CharField(source="__str__", read_only=True)
    email = serializers.EmailField(source="user.email", read_only=True)
    active = serializers.SerializerMethodField()

    class Meta:
        model = Worker
        fields = ["id", "user", "name", "email", "document", "position", "joined_on", "ended_on", "active"]

    def get_active(self, worker):
        return worker.employed_on(timezone.localdate()) and worker.user.is_active

    def validate(self, attrs):
        worker = self.instance
        joined_on = attrs.get("joined_on", worker.joined_on if worker else timezone.localdate())
        ended_on = attrs.get("ended_on", worker.ended_on if worker else None)
        if ended_on and ended_on < joined_on:
            raise serializers.ValidationError("El fin laboral debe ser posterior o igual al ingreso.")
        user = attrs.get("user")
        if worker and user and user.pk != worker.user_id:
            raise serializers.ValidationError("La cuenta de un trabajador existente es permanente.")
        if user and Worker.objects.filter(user=user).exclude(pk=worker and worker.pk).exists():
            raise serializers.ValidationError({"user": "La cuenta ya tiene un perfil de trabajador."})
        return attrs


class WorkerViewSet(viewsets.ModelViewSet):
    permission_classes = [RolePermission]
    allowed_roles = ["admin"]
    queryset = Worker.objects.select_related("user").order_by("user__first_name", "user__username", "pk")
    serializer_class = WorkerSerializer
    filter_backends = [filters.SearchFilter]
    search_fields = ["document", "position", "user__username", "user__first_name", "user__last_name", "user__email"]
