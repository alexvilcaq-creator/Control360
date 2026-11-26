import { AlertTriangle, ArrowRight, Barcode, CalendarCheck, MapPin, ReceiptText, Boxes, CircleAlert, ClipboardList, Clock3, PackageCheck, PackageOpen, UsersRound } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { money } from '../api/operations'
import { request } from '../api/client'
import { OrderDistribution, OrderTrend } from '../components/Charts'
import { Empty, Loading, Notice, PageHeading } from '../components/UI'
import { useAuth } from '../context/Auth'
import { useQuery } from '../hooks/useQuery'
import { OrderTable } from './Orders'

const loadDashboard = signal => request('/dashboard/', { signal })
const metrics = [
  ['orders_today', 'Pedidos del día', ClipboardList],
  ['pending', 'Pedidos pendientes', PackageOpen],
  ['completed', 'Pedidos entregados', PackageCheck],
  ['products', 'Productos registrados', Boxes],
  ['low_stock', 'Productos con stock bajo', CircleAlert],
  ['present', 'Trabajadores presentes', UsersRound],
  ['late', 'Tardanzas del día', Clock3],
  ['overtime', 'Tiempo extra aprobado hoy', Clock3, ' min'],
  ['paid_today', 'Cobrado hoy', ReceiptText, money.format],
  ['open_incidents', 'Incidencias abiertas', AlertTriangle],
  ['pending_attendance', 'Asistencias por revisar', CalendarCheck],
  ['assigned', 'Mis tareas en curso', PackageCheck],
]

const shortcuts = {
  admin: [['/asistencia', 'Revisar asistencia', CalendarCheck], ['/pagos', 'Consultar cobros', ReceiptText],
    ['/incidencias', 'Revisar incidencias', AlertTriangle]],
  seller: [['/punto-de-venta', 'Abrir punto de venta', Barcode], ['/pagos', 'Historial de ventas', ReceiptText],
    ['/asistencia', 'Mi asistencia', CalendarCheck]],
  warehouse: [['/almacen', 'Mapa del almacén', MapPin], ['/productos?stock=low', 'Consultar stock bajo', Boxes],
    ['/incidencias', 'Reportar incidencia', AlertTriangle], ['/asistencia', 'Mi asistencia', CalendarCheck]],
}

const descriptions = {
  admin: 'Supervisa pedidos, existencias y asistencia del equipo.',
  seller: 'Sigue tus pedidos y revisa las existencias para atender a tus clientes.',
  warehouse: 'Consulta la cola de pedidos y sigue tus tareas de preparación.',
}

export default function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { data, error, loading } = useQuery(loadDashboard)
  return <>
    <PageHeading title={user.role === 'warehouse' ? 'Panel de almacén' : user.role === 'seller' ? 'Panel de ventas' : 'Resumen de operaciones'}
      description={descriptions[user.role]}>
      <Link className="button primary" to={user.role === 'seller' ? '/punto-de-venta' : '/pedidos'}>
        {user.role === 'seller' ? 'Abrir POS' : 'Ir a pedidos'} <ArrowRight size={17} />
      </Link>
    </PageHeading>
    <Notice>{error}</Notice>
    {loading && <Loading />}
    {data && <div className="dashboard-stack">
      <nav className="operation-shortcuts" aria-label="Acciones de mi rol">
        {shortcuts[user.role].map(([to, name, Icon]) => <Link className="panel" to={to} key={to}>
          <span className="tile-icon"><Icon size={18}/></span><strong>{name}</strong><ArrowRight size={16}/>
        </Link>)}
      </nav>
      <div className="metrics-grid">{metrics.filter(([key]) => Object.hasOwn(data, key)).map(([key, label, Icon, suffix]) =>
        <article key={key} className="metric"><span className="tile-icon"><Icon size={21} /></span>
          <p>{label}</p><strong>{typeof suffix === "function" ? suffix(data[key]) : data[key]}
            {typeof suffix === "string" && <small>{suffix}</small>}</strong>
        </article>)}</div>
      <div className="chart-grid"><OrderTrend title="Pedidos de los últimos 7 días" data={data.trend}/>
        <OrderDistribution data={data.statuses}/></div>
      <section className="panel"><div className="section-heading"><h2>Pedidos recientes</h2>
        <Link className="text-button" to="/pedidos">Ver todos</Link></div>
        {data.recent.length ? <OrderTable orders={data.recent} onOpen={id => navigate(`/pedidos?pedido=${id}`)}/>
          : <Empty>No hay pedidos recientes.</Empty>}</section>
      {data.alerts && <section className="panel"><div className="section-heading"><h2>Alertas de stock</h2></div>
        {data.alerts.length ? data.alerts.map(row => <div className="alert-row" key={row.sku}><strong>{row.name}</strong><span>{row.stock} disponibles · mínimo {row.minimum_stock}</span></div>)
          : <Empty>Los niveles de stock están por encima del mínimo.</Empty>}</section>}
    </div>}
  </>
}
