from rest_framework.authentication import SessionAuthentication
from rest_framework.permissions import SAFE_METHODS, BasePermission

from .models import User


class APISessionAuthentication(SessionAuthentication):
    def authenticate_header(self, request):
        return "Session"


def role_for(user):
    return User.Role.ADMIN if user.is_superuser else user.role


class CatalogPermission(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and (
            request.method in SAFE_METHODS or role_for(request.user) == User.Role.ADMIN
        )


class RolePermission(BasePermission):
    """Los ViewSets declaran sus roles a partir de la identidad de sesión."""

    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        roles = getattr(view, "action_roles", {}).get(getattr(view, "action", None), view.allowed_roles)
        return role_for(request.user) in roles
