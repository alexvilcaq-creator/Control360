import { useSearchParams } from 'react-router-dom'
import { useCallback, useState } from 'react'
import { AlertTriangle, Plus, Search } from 'lucide-react'
import { catalog } from '../api/catalog'
import { dateLabel, post } from '../api/operations'
import { Empty, Loading, Modal, Notice, PageHeading, Pagination, Status } from '../components/UI'
import { useAuth } from '../context/Auth'
import { useQuery } from '../hooks/useQuery'

export const incidentStates = { open: 'Abierta', review: 'En revisión', resolved: 'Resuelta' }
const kinds = {
  damaged: 'Producto dañado', discrepancy: 'Diferencia de inventario', lost: 'Producto extraviado',
  location: 'Ubicación incorrecta', other: 'Otros problemas',
}
const tones = { open: 'pending', review: 'preparing', resolved: 'ready' }
const loadProducts = signal => catalog.options('products', signal)

function IncidentForm({ initialProduct, onClose, onSaved }) {
  const [product, setProduct] = useState(initialProduct)
  const [kind, setKind] = useState('damaged')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const products = useQuery(loadProducts)
  async function submit(event) {
    event.preventDefault()
    const data = Object.fromEntries(new FormData(event.currentTarget))
    setError('')
    setBusy(true)
    try {
      await post('/incidents/', { ...data, product: data.product || null })
      onSaved('Incidencia reportada.')
    } catch (error) { setError(error.message) }
    finally { setBusy(false) }
  }
  return <Modal title="Reportar incidencia" onClose={onClose} busy={busy}>
    <div className="modal-body"><Notice>{error || products.error}</Notice>
      <form id="incident-form" className="stack" onSubmit={submit}>
        <label>Tipo<select name="kind" value={kind} onChange={event => setKind(event.target.value)}>
          {Object.entries(kinds).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label htmlFor="incident-product">Producto</label>
        <select id="incident-product" name="product" value={product}
          onChange={event => setProduct(event.target.value)} required={kind !== 'other'}>
          <option value="">Selecciona un producto</option>
          {products.data?.map(row => <option key={row.id} value={row.id}>{row.name} · {row.sku}</option>)}
        </select>
        {products.loading && <Loading/>}
        <label>Descripción<textarea name="description" rows={4} maxLength={500} required/></label>
      </form>
    </div>
    <div className="modal-foot"><button className="button secondary" onClick={onClose} disabled={busy}>Cerrar</button>
      <button className="button primary" form="incident-form" disabled={busy}>{busy ? 'Guardando…' : 'Enviar reporte'}</button></div>
  </Modal>
}

function IncidentDetail({ row, admin, onClose, onSaved }) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const body = Object.fromEntries(new FormData(event.currentTarget))
      await post(`/incidents/${row.id}/review/`, body)
      onSaved('Revisión guardada.')
    } catch (error) { setError(error.message) }
    finally { setBusy(false) }
  }
  return <Modal title={`Incidencia #${row.id}`} onClose={onClose} busy={busy}>
    <div className="modal-body stack"><Notice>{error}</Notice>
      <div className="detail-summary"><strong>{kinds[row.kind]}</strong><Status status={tones[row.status]}>{incidentStates[row.status]}</Status></div>
      <p>{row.product_name || 'Incidencia general'} · {row.reporter_name}</p><p>{row.description}</p>
      {row.history.map(event => <div key={event.id} className="movement"><div><strong>{incidentStates[event.status]}</strong>
        <small>{event.reviewer_name} · {dateLabel(event.created_at)}</small></div><p>{event.note}</p></div>)}
      {admin && row.status !== 'resolved' && <form id="incident-review" onSubmit={submit} className="stack">
        <label>Estado<select name="status" defaultValue={row.status === 'open' ? 'review' : 'resolved'}>
          {row.status === 'open' && <option value="review">En revisión</option>}<option value="resolved">Resuelta</option></select></label>
        <label>Nota de revisión<textarea name="note" rows={3} maxLength={500} required/></label>
      </form>}
    </div>
    {admin && row.status !== 'resolved' && <div className="modal-foot">
      <button className="button secondary" onClick={onClose} disabled={busy}>Cerrar</button>
      <button className="button primary" form="incident-review" disabled={busy}>{busy ? 'Guardando…' : 'Guardar revisión'}</button></div>}
  </Modal>
}

export default function Incidents() {
  const { user } = useAuth()
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [version, setVersion] = useState(0)
  const [params, setParams] = useSearchParams()
  const [modal, setModal] = useState(() => params.get('nueva') ? 'create' : null)
  const [message, setMessage] = useState('')
  const load = useCallback(signal => catalog.list('incidents', { status, search, page }, signal), [status, search, page, version])
  const { data, error, loading } = useQuery(load)
  function closeForm() {
    setModal(null)
    if (params.has('nueva')) setParams({}, { replace: true })
  }
  function saved(text) {
    closeForm(); setMessage(text); setPage(1); setVersion(value => value + 1)
    window.dispatchEvent(new Event('control360:notifications'))
  }
  return <>
    <PageHeading title="Incidencias" description="Registra y consulta problemas de productos o ubicaciones del almacén.">
      <button className="button primary" onClick={() => setModal('create')}><Plus size={17}/> Reportar incidencia</button>
    </PageHeading>
    <Notice>{error}</Notice><Notice success>{message}</Notice>
    <section className="panel"><div className="toolbar">
      <label className="search"><Search size={17}/><input type="search" aria-label="Buscar incidencias"
        placeholder="Producto o descripción" value={search} onChange={event => { setSearch(event.target.value); setPage(1) }}/></label>
      <select aria-label="Estado" value={status} onChange={event => { setStatus(event.target.value); setPage(1) }}>
        <option value="">Todos los estados</option>{Object.entries(incidentStates).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
    </div>
      {loading && <Loading/>}
      {data?.results.length === 0 && <Empty>Sin incidencias registradas.</Empty>}
      {!!data?.results.length && <div className="table-scroll"><table>
        <thead><tr><th>Incidencia</th><th>Producto</th><th>Estado</th><th>Reportó</th><th>Fecha</th><th>Ver</th></tr></thead>
        <tbody>{data.results.map(row => <tr key={row.id}><td><strong>{kinds[row.kind]}</strong><small>#{row.id}</small></td>
          <td>{row.product_name || 'General'}</td><td><Status status={tones[row.status]}>{incidentStates[row.status]}</Status></td>
          <td>{row.reporter_name}</td><td>{dateLabel(row.created_at)}</td><td><button className="icon-button"
            aria-label={`Ver incidencia ${row.id}`} onClick={() => setModal(row)}><AlertTriangle size={17}/></button></td></tr>)}</tbody>
      </table></div>}
      <Pagination data={data} page={page} onChange={setPage}/>
    </section>
    {modal === 'create' && <IncidentForm initialProduct={params.get('producto') || ''} onClose={closeForm} onSaved={saved}/>}
    {modal && modal !== 'create' && <IncidentDetail row={modal} admin={user.role === 'admin'} onClose={() => setModal(null)} onSaved={saved}/>}
  </>
}
