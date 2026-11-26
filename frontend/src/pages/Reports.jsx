import { useCallback, useState } from 'react'
import { AlertTriangle, BarChart3, CalendarDays, Clock3, Download, Package, ShoppingCart, TrendingUp, Users } from 'lucide-react'
import { request } from '../api/client'
import { localDate, money, orderStatus, query } from '../api/operations'
import { AttendanceChart } from '../components/Charts'
import { BarPanel, DateChart } from '../components/ReferenceCharts'
import { DataTable, Loading, Notice, PageHeading, Section, Tag, TextLink } from '../components/UI'
import { paymentMethods } from '../components/Payment'
import { incidentStates } from './Incidents'
import { useQuery } from '../hooks/useQuery'

function ReportTable({ title, rows, columns }) {
  return <Section title={title} className="table-panel">
    <DataTable rows={rows.map(row => ({ ...row, id: row.worker ?? row.method ?? row.status }))}
      columns={columns.map(([key, label]) => ({ key, label }))} empty="Sin registros."/>
  </Section>
}

export default function Reports() {
  const today = localDate()
  const [period, setPeriod] = useState({ start: `${today.slice(0, 7)}-01`, end: today, group: 'day' })
  const [downloadError, setDownloadError] = useState('')
  const [busy, setBusy] = useState(false)
  const load = useCallback(signal => request(`/reports/?${query(period)}`, { signal }), [period])
  const { data, loading, error } = useQuery(load)

  async function download() {
    setDownloadError('')
    setBusy(true)
    try {
      const blob = await request(`/reports/export/?${query(period)}`, { download: true })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'control360-reportes.csv'
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (error) { setDownloadError(error.message) }
    finally { setBusy(false) }
  }

  return <>
    <PageHeading title="Reportes" description="Analiza pedidos, existencias y asistencia del equipo.">
      <button className="button primary" disabled={busy || !data} onClick={download}><Download size={18}/> {busy ? 'Exportando…' : 'Exportar CSV'}</button>
    </PageHeading>
    <form className="toolbar panel module-toolbar" onSubmit={event => {
      event.preventDefault()
      setPeriod(Object.fromEntries(new FormData(event.currentTarget)))
    }}>
      <label>Desde<input name="start" defaultValue={period.start} type="date" required /></label>
      <label>Hasta<input name="end" defaultValue={period.end} type="date" required /></label>
      <label>Agrupar pedidos<select name="group" defaultValue={period.group}>
        <option value="day">Por día</option><option value="week">Por semana</option><option value="month">Por mes</option>
      </select></label>
      <button className="button secondary">Aplicar filtros</button>
    </form>
    <Notice>{error || downloadError}</Notice>
    {loading && <Loading />}
    {data && <div className="dashboard-stack">
      <div className="mini-metrics">
        <div><ShoppingCart size={21}/><span>Pedidos en el período</span><strong>{data.trend.reduce((sum, item) => sum + item.count, 0)}</strong></div>
        <div><Users size={21}/><span>Trabajadores activos</span><strong>{data.active_workers}</strong></div>
        <div><AlertTriangle size={21}/><span>Productos con stock bajo</span><strong>{data.low_stock.length}</strong></div>
        <div><Clock3 size={21}/><span>Tiempo extra aprobado</span><strong>{data.attendance.overtime} min</strong></div>
      </div>
      <div className="report-grid">
        <Section title="Pedidos por fecha" icon={TrendingUp}>
          <DateChart data={data.trend.map(row => ({ name: row.date, value: row.count }))}/>
        </Section>
        <Section title="Pedidos por estado" icon={BarChart3}>
          <BarPanel data={data.statuses.map(row => ({ name: orderStatus[row.status], value: row.count }))}
            unit="pedidos" height={245} horizontal/>
        </Section>
        <Section title="Productos más solicitados" icon={Package}>
          <BarPanel data={data.top_products.map(row => ({ name: row.sku, value: row.quantity }))} height={250} horizontal/>
          {data.top_products.length > 0 && <DataTable rows={data.top_products.map(row => ({ ...row, id: row.product_id }))}
            columns={[{ key: 'sku', label: 'SKU' }, { key: 'name', label: 'Producto' }, { key: 'quantity', label: 'Unidades', align: 'right' }]}/>}
        </Section>
        <Section title="Asistencia del período" icon={CalendarDays} action={<TextLink to="/asistencia">Ver historial</TextLink>}>
          <BarPanel data={[
            { name: 'Turnos cerrados o marcados', value: data.attendance.present + data.attendance.absent },
            { name: 'Asistencias', value: data.attendance.present },
            { name: 'Tardanzas', value: data.attendance.late },
            { name: 'Faltas', value: data.attendance.absent },
          ]} unit="registros" height={250} horizontal/>
        </Section>
        <Section title="Productos con stock bajo actual" icon={AlertTriangle} className="table-panel report-full"
          action={<TextLink to="/inventario?stock=low">Ver todos</TextLink>}>
          <DataTable rows={data.low_stock.map(row => ({ ...row, id: row.sku }))} empty="No hay productos con stock bajo." columns={[
            { key: 'sku', label: 'SKU' }, { key: 'name', label: 'Producto' },
            { key: 'minimum_stock', label: 'Mínimo', align: 'right' },
            { key: 'stock', label: 'Existencia', align: 'right', render: row => <Tag tone="red">{row.stock} u.</Tag> },
          ]}/>
        </Section>
      </div>
      <AttendanceChart data={data.attendance_trend}/>
      <ReportTable title="Cobros por método" rows={data.payments.map(row => ({
        ...row, method: paymentMethods[row.method], amount: money.format(row.amount),
      }))} columns={ [['method', 'Método'], ['count', 'Pagados'], ['voided', 'Anulados'], ['amount', 'Total vigente']] }/>
      <ReportTable title="Incidencias del período" rows={data.incidents.map(row => ({
        ...row, status: incidentStates[row.status],
      }))} columns={ [['status', 'Estado actual'], ['count', 'Cantidad']] }/>
      <ReportTable title="Actividad de trabajadores" rows={data.workers} columns={ [['name', 'Trabajador'], ['assigned', 'Asignados'], ['ready', 'Listos o entregados']] }/>
    </div>}
  </>
}
