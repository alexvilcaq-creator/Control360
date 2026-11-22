from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    class Role(models.TextChoices):
        ADMIN = "admin", "Administrador"
        SELLER = "seller", "Vendedor"
        WAREHOUSE = "warehouse", "Almacén"

    role = models.CharField(max_length=12, choices=Role.choices, default=Role.SELLER)

    class Meta:
        constraints = [models.CheckConstraint(
            condition=models.Q(role__in=["admin", "seller", "warehouse"]),
            name="account_valid_role",
        )]
