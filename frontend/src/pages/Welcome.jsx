import { useState } from 'react'
import { ArrowRight, Boxes, CalendarCheck, Eye, EyeOff, LockKeyhole, UserRound } from 'lucide-react'
import { Link, Navigate } from 'react-router-dom'
import { Brand, Button, ErrorNotice, Field, Loading } from '../components/UI'
import { ThemeButton } from '../components/Layout'
import { useAuth } from '../context/Auth'

function LoginSide() {
  return <section className="login-side">
    <img className="login-photo" src="/images/warehouse-login.webp" alt="" fetchPriority="high"/>
    <Link to="/bienvenida" aria-label="Conoce Control360"><Brand/></Link>
    <div className="login-intro">
      <h1>Tu tienda y almacén en un solo lugar.</h1>
      <p>Gestiona pedidos, consulta existencias y coordina al equipo desde tu espacio de trabajo.</p>
    </div>
    <div className="login-course">Desarrollo de Aplicaciones Empresariales</div>
  </section>
}

export function Welcome() {
  const { user } = useAuth()
  return <main className="login-shell legacy-welcome">
    <LoginSide/>
    <section className="login-main">
      <div className="login-form stack">
        <span className="login-lock"><Boxes size={24}/></span>
        <h2>Control360</h2>
        <p>Gestiona la venta, la preparación de pedidos y la asistencia del equipo desde una misma aplicación.</p>
        <div className="section-title"><Boxes size={18}/> <strong>Pedidos, cobros e inventario</strong></div>
        <div className="section-title"><CalendarCheck size={18}/> <strong>Turnos y solicitudes de asistencia</strong></div>
        <Link className="button button--primary" to={user ? '/panel' : '/acceso'}>Ir al panel <ArrowRight size={17}/></Link>
      </div>
    </section>
  </main>
}

export function Login() {
  const { user, loading, login, error: sessionError } = useAuth()
  const [busy, setBusy] = useState(false)
  const [visible, setVisible] = useState(false)
  const [error, setError] = useState('')
  if (user) return <Navigate to="/panel" replace/>

  async function submit(event) {
    event.preventDefault()
    const credentials = Object.fromEntries(new FormData(event.currentTarget))
    setBusy(true)
    setError('')
    try { await login(credentials) }
    catch (cause) { setError(cause.message) }
    finally { setBusy(false) }
  }

  return <main className="login-shell">
    <LoginSide/>
    <section className="login-main">
      <div className="login-theme"><ThemeButton/></div>
      {loading ? <Loading/> : <div className="login-form">
        <span className="login-lock"><LockKeyhole size={24}/></span>
        <h2>Inicia sesión</h2>
        <p>Ingresa tus credenciales para acceder a Control360.</p>
        <form onSubmit={submit}>
          <ErrorNotice message={error || sessionError}/>
          <Field label="Usuario o correo" inputId="login-username">
            <div className="login-input"><UserRound size={18} aria-hidden="true"/><input id="login-username" name="username"
              autoComplete="username" placeholder="Tu usuario" required maxLength={254}/></div>
          </Field>
          <Field label="Contraseña" inputId="login-password">
            <div className="login-input password-field">
              <LockKeyhole size={17} aria-hidden="true"/>
              <input id="login-password" name="password" type={visible ? 'text' : 'password'}
                autoComplete="current-password" placeholder="Tu contraseña" required/>
              <button type="button" className="icon-button" aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                onClick={() => setVisible(!visible)}>{visible ? <EyeOff size={18}/> : <Eye size={18}/>}</button>
            </div>
          </Field>
          <Button type="submit" icon={ArrowRight} disabled={busy}>{busy ? 'Ingresando…' : 'Ingresar al panel'}</Button>
        </form>
      </div>}
    </section>
  </main>
}
