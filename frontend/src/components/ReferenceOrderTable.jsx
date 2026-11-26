import { ArrowUpRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { businessDateLabel, money, orderCode, orderStatus, timeLabel } from '../api/operations'
import { DataTable, Status } from './UI'

export default function ReferenceOrderTable({ rows, empty, showAssignee = false, filters }) {
  function detailUrl(id) {
    const params = new URLSearchParams(filters)
    params.set('pedido', id)
    return `/pedidos?${params}`
  }
  const columns = [
    { key: 'number', label: 'N.º pedido', render: order => <Link className="table-link" to={detailUrl(order.id)}>{orderCode(order.id)}</Link> },
    { key: 'customer_name', label: 'Cliente' },
    { key: 'date', label: 'Fecha y hora', render: order => <span className="muted">
      {businessDateLabel(order.created_at)}<span className="date-time"> · {timeLabel(order.created_at)}</span></span> },
    { key: 'status', label: 'Estado', render: order => <Status status={order.status}>{orderStatus[order.status]}</Status> },
  ]
  if (showAssignee) columns.push({ key: 'assignee_name', label: 'Asignación', render: order => order.assignee_name || 'Sin asignar' })
  columns.push(
    { key: 'total', label: 'Total', align: 'right', render: order => <strong>{money.format(order.total)}</strong> },
    { key: 'detail', label: '', align: 'right', render: order => <Link className="table-detail"
      aria-label={`Ver ${orderCode(order.id)}`} to={detailUrl(order.id)}><ArrowUpRight size={16}/></Link> },
  )
  return <DataTable rows={rows} columns={columns} empty={empty ?? 'No hay pedidos para esta fecha.'}/>
}
