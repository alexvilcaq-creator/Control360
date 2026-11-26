import { useCallback, useState } from 'react'
import { Columns3, List, Plus, Search, Trash2 } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { request } from '../api/client'
import { catalog } from '../api/catalog'
import { dateLabel, money, orderActions, orderStatus, post } from '../api/operations'
import { PaymentFields, paymentBody, paymentMethods, paymentStates } from '../components/Payment'
import { Empty, Loading, Modal, Notice, PageHeading, Pagination, Status, Toast } from '../components/UI'
import { useAuth } from '../context/Auth'
import { useQuery } from '../hooks/useQuery'

function NewOrder({ onClose, onSaved }) {
  const [lines, setLines] = useState([])
  const [requestKey] = useState(() => crypto.randomUUID())
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const customers = useQuery(loadCustomers)
  const loadProducts = useCallback(signal => catalog.list('products', { search, active: 'true' }, signal), [search])
  const products = useQuery(loadProducts)
  const total = lines.reduce((value, line) => value + Number(line.price) * Number(line.quantity), 0)

  async function submit(event) {
    event.preventDefault()
    if (!lines.length) return setError('Agrega al menos un producto.')
    if (lines.some(line => !Number.isInteger(Number(line.quantity)) || line.quantity < 1 || line.quantity > line.stock)) {
      return setError('Comprueba la cantidad disponible de cada producto.')
    }
    setBusy(true)
    setError('')
    const form = new FormData(event.currentTarget)
    try {
      const order = await post('/orders/', {
        request_key: requestKey,
        customer: Number(form.get('customer')),
        items: lines.map(line => ({ product: line.id, quantity: Number(line.quantity) })),
      })
      onSaved(`Pedido #${order.id} registrado.`)
    } catch (error) { setError(error.message) }
    finally { setBusy(false) }
  }

  return <Modal title="Registrar pedido" busy={busy} onClose={onClose}>
    <div className="modal-body">
      <Notice>{error || customers.error || products.error}</Notice>
      {(customers.loading || products.loading) && <Loading />}
      <form id="create-order" className="stack" onSubmit={submit}>
        <label>Cliente<select name="customer" required defaultValue="">
          <option value="">Seleccionar cliente</option>
          {customers.data?.map(customer => <option key={customer.id} value={customer.id}>{customer.name} · {customer.document}</option>)}
        </select></label>
        {customers.data?.length === 0 && <Notice>Registra un cliente antes de crear un pedido.</Notice>}
        <label>Buscar producto<input value={search} onChange={event => setSearch(event.target.value)} placeholder="Nombre o SKU" /></label>
        <div className="picker" aria-label="Productos disponibles">
          {products.data?.results.length === 0 && <p className="muted">Sin productos para la búsqueda.</p>}
          {products.data?.results.map(product => <button type="button" key={product.id}
            disabled={product.stock < 1 || lines.length >= 30 || lines.some(line => line.id === product.id)}
            onClick={() => setLines(current => [...current, { ...product, quantity: 1 }])}>
            <span><strong>{product.name}</strong><small>{product.sku} · {product.stock} disponibles</small></span>
            <span>{money.format(product.price)} <Plus size={16} /></span>
          </button>)}
        </div>
        {lines.map(line => <div className="order-line" key={line.id}>
          <span>{line.name}</span>
          <input aria-label={`Cantidad de ${line.name}`} type="number" min="1" max={Math.min(99999, line.stock)} required value={line.quantity}
            onChange={event => setLines(current => current.map(item => item.id === line.id ? { ...item, quantity: event.target.value } : item))} />
          <button type="button" className="icon-button" aria-label={`Quitar ${line.name}`}
            onClick={() => setLines(current => current.filter(item => item.id !== line.id))}><Trash2 size={17} /></button>
        </div>)}
        <strong className="order-total">Total estimado {money.format(total)}</strong>
      </form>
    </div>
    <div className="modal-foot"><button className="button secondary" onClick={onClose} disabled={busy}>Cerrar</button>
      <button className="button primary" form="create-order" disabled={busy}>{busy ? 'Guardando…' : 'Registrar'}</button></div>
  </Modal>
}

const loadCustomers = signal => catalog.options('customers', signal)
const loadWorkers = signal => catalog.options('workers', signal)
const noWorkers = async () => []

