import '@fontsource-variable/inter'
import { lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Link, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/Auth'
import Layout from './components/Layout'
import { ThemeProvider } from './context/Theme'
import { Loading } from './components/UI'
import Catalog from './pages/Catalog'
import Attendance from './pages/Attendance'
import Incidents from './pages/Incidents'
import Payments from './pages/Payments'
import PointOfSale from './pages/PointOfSale'
import Notifications from './pages/Notifications'
import Orders from './pages/Orders'
import Records from './pages/Records'
import Warehouse from './pages/Warehouse'
import Settings from './pages/Settings'
import StockAlerts from './pages/StockAlerts'
import { Login, Welcome } from './pages/Welcome'
import './styles.css'
import './django-modules.css'

const Dashboard = lazy(() => import('./pages/Dashboard'))
const Reports = lazy(() => import('./pages/Reports'))

function RedirectInventory() {
  const { search } = useLocation()
  return <Navigate to={{ pathname: '/inventario', search }} replace/>
}

function InventoryRoute() {
  const { search } = useLocation()
  return <Catalog key={search} resource="products"/>
}

function WorkerRoute() {
  const { search } = useLocation()
  return <Records key={search} resource="workers"/>
}

function Protected({ roles }) {
  const { user, loading } = useAuth()
  if (loading) return <main className="content"><Loading /></main>
  if (!user) return <Navigate to="/acceso" replace />
  if (roles && !roles.includes(user.role)) return <Navigate to="/panel" replace />
  return <Outlet />
}

createRoot(document.getElementById('root')).render(
  <BrowserRouter><ThemeProvider><AuthProvider><Suspense fallback={<Loading />}><Routes>
    <Route path="/" element={<Login />} />
    <Route path="/bienvenida" element={<Welcome />} />
    <Route path="/acceso" element={<Login />} />
    <Route element={<Protected />}>
      <Route element={<Layout />}>
        <Route path="/panel" element={<Dashboard />} />
        <Route path="/pedidos" element={<Orders />} />
        <Route path="/asistencia" element={<Attendance />} />
        <Route path="/notificaciones" element={<Notifications />} />
        <Route element={<Protected roles={['admin', 'warehouse']} />}>
          <Route path="/almacen" element={<Warehouse />} />
          <Route path="/alertas-stock" element={<StockAlerts />} />
          <Route path="/incidencias" element={<Incidents />} />
        </Route>
        <Route element={<Protected roles={['admin', 'seller']} />}>
          <Route path="/punto-de-venta" element={<PointOfSale />} />
          <Route path="/pagos" element={<Payments />} />
          <Route path="/clientes" element={<Records key="customers" resource="customers" />} />
        </Route>
        <Route path="/productos" element={<RedirectInventory />} />
        <Route path="/inventario" element={<InventoryRoute />} />
        <Route path="/configuracion" element={<Settings />} />
        <Route element={<Protected roles={['admin']} />}>
          <Route path="/cuentas" element={<Navigate to="/configuracion/usuarios" replace />} />
          <Route path="/configuracion/usuarios" element={<Records key="accounts" resource="accounts" />} />
          <Route path="/trabajadores" element={<WorkerRoute />} />
          <Route path="/turnos" element={<Records key="shifts" resource="shifts" />} />
          <Route path="/asignaciones" element={<Records key="schedules" resource="schedules" />} />
          <Route path="/reportes" element={<Reports />} />
          <Route path="/categorias" element={<Catalog key="categories" resource="categories" />} />
          <Route path="/ubicaciones" element={<Catalog key="locations" resource="locations" />} />
        </Route>
      </Route>
    </Route>
    <Route path="*" element={<main className="content"><h1>Página no encontrada</h1><Link className="button primary" to="/">Volver al inicio</Link></main>} />
  </Routes></Suspense></AuthProvider></ThemeProvider></BrowserRouter>,
)
