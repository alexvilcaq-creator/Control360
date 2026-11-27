import { useCallback, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Boxes, Clock3, Pencil, Plus, Search, SlidersHorizontal, Trash2 } from 'lucide-react'
import ProductIcon from '../components/ProductIcon'
import { catalog } from '../api/catalog'
import { money } from '../api/operations'
import { useAuth } from '../context/Auth'
import { useQuery } from '../hooks/useQuery'
import { Empty, Loading, Modal, Notice, PageTitle, Pagination, Section, Tag } from '../components/UI'

const catalogConfig = {
  products: {
    title: 'Inventario', singular: 'producto', description: 'Consulta existencias, precios y ubicaciones por SKU.',
    fields: [
      ['barcode', 'Código de barras', { maxLength: 64 }],
      ['sku', 'SKU', { maxLength: 50 }], ['name', 'Nombre', { maxLength: 160 }],
      ['category', 'Categoría'], ['location', 'Ubicación'],
      ['price', 'Precio', { type: 'number', min: 0, step: '0.01' }],
      ['minimum_stock', 'Stock mínimo', { type: 'number', min: 0, step: 1 }],
      ['is_active', 'Disponibilidad'],
      ['description', 'Descripción'],
    ],
  },
  categories: {
    title: 'Categorías', singular: 'categoría', description: 'Organiza los productos del catálogo.',
    fields: [['name', 'Nombre', { maxLength: 100 }]],
  },
  locations: {
    title: 'Ubicaciones', singular: 'ubicación', description: 'Identifica cada posición física del almacén.',
    fields: [['zone', 'Zona'], ['aisle', 'Pasillo'], ['shelf', 'Estante']]
      .map(([name, label]) => [name, label, { maxLength: 35 }]),
  },
}


function Options({ values, labelKey }) {
  return values?.map(option => <option key={option.id} value={option.id}>{option[labelKey]}</option>)
}

function EditForm({ config, item, options, onSubmit }) {
  return <form id="catalog-form" className="form-grid" onSubmit={onSubmit}>
    {config.fields.map(([name, label, attributes]) => {
      const related = name === 'category' || name === 'location'
      const defaultValue = item?.[name] ?? (name === 'minimum_stock' ? 0 : name === 'is_active' ? true : '')
      return <div className="field" key={name}><label htmlFor={`catalog-${name}`}>{label}</label>
        {name === 'is_active' ? <select id={`catalog-${name}`} name={name} defaultValue={String(defaultValue)}>
          <option value="true">Activo</option><option value="false">Desactivado</option>
        </select> : related ? <select id={`catalog-${name}`} name={name} defaultValue={defaultValue} required={name === 'category'}>
          <option value="">{name === 'location' ? 'Sin ubicación asignada' : 'Seleccionar'}</option>
          <Options values={options?.[name]} labelKey={name === 'category' ? 'name' : 'label'} />
        </select> : name === 'description' ? <textarea id={`catalog-${name}`} name={name} defaultValue={defaultValue} rows={3} />
          : <input id={`catalog-${name}`} name={name} defaultValue={defaultValue} required={name !== 'barcode'} {...attributes} />}
      </div>
    })}
  </form>
}

function StockHistory({ item }) {
  const [page, setPage] = useState(1)
  const load = useCallback(signal => catalog.movements(item.id, page, signal), [item.id, page])
  const { data, loading, error } = useQuery(load)
  return <>
    <Notice>{error}</Notice>
    {loading && <Loading />}
    {data?.results.length === 0 && <Empty>Todavía no hay movimientos.</Empty>}
    {data?.results.map(movement => <div className="movement" key={movement.id}>
      <div><strong>{movement.reason}</strong><small>{movement.actor_name || 'Usuario eliminado'} · {new Date(movement.created_at).toLocaleString('es-CO')}</small></div>
      <div><strong>{movement.delta > 0 ? '+' : ''}{movement.delta}</strong><small>Saldo {movement.balance}</small></div>
    </div>)}
    {data?.count > 0 && <Pagination data={data} page={page} onChange={setPage} />}
  </>
}