function OrderDetail({ id, onClose, onChanged }) {
  const { user } = useAuth()
  const [showPayment, setShowPayment] = useState(false)
  const [version, setVersion] = useState(0)
  const [choice, setChoice] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const load = useCallback(signal => request(`/orders/${id}/`, { signal }), [id, version])
  const { data, loading, error: readError } = useQuery(load)
  const workers = useQuery(choice === 'assign' ? loadWorkers : noWorkers)

  async function transition(event) {
    event.preventDefault()
    if (!data?.actions.includes(choice)) return
    setBusy(true)
    setError('')
    const fields = Object.fromEntries(new FormData(event.currentTarget))
    try {
      await post(`/orders/${id}/transition/`, { action: choice, ...fields })
      setChoice('')
      setVersion(value => value + 1)
      onChanged('Estado actualizado.')
    } catch (error) {
      setError(error.message)
      if (error.status === 409) {
        setChoice('')
        setVersion(value => value + 1)
        onChanged('')
      }
    } finally { setBusy(false) }
  }

  async function pay(event) {
    event.preventDefault()
    const body = paymentBody(new FormData(event.currentTarget))
    setBusy(true)
    setError('')
    try {
      await post(`/orders/${id}/payment/`, body)
      setShowPayment(false)
      setVersion(value => value + 1)
      onChanged('Cobro registrado.')
    } catch (error) { setError(error.message) }
    finally { setBusy(false) }
  }

  return <Modal title={`Pedido #${id}`} onClose={onClose} busy={busy}>
    <div className="modal-body stack">
      <Notice>{error || readError || workers.error}</Notice>
      {loading && <Loading />}
      {data && <>
        <div className="detail-summary"><div><strong>{data.customer_name}</strong>
          <p className="muted">{data.assignee_name ? `Asignado a ${data.assignee_name}` : 'Sin asignar'}</p></div>
          <Status status={data.status}>{orderStatus[data.status]}</Status></div>
        {data.items.map(item => <div className="movement" key={item.product}>
          <div><strong>{item.name}</strong><small>{item.sku} · {item.location}</small></div>
          <div><strong>{item.quantity} × {money.format(item.unit_price)}</strong></div>
        </div>)}
        <strong className="order-total">Total {money.format(data.total)}</strong>
        {data.payment && <div className="detail-summary"><strong>{data.payment.number} · {paymentMethods[data.payment.method]}</strong>
          <Status status={data.payment.status === 'paid' ? 'ready' : 'cancelled'}>{paymentStates[data.payment.status]}</Status></div>}
        {user.role !== 'warehouse' && !data.payment && data.status !== 'cancelled' && <>
          <button type="button" className="button secondary" disabled={busy} aria-expanded={showPayment}
            onClick={() => setShowPayment(value => !value)}>{showPayment ? 'Cerrar cobro' : 'Registrar cobro'}</button>
          {showPayment && <form onSubmit={pay} className="stack">
            <PaymentFields total={Number(data.total)}/>
            <button className="button primary" disabled={busy}>{busy ? 'Guardando…' : 'Confirmar cobro'}</button>
          </form>}
        </>}
        {data.actions.length > 0 && <form onSubmit={transition} className="stack">
          <div className="heading-actions">
            {data.actions.map(action => <button key={action} type="button" disabled={busy}
              className={`button ${choice === action ? 'primary' : 'secondary'}`}
              aria-pressed={choice === action} onClick={() => setChoice(action)}>{orderActions[action]}</button>)}
          </div>
          {choice === 'assign' && <label>Trabajador<select name="worker_id" required defaultValue="">
            <option value="">Seleccionar</option>
            {workers.data?.filter(worker => worker.active && worker.role === 'warehouse').map(worker =>
              <option key={worker.id} value={worker.id}>{worker.name}</option>)}
          </select></label>}
          {choice === 'cancel' && <label>Motivo<input name="note" maxLength={200} required /></label>}
          {choice && <button className={`button ${choice === 'cancel' ? 'danger' : 'primary'}`} disabled={busy}>
            {busy ? 'Actualizando…' : 'Confirmar acción'}</button>}
        </form>}
        <h2>Historial</h2>
        {data.history.map(event => <div className="movement" key={event.id}><div><strong>{orderStatus[event.status]}</strong>
          <small>{event.actor}{event.note && ` · ${event.note}`}</small></div><small>{dateLabel(event.created_at)}</small></div>)}
      </>}
    </div>
  </Modal>
}

