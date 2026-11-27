import { useCallback, useRef, useState } from 'react'
import { Barcode, Plus, Search, ShoppingCart, Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { catalog } from '../api/catalog'
import { request } from '../api/client'
import { money, post, query } from '../api/operations'
import { PaymentFields, Receipt, paymentBody } from '../components/Payment'
import ProductIcon from '../components/ProductIcon'
import { Empty, Loading, Notice, PageHeading, Pagination, Section, Tag, TextLink } from '../components/UI'
import { useQuery } from '../hooks/useQuery'

const loadCustomers = signal => catalog.options('customers', signal)

export default function PointOfSale() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [code, setCode] = useState('')
  const [lines, setLines] = useState([])
  const [customer, setCustomer] = useState('')
  const [error, setError] = useState('')
  const [scanBusy, setScanBusy] = useState(false)
  const [busy, setBusy] = useState(false)
  const [version, setVersion] = useState(0)
  const [receipt, setReceipt] = useState(null)
  const pending = useRef(null)
  const scanner = useRef(null)
  const loadProducts = useCallback(signal => catalog.list('products', { search, page, active: 'true', ordering: 'id' }, signal),
    [search, page, version])
  const products = useQuery(loadProducts)
  const customers = useQuery(loadCustomers)
  const total = lines.reduce((sum, line) => sum + line.quantity * Math.round(Number(line.price) * 100), 0) / 100

  function add(product) {
    const current = lines.find(line => line.id === product.id)
    if (Number(current?.quantity) >= Math.min(99999, product.stock) || !product.stock) {
      setError('La cantidad solicitada supera el stock disponible.')
      return false
    }
    if (!current && lines.length >= 30) {
      setError('Puedes agregar hasta 30 productos distintos por pedido.')
      return false
    }
    setLines(current ? lines.map(line => line.id === product.id ? { ...product, quantity: Number(line.quantity) + 1 } : line)
      : [...lines, { ...product, quantity: 1 }])
    return true
  }

  async function scan(event) {
    event.preventDefault()
    const value = code.trim()
    if (!value || busy || scanBusy) return
    setError('')
    setScanBusy(true)
    try {
      if (add(await request(`/products/scan/?${query({ code: value })}`))) setCode('')
    } catch (error) { setError(error.message) }
    finally {
      setScanBusy(false)
      queueMicrotask(() => scanner.current?.focus())
    }
  }

  async function checkout(event) {
    event.preventDefault()
    setError('')
    if (!customer || !lines.length || lines.some(line => !Number.isInteger(Number(line.quantity))
      || Number(line.quantity) < 1 || Number(line.quantity) > Math.min(line.stock, 99999))) {
      return setError('Selecciona un cliente y comprueba las cantidades del pedido.')
    }
    const withoutPayment = event.nativeEvent.submitter?.value === 'pending'
    const body = {
      customer: Number(customer),
      items: lines.map(line => ({ product: line.id, quantity: Number(line.quantity) })),
    }
    const fingerprint = JSON.stringify(body)
    if (pending.current?.fingerprint !== fingerprint) pending.current = { fingerprint, key: crypto.randomUUID() }
    setBusy(true)
    try {
      const orderInput = { ...body, request_key: pending.current.key }
      if (withoutPayment) {
        const order = await post('/orders/', orderInput)
        navigate(`/pedidos?pedido=${order.id}`)
        return
      }
      const payment = paymentBody(new FormData(event.currentTarget))
      const result = await post('/orders/checkout/', { ...orderInput, payment })
      setReceipt(result)
      setLines([])
      setCustomer('')
      pending.current = null
      event.target.reset()
      setVersion(value => value + 1)
    } catch (error) { setError(error.message) }
    finally { setBusy(false) }
  }

  return <>
    <PageHeading title="Punto de venta" description="Agrega productos, confirma el pedido y registra el cobro.">
      <TextLink to="/pagos">Historial de pagos</TextLink>
    </PageHeading>
    <Notice>{error || products.error || customers.error}</Notice>
    <div className="pos-grid">
      <Section title="Catálogo" icon={Barcode} action={<span className="result-count">{products.data?.count ?? '—'} productos</span>}>
        <div className="pos-filters">
          <label className="input-icon"><Search size={18}/><input type="search" value={search} aria-label="Buscar productos"
            placeholder="Nombre, SKU o código de barras" onChange={event => { setSearch(event.target.value); setPage(1) }}/></label>
          <form className="pos-scan" onSubmit={scan}>
            <label className="input-icon"><Barcode size={18}/><input ref={scanner} aria-label="Código de barras"
              value={code} placeholder="Escanea y presiona Enter" maxLength={64}
              onChange={event => setCode(event.target.value)}/></label>
            <button type="submit" className="button outline" disabled={busy || scanBusy || !code.trim()}>{scanBusy ? 'Buscando…' : 'Agregar'}</button>
          </form>
        </div>
        {products.loading && <Loading />}
        {products.data?.results.length === 0 && <Empty>No hay productos para esta búsqueda.</Empty>}
        <div className="pos-products">{products.data?.results.map(product => <article className="pos-product" key={product.id}>
          <ProductIcon/>
          <div><strong>{product.name}</strong><small>{product.sku}{product.barcode && ` · ${product.barcode}`}</small></div>
          <div className="pos-product-end"><strong>{money.format(product.price)}</strong>
            <Tag tone={product.stock > 0 ? 'green' : 'red'}>{product.stock} u.</Tag>
            <button type="button" className="icon-button pos-add" aria-label={`Agregar ${product.name}`}
              disabled={busy || scanBusy || !product.stock} onClick={() => { setError(''); add(product) }}><Plus size={18}/></button>
          </div>
        </article>)}</div>
        {(products.data?.next || products.data?.previous) && <Pagination data={products.data} page={page} onChange={setPage}/>}
      </Section>
      <Section title="Resumen del pedido" icon={ShoppingCart} className="pos-order"
        action={lines.length > 0 && <span className="result-count">{lines.length} {lines.length === 1 ? 'línea' : 'líneas'}</span>}>
        <form onSubmit={checkout} className="stack">
          <fieldset disabled={busy || scanBusy} className="stack">
            <label>Cliente<select value={customer} onChange={event => setCustomer(event.target.value)} required>
              <option value="">Selecciona un cliente</option>
              {customers.data?.map(row => <option key={row.id} value={row.id}>{row.name} · {row.document}</option>)}
            </select></label>
            <TextLink to="/clientes">Gestionar clientes</TextLink>
            {lines.length ? <div className="pos-cart">{lines.map(line => <div className="pos-cart-item" key={line.id}>
              <div><strong>{line.name}</strong><small>{money.format(line.price)} / u.</small></div>
              <input aria-label={`Cantidad de ${line.name}`} type="number" min="1" max={Math.min(line.stock, 99999)} required
                value={line.quantity} onChange={event => setLines(current => current.map(item =>
                  item.id === line.id ? { ...item, quantity: event.target.value } : item))}/>
              <strong>{money.format(Number(line.price) * Number(line.quantity))}</strong>
              <button type="button" className="icon-button" aria-label={`Quitar ${line.name}`}
                onClick={() => setLines(current => current.filter(item => item.id !== line.id))}><Trash2 size={17}/></button>
            </div>)}</div> : <Empty>Agrega productos para comenzar.</Empty>}
            <div className="order-total"><span>Total</span><strong>{money.format(total)}</strong></div>
            {lines.length > 0 && <PaymentFields key={version} total={total}/>}
            <button className="button primary pos-submit" disabled={!lines.length || !customer || busy}>
              {busy ? 'Registrando…' : 'Confirmar pedido y cobro'}
            </button>
            {lines.length > 0 && <button type="submit" value="pending" formNoValidate
              className="button outline" disabled={!customer || busy}>Confirmar pedido sin cobro</button>}
          </fieldset>
        </form>
      </Section>
    </div>
    {receipt && <Receipt {...receipt} onClose={() => setReceipt(null)}/>}
  </>
}
