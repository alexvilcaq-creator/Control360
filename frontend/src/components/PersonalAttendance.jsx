import { CalendarCheck, Clock3 } from 'lucide-react'
import { Empty, ErrorNotice, Loading, Section, Tag, TextLink } from './UI'

const workdays = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

export default function PersonalAttendance({ resource, showHistory = true }) {
  const state = resource.data
  const shift = state?.schedule
  const tone = state?.pending ? 'amber' : state?.open ? 'green' : 'muted'
  return <Section title="Mi asistencia" icon={CalendarCheck} className="personal-attendance"
    action={showHistory && <TextLink to="/asistencia">Ver historial</TextLink>}>
    <ErrorNotice message={resource.error}/>
    {resource.loading && !state ? <Loading/> : state && (!state.linked
      ? <Empty>Pide a administración que vincule tu cuenta con una ficha de trabajador.</Empty>
      : <div className="personal-attendance-body">
        <div><Tag tone={tone} dot>{state.pending ? 'Solicitud pendiente' : state.open ? 'En jornada' : 'Sin jornada abierta'}</Tag>
          <p><Clock3 size={14} aria-hidden="true"/> {shift?.name || 'Turno sin asignar'}</p>
          {shift && <small>{shift.starts_at.slice(0, 5)} a {shift.ends_at.slice(0, 5)}
            {!showHistory && ` · ${shift.workdays.map(day => workdays[day]).join(', ')}`}</small>}
        </div>
        {showHistory && state.can_request && <TextLink to="/asistencia">{state.open ? 'Solicitar salida' : 'Solicitar entrada'}</TextLink>}
      </div>)}
  </Section>
}