export function OrderTable({ orders, onOpen }) {
  return <div className="table-scroll"><table>
    <thead><tr><th>Pedido</th><th>Cliente</th><th>Estado</th><th>Asignación</th><th>Total</th></tr></thead>
    <tbody>{orders.map(order => <tr key={order.id}>
      <td><button className="text-button" onClick={() => onOpen(order.id)}>#{order.id}</button><small>{dateLabel(order.created_at)}</small></td>
      <td>{order.customer_name}</td><td><Status status={order.status}>{orderStatus[order.status]}</Status></td>
      <td>{order.assignee_name || 'Sin asignar'}</td><td>{money.format(order.total)}</td>
    </tr>)}</tbody>
  </table></div>
}

function OrderList({ status = '', search, mine, version, onOpen, board }) {
  const [page, setPage] = useState(1)
  const load = useCallback(signal => catalog.list('orders', { status, search, page, mine }, signal),
    [status, search, page, mine, version])
  const { data, loading, error } = useQuery(load)
  return <div className={board ? 'kanban-column' : 'panel'}>
    {board && <header><Status status={status}>{orderStatus[status]}</Status><span>{data?.count ?? '—'}</span></header>}
    <Notice>{error}</Notice>
    {loading && <Loading />}
    {data?.results.length === 0 && <Empty>{board ? 'Sin pedidos' : 'No se encontraron pedidos.'}</Empty>}
    {!!data?.results.length && (board ? <div className="kanban-cards">
      {data.results.map(order => <button key={order.id} onClick={() => onOpen(order.id)}>
        <strong>#{order.id} · {order.customer_name}</strong>
        <small>{order.assignee_name || 'Sin asignar'}</small><span>{money.format(order.total)}</span>
      </button>)}
    </div> : <OrderTable orders={data.results} onOpen={onOpen} />)}
    {data?.count > 0 && (!board || data.next || data.previous) && <Pagination data={data} page={page} onChange={setPage} />}
  </div>
}

export default function Orders() {
  const { user } = useAuth()
  const [params, setParams] = useSearchParams()
  const [board, setBoard] = useState(true)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [mine, setMine] = useState('')
  const [version, setVersion] = useState(0)
  const [creating, setCreating] = useState(false)
  const [toast, setToast] = useState('')
  const closeToast = useCallback(() => setToast(''), [])
  const open = id => setParams({ pedido: id })
  const close = () => setParams({})
  const onChanged = message => { setToast(message); setVersion(value => value + 1) }
  const listKey = JSON.stringify([search, mine, status, version])
  return <>
    <PageHeading title={user.role === 'warehouse' ? 'Pedidos de almacén' : 'Pedidos'} description="Consulta el estado y el historial de cada pedido.">
      {user.role !== 'warehouse' && <button className="button primary" onClick={() => setCreating(true)}><Plus size={18}/> Nuevo pedido</button>}
    </PageHeading>
    <div className="toolbar panel module-toolbar">
      <label className="search"><Search size={18}/><input type="search" aria-label="Buscar pedidos" placeholder="Número, cliente o SKU" value={search} onChange={event => setSearch(event.target.value)} /></label>
      {user.role === 'warehouse' && <select aria-label="Asignación" value={mine} onChange={event => setMine(event.target.value)}>
        <option value="">Pendientes y asignados a mí</option><option value="true">Mis tareas</option></select>}
      {!board && <select aria-label="Estado" value={status} onChange={event => setStatus(event.target.value)}>
        <option value="">Todos los estados</option>
        {Object.entries(orderStatus).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select>}
      <button className="button secondary" aria-pressed={board} onClick={() => setBoard(value => !value)}>
        {board ? <List size={17}/> : <Columns3 size={17}/>} {board ? 'Ver lista' : 'Ver tablero'}</button>
    </div>
    {board ? <div className="kanban" aria-label="Tablero Kanban" tabIndex={0}>
      {Object.keys(orderStatus).map(status => <OrderList key={status + listKey} {...{ status, search, mine, version }} onOpen={open} board />)}
    </div> : <OrderList key={listKey} {...{ status, search, mine, version }} onOpen={open} />}
    {creating && <NewOrder onClose={() => setCreating(false)} onSaved={message => { setCreating(false); onChanged(message) }} />}
    {params.get('pedido') && <OrderDetail key={params.get('pedido')} id={params.get('pedido')} onClose={close} onChanged={onChanged} />}
    <Toast onClose={closeToast}>{toast}</Toast>
  </>
}