export default function Catalog({ resource }) {
  const { user } = useAuth()
  const admin = user.role === 'admin'
  const products = resource === 'products'
  const config = catalogConfig[resource]
  const [params] = useSearchParams()
  const [search, setSearch] = useState(() => params.get('q') || '')
  const [category, setCategory] = useState('')
  const [stock, setStock] = useState(() => params.get('stock') || '')
  const [active, setActive] = useState('')
  const [page, setPage] = useState(1)
  const [version, setVersion] = useState(0)
  const [modal, setModal] = useState(() => admin && params.get('nuevo') ? { type: 'edit' } : null)
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState('')
  const [success, setSuccess] = useState('')
  const load = useCallback(signal => catalog.list(resource, { search, category, stock, active, page }, signal),
    [resource, search, category, stock, active, page, version])
  const { data, loading, error } = useQuery(load)
  const loadOptions = useCallback(async signal => {
    if (!products) return {}
    const [category, location] = await Promise.all([
      catalog.options('categories', signal), catalog.options('locations', signal),
    ])
    return { category, location }
  }, [products])
  const options = useQuery(loadOptions)

  function open(type, item) {
    setFormError('')
    setSuccess('')
    setModal({ type, item })
  }

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setFormError('')
    const body = Object.fromEntries(new FormData(event.currentTarget))
    try {
      if (modal.type === 'delete') {
        await catalog.remove(resource, modal.item.id)
        if (data.results.length === 1 && page > 1) setPage(page - 1)
      } else if (modal.type === 'adjust') {
        await catalog.adjust(modal.item.id, body)
      } else {
        if (products && body.location === '') body.location = null
        await catalog.save(resource, modal.item?.id, body)
        setPage(1)
      }
      setSuccess({ delete: 'Registro eliminado.', adjust: 'Movimiento registrado.', edit: 'Cambios guardados.' }[modal.type])
      setModal(null)
      setVersion(value => value + 1)
    } catch (error) { setFormError(error.message) }
    finally { setBusy(false) }
  }

  const modalTitle = modal && {
    edit: `${modal.item ? 'Editar' : 'Crear'} ${config.singular}`,
    delete: `Eliminar ${config.singular}`, adjust: 'Ajustar existencias', history: 'Historial de movimientos',
  }[modal.type]

  return <>
    <PageTitle title={config.title} subtitle={config.description}>
      {admin && <button className="button primary" onClick={() => open('edit')}><Plus size={18} /> {products ? 'Nuevo producto' : `Crear ${config.singular}`}</button>}
    </PageTitle>
    <Notice success>{success}</Notice>
    <Notice>{error || options.error}</Notice>
    <Section title={products ? 'Catálogo de productos' : config.title} icon={products ? Boxes : undefined} className="table-panel"
      action={<span className="result-count">{data?.count ?? 0} {products ? 'productos' : 'registros'}</span>}>
      <div className="filters">
        <label className="input-icon"><Search size={18} /><input type="search" aria-label="Buscar" placeholder={products ? 'Nombre, SKU o código de barras' : 'Buscar registros'}
          value={search} onChange={event => { setSearch(event.target.value); setPage(1) }} /></label>
        {products && <>
          <select aria-label="Filtrar por categoría" value={category} onChange={event => { setCategory(event.target.value); setPage(1) }}>
            <option value="">Todas las categorías</option><Options values={options.data?.category} labelKey="name" />
          </select>
          <select aria-label="Filtrar por stock" value={stock} onChange={event => { setStock(event.target.value); setPage(1) }}>
            <option value="">Todas las existencias</option><option value="low">Stock bajo</option><option value="out">Agotado</option><option value="available">Disponibles</option>
          </select>
          {admin && <select aria-label="Filtrar por disponibilidad" value={active} onChange={event => { setActive(event.target.value); setPage(1) }}>
            <option value="">Todos los productos</option><option value="true">Activos</option><option value="false">Desactivados</option>
          </select>}
        </>}
      </div>
      {loading && <Loading />}
      {data?.results.length === 0 && <Empty>No se encontraron registros.</Empty>}
      {data?.results.length > 0 && <div className="table-scroll"><table>
        <thead><tr>
          {products ? <><th>Producto</th><th>Categoría</th><th>Ubicación</th><th>Precio</th><th>Existencias</th><th>Estado</th></>
            : config.fields.map(([name, label]) => <th key={name}>{label}</th>)}
          {(admin || products) && <th>Acciones</th>}
        </tr></thead>
        <tbody>{data.results.map(item => <tr key={item.id}>
          {products ? <><td><div className="entity-cell"><ProductIcon/><div><strong>{item.name}</strong>
              <small>{item.sku}{item.barcode && ` · ${item.barcode}`}</small>
              {item.description && <small>{item.description}</small>}</div></div></td>
            <td>{item.category_name}</td><td>{!item.location ? 'Sin ubicación asignada' : user.role === 'seller' ? item.location_label :
              <Link className="table-link" to={`/almacen?producto=${item.id}`}>{item.location_label}</Link>}</td><td>{money.format(item.price)}</td>
            <td><Tag tone={!item.is_active ? 'muted' : item.stock <= item.minimum_stock ? 'red' : 'green'}>{item.stock} u.</Tag><small>Mínimo {item.minimum_stock}</small></td>
            <td><Tag tone={item.is_active ? 'green' : 'muted'} dot>{item.is_active ? 'Activo' : 'Inactivo'}</Tag></td></>
            : config.fields.map(([name]) => <td key={name}>{item[name]}</td>)}
          {(admin || products) && <td><div className="actions">
            {products && <button title="Historial" aria-label={`Historial de ${item.name}`} className="icon-button" onClick={() => open('history', item)}><Clock3 size={17} /></button>}
            {admin && products && <button title="Ajustar stock" aria-label={`Ajustar stock de ${item.name}`} className="icon-button" onClick={() => open('adjust', item)}><SlidersHorizontal size={17} /></button>}
            {admin && <>
              <button title="Editar" aria-label="Editar registro" className="icon-button" onClick={() => open('edit', item)}><Pencil size={17} /></button>
              <button title="Eliminar" aria-label="Eliminar registro" className="icon-button" onClick={() => open('delete', item)}><Trash2 size={17} /></button>
            </>}
          </div></td>}
        </tr>)}</tbody>
      </table></div>}
      <Pagination data={data} page={page} onChange={setPage} />
    </Section>
    {modal && <Modal title={modalTitle} onClose={() => setModal(null)} busy={busy}>
      <div className="modal-body">
        <Notice>{formError}</Notice>
        {modal.type === 'history' && <StockHistory item={modal.item} />}
        {modal.type === 'edit' && <>
          {products && options.loading && <Loading />}
          {products && options.data && !options.data.category.length
            && <Notice>Crea una categoría antes de guardar el producto.</Notice>}
          {(!products || options.data) && <EditForm config={config} item={modal.item} options={options.data} onSubmit={submit} />}
        </>}
        {modal.type === 'adjust' && <form id="catalog-form" onSubmit={submit} className="form-grid">
          <p className="muted">{modal.item.name} · {modal.item.stock} unidades en el último conteo mostrado</p>
          <label>Cantidad con signo<input name="delta" type="number" step="1" placeholder="Ej. 10 o -3" required /></label>
          <label>Motivo<input name="reason" maxLength={200} required /></label>
        </form>}
        {modal.type === 'delete' && <form id="catalog-form" onSubmit={submit}>
          <p>¿Eliminar {modal.item.name ?? modal.item.label}? Esta acción es permanente.</p>
        </form>}
      </div>
      {modal.type !== 'history' && <div className="modal-foot">
        <button className="button secondary" onClick={() => setModal(null)} disabled={busy}>Cancelar</button>
        <button className={modal.type === 'delete' ? 'button danger' : 'button primary'} form="catalog-form" disabled={busy}>
          {busy ? 'Procesando…' : modal.type === 'delete' ? 'Eliminar' : 'Guardar'}
        </button>
      </div>}
    </Modal>}
  </>
}
