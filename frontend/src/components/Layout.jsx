import { useCallback, useEffect, useState } from 'react'
import {
  AlertTriangle, ArrowRight, Barcode, Bell, Boxes, CalendarCheck, ChartColumnIncreasing,
  CheckCheck, ChevronDown, ChevronRight, CircleHelp, ClipboardList, Clock3, LayoutDashboard,
  LogOut, MapPin, Menu, Moon, Package2, ReceiptText, Search, Settings, ShieldCheck,
  ShoppingCart, Sun, Tags, Users, Warehouse,
} from 'lucide-react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { catalog } from '../api/catalog'
import { request } from '../api/client'
import { businessDateLabel, notificationTarget, orderCode, post, timeLabel } from '../api/operations'
import { useAuth } from '../context/Auth'
import { useTheme } from '../context/Theme'
import { usePolling } from '../hooks/usePolling'
import { useQuery } from '../hooks/useQuery'
import { Brand, Button, Dialog, Empty, ErrorNotice, Loading, TextLink } from './UI'

export const roles = { admin: 'Administrador', seller: 'Vendedor', warehouse: 'Trabajador de almacén' }

const all = ['admin', 'seller', 'warehouse']
const office = ['admin', 'seller']
const storage = ['admin', 'warehouse']
const navigation = [
  { to: '/panel', label: 'Resumen', icon: LayoutDashboard, roles: all },
  { to: '/punto-de-venta', label: 'Punto de venta', icon: Barcode, roles: office },
  { to: '/pedidos', label: 'Pedidos', icon: ShoppingCart, roles: all },
  { to: '/pagos', label: 'Historial de pagos', icon: ReceiptText, roles: office },
  { to: '/inventario', label: 'Inventario', icon: Boxes, roles: all },
  { to: '/almacen', label: 'Almacén', icon: Warehouse, roles: storage },
  { to: '/alertas-stock', label: 'Alertas de stock', icon: AlertTriangle, roles: storage },
  { to: '/incidencias', label: 'Incidencias', icon: ClipboardList, roles: storage },
  { to: '/trabajadores', label: 'Trabajadores', icon: Users, roles: ['admin'] },
  { to: '/asistencia', label: 'Asistencia', icon: CalendarCheck, roles: all },
  { to: '/categorias', label: 'Categorías', icon: Tags, roles: ['admin'], admin: true },
  { to: '/ubicaciones', label: 'Ubicaciones', icon: MapPin, roles: ['admin'], admin: true },
  { to: '/turnos', label: 'Turnos', icon: Clock3, roles: ['admin'], admin: true },
  { to: '/asignaciones', label: 'Asignar turnos', icon: CalendarCheck, roles: ['admin'], admin: true },
  { to: '/configuracion/usuarios', label: 'Usuarios', icon: ShieldCheck, roles: ['admin'], admin: true },
  { to: '/reportes', label: 'Reportes', icon: ChartColumnIncreasing, roles: ['admin'], admin: true },
]
const settings = { to: '/configuracion', icon: Settings, label: 'Configuración' }
const titles = {
  new_order: 'Nuevo pedido', low_stock: 'Alerta de stock', attendance_requested: 'Asistencia por revisar',
  order_assigned: 'Pedido asignado', order_accepted: 'Pedido aceptado', order_preparing: 'En preparación',
  order_ready: 'Pedido listo para entregar', order_delivered: 'Pedido entregado', order_cancelled: 'Pedido cancelado',
  attendance_approved: 'Asistencia aprobada', attendance_rejected: 'Solicitud rechazada',
  attendance_corrected: 'Asistencia corregida', incident_reported: 'Nueva incidencia', incident_reviewed: 'Incidencia actualizada',
}

const loadNotifications = async signal => {
  const [page, count] = await Promise.all([
    request('/notifications/', { signal }), request('/notifications/unread/', { signal }),
  ])
  return { rows: page.results, unread: count.unread }
}

