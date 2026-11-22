import { useState } from 'react'
import { ArrowRight, ArrowUpRight, Boxes, CalendarClock, ChartColumn, ClipboardList, Eye, EyeOff, KeyRound, ScanLine, Warehouse } from 'lucide-react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { Brand, Notice } from '../components/UI'
import { ThemeButton } from '../components/Layout'
import { useAuth } from '../context/Auth'

const modules = [
  [ClipboardList, 'Pedidos', 'Registra pedidos de clientes y sigue su preparación hasta la entrega.'],
  [Boxes, 'Inventario', 'Consulta existencias, ubicaciones físicas y el historial de cada ajuste.'],
  [CalendarClock, 'Personal y turnos', 'Programa jornadas y registra entradas, salidas y tiempo adicional.'],
  [ChartColumn, 'Reportes', 'Revisa indicadores por período y exporta los resultados a CSV.'],
]

export function Welcome() {
  const { user } = useAuth()
  const access = user ? '/panel' : '/acceso'
  return <div className="welcome">
    <header className="public-header"><Link to="/" aria-label="Inicio de Control360"><Brand/></Link>
      <nav aria-label="Menú principal" className="public-links"><a href="#modulos">Módulos</a><a href="#beneficios">Beneficios</a></nav>
      <div className="heading-actions"><ThemeButton/><Link className="button secondary" to={access}>Acceder <ArrowUpRight size={17}/></Link></div>
    </header>
    <main>
      <section className="hero">
        <div>
          <p className="eyebrow">Gestión interna de tienda y almacén</p>
          <h1>Coordina tu tienda<br/><em>y tu almacén.</em></h1>
          <p className="intro">Sigue cada pedido desde la venta hasta la entrega. Consulta el stock y organiza los turnos del equipo en el mismo espacio.</p>
          <Link to={access} className="button primary">Ir al espacio de trabajo <ArrowRight size={18}/></Link>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="orbit orbit-outer"/><div className="orbit orbit-inner"/>
          <div className="art-core"><Warehouse strokeWidth={1.15}/></div>
          <div className="art-node art-node-top"><ScanLine/></div>
          <div className="art-node art-node-bottom"><Boxes/></div>
        </div>
      </section>
      <section className="public-section" id="modulos"><h2>Módulos de Control360</h2>
        <div className="public-modules">{modules.map(([Icon, title, description]) => <article key={title}>
          <span className="tile-icon"><Icon size={22}/></span><h3>{title}</h3><p>{description}</p>
        </article>)}</div>
      </section>
      <section className="public-section benefits" id="beneficios"><h2>Visibilidad para cada equipo</h2>
        <ul><li><strong>Ventas</strong><span>Comprueba disponibilidad antes de comprometer un pedido.</span></li>
          <li><strong>Almacén</strong><span>Encuentra el estante de cada producto y organiza la preparación.</span></li>
          <li><strong>Administración</strong><span>Consulta el historial de operaciones y revisa las horas extras.</span></li></ul>
      </section>
    </main>
    <footer className="public-footer"><Brand/><span>Plataforma de gestión interna</span><Link to={access}>Acceso al sistema</Link></footer>
  </div>
}

export function Login() {
  const { user, login, error: sessionError } = useAuth()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [visible, setVisible] = useState(false)
  const [error, setError] = useState('')
  if (user) return <Navigate to="/panel" replace/>
  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    const credentials = Object.fromEntries(new FormData(event.currentTarget))
    try {
      await login(credentials)
      navigate('/panel', { replace: true })
    } catch (error) { setError(error.message) }
    finally { setBusy(false) }
  }
  return <main className="login-page">
    <div className="heading-actions"><Link to="/" aria-label="Volver al inicio"><Brand/></Link><ThemeButton/></div>
    <section className="login-card">
      <span className="tile-icon"><KeyRound size={22}/></span>
      <h1>Inicia sesión</h1>
      <p className="muted">Accede con tu cuenta de Control360.</p>
      <Notice>{error || sessionError}</Notice>
      <form onSubmit={submit}>
        <label>Usuario o correo<input name="username" autoComplete="username" maxLength={254} required/></label>
        <div className="field"><label htmlFor="login-password">Contraseña</label>
          <div className="password-field"><input id="login-password" name="password" type={visible ? 'text' : 'password'} autoComplete="current-password" required/>
            <button className="icon-button" type="button" aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'} onClick={() => setVisible(value => !value)}>
              {visible ? <EyeOff size={18}/> : <Eye size={18}/>}
            </button></div>
        </div>
        <button className="button primary" disabled={busy}>{busy ? 'Verificando…' : 'Entrar al sistema'}<ArrowRight size={17}/></button>
      </form>
    </section>
  </main>
}
