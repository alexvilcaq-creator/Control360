"""Prepara una base MySQL independiente y arranca Django para la demo local."""

import argparse
import getpass
import json
import os
from pathlib import Path
import re
import secrets
import subprocess
import sys
import time

import MySQLdb

ROOT = Path(__file__).resolve().parent.parent
CONFIG_DIR = ROOT / ".control360-demo"
HOST = "127.0.0.1"


def load_config(mode):
    CONFIG_DIR.mkdir(mode=0o700, exist_ok=True)
    path = CONFIG_DIR / f"{mode}.json"
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


def prepare_docker_mysql(config, port):
    try:
        subprocess.run(["docker", "info", "--format", "{{.ServerVersion}}"], check=True,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=15)
    except (FileNotFoundError, subprocess.CalledProcessError, subprocess.TimeoutExpired) as error:
        raise RuntimeError("Abre Docker Desktop y espera a que el motor de Docker esté listo.") from error

    database = config["database"]
    container = "control360-demo-" + database[-8:]
    state = subprocess.run(
        ["docker", "container", "inspect", "--format", "{{.State.Running}}", container],
        capture_output=True, text=True,
    )
    if state.returncode != 0:
        print("Preparando el contenedor de MySQL. La primera descarga puede tardar.", flush=True)
        env = {**os.environ, "MYSQL_PASSWORD": config["database_password"]}
        subprocess.run([
            "docker", "run", "--detach", "--name", container,
            "--publish", f"{HOST}:{port}:3306",
            "--volume", f"{container}-data:/var/lib/mysql",
            "--env", f"MYSQL_DATABASE={database}",
            "--env", f"MYSQL_USER={database}",
            "--env", "MYSQL_PASSWORD",
            "--env", "MYSQL_RANDOM_ROOT_PASSWORD=yes",
            "mysql:8.4",
        ], check=True, env=env, stdout=subprocess.DEVNULL)
    elif state.stdout.strip() != "true":
        subprocess.run(["docker", "start", container], check=True, stdout=subprocess.DEVNULL)

    print(f"Esperando a MySQL en el puerto {port}…", flush=True)
    deadline = time.monotonic() + 90
    while True:
        try:
            demo_connection(config, port).close()
            return
        except MySQLdb.OperationalError as error:
            if time.monotonic() >= deadline:
                raise RuntimeError(f"MySQL no quedó disponible. Revisa el contenedor {container}.") from error
            time.sleep(1)


def start_django(config, mysql_port, backend_port):
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
    from accounts.models import User

    call_command("migrate", interactive=False)
    for role in User.Role.values:
        username = f"demo_{role}"
        if not User.objects.filter(username=username).exists():
            password = config["admin_password"] if role == User.Role.ADMIN else secrets.token_urlsafe(24)
            User.objects.create_user(username=username, role=role, password=password)

    call_command("create_demo_data")
    admin = User.objects.get(username="demo_admin")
    if admin.is_active and admin.check_password(config["admin_password"]):
        print(f"Usuario para la web: demo_admin\nContraseña de la demo: {config['admin_password']}", flush=True)
    else:
        print("Usuario para la web: demo_admin. Usa la contraseña que configuraste para esa cuenta.", flush=True)
    print(f"Iniciando Django en http://{HOST}:{backend_port}/", flush=True)
    call_command("runserver", f"{HOST}:{backend_port}", use_reloader=False)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mysql", choices=["native", "docker"])
    parser.add_argument("--mysql-port", type=int)
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()
    mysql_port = args.mysql_port or (3307 if args.mysql == "docker" else 3306)
    config = load_config(args.mysql)

    try:
        if args.mysql == "docker":
            prepare_docker_mysql(config, mysql_port)
        else:
            prepare_native_mysql(config, mysql_port)
    except (MySQLdb.Error, subprocess.CalledProcessError, RuntimeError) as error:
        print(f"No se pudo preparar MySQL: {error}", file=sys.stderr)
        return 1
    start_django(config, mysql_port, args.port)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
