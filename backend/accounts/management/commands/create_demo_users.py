import getpass

from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from accounts.demo import DEMO_STAFF_NAMES
from accounts.models import User


class Command(BaseCommand):
    help = "Crea las cuentas de demostración mediante contraseñas introducidas en terminal."

    def handle(self, **options):
        pending = []
        for role, label in User.Role.choices:
            username = f"demo_{role}"
            if User.objects.filter(username=username).exists():
                self.stdout.write(f"Ya existe {username}.")
                continue
            first_name, last_name = DEMO_STAFF_NAMES.get(role, ("", ""))
            user = User(username=username, role=role, first_name=first_name, last_name=last_name)
            password = getpass.getpass(f"Contraseña para {username} ({label}): ")
            if password != getpass.getpass("Confirma la contraseña: "):
                raise CommandError("Las contraseñas no coinciden.")
            try:
                validate_password(password, user)
            except ValidationError as error:
                raise CommandError(" ".join(error.messages)) from error
            user.set_password(password)
            pending.append(user)
        with transaction.atomic():
            User.objects.bulk_create(pending)
        for user in pending:
            self.stdout.write(self.style.SUCCESS(f"Creado {user.username}."))
