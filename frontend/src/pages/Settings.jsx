import { Palette, ShieldCheck, UserRound } from 'lucide-react'
import { roles } from '../components/Layout'
import { PageTitle, Section, Tag, TextLink } from '../components/UI'
import { useAuth } from '../context/Auth'
import { useTheme } from '../context/Theme'

export default function Settings() {
  const { user } = useAuth()
  const { theme, setTheme } = useTheme()
  return <>
    <PageTitle title="Configuración" subtitle="Consulta tu perfil y elige cómo se muestra Control360.">
      {user.role === 'admin' && <TextLink to="/configuracion/usuarios">Gestionar usuarios</TextLink>}
    </PageTitle>
    <div className="dashboard-grid dashboard-secondary">
      <Section title="Mi perfil" icon={UserRound}><div className="personal-attendance-body">
        <div><strong>{user.name}</strong><p>{user.username}</p></div>
        <Tag tone="teal" dot><ShieldCheck size={13}/>{roles[user.role]}</Tag>
      </div></Section>
      <Section title="Apariencia" icon={Palette}>
        <label className="field">Tema<select value={theme} onChange={event => setTheme(event.target.value)}>
          <option value="light">Claro</option><option value="dark">Oscuro</option>
        </select></label>
      </Section>
    </div>
  </>
}
