from django.utils import timezone
from rest_framework import serializers, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import Notification


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = ["id", "kind", "message", "order", "product", "created_at", "read_at"]


class NotificationViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = NotificationSerializer

    def get_queryset(self):
        return Notification.objects.filter(recipient=self.request.user).order_by("-created_at", "-pk")

    @action(detail=False)
    def unread(self, request):
        return Response({"unread": self.get_queryset().filter(read_at__isnull=True).count()})

    @action(detail=False, methods=["post"], url_path="read-all")
    def read_all(self, request):
        self.get_queryset().filter(read_at__isnull=True).update(read_at=timezone.now())
        return Response(status=204)

    @action(detail=True, methods=["post"])
    def read(self, request, pk=None):
        notification = self.get_object()
        self.get_queryset().filter(pk=notification.pk, read_at__isnull=True).update(read_at=timezone.now())
        return Response(status=204)
