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

export const money = new Intl.NumberFormat('es-CO', {
  style: 'currency', currency: import.meta.env.VITE_CURRENCY || 'COP',
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
