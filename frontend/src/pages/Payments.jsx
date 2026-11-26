import { useCallback, useState } from 'react'
import { ReceiptText, Search, XCircle } from 'lucide-react'
import { Link } from 'react-router-dom'
import { catalog } from '../api/catalog'
import { request } from '../api/client'
import { dateLabel, money, post } from '../api/operations'
import { paymentMethods, paymentStates, Receipt } from '../components/Payment'
import { Empty, Loading, Modal, Notice, PageHeading, Pagination, Status } from '../components/UI'
import { useAuth } from '../context/Auth'
import { useQuery } from '../hooks/useQuery'

function VoidForm({ payment, onClose, onDone }) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await post(`/payments/${payment.id}/void/`, { reason: new FormData(event.currentTarget).get('reason') })
      onDone()
    } catch (error) { setError(error.message) }
    finally { setBusy(false) }
  }
  return <Modal title={`Anular ${payment.number}`} onClose={onClose} busy={busy}>
    <div className="modal-body"><Notice>{error}</Notice>
      <form id="void-payment" className="stack" onSubmit={submit}>
        <p>El comprobante quedará anulado en el historial.</p>
        <label>Motivo<textarea name="reason" maxLength={250} required rows={3}/></label>
      </form>
    </div>
    <div className="modal-foot"><button className="button secondary" onClick={onClose} disabled={busy}>Cerrar</button>
      <button className="button danger" form="void-payment" disabled={busy}>{busy ? 'Guardando…' : 'Confirmar anulación'}</button></div>
  </Modal>
}

function PaymentReceipt({ payment, onClose }) {
  const load = useCallback(signal => request(`/orders/${payment.order}/`, { signal }), [payment.order])
  const { data } = useQuery(load)
  return <Receipt payment={payment} order={data} onClose={onClose}/>
}

export default function Payments() {
  const { user } = useAuth()
  const [search, setSearch] = useState('')
  const [method, setMethod] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [version, setVersion] = useState(0)
  const [modal, setModal] = useState(null)
  const [message, setMessage] = useState('')
  const load = useCallback(signal => catalog.list('payments', { search, method, status, page }, signal),
    [search, method, status, page, version])
  const { loading, data, error } = useQuery(load)
  return <>
    <PageHeading title={user.role === 'admin' ? 'Pagos' : 'Historial de ventas'}
      description="Consulta los cobros registrados y sus comprobantes.">
      <Link className="button primary" to="/punto-de-venta">Punto de venta</Link>
    </PageHeading>
    <Notice>{error}</Notice><Notice success>{message}</Notice>
    <section className="panel">
      <div className="toolbar">
        <label className="search"><Search size={17}/><input type="search" aria-label="Buscar pagos" value={search}
          placeholder="Pedido, cliente o referencia" onChange={event => { setSearch(event.target.value); setPage(1) }}/></label>
        <select aria-label="Método" value={method} onChange={event => { setMethod(event.target.value); setPage(1) }}>
          <option value="">Todos los métodos</option>{Object.entries(paymentMethods).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
        <select aria-label="Estado" value={status} onChange={event => { setStatus(event.target.value); setPage(1) }}>
          <option value="">Todos los estados</option>{Object.entries(paymentStates).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
      </div>
      {loading && <Loading/>}
      {data?.results.length === 0 && <Empty>Sin cobros registrados.</Empty>}
      {!!data?.results.length && <div className="table-scroll"><table>
        <thead><tr><th>Comprobante</th><th>Cliente</th><th>Método</th><th>Estado</th><th>Importe</th><th>Fecha</th><th>Acciones</th></tr></thead>
        <tbody>{data.results.map(row => <tr key={row.id}>
          <td><strong>{row.number}</strong><small>Pedido #{row.order} · {row.cashier_name}</small></td>
          <td>{row.customer}</td><td>{paymentMethods[row.method]}</td>
          <td><Status status={row.status === 'paid' ? 'ready' : 'cancelled'}>{paymentStates[row.status]}</Status></td>
          <td>{money.format(row.amount)}</td><td>{dateLabel(row.created_at)}</td>
          <td><div className="actions"><button className="icon-button" title="Ver comprobante" aria-label={`Ver comprobante ${row.number}`}
            onClick={() => setModal({ payment: row })}><ReceiptText size={17}/></button>
            {user.role === 'admin' && row.status === 'paid' && <button className="icon-button" title="Anular cobro" aria-label={`Anular ${row.number}`}
              onClick={() => setModal({ payment: row, void: true })}><XCircle size={17}/></button>}</div></td>
        </tr>)}</tbody>
      </table></div>}
      <Pagination data={data} page={page} onChange={setPage}/>
    </section>
    {modal?.void && <VoidForm payment={modal.payment} onClose={() => setModal(null)}
      onDone={() => { setModal(null); setPage(1); setVersion(value => value + 1); setMessage('Cobro anulado.') }}/>}
    {modal && !modal.void && <PaymentReceipt payment={modal.payment} onClose={() => setModal(null)}/>}
  </>
}
