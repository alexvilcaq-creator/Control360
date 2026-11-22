import { useState } from 'react'
import { MapPin } from 'lucide-react'
import { catalog } from '../api/catalog'
import { Empty, Loading, Notice, PageHeading } from '../components/UI'
import { useQuery } from '../hooks/useQuery'

const loadLocations = signal => catalog.options('locations', signal)

export default function Warehouse() {
  const [zone, setZone] = useState('')
  const { data, loading, error } = useQuery(loadLocations)
  const zones = Object.groupBy(data || [], row => row.zone)
  return <>
    <PageHeading title="Mapa del almacén" description="Ubica las posiciones registradas por zona, pasillo y estante." />
    <div className="toolbar panel module-toolbar"><label className="field">Zona
      <select value={zone} onChange={event => setZone(event.target.value)}>
        <option value="">Todas las zonas</option>{Object.keys(zones).map(key => <option key={key}>{key}</option>)}
      </select></label></div>
    <Notice>{error}</Notice>
    {loading && <Loading />}
    {data?.length === 0 && <Empty>Agrega ubicaciones para dibujar el almacén.</Empty>}
    <div className="warehouse-map">
      {Object.entries(zones).filter(([key]) => !zone || key === zone).map(([key, locations]) => <section className="panel map-zone" key={key}>
        <h2><MapPin size={20}/> Zona {key}</h2>
        {Object.entries(Object.groupBy(locations, row => row.aisle)).map(([aisle, rows]) => <div className="map-aisle" key={aisle}>
          <strong>Pasillo {aisle}</strong>
          <div>{rows.map(row => <span key={row.id}>Estante {row.shelf}</span>)}</div>
        </div>)}
      </section>)}
    </div>
  </>
}
