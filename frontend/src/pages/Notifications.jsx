import { useCallback, useState } from 'react'
import { Bell, CheckCheck, CircleAlert, PackageCheck } from 'lucide-react'
import { Link } from 'react-router-dom'
import { catalog } from '../api/catalog'
import { dateLabel, post } from '../api/operations'
import { Empty, Loading, Notice, PageHeading, Pagination } from '../components/UI'
import { usePolling } from '../hooks/usePolling'

export default function Notifications() {
  const [page, setPage] = useState(1)
  const [busy, setBusy] = useState(false)
  const [writeError, setWriteError] = useState('')
  const load = useCallback(signal => catalog.list('notifications', { page }, signal), [page])
  const { data, loading, error } = usePolling(load)

  async function read(id) {
    setWriteError('')
    setBusy(true)
    try {
      await post(id ? `/notifications/${id}/read/` : '/notifications/read-all/')
      window.dispatchEvent(new Event('control360:notifications'))
    } catch (error) { setWriteError(error.message) }
    finally { setBusy(false) }
  }

  return <>
    <PageHeading title="Notificaciones" description="Avisos de pedidos, asistencia e inventario.">
      <button className="button secondary" disabled={busy || !data?.count} onClick={() => read()}>
        <CheckCheck size={18}/> Marcar todas como leídas
      </button>
    </PageHeading>
    <Notice>{writeError || error}</Notice>
    <section className="panel">
      {loading && <Loading />}
      {data?.results.length === 0 && <Empty>Por ahora no hay notificaciones.</Empty>}
      {data?.results.map(row => {
        const Icon = row.kind === 'low_stock' ? CircleAlert : row.kind === 'new_order' ? Bell : PackageCheck
        const target = row.kind.startsWith('attendance_') ? '/asistencia' :
          row.kind.startsWith('incident_') ? '/incidencias' : row.order ? `/pedidos?pedido=${row.order}` :
          row.product ? '/productos' : ''
        return <article className={`notification-row ${row.read_at ? '' : 'unread'}`} key={row.id}>
          <span className="tile-icon"><Icon size={20}/></span><div><strong>{row.message}</strong><small>{dateLabel(row.created_at)}</small></div>
          <div className="heading-actions">
            {target && <Link to={target} className="text-button">Consultar</Link>}
            {!row.read_at && <button className="icon-button" aria-label="Marcar como leída" disabled={busy} onClick={() => read(row.id)}>
              <CheckCheck size={18}/></button>}
          </div>
        </article>
      })}
      <Pagination data={data} page={page} onChange={setPage}/>
    </section>
  </>
}
