import { useId } from 'react'
import { Route } from 'lucide-react'
import { shelfCode } from '../api/operations'

export default function WarehouseRoute({ destination }) {
  const heading = useId()

  return <section className="warehouse-route" aria-labelledby={heading}>
    <div className="route-heading">
      <span><Route size={19} aria-hidden="true"/></span>
      <div><h3 id={heading}>Ruta al estante</h3><strong>{shelfCode(destination)}</strong></div>
    </div>
    <ol className="route-steps">
      <li>Empieza en <strong>Recepción</strong>.</li>
      <li>Localiza la señal de <strong>Zona {destination.zone}</strong>.</li>
      <li>Busca el <strong>pasillo {destination.aisle}</strong> y el <strong>estante {destination.shelf}</strong>.</li>
    </ol>
    <p className="muted route-note">Guía por señalización. El esquema agrupa las ubicaciones registradas.</p>
  </section>
}
