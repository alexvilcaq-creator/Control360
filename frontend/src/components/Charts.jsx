import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { orderStatus } from '../api/operations'
import { Empty } from './UI'

const colors = ['#7358ee', '#3085c0', '#d19325', '#1b976e', '#429756', '#c15675']
const shortDate = value => value.slice(5)
const tooltip = { background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 10 }

export function OrderTrend({ title, data }) {
  return <section className="panel chart-card"><h2>{title}</h2>
    <div className="chart-frame" aria-label="Gráfico de pedidos por período">
      <ResponsiveContainer width="100%" height={235}>
        <AreaChart data={data} margin={{ left: -25, right: 12, top: 12 }}>
          <CartesianGrid vertical={false} stroke="var(--line)"/>
          <XAxis dataKey="date" tickFormatter={shortDate} stroke="var(--muted)" fontSize={12}/>
          <YAxis allowDecimals={false} stroke="var(--muted)" fontSize={12}/>
          <Tooltip contentStyle={tooltip} labelStyle={{color: 'var(--text)'}}/>
          <Area type="monotone" dataKey="count" name="Pedidos" stroke={colors[0]} strokeWidth={2} fill={colors[0]} fillOpacity={0.19}/>
        </AreaChart>
      </ResponsiveContainer>
    </div>
  </section>
}

export function OrderDistribution({ data }) {
  const series = data.map(row => ({ ...row, name: orderStatus[row.status] }))
  return <section className="panel chart-card"><h2>Distribución por estado</h2>
    {series.some(row => row.count) ? <div className="chart-frame" aria-label="Gráfico de distribución de estados">
      <ResponsiveContainer width="100%" height={235}>
        <PieChart>
          <Pie nameKey="name" dataKey="count" data={series} innerRadius={42} outerRadius={70} stroke="var(--surface)">
            {series.map((row, index) => <Cell key={row.status} fill={colors[index]}/>)}
          </Pie>
          <Legend wrapperStyle={{ fontSize: 12 }}/>
          <Tooltip contentStyle={tooltip} labelStyle={{color: 'var(--text)'}}/>
        </PieChart>
      </ResponsiveContainer>
    </div> : <Empty>Sin pedidos en la selección.</Empty>}
  </section>
}

export function AttendanceChart({ data }) {
  return <section className="panel chart-card"><h2>Asistencia por fecha</h2>
    {data.length ? <div className="chart-frame" aria-label="Gráfico de asistencia">
      <ResponsiveContainer width="100%" height={235}>
        <BarChart data={data} margin={{ left: -25, right: 12, top: 12 }}>
          <CartesianGrid vertical={false} stroke="var(--line)"/>
          <XAxis dataKey="date" tickFormatter={shortDate} stroke="var(--muted)" fontSize={12}/>
          <YAxis allowDecimals={false} stroke="var(--muted)" fontSize={12}/>
          <Tooltip contentStyle={tooltip} labelStyle={{color: 'var(--text)'}}/>
          <Legend wrapperStyle={{ fontSize: 12 }}/>
          <Bar dataKey="present" name="Asistencias" fill={colors[0]}/>
          <Bar dataKey="absent" name="Faltas" fill={colors[5]}/>
          <Bar dataKey="late" name="Tardanzas" fill={colors[2]}/>
        </BarChart>
      </ResponsiveContainer>
    </div> : <Empty>Sin jornadas en este período.</Empty>}
  </section>
}