export function ThemeButton() {
  const { theme, toggle } = useTheme()
  return <button className="icon-button theme-trigger" aria-label={theme === 'light' ? 'Activar modo oscuro' : 'Activar modo claro'}
    onClick={toggle}>{theme === 'light' ? <Moon size={19}/> : <Sun size={19}/>}</button>
}

export default function Layout() {
  const { user, logout } = useAuth()
  const { theme } = useTheme()
  const location = useLocation()
  const [search, setSearch] = useState(false)
  const [popover, setPopover] = useState('')
  const [menu, setMenu] = useState(false)
  const [error, setError] = useState('')
  const notifications = usePolling(loadNotifications, 20000)
  const unread = notifications.data?.unread ?? 0
  const allowed = navigation.filter(item => item.roles.includes(user.role))
  const current = [...allowed, settings].find(item => location.pathname === item.to)
    ?? allowed.find(item => location.pathname.startsWith(item.to + '/'))

  useEffect(() => {
    function keyboard(event) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setSearch(true)
        setPopover('')
      }
      if (event.key === 'Escape') { setPopover(''); setMenu(false) }
    }
    document.addEventListener('keydown', keyboard)
    return () => document.removeEventListener('keydown', keyboard)
  }, [])
  useEffect(() => { setPopover(''); setMenu(false) }, [location.pathname, location.search])

  function links(items) {
    return items.map(({ to, icon: Icon, label }) =>
      <NavLink end className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} key={to} to={to}>
        <Icon size={19} strokeWidth={1.9}/><span>{label}</span>
      </NavLink>)
  }

  async function markRead() {
    setError('')
    try {
      await post('/notifications/read-all/')
      window.dispatchEvent(new Event('control360:notifications'))
    } catch (cause) { setError(cause.message) }
  }

  async function leave() {
    setError('')
    try { await logout() }
    catch (cause) { setError(cause.message) }
  }

  return <div className="workspace">
    {menu && <button className="sidebar-overlay" aria-label="Cerrar navegación" onClick={() => setMenu(false)}/>}
    <aside className={`sidebar ${menu ? 'open' : ''}`}>
      <Link className="brand-link" to="/panel"><Brand/></Link>
      <nav aria-label="Menú principal">
        <p className="sidebar-label">OPERACIONES</p>
        {links(allowed.filter(item => !item.admin))}
        {allowed.some(item => item.admin) && <>
          <p className="sidebar-label secondary">ADMINISTRACIÓN</p>{links(allowed.filter(item => item.admin))}
        </>}
      </nav>
      <div className="sidebar-footer">{links([settings])}</div>
    </aside>
    <div className="workarea">
      <header className="topbar">
        <button className="icon-button menu-trigger" aria-label="Abrir navegación" aria-expanded={menu}
          onClick={() => setMenu(value => !value)}><Menu size={22}/></button>
        <div className="topbar-identity">
          <Link to="/panel" aria-label="Control360, inicio"><Brand tone={theme} compact/></Link>
          {current && <><ChevronRight size={13} aria-hidden="true"/><span>{current.label}</span></>}
        </div>
        <button className="top-search" onClick={() => { setSearch(true); setPopover('') }}>
          <Search size={17}/><span>Buscar pedidos, productos{user.role === 'admin' ? ', trabajadores' : ''}…</span><kbd>Ctrl K</kbd>
        </button>
        <div className="header-controls">
          <ThemeButton/>
          <div className="popover-anchor">
            <button className="icon-button bell-trigger" aria-label={unread ? `Notificaciones, ${unread} sin leer` : 'Notificaciones'}
              aria-expanded={popover === 'notifications'} onClick={() => {
                setPopover(popover === 'notifications' ? '' : 'notifications'); setError('')
                window.dispatchEvent(new Event('control360:notifications'))
              }}><Bell size={21}/>{unread > 0 && <i/>}</button>
            {popover === 'notifications' && <section className="popover notification-popover">
              <header><h2>Notificaciones</h2>
                {!!unread && <Button variant="quiet" icon={CheckCheck} onClick={markRead}>Marcar como leídas</Button>}</header>
              <ErrorNotice message={error || notifications.error}/>
              {notifications.loading && !notifications.data ? <Loading/> : notifications.data?.rows.length ? <div className="notification-list">
                {notifications.data.rows.map(item => <Link className="notification-item" key={item.id} to={notificationTarget(item)}
                  onClick={() => setPopover('')}>
                  <span className={`notice-dot ${item.read_at ? 'read' : ''}`}/><div>
                    <strong>{titles[item.kind] ?? 'Actualización de pedido'}</strong><p>{item.message}</p>
                    <small>{businessDateLabel(item.created_at)} · {timeLabel(item.created_at)}</small>
                  </div>
                </Link>)}
              </div> : <Empty>No tienes notificaciones.</Empty>}
              <div className="notice-footer"><TextLink to="/notificaciones">Ver todas</TextLink></div>
            </section>}
          </div>
          <div className="header-divider"/>
          <div className="popover-anchor">
            <button className="profile-trigger" aria-label="Menú de usuario" aria-expanded={popover === 'profile'}
              onClick={() => { setPopover(popover === 'profile' ? '' : 'profile'); setError('') }}>
              <span className="avatar">{user.username.split(/[_ .-]/).filter(Boolean).map(part => part[0]).slice(0, 2).join('').toUpperCase()}</span>
              <span className="profile-name"><strong>{user.username}</strong><small>{roles[user.role]}</small></span><ChevronDown size={16}/>
            </button>
            {popover === 'profile' && <div className="popover profile-popover">
              <Link to="/configuracion" onClick={() => setPopover('')}><CircleHelp size={17}/> Perfil y preferencias</Link>
              <button onClick={leave}><LogOut size={17}/> Cerrar sesión</button>
              <ErrorNotice message={error}/>
            </div>}
          </div>
        </div>
      </header>
      <main className="content"><Outlet/></main>
    </div>
    {search && <GlobalSearch admin={user.role === 'admin'} close={() => setSearch(false)}/>}
  </div>
}

