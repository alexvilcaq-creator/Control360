import { useState } from 'react'
import { Printer } from 'lucide-react'
import { dateLabel, money } from '../api/operations'
import { Modal, Status } from './UI'

export const paymentMethods = { cash: 'Efectivo', card: 'Tarjeta', yape: 'Yape', plin: 'Plin' }
export const paymentStates = { paid: 'Pagado', voided: 'Anulado' }

export function paymentBody(form) {
  const method = form.get('method')
  return method === 'cash' ? { method, cash_received: form.get('cash_received') }
    : { method, reference: form.get('reference') }
}

export function PaymentFields({ total }) {
  const [method, setMethod] = useState('cash')
  const [cash, setCash] = useState('')
  return <div className="stack payment-fields">
    <label>Método de pago<select name="method" value={method} onChange={event => setMethod(event.target.value)}>
      {Object.entries(paymentMethods).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
    </select></label>
    {method === 'cash' ? <>
      <label>Efectivo recibido<input name="cash_received" type="number" step="0.01" min={total} value={cash}
        required onChange={event => setCash(event.target.value)}/></label>
      <p className="cash-change"><span>Cambio estimado</span><strong>{money.format(Math.max(0, Number(cash) - total))}</strong></p>
    </> : <>
      <label>Referencia interna (opcional)<input name="reference" maxLength={60} placeholder="OP-1234"/></label>
      <p className="muted">Confirma el cobro fuera de Control360 antes de registrarlo.</p>
    </>}
  </div>
}

export function Receipt({ payment, order, onClose }) {
  return <Modal title="Comprobante interno" onClose={onClose}>
    <div className="modal-body stack" id="receipt-print">
      <header className="receipt-heading"><div><strong>Control360</strong><p>{payment.number}</p></div>
        <Status status={payment.status === 'paid' ? 'ready' : 'cancelled'}>{paymentStates[payment.status]}</Status></header>
      <dl className="receipt-lines">
        <dt>Pedido</dt><dd>#{payment.order}</dd><dt>Cliente</dt><dd>{payment.customer}</dd>
        <dt>Registrado</dt><dd>{dateLabel(payment.created_at)}</dd>
        <dt>Cajero</dt><dd>{payment.cashier_name}</dd>
        <dt>Método</dt><dd>{paymentMethods[payment.method]}</dd>
        {payment.reference && <><dt>Referencia</dt><dd>{payment.reference}</dd></>}
        {payment.cash_received != null && <><dt>Efectivo</dt><dd>{money.format(payment.cash_received)}</dd>
          <dt>Cambio</dt><dd>{money.format(payment.change)}</dd></>}
      </dl>
      {order?.items?.map(item => <div className="movement" key={item.product}>
        <span>{item.name}</span><span>{item.quantity} × {money.format(item.unit_price)}</span>
      </div>)}
      <div className="order-total"><span>Total</span><strong>{money.format(payment.amount)}</strong></div>
      {payment.void_reason && <p>Motivo de anulación: {payment.void_reason}</p>}
      <p className="muted">Registro interno de venta.</p>
    </div>
    <div className="modal-foot">
      <button className="button secondary" onClick={onClose}>Cerrar</button>
      <button className="button primary" onClick={() => window.print()}><Printer size={17}/> Imprimir</button>
    </div>
  </Modal>
}
