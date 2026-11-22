import { useEffect, useState } from 'react'
import { Bell, Boxes, CalendarClock, ChartColumn, ClipboardList, ContactRound, LayoutDashboard, LogOut, Map, MapPin, Moon, Shapes, Shield, Sun, Users, Workflow } from 'lucide-react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { request } from '../api/client'
import { useAuth } from '../context/Auth'
import { usePolling } from '../hooks/usePolling'
import { Brand, Notice } from './UI'

export const roles = { admin: 'Administrador', seller: 'Vendedor', warehouse: 'Almacén' }

const links = [
  ['/panel', 'Resumen', LayoutDashboard],
  ['/pedidos', 'Pedidos', ClipboardList],
  ['/productos', 'Productos', Boxes],
  ['/clientes', 'Clientes', ContactRound, ['admin', 'seller']],
  ['/almacen', 'Mapa de almacén', Map, ['admin', 'warehouse']],
  ['/asistencia', 'Asistencia', CalendarClock, ['admin', 'warehouse']],
  ['/categorias', 'Categorías', Shapes, ['admin']],
  ['/ubicaciones', 'Ubicaciones', MapPin, ['admin']],
  ['/cuentas', 'Cuentas', Shield, ['admin']],
  ['/trabajadores', 'Trabajadores', Users, ['admin']],
  ['/turnos', 'Turnos', CalendarClock, ['admin']],
  ['/asignaciones', 'Asignar turnos', Workflow, ['admin']],
  ['/reportes', 'Reportes', ChartColumn, ['admin']],
]

const loadUnread = signal => request('/notifications/unread/', { signal })

export function ThemeButton() {
  const [dark, setDark] = useState(() => localStorage.getItem('control360-theme') === 'dark')
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
    localStorage.setItem('control360-theme', dark ? 'dark' : 'light')
  }, [dark])
  return <button className="icon-button" aria-label={dark ? 'Activar modo claro' : 'Activar modo oscuro'}
    title={dark ? 'Modo claro' : 'Modo oscuro'} onClick={() => setDark(value => !value)}>
    {dark ? <Sun size={18}/> : <Moon size={18}/>}
  </button>
}

export default function Layout() {
  const { user, logout } = useAuth()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const { data } = usePolling(loadUnread)

  async function signOut() {
    setBusy(true)
    setError('')
    try { await logout() }
    catch (error) { setError(error.message) }
    finally { setBusy(false) }
  }

  return <div className="app-shell">
    <aside>
      <Link to="/panel" aria-label="Panel de Control360"><Brand /></Link>
      <nav aria-label="Panel de gestión">
        {links.filter(([, , , allowed]) => !allowed || allowed.includes(user.role))
          .map(([path, title, Icon]) => <NavLink key={path} to={path}><Icon size={18}/>{title}</NavLink>)}
      </nav>
    </aside>
    <div className="workspace">
      <header className="topbar">
        <span className="topbar-label">Espacio de trabajo</span>
        <div className="profile">
          <ThemeButton/>
          <Link className="icon-button bell-link" to="/notificaciones" aria-label={`Notificaciones (${data?.unread ?? 0} sin leer)`}>
            <Bell size={18}/>{data?.unread > 0 && <span>{data.unread > 99 ? '99+' : data.unread}</span>}
          </Link>
          <span className="avatar">{user.name.slice(0, 1).toUpperCase()}</span>
          <div><strong>{user.name}</strong><small>{roles[user.role]}</small></div>
          <button className="icon-button" title="Cerrar sesión" aria-label="Cerrar sesión" disabled={busy} onClick={signOut}><LogOut size={18}/></button>
        </div>
      </header>
      <main className="content"><Notice>{error}</Notice><Outlet/></main>
    </div>
  </div>
}
