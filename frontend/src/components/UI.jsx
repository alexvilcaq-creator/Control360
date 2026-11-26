import { cloneElement, useEffect, useId, useRef } from 'react';
import { AlertCircle, ArrowRight, ChevronLeft, ChevronRight, Inbox, LoaderCircle, X } from 'lucide-react';
import { Link } from 'react-router-dom';


export function Brand({ tone = 'dark', compact = false }) {
  const asset = compact ? 'isotipo' : 'control360';
  return <img className={`brand ${compact ? 'brand-compact' : ''}`} src={`/brand/${asset}-${tone}.svg`}
    width={compact ? 29 : 178} height={compact ? 29 : 42} alt="Control360" />;
}

export function Button({ icon: Icon, variant = 'primary', children, className = '', ...props }) {
  return <button type="button" className={`button button--${variant} ${className}`} {...props}>{Icon && <Icon size={17} />}{children}</button>;
}

export function Tag({ tone = 'muted', dot = false, children }) {
  return <span className={`tag ${tone}`}>{dot && <i className="tag-dot" aria-hidden="true" />}{children}</span>;
}
const statusTone = {
  pending: 'amber', accepted: 'purple', preparing: 'blue', ready: 'teal',
  delivered: 'green', cancelled: 'red', present: 'green', open: 'teal', absent: 'red',
};
export function Status({ status, children }) {
  return <Tag tone={statusTone[status] || 'muted'} dot>{children}</Tag>;
}

export function PageTitle({ title, subtitle, children }) {
  return <div className="page-title">
    <div><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>
    {children && <div className="page-actions">{children}</div>}
  </div>;
}
export function Section({ title, icon: Icon, caption, action, children, className = '' }) {
  return <section className={`section ${className}`}>
    <header className="section-header"><div className="section-title">{Icon && <Icon size={20} />}
      <div><h2>{title}</h2>{caption && <p>{caption}</p>}</div>
    </div>{action}</header>
    {children}
  </section>;
}

export function TextLink({ to, children }) {
  return <Link to={to} className="text-link">{children}<ArrowRight size={15} /></Link>;
}

export function Loading() { return <div className="empty" role="status"><LoaderCircle className="spinner" size={24} /><p>Cargando datos…</p></div>; }
export function Empty({ children = 'No hay registros para mostrar.' }) { return <div className="empty"><Inbox size={26} /><p>{children}</p></div>; }
export function ErrorNotice({ message, retry }) {
  if (!message) return null;
  return <div className="error-notice" role="alert"><AlertCircle size={18} /><span>{message}</span>{retry && <Button variant="quiet" onClick={retry}>Reintentar</Button>}</div>;
}

export function DataTable({ columns, rows, empty, onClick }) {
  if (!rows?.length) return <Empty>{empty}</Empty>;
  return <div className="table-scroll"><table>
    <thead><tr>{columns.map((col) => <th key={col.key} className={col.align === 'right' ? 'right' : undefined}>{col.label}</th>)}</tr></thead>
    <tbody>{rows.map((row) => <tr key={row.id ?? row.order?.id ?? row.worker?.id} onClick={onClick ? () => onClick(row) : undefined}>
      {columns.map((col) => <td key={col.key} className={col.align === 'right' ? 'right' : undefined}>{col.render ? col.render(row) : row[col.key]}</td>)}
    </tr>)}</tbody>
  </table></div>;
}

export function Dialog({ title, children, onClose, wide = false, busy = false, bare = false }) {
  const ref = useRef(null);
  const heading = useId();
  useEffect(() => {
    const dialog = ref.current;
    dialog.showModal();
    return () => { if (dialog.open) dialog.close(); };
  }, []);
  return <dialog ref={ref} aria-labelledby={heading} className={wide ? 'dialog wide' : 'dialog'} onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}>
    <div className="dialog-heading"><h2 id={heading}>{title}</h2><button type="button" className="icon-button" aria-label="Cerrar" disabled={busy} onClick={onClose}><X size={20} /></button></div>
    {bare ? children : <div className="dialog-body">{children}</div>}
  </dialog>;
}

export function Field({ label, children, hint, inputId }) {
  const uid = useId();
  const id = inputId || uid;
  const hintId = uid + '-hint';
  return <div className="field"><label htmlFor={id}>{label}</label>
    {inputId ? children : cloneElement(children, { id, 'aria-describedby': hint ? hintId : undefined })}
    {hint && <small id={hintId}>{hint}</small>}
  </div>;
}

export function Notice({ children, success = false }) {
  return success ? children && <p className="success-notice" role="status">{children}</p> : <ErrorNotice message={children}/>;
}

export function Modal(props) { return <Dialog {...props} bare/>; }

export function PageHeading({ description, ...props }) { return <PageTitle {...props} subtitle={description}/>; }

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
