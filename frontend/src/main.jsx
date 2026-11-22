import { lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Link, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/Auth'
import Layout from './components/Layout'
import { Loading } from './components/UI'
import Catalog from './pages/Catalog'
import Attendance from './pages/Attendance'
import Notifications from './pages/Notifications'
import Orders from './pages/Orders'
import Records from './pages/Records'
import Warehouse from './pages/Warehouse'
import { Login, Welcome } from './pages/Welcome'
import './styles.css'

const Dashboard = lazy(() => import('./pages/Dashboard'))
const Reports = lazy(() => import('./pages/Reports'))

function Protected({ roles }) {
  const { user, loading } = useAuth()
  if (loading) return <main className="content"><Loading /></main>
  if (!user) return <Navigate to="/acceso" replace />
  if (roles && !roles.includes(user.role)) return <Navigate to="/panel" replace />
  return <Outlet />
}

createRoot(document.getElementById('root')).render(
  <BrowserRouter><AuthProvider><Suspense fallback={<Loading />}><Routes>
    <Route path="/" element={<Welcome />} />
    <Route path="/acceso" element={<Login />} />
    <Route element={<Protected />}>
      <Route element={<Layout />}>
        <Route path="/panel" element={<Dashboard />} />
        <Route path="/pedidos" element={<Orders />} />
        <Route path="/notificaciones" element={<Notifications />} />
        <Route element={<Protected roles={['admin', 'warehouse']} />}>
          <Route path="/almacen" element={<Warehouse />} />
          <Route path="/asistencia" element={<Attendance />} />
        </Route>
        <Route element={<Protected roles={['admin', 'seller']} />}>
          <Route path="/clientes" element={<Records key="customers" resource="customers" />} />
        </Route>
        <Route path="/productos" element={<Catalog key="products" resource="products" />} />
        <Route element={<Protected roles={['admin']} />}>
          <Route path="/cuentas" element={<Records key="accounts" resource="accounts" />} />
          <Route path="/trabajadores" element={<Records key="workers" resource="workers" />} />
          <Route path="/turnos" element={<Records key="shifts" resource="shifts" />} />
          <Route path="/asignaciones" element={<Records key="schedules" resource="schedules" />} />
          <Route path="/reportes" element={<Reports />} />
          <Route path="/categorias" element={<Catalog key="categories" resource="categories" />} />
          <Route path="/ubicaciones" element={<Catalog key="locations" resource="locations" />} />
        </Route>
      </Route>
    </Route>
    <Route path="*" element={<main className="content"><h1>Página no encontrada</h1><Link className="button primary" to="/">Volver al inicio</Link></main>} />
  </Routes></Suspense></AuthProvider></BrowserRouter>,
)
