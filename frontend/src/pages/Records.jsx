import { useSearchParams } from 'react-router-dom'
import { useCallback, useMemo, useState } from 'react'
import { Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { catalog } from '../api/catalog'
import { localDate } from '../api/operations'
import { roles } from '../components/Layout'
import { Empty, Loading, Modal, Notice, PageHeading, Pagination, Status, Toast } from '../components/UI'
import { useAuth } from '../context/Auth'
import { useQuery } from '../hooks/useQuery'

const days = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const field = (name, label, options = {}) => ({ name, label, ...options })
const yes = value => <Status status={value ? 'delivered' : 'cancelled'}>{value ? 'Activo' : 'Inactivo'}</Status>

const modules = {
  customers: {
    title: 'Clientes', singular: 'cliente', description: 'Gestiona los contactos que se usan en pedidos.',
    fields: [field('name', 'Nombre', { max: 160 }), field('document', 'Documento', { max: 35 }),
      field('email', 'Correo', { type: 'email', optional: true }), field('phone', 'Teléfono', { type: 'tel', optional: true, max: 35 })],
    columns: [['name', 'Cliente'], ['document', 'Documento'], ['email', 'Correo'], ['phone', 'Teléfono']],
  },
  accounts: {
    title: 'Usuarios y roles', singular: 'cuenta', description: 'Crea accesos, asigna roles y desactiva usuarios.',
    fields: [field('username', 'Usuario', { max: 150 }), field('first_name', 'Nombres', { optional: true, max: 150 }),
      field('last_name', 'Apellidos', { optional: true, max: 150 }), field('email', 'Correo', { type: 'email', optional: true }),
      field('role', 'Rol', { choices: roles, defaultValue: 'seller' }),
      field('password', 'Contraseña', { type: 'password', optionalEdit: true, max: 4096 }),
      field('is_active', 'Cuenta habilitada', { type: 'checkbox', defaultValue: true })],
    columns: [['username', 'Usuario'], ['email', 'Correo'], ['role', 'Rol', value => roles[value]],
      ['is_active', 'Estado', yes]],
    noDelete: true,
  },
  workers: {
    title: 'Trabajadores', singular: 'trabajador', description: 'Administra perfiles de almacén vinculados a cuentas del sistema.',
    fields: [
      field('user', 'Cuenta del trabajador', { source: 'accounts', optionLabel: 'username', immutable: true, filter: row => ['warehouse', 'seller'].includes(row.role) }),
      field('document', 'Documento', { max: 35 }), field('position', 'Cargo', { max: 120 }),
      field('joined_on', 'Fecha de ingreso', { type: 'date', today: true }), field('ended_on', 'Fecha de salida laboral', { type: 'date', optional: true }),
    ],
    columns: [['name', 'Trabajador'], ['role', 'Rol', value => roles[value]], ['email', 'Correo'], ['document', 'Documento'], ['position', 'Cargo'],
      ['joined_on', 'Desde'], ['ended_on', 'Hasta'], ['active', 'Estado', yes]],
  },
  shifts: {
    title: 'Turnos', singular: 'turno', description: 'Configura jornadas, tolerancias y mínimos de aprobación.',
    fields: [field('name', 'Nombre', { max: 100 }), field('starts_at', 'Hora de entrada', { type: 'time' }),
      field('ends_at', 'Hora de salida', { type: 'time' }),
      field('grace_minutes', 'Tolerancia en minutos', { type: 'number', defaultValue: 5 }),
      field('overtime_minimum', 'Mínimo de minutos para aprobar', { type: 'number', defaultValue: 15 }),
      field('workdays', 'Días de trabajo', { type: 'days' })],
    columns: [['name', 'Turno'], ['starts_at', 'Entrada'], ['ends_at', 'Salida'],
      ['workdays', 'Días', value => value.map(index => days[index]).join(', ')],
      ['grace_minutes', 'Tolerancia'], ['overtime_minimum', 'Mínimo extra']],
  },
  schedules: {
    title: 'Asignaciones de turnos', singular: 'asignación', description: 'Programa desde qué fecha aplica el turno de cada trabajador.',
    fields: [field('worker', 'Trabajador', { source: 'workers', optionLabel: 'name' }),
      field('shift', 'Turno', { source: 'shifts', optionLabel: 'name' }),
      field('effective_from', 'Vigente desde', { type: 'date', today: true })],
    columns: [['worker_name', 'Trabajador'], ['shift_name', 'Turno'], ['effective_from', 'Vigente desde']],
    noEdit: true,
  },
}

function RecordForm({ definition, editing, item, onClose, onSaved }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const load = useCallback(async signal => Object.fromEntries(await Promise.all(
    definition.fields.filter(field => field.source).map(async field =>
      [field.name, (await catalog.options(field.source, signal)).filter(field.filter ?? (() => true))]),
  )), [definition])
  const choices = useQuery(load)

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    const form = new FormData(event.currentTarget)
    const body = {}
    for (const field of definition.fields) {
      if (item && field.immutable) continue
      const value = form.get(field.name)
      if (field.type === 'checkbox') body[field.name] = form.has(field.name)
      else if (field.type === 'days') body[field.name] = form.getAll(field.name).map(Number)
      else if (field.type === 'date' && field.optional && !value) body[field.name] = null
      else if (!(item && field.optionalEdit && !value)) body[field.name] = value
    }
    try {
      if (editing === 'remove') await catalog.remove(definition.resource, item.id)
      else await catalog.save(definition.resource, item?.id, body)
      onSaved(editing === 'remove' ? 'Registro eliminado.' : 'Registro guardado.')
    } catch (error) { setError(error.message) }
    finally { setBusy(false) }
  }

  const title = editing === 'remove' ? 'Eliminar' : item ? 'Editar' : 'Crear'
  return <Modal title={`${title} ${definition.singular}`} onClose={onClose} busy={busy}>
    <div className="modal-body">
      <Notice>{error || choices.error}</Notice>
      {choices.loading && editing !== 'remove' && <Loading />}
      {(editing === 'remove' || choices.data) && <form id="record-form" className="form-grid" onSubmit={submit}>
        {editing === 'remove' ? <p>¿Eliminar este registro? La operación es permanente.</p> :
          definition.fields.filter(field => !item || !field.immutable).map(field => {
            const id = `record-${field.name}`
            const value = item?.[field.name] ?? (field.today ? localDate() : field.defaultValue ?? '')
            const required = !field.optional && !(item && field.optionalEdit)
            if (field.type === 'days') return <fieldset className="day-field" key={id}><legend>{field.label}</legend>
              {days.map((day, index) => <label className="check-field" key={day}><input type="checkbox" name={field.name} value={index}
                defaultChecked={item?.workdays?.includes(index) ?? index < 5}/>{day}</label>)}
            </fieldset>
            if (field.type === 'checkbox') return <label className="check-field" key={id}>
              <input type="checkbox" name={field.name} defaultChecked={value}/>{field.label}</label>
            return <div className="field" key={id}><label htmlFor={id}>{field.label}</label>
              {field.source || field.choices ? <select id={id} name={field.name} required={required} defaultValue={value}>
                <option value="">Seleccionar</option>
                {field.choices ? Object.entries(field.choices).map(([key, label]) => <option key={key} value={key}>{label}</option>)
                  : choices.data[field.name].map(row => <option key={row.id} value={row.id}>{row[field.optionLabel]}</option>)}
              </select> : <input id={id} name={field.name} type={field.type || 'text'} defaultValue={value}
                required={required} maxLength={field.max} autoComplete={field.type === 'password' ? 'new-password' : undefined}
                step={field.type === 'time' ? 1 : undefined}
                min={field.type === 'number' ? 0 : undefined} max={field.type === 'number' ? 65535 : undefined}
                placeholder={field.optionalEdit && item ? 'Dejar en blanco para conservar' : undefined}/>}
            </div>
          })}
      </form>}
    </div>
    <div className="modal-foot"><button className="button secondary" onClick={onClose} disabled={busy}>Cerrar</button>
      <button className={`button ${editing === 'remove' ? 'danger' : 'primary'}`} form="record-form"
        disabled={busy || (editing !== 'remove' && !choices.data)}>{busy ? 'Procesando…' : editing === 'remove' ? 'Eliminar' : 'Guardar'}</button>
    </div>
  </Modal>
}

