import { useCallback, useState } from 'react'
import { Download } from 'lucide-react'
import { request } from '../api/client'
import { localDate, money, query } from '../api/operations'
import { AttendanceChart, OrderDistribution, OrderTrend } from '../components/Charts'
import { Empty, Loading, Notice, PageHeading } from '../components/UI'
import { paymentMethods } from '../components/Payment'
import { incidentStates } from './Incidents'
import { useQuery } from '../hooks/useQuery'

const metrics = { present: 'Asistencias', absent: 'Faltas', late: 'Tardanzas', overtime: 'Minutos extra aprobados' }

function ReportTable({ title, rows, columns }) {
  return <section className="panel"><div className="section-heading"><h2>{title}</h2></div>
    {rows.length ? <div className="table-scroll"><table>
      <thead><tr>{columns.map(([key, label]) => <th key={key}>{label}</th>)}</tr></thead>
      <tbody>{rows.map(row => <tr key={row.product_id ?? row.sku ?? row.worker ?? row.method ?? row.status}>
        {columns.map(([key]) => <td key={key}>{row[key]}</td>)}</tr>)}</tbody>
    </table></div> : <Empty>Sin registros.</Empty>}
  </section>
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
    <PageHeading title="Reportes" description="Analiza pedidos, actividad de almacén y asistencia por período.">
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
      <div className="metrics-grid">{Object.entries(metrics).map(([key, name]) =>
        <article className="metric" key={key}><p>{name}</p><strong>{data.attendance[key]}</strong></article>)}</div>
      <div className="chart-grid"><OrderTrend title="Pedidos en el período" data={data.trend}/><OrderDistribution data={data.statuses}/></div>
      <AttendanceChart data={data.attendance_trend}/>
      <ReportTable title="Cobros por método" rows={data.payments.map(row => ({
        ...row, method: paymentMethods[row.method], amount: money.format(row.amount),
      }))} columns={ [['method', 'Método'], ['count', 'Pagados'], ['voided', 'Anulados'], ['amount', 'Total vigente']] }/>
      <ReportTable title="Incidencias del período" rows={data.incidents.map(row => ({
        ...row, status: incidentStates[row.status],
      }))} columns={ [['status', 'Estado actual'], ['count', 'Cantidad']] }/>
      <ReportTable title="Productos más solicitados" rows={data.top_products} columns={ [['sku', 'SKU'], ['name', 'Producto'], ['quantity', 'Unidades']] }/>
      <ReportTable title="Productos con stock bajo actual" rows={data.low_stock} columns={ [['sku', 'SKU'], ['name', 'Producto'], ['stock', 'Stock'], ['minimum_stock', 'Mínimo']] }/>
      <ReportTable title="Actividad de trabajadores" rows={data.workers} columns={ [['name', 'Trabajador'], ['assigned', 'Asignados'], ['ready', 'Listos o entregados']] }/>
    </div>}
  </>
}
