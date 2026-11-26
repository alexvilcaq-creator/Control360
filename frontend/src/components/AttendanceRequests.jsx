import { useCallback, useState } from 'react'
import { catalog } from '../api/catalog'
import { request } from '../api/client'
import { dateLabel, exactDateLabel, post } from '../api/operations'
import { usePolling } from '../hooks/usePolling'
import { useQuery } from '../hooks/useQuery'
import { Empty, Loading, Modal, Notice, Pagination, Status } from './UI'

const states = { pending: 'Pendiente', approved: 'Aprobada', rejected: 'Rechazada' }
const tones = { pending: 'pending', approved: 'ready', rejected: 'cancelled' }
const roles = { seller: 'Vendedor', warehouse: 'Almacén', admin: 'Administrador' }
const workdays = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

export function ShiftCard({ state }) {
  const shift = state?.schedule
  if (!state) return null
  return <section className="panel personal-shift">
    <div><h2>Mi turno</h2>{shift ? <><strong>{shift.name}</strong><p className="muted">
      {shift.starts_at.slice(0, 5)} a {shift.ends_at.slice(0, 5)} · {shift.workdays.map(day => workdays[day]).join(', ')}
    </p></> : <p className="muted">{state.linked ? 'Sin turno vigente.' : 'Pide a administración que vincule tu cuenta y asigne un turno.'}</p>}</div>
    {state.pending && <Status status="pending">Solicitud pendiente</Status>}
  </section>
}

function ReviewPunch({ row, onClose, onDone }) {
  const [decision, setDecision] = useState('approved')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(event) {
    event.preventDefault()
    const body = Object.fromEntries(new FormData(event.currentTarget))
    setError('')
    setBusy(true)
    try {
      await post(`/attendance-requests/${row.id}/decide/`, body)
      onDone(decision === 'approved' ? 'Solicitud aprobada.' : 'Solicitud rechazada.')
    } catch (error) { setError(error.message) }
    finally { setBusy(false) }
  }
  return <Modal title="Revisar solicitud" onClose={onClose} busy={busy}>
    <div className="modal-body"><Notice>{error}</Notice>
      <form id="punch-review" className="stack" onSubmit={submit}>
        <p><strong>{row.worker_name}</strong> · {roles[row.role]} · {row.shift_name}</p>
        <p>{row.action === 'in' ? 'Entrada' : 'Salida'} solicitada el {exactDateLabel(row.requested_at)}.</p>
        <label>Decisión<select name="decision" value={decision} onChange={event => setDecision(event.target.value)}>
          <option value="approved">Aprobar</option><option value="rejected">Rechazar</option></select></label>
        <label>Motivo<textarea name="note" required={decision === 'rejected'} maxLength={500} rows={3}/></label>
      </form>
    </div>
    <div className="modal-foot"><button className="button secondary" onClick={onClose} disabled={busy}>Cerrar</button>
      <button className="button primary" form="punch-review" disabled={busy}>{busy ? 'Guardando…' : 'Confirmar decisión'}</button></div>
  </Modal>
}