export default function Records({ resource }) {
  const { user } = useAuth()
  const definition = useMemo(() => ({ ...modules[resource], resource }), [resource])
  const [params] = useSearchParams()
  const [search, setSearch] = useState(() => params.get('q') ?? '')
  const [page, setPage] = useState(1)
  const [version, setVersion] = useState(0)
  const [dialog, setDialog] = useState(null)
  const [toast, setToast] = useState('')
  const closeToast = useCallback(() => setToast(''), [])
  const load = useCallback(signal => catalog.list(resource, { search, page }, signal), [resource, search, page, version])
  const { data, loading, error } = useQuery(load)
  const noSearch = resource === 'schedules'
  return <>
    <PageHeading title={definition.title} description={definition.description}>
      <button className="button primary" onClick={() => setDialog({ type: 'edit' })}><Plus size={18}/> Crear {definition.singular}</button>
    </PageHeading>
    <section className="panel">
      {!noSearch && <div className="toolbar"><label className="search"><Search size={18}/>
        <input aria-label="Buscar registros" type="search" placeholder={`Buscar en ${definition.title.toLowerCase()}`} value={search}
          onChange={event => { setSearch(event.target.value); setPage(1) }}/></label></div>}
      <Notice>{error}</Notice>
      {loading && <Loading />}
      {data?.results.length === 0 && <Empty>No se encontraron registros.</Empty>}
      {!!data?.results.length && <div className="table-scroll"><table>
        <thead><tr>{definition.columns.map(([key, label]) => <th key={key}>{label}</th>)}<th>Acciones</th></tr></thead>
        <tbody>{data.results.map(row => <tr key={row.id}>
          {definition.columns.map(([key, label, format]) => <td key={key}>{format ? format(row[key]) : (row[key] ?? '—')}</td>)}
          <td><div className="actions">
            {!definition.noEdit && <button aria-label={`Editar ${definition.singular}`} className="icon-button" onClick={() => setDialog({ type: 'edit', item: row })}><Pencil size={17}/></button>}
            {!definition.noDelete && user.role === 'admin' && (resource !== 'schedules' || row.effective_from > localDate()) &&
              <button aria-label={`Eliminar ${definition.singular}`} className="icon-button" onClick={() => setDialog({ type: 'remove', item: row })}><Trash2 size={17}/></button>}
          </div></td>
        </tr>)}</tbody>
      </table></div>}
      <Pagination data={data} page={page} onChange={setPage} />
    </section>
    {dialog && <RecordForm definition={definition} editing={dialog.type} item={dialog.item}
      onClose={() => setDialog(null)} onSaved={message => { setDialog(null); setToast(message); setPage(1); setVersion(value => value + 1) }}/>}
    <Toast onClose={closeToast}>{toast}</Toast>
  </>
}
