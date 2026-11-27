import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowUpRight, MapPin, Search, Truck, X, Warehouse as WarehouseIcon } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { Empty, ErrorNotice, Loading, PageTitle, Section, Tag, TextLink } from '../components/UI'
import ProductPhoto from '../components/ProductPhoto'
import WarehouseRoute from '../components/WarehouseRoute'
import { useAuth } from '../context/Auth'
import { catalog } from '../api/catalog'
import { request } from '../api/client'
import { useQuery } from '../hooks/useQuery'
import { locationLabel, matchesLocation, normalize, orderCode, shelfCode } from '../api/operations'

const loadLocations = signal => catalog.options('locations', signal)
const loadProducts = signal => catalog.options('products', signal, { active: 'true' })
const getId = value => /^[1-9][0-9]{0,18}$/.test(value ?? '') ? value : ''

export default function Warehouse() {
  const { user } = useAuth()
  const locations = useQuery(loadLocations)
  const products = useQuery(loadProducts)
  const [params, setParams] = useSearchParams()
  const [query, setQuery] = useState('')
  const targetShelf = useRef(null)
  const productId = getId(params.get('producto'))
  const orderId = getId(params.get('pedido'))
  const selected = getId(params.get('ubicacion'))
  const loadTarget = useCallback(signal => productId ? request(`/products/${productId}/`, { signal }) : Promise.resolve(null), [productId])
  const target = useQuery(loadTarget)
  const product = String(target.data?.id) === productId ? target.data : null

  const groups = new Map()
  const locationById = new Map()
  for (const item of locations.data ?? []) {
    locationById.set(String(item.id), item)
    if (!groups.has(item.zone)) groups.set(item.zone, [])
    groups.get(item.zone).push(item)
  }
  const zones = Array.from(groups, ([zone, shelves]) => [
    zone,
    shelves.sort((a, b) => a.aisle.localeCompare(b.aisle, undefined, { numeric: true })
      || a.shelf.localeCompare(b.shelf, undefined, { numeric: true })),
  ])
  const search = normalize(query).trim()
  const inventory = (products.data ?? []).filter(item => item.location && item.id !== product?.id)
  if (product?.location) inventory.unshift(product)
  const counts = new Map()
  for (const item of inventory) counts.set(item.location, (counts.get(item.location) ?? 0) + 1)
  const locationIds = new Set(search ? (locations.data ?? []).filter(item => matchesLocation(item, search)).map(item => item.id) : [])
  const matches = inventory.filter(item => locationIds.has(item.location) || normalize(`${item.name} ${item.sku}`).includes(search))
  const highlightIds = new Set([...locationIds, ...matches.map(item => item.location)])
  const active = locationById.get(productId ? String(product?.location) : selected)
  const shown = productId ? (active && product ? [product] : [])
    : selected ? matches.filter(item => item.location === active?.id) : matches
  const singleMatch = !productId && !selected && search && highlightIds.size === 1 ? [...highlightIds][0] : null
  const destination = active ?? locationById.get(String(singleMatch))
  const destinationId = destination?.id
  const loading = locations.loading || (productId ? (!product && !target.error) : products.loading)

  useEffect(() => {
    if (productId && destinationId) targetShelf.current?.scrollIntoView({ block: 'nearest' })
  }, [productId, destinationId])

  function selectShelf(id) {
    setQuery('')
    const next = new URLSearchParams()
    if (orderId) next.set('pedido', orderId)
    if (id) next.set('ubicacion', id)
    setParams(next)
  }

  return <>
    <PageTitle title="Mapa del almacén" subtitle="Ubica productos y consulta existencias por zona, pasillo y estante.">
      {orderId && <TextLink to={`/pedidos?pedido=${orderId}`}>Volver al pedido {orderCode(orderId)}</TextLink>}
      {user.role === 'admin' && <TextLink to="/ubicaciones">Gestionar ubicaciones</TextLink>}
    </PageTitle>
    <ErrorNotice message={locations.error || products.error || (productId && target.error)}/>
    <div className="warehouse-grid">
      <Section title="Plano de ubicaciones" icon={WarehouseIcon} caption="Busca un producto o selecciona un estante.">
        <label className="input-icon map-search"><Search size={17}/><input aria-label="Buscar en el mapa" placeholder="Buscar por producto, SKU o ubicación"
          value={query} onChange={event => {
            if (productId || selected) selectShelf()
            setQuery(event.target.value)
          }}/></label>
        {destination && <WarehouseRoute destination={destination}/>}
        {locations.loading ? <Loading/> : zones.length ?
          <div className="warehouse-floor">
            <div className="map-terminal"><Truck size={21}/> Recepción</div>
            <div className="warehouse-zones">{zones.map(([zone, cells], index) =>
              <div className="map-zone" key={zone}><span>Zona {zone}</span><div>
                {cells.map(item => {
                  const current = destinationId === item.id
                  return <button key={item.id} type="button" ref={current ? targetShelf : null}
                    className={`map-cell ${current ? 'selected' : ''} ${search && highlightIds.has(item.id) ? 'matching' : ''}`}
                    aria-pressed={active?.id === item.id} aria-current={current ? 'location' : undefined}
                    aria-label={locationLabel(item)} onClick={() => selectShelf(active?.id === item.id ? null : item.id)}>
                    <img className="map-shelf-image" src={`/images/rack-${index % 3 + 1}.webp`}
                      alt="" width="78" height="58" loading="lazy" decoding="async"/>
                    <span className="map-cell-info"><strong>{shelfCode(item)}</strong><small>Pasillo {item.aisle}</small></span>
                    {products.data && <span className="map-cell-count">{counts.get(item.id) ?? 0}</span>}
                  </button>
                })}
              </div></div>)}</div>
          </div> : !locations.error && <Empty>No hay ubicaciones registradas.</Empty>}
        {search && <p className="map-legend" role="status">{highlightIds.size === 1 ? '1 ubicación coincide con la búsqueda' : `${highlightIds.size} ubicaciones coinciden con la búsqueda`}</p>}
      </Section>
      <Section title={product?.name || (active ? `Zona ${active.zone} · Estante ${active.shelf}` : 'Productos en el plano')}
        icon={MapPin} className="map-product-panel" caption={active ? locationLabel(active) : 'Existencias por ubicación'}
        action={(productId || selected) && <button type="button" className="icon-button" aria-label="Ver todas las ubicaciones" onClick={() => selectShelf()}><X size={18}/></button>}>
        {loading ? <Loading/> : product && !active ? <Empty>{product.location ? 'La ubicación registrada no está disponible en el mapa.' : 'Este producto no tiene ubicación asignada.'}</Empty>
          : selected && !productId && !active ? <Empty>La ubicación solicitada no está disponible en el mapa.</Empty>
          : shown.length ? <div className="map-products">
            {shown.map(item => <Link key={item.id} to={`/inventario?q=${encodeURIComponent(item.sku)}`}>
              <ProductPhoto product={item}/>
              <div><strong>{item.name}</strong><small>{productId ? item.sku : locationLabel(locationById.get(String(item.location)))}</small></div>
              <Tag tone={item.stock <= item.minimum_stock ? 'red' : 'blue'}>{item.stock} u.</Tag><ArrowUpRight size={15}/>
            </Link>)}
          </div> : !target.error && !products.error && <Empty>No hay productos en esta selección.</Empty>}
      </Section>
    </div>
  </>
}