function GlobalSearch({ admin, close }) {
  const [query, setQuery] = useState('')
  const term = query.trim()
  const load = useCallback(async signal => {
    if (term.length < 2) return []
    const number = /^PED-0*(\d+)$/i.exec(term)
    const [products, orders, workers] = await Promise.all([
      catalog.list('products', { search: term }, signal),
      catalog.list('orders', { search: number?.[1] ?? term }, signal),
      admin ? catalog.list('workers', { search: term }, signal) : Promise.resolve({ results: [] }),
    ])
    return [
      ...orders.results.slice(0, 6).map(order => ({
        title: orderCode(order.id), subtitle: order.customer_name, Icon: ShoppingCart, to: `/pedidos?pedido=${order.id}`,
      })),
      ...products.results.slice(0, 6).map(item => ({
        title: item.name, subtitle: item.sku, Icon: Package2, to: `/inventario?q=${encodeURIComponent(item.sku)}`,
      })),
      ...workers.results.slice(0, 5).map(item => ({
        title: item.name, subtitle: item.position, Icon: Users, to: `/trabajadores?q=${encodeURIComponent(item.document)}`,
      })),
    ]
  }, [admin, term])
  const results = useQuery(load)
  return <Dialog title="Buscar en Control360" onClose={close}>
    <label className="input-icon dialog-search"><Search size={19}/><input autoFocus aria-label="Buscar en Control360" value={query}
      placeholder="Nombre, código o número de pedido" onChange={event => setQuery(event.target.value)}/></label>
    <ErrorNotice message={results.error}/>
    {term.length < 2 ? <p className="muted search-hint">Escribe al menos dos caracteres.</p>
      : results.loading ? <Loading/> : results.data?.length ? <div className="search-results">
        {results.data.map(({ title, subtitle, Icon, to }) => <Link key={to} to={to} onClick={close}>
          <Icon size={18}/><div><strong>{title}</strong><small>{subtitle}</small></div><ArrowRight size={16}/>
        </Link>)}
      </div> : !results.error && <Empty>No encontramos coincidencias.</Empty>}
  </Dialog>
}
