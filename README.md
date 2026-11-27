# Control360

Control360 es una aplicación web interna para una tienda con almacén. Integra el punto de venta, los cobros, la preparación y entrega de pedidos, el control de inventario y la asistencia del personal.

| Rol | Operaciones principales |
| --- | --- |
| Administrador | Gestiona usuarios, catálogo, pedidos, trabajadores y turnos. Revisa y corrige asistencias, consulta y anula cobros, resuelve incidencias y exporta reportes. |
| Vendedor | Usa el POS, escanea productos, registra cobros, consulta sus ventas, confirma entregas y solicita su entrada o salida. |
| Almacén | Acepta y prepara pedidos, consulta existencias y ubicaciones, reporta incidencias y solicita su entrada o salida. |

La página de bienvenida es pública. Django valida la sesión, el rol y el alcance de cada operación interna. El panel y los gráficos consultan datos de MySQL mediante la API.

La interfaz comparte el logotipo, las imágenes, la tipografía Inter y los componentes visuales de Control360-DW. Las dos versiones tienen esquemas MySQL propios. Esta versión usa Django, Django REST Framework y el cliente HTTP de React.

## Tecnologías y requisitos

- Python 3.12, Django 5.2, Django REST Framework, `django-cors-headers`, mysqlclient y MySQL 8.4.
- Node.js 22.12 o posterior, npm, Vite, React, React Router, Tailwind CSS, Lucide y Recharts.
- En Linux, instala las herramientas de compilación y las cabeceras de Python y MySQL si pip las necesita. En Debian y Ubuntu los paquetes habituales son `build-essential pkg-config python3-dev default-libmysqlclient-dev`.
- En Windows, usa Python de 64 bits y MySQL Community Server. Si pip requiere compilar mysqlclient, instala Visual Studio Build Tools con C++ y MariaDB Connector/C, y consulta la guía de instalación de [mysqlclient](https://pypi.org/project/mysqlclient/).

## Probar la demo desde VS Code

Abre la carpeta raíz de Control360 en VS Code. Con Python 3.12, `.venv` y las dependencias de Python instaladas, presiona `Ctrl+Shift+P`, abre **Tareas: Ejecutar tarea** y elige **Control360: Backend demo**.

Si ya tienes Control360 en tu PC, actualiza la copia con `git pull --ff-only origin main` desde la raíz. Reinicia Django y vuelve a ejecutar `npm ci` en `frontend` para instalar la fuente Inter antes de iniciar Vite.

La tarea usa el **servidor MySQL instalado en tu PC**, en el puerto 3306. Verifica que esté iniciado. En Windows puedes comprobarlo desde **Servicios** (`services.msc`). Si es la primera ejecución, la tarea solicita tu cuenta administradora de MySQL (normalmente `root`) y su contraseña para crear una base y un usuario exclusivos para la demo.

La tarea aplica las migraciones y muestra en su terminal las cuentas `demo_admin`, `demo_seller` y `demo_warehouse` con sus contraseñas locales cuando están guardadas en la configuración de la demo. El inicio habitual conserva los datos almacenados. La tarea guarda su configuración en `.control360-demo/`, excluida de Git, y conserva el archivo `.env`.

Si un nombre de demo ya está ocupado por una cuenta desactivada, con otro rol o incompatible con la configuración local, el iniciador conserva esa cuenta y muestra un nuevo usuario de prueba con sufijo. Para entrar, copia el usuario completo y la contraseña que imprime la terminal.

Deja el backend abierto en el puerto 8000 y ejecuta la tarea **Control360: Vite** si todavía necesitas iniciar React. Si es tu primera instalación del frontend, ejecuta `npm ci` en `frontend` antes de iniciar Vite. Abre `http://localhost:5173` e inicia sesión con los datos de la terminal de VS Code.

Desde CMD, en la raíz del repositorio y con `.venv` activado, puedes iniciar la demo directamente:

```cmd
python scripts\iniciar_demo.py
```

Usa `--mysql-port 3307` si ese es el puerto que confirmaste en tu equipo. Si ya tenías una base de demostración de una versión anterior y te faltan las contraseñas de vendedor y almacén, añade una vez `--reset-staff-passwords`. El parámetro renueva las contraseñas de las dos cuentas de personal que usa el iniciador en la base de demostración.

Usa `--seed-demo` solo para cargar intencionalmente el catálogo, los pedidos y el personal de ejemplo en tu base de demostración. Una instalación nueva que arranca sin ese parámetro empieza con el catálogo vacío. Para usarla con tus datos, registra productos, clientes y las fichas del personal desde el panel de administración.

Si `DEMO-A` aparece en la interfaz, es una zona guardada en la base consultada. El escenario anterior usaba los SKU `C360-DEMO-01` (Teclado mecánico), `C360-DEMO-02` (Ratón inalámbrico) y `C360-DEMO-03` (Cable USB-C). El escenario de DW usaba `BEB-001` a `BEB-003`, `ABA-001` a `ABA-003`, `LIM-001` a `LIM-003` y `HOG-001` a `HOG-003`, con el movimiento inicial «Apertura del catálogo de demostración». Verifica el nombre y ese movimiento en **Inventario** antes de identificar un SKU compartido como dato de prueba.

Si el puerto 8000 está ocupado por otro Django que iniciaste antes, detén ese proceso con `Ctrl+C` en su terminal.

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
| `VITE_CURRENCY` | Código de moneda mostrado en pantalla. La demo usa `PEN`. Si tu catálogo ya está en pesos colombianos, configura `VITE_CURRENCY=COP` en `frontend/.env.local` y reinicia Vite. El ajuste cambia el formato visual y conserva los importes almacenados. |

Usa la base existente de Empresariales (por defecto `control360`) o una base dedicada para esta aplicación. Mantén un nombre diferente a `control360_dw`. Aplica las migraciones de Django pendientes antes de arrancar.

En un servidor MySQL instalado en tu equipo, conéctate como administrador y crea un usuario específico para la base. Sustituye el valor indicado por la contraseña aleatoria de tu `.env`.

```sql
CREATE DATABASE control360 CHARACTER SET utf8mb4;
CREATE USER 'control360'@'localhost' IDENTIFIED BY '<contraseña de MYSQL_PASSWORD>';
GRANT ALL PRIVILEGES ON control360.* TO 'control360'@'localhost';
```

Los gráficos agrupan fechas en la zona `America/Bogota`. Si las tablas de zonas horarias están disponibles, MySQL agrupa los resultados. Django calcula esa agrupación cuando faltan las tablas. Para cargarlas, en Linux se utiliza `mysql_tzinfo_to_sql` con los datos del sistema y en Windows está disponible el paquete oficial importable. Comprueba que la consulta siguiente devuelva una fecha en lugar de `NULL`. [Guía oficial de MySQL](https://dev.mysql.com/doc/refman/8.4/en/time-zone-support.html).

```sql
SELECT CONVERT_TZ('2026-01-01 12:00:00', 'UTC', 'America/Bogota');
```

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

`create_demo_users` solicita una contraseña por cada cuenta y guarda hashes de Django. Las cuentas son `demo_admin`, `demo_seller` y `demo_warehouse`. En una base de demostración nueva, `create_demo_data` carga el escenario de DW con 12 productos y sus códigos de barras, cuatro categorías, nueve ubicaciones, cinco clientes, diez trabajadores, dos turnos y 24 pedidos de ejemplo. Estos pedidos se registran desde la cuenta de administración. Las ventas que registra el vendedor aparecen en su propio historial. En bases usadas, la carga conserva los registros existentes y omite los pedidos de ejemplo que necesitarían productos o clientes previamente registrados. Usa `createsuperuser` para el acceso independiente a Django Admin.

Para desplegar el build de React, sirve `frontend/dist` con fallback a `index.html` y reenvía `/api` a Django mediante HTTPS. También puedes compilar con `VITE_API_URL` para una API de otro origen del mismo sitio y declarar el frontend en `FRONTEND_ORIGINS`. El cliente usa cookies y tokens CSRF.

## Probar los flujos con los tres roles

1. Entra como vendedor y abre **Punto de venta**. Elige a Carlos Ramos y busca `BEB-001`, o enfoca **Código de barras** y escribe `2000000000015` y pulsa Enter. Un lector físico puede enviar ese mismo código y la tecla Enter. Puedes registrar el pedido con el cobro o cobrarlo más tarde desde el detalle.
2. Elige efectivo e ingresa un importe suficiente para verificar el cambio en el comprobante. Para tarjeta, Yape o Plin, usa una referencia interna como `OP-1234` y revisa el historial. Cada cobro es un registro manual de demostración. La impresión es un comprobante interno.
3. Entra como operario de almacén. Acepta el pedido, inicia preparación y márcalo listo. Vuelve a ventas para confirmar la entrega. Verifica el movimiento de reserva de stock en **Inventario**.
4. En almacén, filtra **Stock bajo** o **Agotado** y reporta una incidencia en el producto. Como administrador, revisa la notificación y guarda la resolución. Compara las existencias antes y después de reportar la incidencia.
5. En **Asistencia**, un vendedor u operario con ficha y turno envía una solicitud de entrada. Como administrador, verifica el aviso, revisa las horas y aprueba. Repite con la salida. Una solicitud rechazada requiere motivo. En el historial de administración, **Corregir** exige justificación y deja una auditoría de los cambios.
6. Usa **Reportes** para consultar las asistencias confirmadas, los cobros por método y las incidencias del período. Exporta CSV y revisa que conserve los totales.

## Pruebas automatizadas

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
- Un empleado puede tener una solicitud pendiente y una jornada abierta. Al aprobar se usa la hora solicitada para calcular las marcaciones y se guarda por separado la hora de la decisión. Los turnos pueden cruzar medianoche y las asistencias históricas siguen disponibles.
- El pago toma el total guardado del pedido. La reserva y el cobro desde POS se procesan juntos y comparten la clave de reintento. Anular un cobro conserva su historial, y cancelar el pedido también repone sus unidades.
- Una incidencia registra observaciones y revisiones. Cualquier ajuste de stock se realiza como movimiento administrativo.
- Las faltas se calculan al cerrar el horario programado. El tiempo adicional se registra en minutos después de la hora programada de salida y la aprobación requiere una acción administrativa.
- El reporte de stock bajo muestra las existencias actuales. Los otros reportes admiten períodos. Los avisos del navegador se actualizan mediante consultas periódicas.
- Este alcance usa días laborales semanales. Festivos, licencias, nómina, múltiples tramos de turno en el mismo día y conciliación de marcaciones omitidas requieren reglas adicionales.

Consulta el [contrato de API](docs/api.md), los [diagramas y la arquitectura](docs/arquitectura.md) y la [guía para el informe y la sustentación](docs/informe.md).
