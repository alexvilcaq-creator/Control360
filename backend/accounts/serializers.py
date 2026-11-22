from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from .models import User


class AccountSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=False, trim_whitespace=False, max_length=4096)

    class Meta:
        model = User
        fields = ["id", "username", "first_name", "last_name", "email", "role", "is_active", "password"]

    def validate_email(self, value):
        if value and User.objects.filter(email__iexact=value).exclude(pk=self.instance and self.instance.pk).exists():
            raise serializers.ValidationError("Este correo pertenece a otra cuenta.")
        return value.lower()

    def validate(self, attrs):
        user = self.instance
        if user and user.pk == self.context["request"].user.pk and (
            attrs.get("role", user.role) != user.role or not attrs.get("is_active", user.is_active)
        ):
            raise serializers.ValidationError("No puedes cambiar tu propio rol ni desactivar tu sesión.")
        if user and attrs.get("role", user.role) != user.role and hasattr(user, "worker"):
            raise serializers.ValidationError("La cuenta tiene un perfil de trabajador asociado.")
        password = attrs.get("password")
        if not password and user is None:
            raise serializers.ValidationError({"password": "Introduce una contraseña."})
        if password:
            candidate = User(**{
                key: attrs.get(key, getattr(user, key, ""))
                for key in ("username", "first_name", "last_name", "email")
            })
            try:
                validate_password(password, candidate)
            except DjangoValidationError as error:
                raise serializers.ValidationError({"password": error.messages}) from error
        return attrs

    def create(self, validated_data):
        return User.objects.create_user(**validated_data)

    def update(self, instance, validated_data):
        password = validated_data.pop("password", None)
        if password:
            instance.set_password(password)
            validated_data["password"] = instance.password
        return super().update(instance, validated_data)
