from django.db.models import Q

from accounts.models import User
from .models import Notification


def notify(kind, message, *, roles=(), user_ids=(), order=None, product=None):
    recipients = Q(pk__in=[pk for pk in user_ids if pk])
    if roles:
        recipients |= Q(role__in=roles, is_superuser=False)
    if "admin" in roles:
        recipients |= Q(is_superuser=True)
    ids = User.objects.filter(recipients, is_active=True).values_list("pk", flat=True)
    Notification.objects.bulk_create([
        Notification(recipient_id=pk, kind=kind, message=message, order=order, product=product)
        for pk in ids
    ])
