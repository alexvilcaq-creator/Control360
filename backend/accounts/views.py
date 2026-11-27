from django.contrib.auth import authenticate, login as session_login, logout as session_logout
from django.http import JsonResponse
from django.middleware.csrf import get_token
from django.views.decorators.cache import never_cache
from rest_framework import filters, mixins, serializers, viewsets
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle

from .models import User
from .permissions import APISessionAuthentication, RolePermission, role_for
from .serializers import AccountSerializer


def user_data(user):
    return {"id": user.pk, "username": user.username,
            "name": user.get_full_name() or user.username, "role": role_for(user)}


def csrf_failure(request, reason=""):
    return JsonResponse({"detail": "La comprobación CSRF falló. Actualiza la página."}, status=403)


class Credentials(serializers.Serializer):
    username = serializers.CharField(max_length=254)
    password = serializers.CharField(max_length=4096, trim_whitespace=False, write_only=True)


class LoginThrottle(AnonRateThrottle):
    rate = "10/min"
    scope = "login"


@never_cache
@api_view(["GET"])
@permission_classes([AllowAny])
def csrf(request):
    return Response({"csrfToken": get_token(request)})


@never_cache
@api_view(["POST"])
@permission_classes([AllowAny])
@throttle_classes([LoginThrottle])
def login(request):
    APISessionAuthentication().enforce_csrf(request)
    credentials = Credentials(data=request.data)
    credentials.is_valid(raise_exception=True)
    user = authenticate(request, **credentials.validated_data)
    if user is None:
        return Response({"detail": "Usuario, correo o contraseña incorrectos."}, status=401)
    session_login(request, user)
    return Response({"user": user_data(user), "csrfToken": get_token(request)})


@never_cache
@api_view(["GET"])
def me(request):
    return Response(user_data(request.user))


@never_cache
@api_view(["POST"])
def logout(request):
    session_logout(request)
    return Response(status=204)


class AccountViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin,
                     mixins.CreateModelMixin, mixins.UpdateModelMixin, viewsets.GenericViewSet):
    permission_classes = [RolePermission]
    allowed_roles = ["admin"]
    queryset = User.objects.filter(is_staff=False, is_superuser=False).order_by("username")
    serializer_class = AccountSerializer
    filter_backends = [filters.SearchFilter]
    search_fields = ["username", "email", "first_name", "last_name"]
