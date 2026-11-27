import { useState } from 'react';
import { AlertTriangle, Boxes, MapPin } from 'lucide-react';
import { Link } from 'react-router-dom';
import ProductPhoto from '../components/ProductPhoto';
import { DataTable, ErrorNotice, Loading, PageTitle, Section, Tag, TextLink } from '../components/UI';
import { useAuth } from '../context/Auth';
import { catalog } from '../api/catalog';
import { usePolling } from '../hooks/usePolling';

const loadStock = signal => catalog.options('products', signal, { stock: 'low', active: 'true' });

export default function StockAlerts() {
  const { user } = useAuth();
  const stock = usePolling(loadStock);
  const [filter, setFilter] = useState('');
  const alerts = stock.data || [];
  const rows = alerts.filter((row) => filter === 'agotado' ? row.stock === 0 : filter === 'bajo' ? row.stock > 0 : true)
    .sort((a, b) => a.stock - b.stock);
  return <>
    <PageTitle title="Alertas de stock" subtitle="Existencias disponibles en el mínimo configurado o por debajo." />
    <ErrorNotice message={stock.error} />
    <div className="mini-metrics">
      <div><AlertTriangle size={20} /><span>Agotados</span><strong>{alerts.filter((item) => item.stock === 0).length}</strong></div>
      <div><Boxes size={20} /><span>Stock bajo</span><strong>{alerts.filter((item) => item.stock > 0).length}</strong></div>
    </div>
    <Section title="Productos con alertas" icon={AlertTriangle} className="table-panel">
      <div className="filters"><select aria-label="Filtrar alertas por prioridad" value={filter} onChange={(event) => setFilter(event.target.value)}>
        <option value="">Todas las alertas</option><option value="agotado">Crítica · Agotado</option><option value="bajo">Alta · Stock bajo</option>
      </select></div>
      {stock.loading && !stock.data ? <Loading /> : <DataTable rows={rows} empty="No hay alertas para esta selección." columns={[
        { key: 'name', label: 'Producto', render: (item) => <div className="entity-cell"><ProductPhoto product={item}/><div><strong>{item.name}</strong><small>{item.sku}</small></div></div> },
        { key: 'quantity', label: 'Disponible', align: 'right', render: (item) => `${item.stock} u.` },
        { key: 'minStock', label: 'Mínimo', align: 'right', render: (item) => `${item.minimum_stock} u.` },
        { key: 'location', label: 'Ubicación', render: (item) => item.location
          ? <Link className="location-text table-link" to={`/almacen?producto=${item.id}`}><MapPin size={15} /> {item.location_label}</Link>
          : 'Sin ubicación asignada' },
        { key: 'priority', label: 'Prioridad', render: (item) => <Tag tone={item.stock === 0 ? 'red' : 'amber'} dot>
          {item.stock === 0 ? 'Crítica · Agotado' : 'Alta · Stock bajo'}
        </Tag> },
        { key: 'action', label: '', align: 'right', render: (item) => user.role === 'warehouse'
          ? <TextLink to={`/incidencias?nueva=1&producto=${item.id}`}>Reportar</TextLink>
          : <TextLink to={`/inventario?q=${encodeURIComponent(item.sku)}`}>Ver inventario</TextLink> },
      ]} />}
    </Section>
  </>;
}
