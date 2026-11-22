from django.conf import settings
from django.db import models


class Customer(models.Model):
    name = models.CharField(max_length=160)
    document = models.CharField(max_length=35, unique=True)
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=35, blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL)

    def __str__(self):
        return self.name
