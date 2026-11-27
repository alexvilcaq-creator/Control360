from secrets import token_hex, token_urlsafe

from django.db import transaction

from accounts.models import User


DEMO_STAFF_NAMES = {
    User.Role.SELLER: ("Andrés", "Cruz"),
    User.Role.WAREHOUSE: ("Mateo", "Vega"),
}


@transaction.atomic
def prepare_demo_accounts(config, reset_staff_passwords=False):
    saved_names = config.setdefault("account_names", {})
    saved_passwords = config.setdefault("staff_passwords", {})
    usernames = {}
    credentials = {}
    for role in User.Role.values:
        default_name = f"demo_{role}"
        username = saved_names.get(role, default_name)
        account = User.objects.select_for_update().filter(username=username).first()
        is_admin = role == User.Role.ADMIN
        password = config["admin_password"] if is_admin else saved_passwords.get(role)
        usable = account and account.is_active and account.role == role and not account.is_superuser
        known_password = usable and password and account.check_password(password)

        if account and (not usable or (is_admin and not known_password)):
            # Conserva la cuenta anterior y crea un acceso de prueba independiente.
            username = f"{default_name}_{token_hex(4)}"
            while User.objects.filter(username=username).exists():
                username = f"{default_name}_{token_hex(4)}"
            saved_names[role] = username
            password = None
            account = None

        if (account is None and not password) or (reset_staff_passwords and not is_admin):
            password = "Demo-" + token_urlsafe(12)
            if is_admin:
                config["admin_password"] = password
            else:
                saved_passwords[role] = password
        if account is None:
            first_name, last_name = DEMO_STAFF_NAMES.get(role, ("", ""))
            User.objects.create_user(
                username=username, role=role, password=password, first_name=first_name, last_name=last_name,
            )
            credentials[username] = password
        elif reset_staff_passwords and not is_admin:
            account.set_password(password)
            account.save(update_fields=["password"])
            credentials[username] = password
        elif known_password:
            credentials[username] = password
        usernames[role] = username
    return usernames, credentials
