"""Prepara una base MySQL independiente y arranca Django para la demo local."""

import argparse
import getpass
import json
import os
from pathlib import Path
import re
import secrets
import sys
from tempfile import NamedTemporaryFile

import MySQLdb

ROOT = Path(__file__).resolve().parent.parent
CONFIG_DIR = ROOT / ".control360-demo"
HOST = "127.0.0.1"


def load_config():
    CONFIG_DIR.mkdir(mode=0o700, exist_ok=True)
    path = CONFIG_DIR / "native.json"
    if not path.exists():
        config = {
            "database": "control360demo" + secrets.token_hex(4),
            "database_password": secrets.token_hex(24),
            "django_key": secrets.token_hex(32),
            "admin_password": "Demo-" + secrets.token_urlsafe(12),
        }
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as file:
            json.dump(config, file)
    with path.open(encoding="utf-8") as file:
        config = json.load(file)
    if not re.fullmatch(r"control360demo[0-9a-f]{8}", config["database"]):
        raise ValueError("El nombre guardado de la base de demostración es inválido.")
    return config


def demo_connection(config, port):
    return MySQLdb.connect(
        host=HOST, port=port, connect_timeout=3, charset="utf8mb4",
        user=config["database"], password=config["database_password"], database=config["database"],
    )


def prepare_native_mysql(config, port):
    try:
        demo_connection(config, port).close()
        return
    except MySQLdb.OperationalError as error:
        if error.args[0] not in (1044, 1045, 1049):
            raise

    print("Primera ejecución. Ingresa tu cuenta administradora de MySQL para crear la base demo.")
    print("Esta cuenta se usa solo durante la preparación.")
    admin = input("Usuario administrador de MySQL [root]: ").strip() or "root"
    password = getpass.getpass("Contraseña del administrador de MySQL: ")
    connection = MySQLdb.connect(
        host=HOST, port=port, connect_timeout=3, user=admin, password=password, charset="utf8mb4",
    )
    database = config["database"]
    try:
        with connection.cursor() as cursor:
            cursor.execute(f"CREATE DATABASE IF NOT EXISTS `{database}` CHARACTER SET utf8mb4")
            # MySQL puede identificar las conexiones locales por nombre o por IP.
            for account_host in ("localhost", HOST):
                cursor.execute(
                    "CREATE USER IF NOT EXISTS %s@%s IDENTIFIED BY %s",
                    (database, account_host, config["database_password"]),
                )
                cursor.execute(
                    f"GRANT ALL PRIVILEGES ON `{database}`.* TO %s@%s",
                    (database, account_host),
                )
    finally:
        connection.close()
    demo_connection(config, port).close()


def prepare_demo_accounts(config, reset_staff_passwords):
    from django.db import transaction

    from accounts.demo import DEMO_STAFF_NAMES
    from accounts.models import User

    saved_passwords = config.setdefault("staff_passwords", {})
    saved_before = saved_passwords.copy()
    credentials = {}
    with transaction.atomic():
        for role in User.Role.values:
            username = f"demo_{role}"
            account = User.objects.select_for_update().filter(username=username).first()
            if role == User.Role.ADMIN:
                password = config["admin_password"]
            else:
                password = saved_passwords.get(role)
                if reset_staff_passwords or (account is None and not password):
                    password = saved_passwords[role] = "Demo-" + secrets.token_urlsafe(12)
            if account is None:
                first_name, last_name = DEMO_STAFF_NAMES.get(role, ("", ""))
                account = User.objects.create_user(
                    username=username, role=role, password=password, first_name=first_name, last_name=last_name,
                )
            elif reset_staff_passwords and role != User.Role.ADMIN and account.role == role:
                account.set_password(password)
                account.save(update_fields=["password"])
            if password and account.is_active and account.role == role and account.check_password(password):
                credentials[username] = password
        if saved_before != saved_passwords:
            with NamedTemporaryFile(dir=CONFIG_DIR, mode="w", encoding="utf-8", delete=False) as file:
                temp_path = Path(file.name)
                json.dump(config, file)
            try:
                temp_path.replace(CONFIG_DIR / "native.json")
            finally:
                temp_path.unlink(missing_ok=True)
    return credentials


def start_django(config, mysql_port, backend_port, reset_staff_passwords):
    import django
    from django.core.management import call_command

    sys.path.insert(0, str(ROOT / "backend"))
    os.environ.update(
        DJANGO_SETTINGS_MODULE="config.settings",
        DJANGO_SECRET_KEY=config["django_key"],
        DJANGO_DEBUG="true",
        DJANGO_ALLOWED_HOSTS="localhost,127.0.0.1",
        DJANGO_SECURE_COOKIES="false",
        FRONTEND_ORIGINS="http://localhost:5173,http://127.0.0.1:5173",
        MYSQL_HOST=HOST,
        MYSQL_PORT=str(mysql_port),
        MYSQL_DATABASE=config["database"],
        MYSQL_USER=config["database"],
        MYSQL_PASSWORD=config["database_password"],
    )
    django.setup()

    call_command("migrate", interactive=False)
    credentials = prepare_demo_accounts(config, reset_staff_passwords)
    call_command("create_demo_data")
    if "demo_admin" in credentials:
        print(f"Usuario para la web: demo_admin\nContraseña de la demo: {credentials['demo_admin']}", flush=True)
    else:
        print("Usuario para la web: demo_admin. Usa la contraseña que configuraste para esa cuenta.", flush=True)
    for username in ("demo_seller", "demo_warehouse"):
        if username in credentials:
            print(f"Cuenta de demostración: {username} · Contraseña: {credentials[username]}", flush=True)
    if len(credentials.keys() & {"demo_seller", "demo_warehouse"}) < 2:
        print("Para renovar las claves de las cuentas de personal de la demo usa --reset-staff-passwords.", flush=True)
    print(f"Iniciando Django en http://{HOST}:{backend_port}/", flush=True)
    call_command("runserver", f"{HOST}:{backend_port}", use_reloader=False)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    # Acepta el argumento usado por las instrucciones anteriores.
    parser.add_argument("mysql", nargs="?", choices=["native"], help=argparse.SUPPRESS)
    parser.add_argument("--mysql-port", type=int, default=3306)
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--reset-staff-passwords", action="store_true",
                        help="Renueva las claves de demo_seller y demo_warehouse en la base de demostración.")
    args = parser.parse_args()
    config = load_config()

    try:
        prepare_native_mysql(config, args.mysql_port)
    except MySQLdb.Error as error:
        if error.args[0] in (2002, 2003):
            print(
                f"MySQL no responde en {HOST}:{args.mysql_port}. Inicia el servicio de MySQL "
                "de tu equipo y vuelve a ejecutar la demo.",
                file=sys.stderr,
            )
        else:
            print(f"No se pudo preparar MySQL: {error}", file=sys.stderr)
        return 1
    start_django(config, args.mysql_port, args.port, args.reset_staff_passwords)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
