import { useEffect, useRef } from 'react'
import { ChevronLeft, ChevronRight, PackageOpen, X } from 'lucide-react'

export function Brand() {
  return <span className="brand"><span className="brand-mark">
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3 21 8l-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round"/></svg>
  </span>Control<span>360</span></span>
}

export function Notice({ children, success = false }) {
  return children && <p className={success ? 'notice success' : 'notice'} role={success ? 'status' : 'alert'}>{children}</p>
}

export function Loading() {
  return <div className="skeleton" role="status" aria-label="Cargando">
    <span /><span /><span />
  </div>
}

export function Empty({ children }) {
  return <div className="empty"><PackageOpen size={28} aria-hidden="true" /><p>{children}</p></div>
}

export function Pagination({ data, page, onChange }) {
  if (!data) return null
  return <div className="pagination">
    <span>{data.count} registros</span>
    <div>
      <button className="icon-button" type="button" aria-label="Página anterior" disabled={!data.previous} onClick={() => onChange(page - 1)}><ChevronLeft size={17} /></button>
      <span aria-live="polite">Página {page}</span>
      <button className="icon-button" type="button" aria-label="Página siguiente" disabled={!data.next} onClick={() => onChange(page + 1)}><ChevronRight size={17} /></button>
    </div>
  </div>
}

export function Modal({ title, onClose, busy, children }) {
  const ref = useRef(null)
  useEffect(() => {
    const dialog = ref.current
    dialog.showModal()
    return () => dialog.close()
  }, [])
  return <dialog ref={ref} onCancel={event => { event.preventDefault(); if (!busy) onClose() }} aria-labelledby="dialog-title">
    <div className="modal-head"><h2 id="dialog-title">{title}</h2>
      <button className="icon-button" aria-label="Cerrar" onClick={onClose} disabled={busy}><X size={19} /></button>
    </div>
    {children}
  </dialog>
}

export function Toast({ children, onClose }) {
  useEffect(() => {
    if (!children) return
    const timer = setTimeout(onClose, 4500)
    return () => clearTimeout(timer)
  }, [children, onClose])
  return children && <div className="toast" role="status">{children}
    <button className="icon-button" aria-label="Cerrar aviso" onClick={onClose}><X size={17} /></button>
  </div>
}

export function Status({ status, children }) {
  return <span className={`state-tag state-${status}`}>{children}</span>
}

export function PageHeading({ title, description, children }) {
  return <div className="page-heading"><div><h1>{title}</h1>{description && <p>{description}</p>}</div>
    {children && <div className="heading-actions">{children}</div>}
  </div>
}
