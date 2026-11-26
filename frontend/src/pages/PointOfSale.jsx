import { useCallback, useRef, useState } from 'react'
import { Barcode, PackagePlus, Search, ShoppingCart, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { catalog } from '../api/catalog'
import { request } from '../api/client'
import { money, post, query } from '../api/operations'
import { PaymentFields, Receipt, paymentBody } from '../components/Payment'
import { Empty, Loading, Notice, PageHeading, Pagination } from '../components/UI'
import { useQuery } from '../hooks/useQuery'

const loadCustomers = signal => catalog.options('customers', signal)

export default function PointOfSale() {
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
  const loadProducts = useCallback(signal => catalog.list('products', { search, page, active: 'true' }, signal),
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
    const body = {
      customer: Number(customer),
      items: lines.map(line => ({ product: line.id, quantity: Number(line.quantity) })),
      payment: paymentBody(new FormData(event.currentTarget)),
    }
    const fingerprint = JSON.stringify(body)
    if (pending.current?.fingerprint !== fingerprint) pending.current = { fingerprint, key: crypto.randomUUID() }
    setBusy(true)
    try {
      const result = await post('/orders/checkout/', { ...body, request_key: pending.current.key })
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
    <PageHeading title="Punto de venta" description="Agrega productos, registra el cobro y envía el pedido a almacén.">
      <Link className="button secondary" to="/pagos">Historial de ventas</Link>
    </PageHeading>
    <Notice>{error || products.error || customers.error}</Notice>
    <div className="pos-grid">
      <section className="panel">
        <div className="section-heading"><h2>Catálogo</h2><span className="muted">{products.data?.count ?? '—'} productos</span></div>
        <div className="toolbar pos-search">
          <label className="search"><Search size={18}/><input type="search" value={search} aria-label="Buscar productos"
            placeholder="Nombre, SKU o código" onChange={event => { setSearch(event.target.value); setPage(1) }}/></label>
          <form className="scan-form" onSubmit={scan}>
            <label className="search"><Barcode size={18}/><input ref={scanner} aria-label="Código de barras"
              value={code} placeholder="Escanea y pulsa Enter" maxLength={64}
              onChange={event => setCode(event.target.value)}/></label>
            <button type="submit" className="button secondary" disabled={busy || scanBusy}>{scanBusy ? 'Buscando…' : 'Agregar código'}</button>
          </form>
        </div>
        {products.loading && <Loading />}
        {products.data?.results.length === 0 && <Empty>No hay productos para esta búsqueda.</Empty>}
        <div className="pos-products">{products.data?.results.map(product => <article key={product.id}>
          <div><strong>{product.name}</strong><small>{product.sku}{product.barcode && ` · ${product.barcode}`}</small></div>
          <div><span>{product.stock} disponibles</span><strong>{money.format(product.price)}</strong></div>
          <button type="button" className="icon-button" aria-label={`Agregar ${product.name}`}
            disabled={busy || scanBusy || !product.stock} onClick={() => { setError(''); add(product) }}><PackagePlus size={19}/></button>
        </article>)}</div>
        <Pagination data={products.data} page={page} onChange={setPage}/>
      </section>
      <section className="panel pos-cart">
        <div className="section-heading"><h2><ShoppingCart size={19}/> Pedido actual</h2><span className="muted">{lines.length} {lines.length === 1 ? 'línea' : 'líneas'}</span></div>
        <form onSubmit={checkout} className="stack">
          <fieldset disabled={busy || scanBusy} className="stack">
            <label>Cliente<select value={customer} onChange={event => setCustomer(event.target.value)} required>
              <option value="">Selecciona un cliente</option>
              {customers.data?.map(row => <option key={row.id} value={row.id}>{row.name} · {row.document}</option>)}
            </select></label>
            {customers.data?.length === 0 && <Link className="text-button" to="/clientes">Registrar cliente</Link>}
            {!lines.length && <Empty>Agrega productos del catálogo.</Empty>}
            {lines.map(line => <div className="order-line" key={line.id}>
              <span><strong>{line.name}</strong><small>{money.format(Number(line.price) * Number(line.quantity))}</small></span>
              <input aria-label={`Cantidad de ${line.name}`} type="number" min="1" max={Math.min(line.stock, 99999)} required
                value={line.quantity} onChange={event => setLines(current => current.map(item =>
                  item.id === line.id ? { ...item, quantity: event.target.value } : item))}/>
              <button type="button" className="icon-button" aria-label={`Quitar ${line.name}`}
                onClick={() => setLines(current => current.filter(item => item.id !== line.id))}><Trash2 size={17}/></button>
            </div>)}
            <div className="order-total"><span>Total estimado</span><strong>{money.format(total)}</strong></div>
            <PaymentFields key={version} total={total}/>
            <button className="button primary" disabled={!lines.length || !customer || busy}>
              {busy ? 'Registrando…' : 'Confirmar pedido y cobro'}
            </button>
          </fieldset>
        </form>
      </section>
    </div>
    {receipt && <Receipt {...receipt} onClose={() => setReceipt(null)}/>}
  </>
}
