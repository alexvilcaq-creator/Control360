import { useCallback, useState } from 'react'
import { CalendarDays, LogIn, LogOut } from 'lucide-react'
import { catalog } from '../api/catalog'
import { request } from '../api/client'
import { dateLabel, localDate, post, query } from '../api/operations'
import { Empty, Loading, Modal, Notice, PageHeading, Pagination, Status, Toast } from '../components/UI'
import { AttendanceCorrection, AttendanceRequests, ShiftCard } from '../components/AttendanceRequests'
import { usePolling } from '../hooks/usePolling'
import { useAuth } from '../context/Auth'
import { useQuery } from '../hooks/useQuery'

const loadWorkers = signal => catalog.options('workers', signal)
const noWorkers = async () => []
const noShift = async () => null
const loadShift = signal => request('/attendance/state/', { signal })
const statuses = { open: 'Entrada abierta', present: 'Asistencia', absent: 'Falta' }

function monthDates(month) {
  const [year, number] = month.split('-').map(Number)
  const first = new Date(Date.UTC(year, number - 1, 1))
  const count = new Date(Date.UTC(year, number, 0)).getUTCDate()
  return { count, offset: (first.getUTCDay() + 6) % 7, start: `${month}-01`, end: `${month}-${count}` }
}

function MonthGrid({ month, byDate, selected, onSelect }) {
  const { count, offset } = monthDates(month)
  return <div className="calendar-grid" aria-label="Calendario de asistencia">
    {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(day => <span key={day}>{day}</span>)}
    {Array.from({ length: offset }, (_, index) => <div key={`space-${index}`} />)}
    {Array.from({ length: count }, (_, index) => {
      const date = `${month}-${String(index + 1).padStart(2, '0')}`
      const { present = 0, open = 0, absent = 0 } = byDate?.[date] || {}
      return <button key={date} aria-pressed={date === selected}
        aria-label={`${date}: ${present + open} asistencias y ${absent} faltas`} onClick={() => onSelect(date === selected ? '' : date)}>
        <strong>{index + 1}</strong>
        <span className="calendar-indicators">{present + open > 0 && <span className="present-dot" />}
          {absent > 0 && <span className="absent-dot" />}</span>
      </button>
    })}
  </div>
}

function Approval({ record, onClose, onSaved }) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(event) {
    event.preventDefault()
    setError('')
    setBusy(true)
    const minutes = Number(new FormData(event.currentTarget).get('minutes'))
    try {
      await post(`/attendance/${record.id}/overtime/`, { minutes })
      onSaved('Aprobación actualizada.')
    } catch (error) { setError(error.message) }
    finally { setBusy(false) }
  }
  return <Modal title="Aprobar tiempo extra" onClose={onClose} busy={busy}>
    <div className="modal-body"><Notice>{error}</Notice>
      <form className="stack" id="approval-form" onSubmit={submit}>
        <p>{record.worker_name} · {record.date} · {record.extra_minutes} minutos adicionales</p>
        <label>Minutos aprobados<input type="number" name="minutes" min={0} max={record.extra_minutes}
          defaultValue={record.approved_overtime} required /></label>
      </form>
    </div>
    <div className="modal-foot"><button className="button secondary" onClick={onClose} disabled={busy}>Cerrar</button>
      <button className="button primary" form="approval-form" disabled={busy}>{busy ? 'Guardando…' : 'Guardar aprobación'}</button></div>
  </Modal>
}

