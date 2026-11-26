import { request } from './client'

export const orderStatus = {
  pending: 'Pendiente', accepted: 'Aceptado', preparing: 'En preparación',
  ready: 'Listo para entregar', delivered: 'Entregado', cancelled: 'Cancelado',
}

export const orderActions = {
  accept: 'Aceptar pedido', assign: 'Asignar trabajador', prepare: 'Iniciar preparación',
  ready: 'Marcar listo', deliver: 'Confirmar entrega', cancel: 'Cancelar pedido',
}

export const dateLabel = value => value ? new Date(value).toLocaleString('es-CO', {
  dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Bogota',
}) : '—'

export const exactDateLabel = value => value ? new Date(value).toLocaleString('es-CO', {
  dateStyle: 'short', timeStyle: 'medium', timeZone: 'America/Bogota',
}) : '—'

const currency = import.meta.env.VITE_CURRENCY || 'PEN'
export const money = new Intl.NumberFormat(currency === 'COP' ? 'es-CO' : 'es-PE', {
  style: 'currency', currency,
})

export const localDate = (value = new Date()) => new Intl.DateTimeFormat('en-CA', {
  year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'America/Bogota',
}).format(value)

export function query(values) {
  return new URLSearchParams(Object.entries(values).filter(([, value]) => value != null && value !== '')).toString()
}

export function post(path, body) {
  return request(path, { method: 'POST', body })
}

export function notificationTarget(item) {
  if (item.kind.startsWith('attendance_')) return '/asistencia'
  if (item.kind.startsWith('incident_')) return '/incidencias'
  if (item.order) return `/pedidos?pedido=${item.order}`
  return item.product ? '/inventario?stock=low' : '/notificaciones'
}

export const normalize = value => String(value ?? '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')
export const orderCode = id => 'PED-' + String(id).padStart(4, '0')
export const aisleCode = ({ zone, aisle }) => `${zone}${aisle}`
export const shelfCode = location => `${aisleCode(location)} · E${location.shelf}`
export const locationLabel = location => location ? `Zona ${location.zone} · Pasillo ${location.aisle} · Estante ${location.shelf}` : '—'
export const businessDateLabel = value => new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeZone: 'America/Bogota' })
  .format(new Date(value.length === 10 ? `${value}T12:00:00-05:00` : value))
export const timeLabel = value => new Intl.DateTimeFormat('es-PE', {
  hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Bogota',
})
  .format(new Date(value))

export function matchesLocation(location, query) {
  const compact = value => normalize(value).replace(/[\s.·-]+/g, '')
  return normalize(locationLabel(location)).includes(query)
    || [aisleCode(location), shelfCode(location)].some(alias => compact(alias) === compact(query))
}
