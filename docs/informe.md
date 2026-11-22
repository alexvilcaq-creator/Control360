# Guía para el informe de Desarrollo de Aplicaciones Empresariales

## Problema y objetivo general

En una tienda con almacén, registrar ventas, existencias y asistencia en herramientas separadas dificulta saber qué se debe preparar, cuántas unidades están disponibles y quién intervino. El objetivo general de Control360 es integrar la operación de ventas y almacén en una aplicación web interna con información persistida y verificable.

## Objetivos específicos

1. Registrar y consultar pedidos con productos, cliente, precios vigentes, estado y responsables.
2. Mantener existencias consistentes ante operaciones concurrentes y conservar un historial de movimientos.
3. Controlar el acceso mediante roles de servidor, con paneles específicos para administración, ventas y almacén.
4. Registrar asistencia según turnos y distinguir tardanzas, faltas, tiempo adicional y horas extras aprobadas.
5. Consultar indicadores operativos con filtros de fechas y exportar reportes en CSV.

## Material técnico y guion de sustentación

Consulta los [diagramas, modelos y componentes](arquitectura.md), el [contrato REST](api.md) y las [instrucciones de instalación](../README.md).

1. Muestra el mapa de almacén y el saldo inicial de un producto. Inicia sesión como vendedor, registra un cliente y crea un pedido con dos productos.
2. Abre el panel de almacén, toma el pedido, verifica el pasillo y el estante, e inicia y termina la preparación. Muestra el aviso que llega al vendedor.
3. Confirma la entrega como vendedor. Revisa que el stock tenga un movimiento de reserva y que el historial del pedido incluya a los responsables.
4. Consulta el calendario como administrador y compara tardanza, tiempo adicional y minutos aprobados. Exporta el reporte con un filtro de fechas.
5. Explica las pruebas de concurrencia y la separación entre los permisos del navegador y la autorización de Django.

## Evidencias para incorporar al informe

| Evidencia | Espacio para el archivo o captura | Qué debe mostrar |
| --- | --- | --- |
| Acceso y roles | Pendiente de insertar en el informe | Identidad y alcance de un rol, sin mostrar contraseñas. |
| Pedido e inventario | Pendiente de insertar en el informe | Estado, líneas y movimiento de reserva del mismo pedido. |
| Asistencia | Pendiente de insertar en el informe | Jornada programada, entrada, salida y tiempo adicional. |
| Reportes | Pendiente de insertar en el informe | Filtro aplicado, gráfico y CSV correspondiente. |
| Pruebas | Pendiente de insertar en el informe | Salida de `manage.py test`, migraciones y compilación de Vite. |

## Conclusiones técnicas

1. Una transacción que reserva inventario y registra el pedido evita que un error parcial deje saldos modificados o líneas sin guardar.
2. Bloquear el pedido al aceptar permite que una sola operación gane incluso si dos operarios ven el mismo pedido disponible.
3. Validar permisos y relaciones en la API permite que React adapte la experiencia y que MySQL conserve datos consistentes.
4. Guardar el horario previsto y versionar asignaciones permite interpretar una marcación histórica cuando se programan turnos futuros.
5. Registrar tiempo adicional y aprobarlo como acciones distintas permite revisar los datos sin convertir automáticamente cada minuto en una hora extra.
6. Un cliente HTTP desacoplado permite cambiar la dirección de la API y conservar los componentes cuando se mantiene el contrato de datos y autenticación.

## Documentación oficial para la bibliografía APA 7

- Django Software Foundation. (s. f.). *Django documentation* (versión 5.2). https://docs.djangoproject.com/en/5.2/
- Encode. (s. f.). *Django REST framework*. https://www.django-rest-framework.org/
- Oracle. (s. f.). *MySQL 8.4 reference manual*. https://dev.mysql.com/doc/refman/8.4/en/
- React. (s. f.). *React documentation*. https://react.dev/
- Remix Software. (s. f.). *React Router documentation*. https://reactrouter.com/
- Vite. (s. f.). *Vite guide*. https://vite.dev/guide/
- Tailwind Labs. (s. f.). *Tailwind CSS documentation*. https://tailwindcss.com/docs/
- Recharts. (s. f.). *Recharts documentation*. https://recharts.org/
