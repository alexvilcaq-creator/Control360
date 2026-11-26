# API REST de Control360

Prefijo `/api/v1`. Las rutas usan barra final. Los listados tienen el formato paginado `count`, `next`, `previous` y `results`. Los filtros se envían como parámetros de consulta.

| Método | Ruta | Alcance y parámetros |
| --- | --- | --- |
| GET | `/auth/csrf/` | Devuelve el token CSRF e inicializa su cookie. |
| POST | `/auth/login/` | Recibe `username` con usuario o correo y `password`. Devuelve identidad y token CSRF rotado. |
| GET | `/auth/me/` | Identidad y rol de la sesión. |
| POST | `/auth/logout/` | Cierra la sesión y devuelve 204. |
| GET | `/dashboard/`, `/summary/` | Panel por rol y resumen del catálogo activo. En el panel, `date=AAAA-MM-DD` selecciona la fecha para pedidos recientes de administración, cobros e indicadores de asistencia. Las colas y existencias representan el estado actual. |
| GET, POST | `/accounts/` | Listar/buscar y crear cuentas como administrador. |
| GET, PUT, PATCH | `/accounts/{id}/` | Administrar cuentas, con desactivación mediante `is_active`. |
| GET, POST | `/customers/` | Clientes para administrador y vendedor. Búsqueda con `search`. |
| GET, PUT, PATCH, DELETE | `/customers/{id}/` | Edición según rol. Eliminación de administrador cuando la relación lo permite. |
| GET, POST | `/products/`, `/categories/`, `/locations/` | Lectura autenticada, creación de administrador. Productos admite `category`, `stock=low\|out\|available`, `active=true\|false`, `ordering=id` y `search`. |
| GET, PUT, PATCH, DELETE | `/products/{id}/`, `/categories/{id}/`, `/locations/{id}/` | Lectura autenticada y escritura de administrador. Productos se desactivan con `is_active=false`. |
| GET | `/products/scan/?code=…` | Busca el código de barras exacto y luego el SKU de un producto activo. Devuelve sus existencias y ubicación. |
| GET, POST | `/products/{id}/movements/` | Historial y ajuste administrativo con `delta` y `reason`. |
| GET, POST | `/orders/` | Consulta por rol, `search`, `status`, `mine=true` en almacén. Creación de administrador o vendedor. |
| POST | `/orders/checkout/` | Administrador o vendedor. Recibe `customer`, `items`, `request_key` y `payment`. Devuelve pedido y comprobante. |
| POST | `/orders/{id}/payment/` | Registra un cobro para un pedido autorizado. Recibe `method`, `cash_received` para efectivo o `reference` interna opcional. |
| GET | `/payments/`, `/payments/{id}/` | Administrador y propietario del pedido. Filtros `search`, `status` y `method`. |
| POST | `/payments/{id}/void/` | Administrador. Registra anulación y responsable. Recibe `reason`. |
| GET, POST | `/incidents/` | Almacén consulta sus reportes y administración consulta todos. Crea con `kind`, `product` y `description`. Filtros `search` y `status`. |
| GET | `/incidents/{id}/` | Incluye historial de revisiones. |
| POST | `/incidents/{id}/review/` | Administrador. Recibe `status=review` o `resolved` y `note`. |
| GET | `/orders/{id}/` | Detalle con líneas, ubicaciones e historial, según alcance del usuario. |
| POST | `/orders/{id}/transition/` | Acciones `accept`, `assign`, `prepare`, `ready`, `deliver` o `cancel`. Asignación requiere `worker_id` y cancelación requiere `note`. |
| GET, POST | `/workers/`, `/shifts/` | Catálogos administrativos con `search`. |
| GET, PUT, PATCH, DELETE | `/workers/{id}/`, `/shifts/{id}/` | Administra los registros respetando las referencias y el historial. El turno asociado permanece fijo. |
| GET, POST | `/schedules/` | Asignaciones administrativas por trabajador y fecha de inicio. |
| DELETE | `/schedules/{id}/` | Retira una asignación futura. |
| GET | `/attendance/`, `/attendance/{id}/`, `/attendance/open/` | Consulta de vendedor u operario sobre su historial y consulta global de administrador. |
| GET | `/attendance/state/` | Vendedor u operario consulta turno, jornada abierta y solicitud pendiente. |
| POST | `/attendance/punch/` | Vendedor u operario solicita `action=in` o `action=out`. Devuelve la solicitud pendiente con la hora del servidor. |
| GET | `/attendance-requests/`, `/attendance-requests/{id}/` | Consulta propia o administrativa de las solicitudes. Filtro `status`. |
| POST | `/attendance-requests/{id}/decide/` | Administrador. Recibe `decision=approved` o `rejected`. Un rechazo requiere `note`. |
| POST | `/attendance/{id}/correct/` | Administrador. Recibe `clock_in`, `clock_out` (puede ser nulo) y `reason`. |
| GET | `/attendance/{id}/corrections/` | Administrador. Devuelve el historial de auditoría con valores previos y posteriores. |
| GET | `/attendance/calendar/` | Jornadas, faltas y conteo por fecha. Filtros `start`, `end` y `worker` para el administrador. |
| POST | `/attendance/{id}/overtime/` | Aprueba o revisa minutos extra mediante `minutes`. |
| GET | `/reports/`, `/reports/export/` | Reportes de administrador en JSON o CSV, con pedidos, cobros, incidencias y asistencia, con `start`, `end` y `group=day\|week\|month`. |
| GET | `/notifications/`, `/notifications/{id}/`, `/notifications/unread/` | Bandeja propia y contador de pendientes. |
| POST | `/notifications/{id}/read/`, `/notifications/read-all/` | Marca como leídas las notificaciones de la sesión. |

El cliente transmite la cookie de sesión con `credentials: include` y el token `X-CSRFToken` en escrituras, incluido el login. Los roles y el precio vigente se obtienen del servidor. El alta de pedido recibe `customer` e `items`, una lista de objetos con `product` y `quantity`. Envíale un UUID `request_key` estable para los reintentos. La misma cuenta recibe el pedido original si reenvía la misma clave, cliente y cantidades. Cambiar esos datos con la misma clave devuelve 409.

Códigos de respuesta habituales: 200 para consultas y cambios, 201 para altas, 204 para operaciones sin contenido, 400 para datos inválidos, 401 para sesión ausente, 403 para permisos o CSRF, 404 para recursos inexistentes o fuera de alcance y 409 para conflictos de inventario, relaciones o estado. El manejador de la API registra errores inesperados en el backend y devuelve 500 con un mensaje general.

Los métodos de cobro son `cash`, `card`, `yape` y `plin`. El importe y el cambio se calculan en Django. En checkout la validación de cobro y stock comparte una transacción. Para una marcación se conserva `requested_at` al solicitar y se agrega `decided_at` al revisar. La asistencia confirmada queda enlazada mediante `attendance`.