export default function Attendance() {
  const { user } = useAuth()
  const admin = user.role === 'admin'
  const [month, setMonth] = useState(localDate().slice(0, 7))
  const [day, setDay] = useState('')
  const [worker, setWorker] = useState('')
  const [page, setPage] = useState(1)
  const [version, setVersion] = useState(0)
  const [record, setRecord] = useState(null)
  const [correction, setCorrection] = useState(null)
  const [busy, setBusy] = useState(false)
  const [operationError, setOperationError] = useState('')
  const [toast, setToast] = useState('')
  const closeToast = useCallback(() => setToast(''), [])
  const workers = useQuery(admin ? loadWorkers : noWorkers)
  const shift = usePolling(admin ? noShift : loadShift)
  const load = useCallback(async signal => {
    const { start, end } = monthDates(month)
    const path = '/attendance/calendar/'
    const period = query({ start, end, worker, page: day ? 1 : page })
    const list = request(`${path}?${period}`, { signal })
    const [calendar, detail] = await Promise.all([
      list, day ? request(`${path}?${query({ start: day, end: day, worker, page })}`, { signal }) : list,
    ])
    return { calendar: calendar.days, detail }
  }, [day, month, worker, page, version])
  const { data, loading, error } = usePolling(load)

  function changed(message) {
    setToast(message)
    setVersion(value => value + 1)
    window.dispatchEvent(new Event('control360:notifications'))
  }

  async function punch() {
    setBusy(true)
    setOperationError('')
    try {
      const action = shift.data.open ? 'out' : 'in'
      await post('/attendance/punch/', { action })
      changed(action === 'out' ? 'Solicitud de salida enviada.' : 'Solicitud de entrada enviada.')
    } catch (error) { setOperationError(error.message) }
    finally { setBusy(false) }
  }

  return <>
    <PageHeading title={admin ? 'Asistencia del equipo' : 'Mi asistencia'} description="Consulta jornadas, marcaciones y tiempo adicional.">
      {!admin && <button className="button primary" disabled={busy || !shift.data?.can_request} onClick={punch}>
        {shift.data?.open ? <LogOut size={18}/> : <LogIn size={18}/>} {busy ? 'Enviando…' : shift.data?.open ? 'Solicitar salida' : 'Solicitar entrada'}
      </button>}
    </PageHeading>
    <Notice>{operationError || error || workers.error || shift.error}</Notice>
    {!admin && <ShiftCard state={shift.data}/>}
    <AttendanceRequests admin={admin} version={version} onChanged={changed}/>
    <section className="panel attendance-panel">
      <div className="toolbar"><label className="field"><span><CalendarDays size={16}/> Mes</span>
        <input aria-label="Mes" type="month" min="1900-01" max="9998-12" value={month} onChange={event => {
          if (/^\d{4}-\d{2}$/.test(event.target.value)) { setMonth(event.target.value); setDay(''); setPage(1) }
        }}/></label>
        {admin && <label className="field">Trabajador<select value={worker} onChange={event => { setWorker(event.target.value); setPage(1) }}>
          <option value="">Todo el equipo</option>{workers.data?.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
        </select></label>}
      </div>
      <div className="calendar-wrap">
        <MonthGrid month={month} byDate={data?.calendar} selected={day} onSelect={date => { setDay(date); setPage(1) }}/>
        <div className="calendar-legend"><span><i className="present-dot"/> Asistencia</span><span><i className="absent-dot"/> Falta</span></div>
      </div>
      {loading && <Loading />}
      {data?.detail.results.length === 0 && <Empty>No hay marcaciones ni faltas en la selección.</Empty>}
      {!!data?.detail.results.length && <div className="table-scroll"><table>
        <thead><tr><th>Fecha</th>{admin && <th>Trabajador</th>}<th>Turno</th><th>Estado</th><th>Entrada</th><th>Salida</th><th>Tardanza</th><th>Adicional</th><th>Aprobado</th>{admin && <th>Corrección</th>}</tr></thead>
        <tbody>{data.detail.results.map(row => <tr key={`${row.worker}-${row.date}`}>
          <td>{row.date}</td>{admin && <td>{row.worker_name}</td>}<td>{row.shift_name}</td>
          <td><Status status={row.status}>{statuses[row.status]}</Status></td><td>{dateLabel(row.clock_in)}</td><td>{dateLabel(row.clock_out)}</td>
          <td>{row.late_minutes ?? '—'}</td><td>{row.extra_minutes ?? '—'}</td>
          <td>{admin && row.clock_out && row.extra_minutes > 0
            ? <button className="text-button" onClick={() => setRecord(row)}>{row.approved_overtime} min · Revisar</button>
            : row.approved_overtime ?? '—'}</td>
          {admin && <td>{row.id && <button className="text-button" onClick={() => setCorrection(row)}>Corregir</button>}</td>}
        </tr>)}</tbody>
      </table></div>}
      <Pagination data={data?.detail} page={page} onChange={setPage} />
    </section>
    {record && <Approval record={record} onClose={() => setRecord(null)} onSaved={message => { setRecord(null); changed(message) }}/>}
    {correction && <AttendanceCorrection row={correction} onClose={() => setCorrection(null)}
      onDone={message => { setCorrection(null); changed(message) }}/>}
    <Toast onClose={closeToast}>{toast}</Toast>
  </>
}
