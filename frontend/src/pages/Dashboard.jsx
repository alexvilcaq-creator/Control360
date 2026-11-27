import { useCallback, useState } from 'react'
import {
  Activity, AlertTriangle, ArrowRight, BellRing, Boxes, CalendarDays, ChartNoAxesColumnIncreasing,
  Clock3, CreditCard, PackageCheck, PackagePlus, Plus, ShoppingCart, Users, UserRoundCheck, Warehouse, Zap,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { catalog } from '../api/catalog'
import { request } from '../api/client'
import { businessDateLabel, money, query } from '../api/operations'
import { OrderDistribution, OrderTrend } from '../components/Charts'
import Metric from '../components/DashboardMetric'
import PersonalAttendance from '../components/PersonalAttendance'
import ProductPhoto from '../components/ProductPhoto'
import { BarPanel } from '../components/ReferenceCharts'
import OrderTable from '../components/ReferenceOrderTable'
import { Empty, ErrorNotice, Loading, PageTitle, Section, Tag, TextLink } from '../components/UI'
import { useAuth } from '../context/Auth'
import { usePolling } from '../hooks/usePolling'
import { useQuery } from '../hooks/useQuery'

const loadDashboard = signal => request('/dashboard/', { signal })
const loadAttendance = signal => request('/attendance/state/', { signal })
const loadAvailable = signal => catalog.list('products', { active: 'true', stock: 'available', ordering: 'id' }, signal)
const units = amount => Number(amount).toLocaleString('es-PE')
const hours = minutes => (minutes / 60).toLocaleString('es-PE', { maximumFractionDigits: 1 }) + ' h'

function Quick({ to, icon: Icon, title, tone }) {
  return <Link to={to} className={`quick-action ${tone}`}><span className="quick-icon"><Icon size={16} strokeWidth={1.9}/></span>
    <span>{title}</span><ArrowRight className="quick-arrow" size={14}/></Link>
}

function Trends({ data }) {
  return <details className="dashboard-trends">
    <summary>Tendencias y distribución de pedidos</summary>
    <div className="chart-grid">
      <OrderTrend title="Pedidos de los últimos 7 días" data={data.trend}/>
      <OrderDistribution data={data.statuses}/>
    </div>
  </details>
}

function AdminDashboard() {
  const [date, setDate] = useState('')
  const [chartMode, setChartMode] = useState('quantity')
  const load = useCallback(signal => request(`/dashboard/?${query({ date })}`, { signal }), [date])
  const dashboard = usePolling(load, 25000)
  const { data } = dashboard
  const selected = date || data?.date
  const attendance = data?.attendance
  const rate = attendance?.scheduled ? Math.min(100, Math.round(100 * attendance.present / attendance.scheduled)) : 0
  const byValue = chartMode === 'value'
  const chart = data?.inventory_by_category.map(row => ({ name: row.name, value: Number(row[chartMode]) }))
  const inventoryTotal = chart?.reduce((total, category) => total + category.value, 0) || 0

  return <>
    <PageTitle title="Resumen de operaciones" subtitle="Pedidos, existencias y actividad del equipo en un solo lugar.">
      <label className="date-control"><CalendarDays size={17}/><span>
        {selected && (selected === data?.today ? 'Hoy, ' : '')}{selected && businessDateLabel(selected)}</span>
        <input type="date" aria-label="Fecha de resumen" value={selected || ''} max={data?.today}
          onChange={event => setDate(event.target.value)}/>
      </label>
    </PageTitle>
    <ErrorNotice message={dashboard.error}/>
    {dashboard.loading && !data ? <Loading/> : data && <>
      <div className="metrics-grid">
        <Metric icon={ShoppingCart} tone="teal" title="Pedidos del día" value={data.orders_today} label="En la fecha seleccionada" to="/pedidos"/>
        <Metric icon={Clock3} tone="amber" title="Pedidos pendientes" value={data.pending} label="Por aceptar en almacén" to="/pedidos?estado=pending"/>
        <Metric icon={Boxes} tone="red" title="Productos con bajo stock" value={data.low_stock} label="En el mínimo o por debajo" to="/inventario?stock=low"/>
        <Metric icon={Users} tone="green" title={selected === data.today ? 'Trabajadores presentes' : 'Asistencia del personal'}
          value={`${attendance.at_work} / ${attendance.scheduled}`} label={`${rate}% de asistencia`} to="/asistencia"/>
      </div>
      <div className="dashboard-grid dashboard-main">
        <Section title="Pedidos recientes" caption={businessDateLabel(data.date)} icon={ShoppingCart}
          action={<TextLink to="/pedidos">Ver todos</TextLink>} className="recent-panel table-panel">
          <OrderTable rows={data.recent}/>
        </Section>
        <Section title="Inventario por categoría" icon={ChartNoAxesColumnIncreasing} className="inventory-chart"
          action={<select aria-label="Vista de inventario" className="mini-select" value={chartMode}
            onChange={event => setChartMode(event.target.value)}>
            <option value="quantity">Por cantidad</option><option value="value">Por valor</option>
          </select>}>
          {!!chart?.length && <div className="inventory-total">
            <span>{byValue ? 'Valor de las existencias' : 'Existencia total'}</span>
            <strong>{byValue ? money.format(inventoryTotal) : units(inventoryTotal)} {!byValue && <small>u.</small>}</strong>
          </div>}
          <BarPanel data={chart} height={180} unit={byValue ? money.resolvedOptions().currency : 'unidades'} accent/>
        </Section>
      </div>
      <div className="dashboard-grid dashboard-secondary">
        <Section title="Alertas de bajo stock" icon={AlertTriangle} className="alerts-panel" action={<TextLink to="/inventario?stock=low">Ver inventario</TextLink>}>
          {data.alerts.length ? <div className="alert-list">{data.alerts.slice(0, 3).map(product =>
            <Link to={`/inventario?q=${encodeURIComponent(product.sku)}`} className="stock-alert" key={product.sku}>
              <ProductPhoto product={product}/><span className="stock-product"><strong>{product.name}</strong>
                <small>{product.category__name} · Mín. {product.minimum_stock}</small></span>
              <Tag tone="red">{product.stock} u.</Tag><ArrowRight size={15} className="stock-arrow"/>
            </Link>)}</div> : <Empty>No hay productos en el mínimo o por debajo.</Empty>}
        </Section>
        <Section title="Asistencia del equipo" icon={Activity} className="attendance-panel" action={<TextLink to="/asistencia">Historial</TextLink>}>
          <div className="attendance-widget">
            <div className="donut" style={{ '--progress': rate + '%' }}><div><strong>{rate}%</strong><span>Asistencia</span></div></div>
            <div className="attendance-stats"><span><i/> Presentes <strong>{attendance.present}</strong></span>
              <span><i/> Faltas <strong>{attendance.absent}</strong></span>
              <span><i/> Horas extra <strong>{hours(attendance.overtime)}</strong></span></div>
          </div>
          <div className="team-availability">
            <span><UserRoundCheck size={14}/> <strong>{data.employed}</strong> perfiles laborales activos</span>
            <TextLink to="/trabajadores">Ver equipo</TextLink>
          </div>
        </Section>
        <Section title="Acciones rápidas" icon={Zap}>
          <div className="quick-grid">
            <Quick to="/punto-de-venta" icon={Plus} title="Abrir punto de venta" tone="teal"/>
            <Quick to="/inventario?nuevo=1" icon={PackagePlus} title="Ingresar producto" tone="green"/>
            <Quick to="/trabajadores" icon={Users} title="Gestionar equipo" tone="purple"/>
            <Quick to="/asistencia" icon={UserRoundCheck} title={`Revisar asistencia (${data.pending_attendance})`} tone="teal"/>
          </div>
        </Section>
      </div>
      <Section title="Cobros e incidencias" icon={CreditCard}>
        <div className="operations-links dashboard-commercial">
          <Link to="/pagos"><span>Cobros de la fecha <small>{data.paid_count} pagos vigentes</small></span>
            <strong>{money.format(data.paid_today)}</strong></Link>
          <Link to="/incidencias">Incidencias abiertas <strong>{data.open_incidents}</strong></Link>
          <Link to="/alertas-stock">Alertas de stock <strong>{data.low_stock}</strong></Link>
        </div>
      </Section>
      <Trends data={data}/>
    </>}
  </>
}

function SellerDashboard({ dashboard, attendance }) {
  const products = useQuery(loadAvailable)
  const data = dashboard.data
  return <>
    <PageTitle title="Panel de ventas" subtitle="Registra pedidos, consulta su preparación y confirma las entregas.">
      <Link className="button button--primary" to="/punto-de-venta"><ShoppingCart size={17}/> Punto de venta</Link>
    </PageTitle>
    <ErrorNotice message={dashboard.error}/>
    {dashboard.loading && !data && <Loading/>}
    {data && <>
      <div className="metrics-grid">
        <Metric icon={CreditCard} tone="teal" title="Total cobrado hoy" value={money.format(data.paid_today)} label="Mis pagos vigentes" to="/pagos"/>
        <Metric icon={ShoppingCart} tone="amber" title="Pedidos pendientes" value={data.pending} label="Por aceptar en almacén" to="/pedidos?estado=pending"/>
        <Metric icon={BellRing} tone="amber" title="Listos para entregar" value={data.ready} label="Pendientes de confirmación" to="/pedidos?estado=ready"/>
        <Metric icon={PackageCheck} tone="green" title="Entregados" value={data.completed} label="Entregas confirmadas" to="/pedidos?estado=delivered"/>
      </div>
      {data.ready > 0 && <div className="ready-order-notice" role="status"><BellRing size={19}/>
        <span>{data.ready === 1 ? 'Tienes un pedido listo para entregar.' : `Tienes ${data.ready} pedidos listos para entregar.`}</span>
        <TextLink to="/pedidos?estado=ready">Ver listos</TextLink></div>}
      <div className="dashboard-grid staff-dashboard">
        <Section title="Mis pedidos recientes" icon={ShoppingCart} action={<TextLink to="/pedidos">Ver historial</TextLink>} className="table-panel recent-panel">
          <OrderTable rows={data.recent} empty="Todavía no tienes pedidos registrados."/>
        </Section>
        <div className="staff-dashboard-side">
          <PersonalAttendance resource={attendance}/>
          <Section title="Productos disponibles" icon={Boxes} action={<TextLink to="/inventario?stock=available">Ver inventario</TextLink>}>
            <ErrorNotice message={products.error}/>
            {products.loading ? <Loading/> : products.data?.results.length ? <div className="map-products">
              {products.data.results.slice(0, 3).map(product => <Link key={product.id} to={`/inventario?q=${encodeURIComponent(product.sku)}`}>
                <ProductPhoto product={product}/><div><strong>{product.name}</strong><small>{product.sku} · {money.format(product.price)}</small></div>
                <Tag tone="green">{product.stock} u.</Tag>
              </Link>)}
            </div> : <Empty>No hay productos con existencias.</Empty>}
          </Section>
        </div>
      </div>
      <Trends data={data}/>
    </>}
  </>
}

function WarehouseDashboard({ dashboard, attendance }) {
  const data = dashboard.data
  return <>
    <PageTitle title="Panel de almacén" subtitle="Acepta pedidos, ubica sus productos y registra el avance de preparación.">
      <Link className="button button--primary" to="/almacen"><Warehouse size={17}/> Mapa del almacén</Link>
    </PageTitle>
    <ErrorNotice message={dashboard.error}/>
    {dashboard.loading && !data && <Loading/>}
    {data && <>
      <div className="metrics-grid staff-metrics">
        <Metric icon={ShoppingCart} tone="amber" title="Pendientes de aceptar" value={data.pending} label="Disponibles para almacén" to="/pedidos?estado=pending"/>
        <Metric icon={Boxes} tone="teal" title="Mis pedidos en curso" value={data.assigned} label="Aceptados o en preparación" to="/pedidos?vista=asignados"/>
        <Metric icon={PackageCheck} tone="green" title="Mis pedidos listos" value={data.ready} label="Listos para entregar" to="/pedidos?vista=asignados&estado=ready"/>
      </div>
      <div className="dashboard-grid staff-dashboard">
        <div className="staff-dashboard-side">
          <Section title="Pedidos pendientes" icon={ShoppingCart} action={<TextLink to="/pedidos?estado=pending">Ver pendientes</TextLink>} className="table-panel recent-panel">
            <OrderTable rows={data.pending_recent} empty="No hay pedidos pendientes de aceptar."/>
          </Section>
          <Section title="Mis pedidos asignados" icon={Boxes} action={<TextLink to="/pedidos?vista=asignados">Ver asignados</TextLink>} className="table-panel recent-panel">
            <OrderTable rows={data.assigned_recent} empty="Todavía no tienes pedidos asignados."/>
          </Section>
        </div>
        <div className="staff-dashboard-side">
          <Section title="Alertas e incidencias" icon={AlertTriangle}>
            <div className="operations-links">
              <Link to="/alertas-stock">Productos con alerta de stock <strong>{data.low_stock}</strong></Link>
              <Link to="/incidencias">Mis incidencias abiertas <strong>{data.open_incidents}</strong></Link>
            </div>
          </Section>
          <PersonalAttendance resource={attendance}/>
        </div>
      </div>
      <Trends data={data}/>
    </>}
  </>
}

function StaffDashboard({ role }) {
  const dashboard = usePolling(loadDashboard)
  const attendance = usePolling(loadAttendance)
  const View = role === 'seller' ? SellerDashboard : WarehouseDashboard
  return <View dashboard={dashboard} attendance={attendance}/>
}

export default function Dashboard() {
  const { user } = useAuth()
  return user.role === 'admin' ? <AdminDashboard/> : <StaffDashboard role={user.role}/>
}
