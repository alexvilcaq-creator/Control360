# Control360

Control360 es una aplicación web interna para una tienda con almacén. Conecta las ventas con la preparación y entrega de pedidos, registra los movimientos de inventario y centraliza la programación y asistencia del personal.

| Rol | Operaciones principales |
| --- | --- |
| Administrador | Gestiona catálogo, clientes, pedidos, trabajadores, cuentas y turnos. Revisa asistencia, aprueba tiempo extra y exporta reportes. |
| Vendedor | Registra clientes y pedidos, consulta existencias y confirma la entrega de sus pedidos listos. |
| Almacén | Consulta la cola de pedidos, acepta y prepara los que le corresponden, ubica productos y marca entrada y salida. |

La página de bienvenida es pública. Django valida la sesión, el rol y el alcance de cada operación interna. El panel y los gráficos consultan datos de MySQL mediante la API.

## Tecnologías y requisitos

- Python 3.12, Django 5.2, Django REST Framework, `django-cors-headers`, mysqlclient y MySQL 8.4.
- Node.js 22.12 o posterior, npm, Vite, React, React Router, Tailwind CSS, Lucide y Recharts.
- En Linux, instala las herramientas de compilación y las cabeceras de Python y MySQL si pip las necesita. En Debian y Ubuntu los paquetes habituales son `build-essential pkg-config python3-dev default-libmysqlclient-dev`.
- En Windows, usa Python de 64 bits y MySQL Community Server o Docker Desktop. Si pip requiere compilar mysqlclient, instala Visual Studio Build Tools con C++ y MariaDB Connector/C, y consulta la guía de instalación de [mysqlclient](https://pypi.org/project/mysqlclient/).

## Configurar MySQL y el entorno

Copia `.env.example` a `.env` en la raíz. En PowerShell utiliza `Copy-Item .env.example .env`. En Bash utiliza `cp .env.example .env` y limita los permisos del archivo a tu cuenta. Genera valores aleatorios distintos para `DJANGO_SECRET_KEY` y `MYSQL_PASSWORD`, por ejemplo con `python -c "import secrets; print(secrets.token_hex(32))"`. Configura `DJANGO_DEBUG=true` en desarrollo local.

| Variable | Uso |
| --- | --- |
| `DJANGO_SECRET_KEY` | Clave privada de Django. |
| `DJANGO_DEBUG`, `DJANGO_ALLOWED_HOSTS` | Depuración y hosts autorizados. |
| `FRONTEND_ORIGINS` | Orígenes exactos de CORS y CSRF, separados por comas. |
| `DJANGO_SECURE_COOKIES` | `false` con HTTP local y `true` con HTTPS. |
| `MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_HOST`, `MYSQL_PORT` | Credenciales y destino de MySQL. |
| `VITE_API_URL` | Base HTTP que usa React. El valor de desarrollo predeterminado es `/api/v1`. |
| `DJANGO_PROXY_TARGET` | Destino del proxy de Vite, por defecto `http://127.0.0.1:8000`. |
| `VITE_CURRENCY` | Código de moneda mostrado en pantalla, por defecto `COP`. |

En un servidor MySQL instalado en tu equipo, conéctate como administrador y crea un usuario específico para la base. Sustituye el valor indicado por la contraseña aleatoria de tu `.env`.

```sql
CREATE DATABASE control360 CHARACTER SET utf8mb4;
CREATE USER 'control360'@'localhost' IDENTIFIED BY '<contraseña de MYSQL_PASSWORD>';
GRANT ALL PRIVILEGES ON control360.* TO 'control360'@'localhost';
```

Los gráficos agrupan fechas en la zona `America/Bogota`. Carga las tablas de zonas horarias de MySQL si instalaste el servidor manualmente. En Linux se utiliza `mysql_tzinfo_to_sql` con los datos del sistema y en Windows está disponible el paquete oficial importable. Comprueba que la consulta siguiente devuelva una fecha en lugar de `NULL`. [Guía oficial de MySQL](https://dev.mysql.com/doc/refman/8.4/en/time-zone-support.html).

```sql
SELECT CONVERT_TZ('2026-01-01 12:00:00', 'UTC', 'America/Bogota');
```

Con Docker en Bash puedes iniciar una instancia local con volumen persistente. Conserva el mismo `.env` para reinicios posteriores del contenedor.

```bash
export MYSQL_ROOT_PASSWORD="$(python3 -c 'import secrets; print(secrets.token_hex(32))')"
docker run -d --name control360-mysql \
  --env-file <(grep -E '^MYSQL_(DATABASE|USER|PASSWORD)=' .env) -e MYSQL_ROOT_PASSWORD \
  -p 127.0.0.1:3306:3306 -v control360-mysql-data:/var/lib/mysql mysql:8.4
unset MYSQL_ROOT_PASSWORD
docker logs control360-mysql
```

Espera el mensaje de MySQL que indica que acepta conexiones. En siguientes sesiones inicia el contenedor existente con `docker start control360-mysql`.

## Instalar y ejecutar

En Windows, desde la raíz del repositorio en PowerShell:

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend/requirements.txt
.\.venv\Scripts\python.exe backend/manage.py migrate
.\.venv\Scripts\python.exe backend/manage.py create_demo_users
.\.venv\Scripts\python.exe backend/manage.py create_demo_data
.\.venv\Scripts\python.exe backend/manage.py runserver 127.0.0.1:8000
```

En macOS o Linux:

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r backend/requirements.txt
.venv/bin/python backend/manage.py migrate
.venv/bin/python backend/manage.py create_demo_users
.venv/bin/python backend/manage.py create_demo_data
.venv/bin/python backend/manage.py runserver 127.0.0.1:8000
```

En otra terminal:

```bash
cd frontend
npm ci
npm run dev
```

Abre `http://localhost:5173`. En VS Code puedes iniciar ambos servidores con la tarea **Control360: Django y Vite** después de instalar dependencias y aplicar las migraciones.

`create_demo_users` solicita una contraseña por cada cuenta y guarda hashes de Django. Las cuentas son `demo_admin`, `demo_seller` y `demo_warehouse`. En una base de demostración, `create_demo_data` registra un cliente ficticio, tres productos, existencias, pedidos, un turno, una asistencia histórica y su aprobación. Reejecutar el comando conserva los registros de demostración existentes sin duplicar las reservas. Usa `createsuperuser` para el acceso independiente a Django Admin.

Para desplegar el build de React, sirve `frontend/dist` con fallback a `index.html` y reenvía `/api` a Django mediante HTTPS. También puedes compilar con `VITE_API_URL` para una API de otro origen del mismo sitio y declarar el frontend en `FRONTEND_ORIGINS`. El cliente usa cookies y tokens CSRF.

## Probar

Da al usuario de Django permisos sobre `test_control360` o `test_<MYSQL_DATABASE>`. La suite crea y elimina esa base de pruebas.

```sql
GRANT ALL PRIVILEGES ON test_control360.* TO 'control360'@'localhost';
```

Adapta el nombre y el host de la cuenta al servidor usado. Activa el entorno virtual o sustituye `python` por su ejecutable.

```bash
cd backend
python manage.py check
python manage.py makemigrations --check --dry-run
python manage.py migrate --check
python manage.py test
cd ../frontend
npm ci
npm run build
```

## Comportamiento y alcance

- El alta de un pedido reserva unidades y guarda los precios vigentes. Una cancelación autorizada restaura las unidades. La entrega cierra el pedido sin un segundo descuento. React conserva una clave de solicitud al reintentar el alta.
- Un trabajador puede tener una jornada abierta y una marcación por fecha laboral. El turno del día se toma de la asignación vigente y puede cruzar medianoche.
- Las faltas se calculan al cerrar el horario programado. El tiempo adicional se registra en minutos después de la hora programada de salida y la aprobación requiere una acción administrativa.
- El reporte de stock bajo muestra las existencias actuales. Los otros reportes admiten períodos. Los avisos del navegador se actualizan mediante consultas periódicas.
- Este alcance usa días laborales semanales. Festivos, licencias, nómina, múltiples tramos de turno en el mismo día y conciliación de marcaciones omitidas requieren reglas adicionales.

Consulta el [contrato de API](docs/api.md), los [diagramas y la arquitectura](docs/arquitectura.md) y la [guía para el informe y la sustentación](docs/informe.md).