export function AttendanceRequests({ admin, version, onChanged }) {
  const [status, setStatus] = useState(admin ? 'pending' : '')
  const [page, setPage] = useState(1)
  const [review, setReview] = useState(null)
  const load = useCallback(signal => catalog.list('attendance-requests', { status, page, refresh: version }, signal),
    [status, page, version])
  const { data, error, loading } = usePolling(load)
  return <section className="panel module-toolbar" aria-label="Solicitudes de asistencia">
    <div className="section-heading"><h2>{admin ? 'Solicitudes del equipo' : 'Mis solicitudes'}</h2>
      <select value={status} aria-label="Filtrar solicitudes" onChange={event => { setStatus(event.target.value); setPage(1) }}>
        <option value="">Todos los estados</option>{Object.entries(states).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select>
    </div>
    <Notice>{error}</Notice>
    {loading && <Loading/>}
    {data?.results.length === 0 && <Empty>Sin solicitudes en esta selección.</Empty>}
    {!!data?.results.length && <div className="table-scroll"><table>
      <thead><tr>{admin && <th>Trabajador</th>}<th>Tipo y turno</th><th>Solicitada</th><th>Estado</th><th>Resuelta</th><th>Nota</th>{admin && <th>Revisión</th>}</tr></thead>
      <tbody>{data.results.map(row => <tr key={row.id}>
        {admin && <td><strong>{row.worker_name}</strong><small>{roles[row.role]}</small></td>}
        <td>{row.action === 'in' ? 'Entrada' : 'Salida'}<small>{row.shift_name}</small></td>
        <td>{exactDateLabel(row.requested_at)}</td><td><Status status={tones[row.status]}>{states[row.status]}</Status></td>
        <td>{exactDateLabel(row.decided_at)}{row.reviewer && <small>{row.reviewer}</small>}</td><td>{row.note || '—'}</td>
        {admin && <td>{row.status === 'pending' && <button className="text-button" onClick={() => setReview(row)}>Revisar</button>}</td>}
      </tr>)}</tbody>
    </table></div>}
    <Pagination data={data} page={page} onChange={setPage}/>
    {review && <ReviewPunch row={review} onClose={() => setReview(null)} onDone={message => {
      setReview(null); setPage(1); onChanged(message)
    }}/>}
  </section>
}

const localTime = value => value ? new Intl.DateTimeFormat('sv-SE', {
  dateStyle: 'short', timeStyle: 'medium', timeZone: 'America/Bogota',
}).format(new Date(value)).replace(' ', 'T') : ''

export function AttendanceCorrection({ row, onClose, onDone }) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [page, setPage] = useState(1)
  const load = useCallback(signal => request(`/attendance/${row.id}/corrections/?page=${page}`, { signal }), [row.id, page])
  const history = useQuery(load)
  const beforeIn = localTime(row.clock_in)
  const beforeOut = localTime(row.clock_out)

  async function submit(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const start = form.get('clock_in')
    const end = form.get('clock_out')
    setError('')
    setBusy(true)
    try {
      await post(`/attendance/${row.id}/correct/`, {
        clock_in: start === beforeIn ? row.clock_in : start,
        clock_out: end === beforeOut ? row.clock_out : end || null, reason: form.get('reason'),
      })
      onDone('Asistencia corregida.')
    } catch (error) { setError(error.message) }
    finally { setBusy(false) }
  }

  return <Modal title="Corregir asistencia" onClose={onClose} busy={busy}>
    <div className="modal-body stack"><Notice>{error || history.error}</Notice>
      <form id="attendance-correction" className="stack" onSubmit={submit}>
        <p><strong>{row.worker_name}</strong> · {row.date}</p>
        <label>Entrada corregida<input name="clock_in" type="datetime-local" step="1" defaultValue={beforeIn} required/></label>
        <label>Salida corregida<input name="clock_out" type="datetime-local" step="1" defaultValue={beforeOut}/></label>
        <label>Justificación<textarea name="reason" rows={3} maxLength={500} required/></label>
      </form>
      <h2>Auditoría</h2>
      {history.loading && <Loading/>}
      {history.data?.results.length === 0 && <Empty>Sin correcciones anteriores.</Empty>}
      {history.data?.results.map(item => <div className="movement" key={item.id}>
        <div><strong>{item.reason}</strong><small>{item.actor} · {dateLabel(item.created_at)}</small>
          <small>Entrada: {exactDateLabel(item.before.clock_in)} → {exactDateLabel(item.after.clock_in)}</small>
          <small>Salida: {exactDateLabel(item.before.clock_out)} → {exactDateLabel(item.after.clock_out)}</small></div>
      </div>)}
      <Pagination data={history.data} page={page} onChange={setPage}/>
    </div>
    <div className="modal-foot"><button className="button secondary" onClick={onClose} disabled={busy}>Cerrar</button>
      <button className="button primary" form="attendance-correction" disabled={busy}>{busy ? 'Guardando…' : 'Guardar corrección'}</button></div>
  </Modal>
}
