import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Icon, type IconName } from './Icon'
import type { Advice, Severity } from '../engine/types'
import { localizeTemps } from '../engine/units'
import { useSettings } from '../state/store'

const SEVERITY_ICON: Record<Severity, IconName> = {
  info: 'info',
  tip: 'bulb',
  warn: 'alert',
  error: 'alert',
}

export function Alert({
  severity = 'info',
  title,
  children,
}: {
  severity?: Severity
  title?: ReactNode
  children?: ReactNode
}) {
  return (
    <div className={`alert ${severity}`} role={severity === 'error' ? 'alert' : undefined}>
      <span className="a-icon">
        <Icon name={SEVERITY_ICON[severity]} size={18} />
      </span>
      <div>
        {title && <strong>{title}</strong>}
        {children}
      </div>
    </div>
  )
}

export function AdviceList({
  advice,
  scope,
  action,
}: {
  advice: Advice[]
  scope?: string | string[]
  /** Extra content inside an advice card, e.g. one-tap fixes. */
  action?: (a: Advice) => ReactNode
}) {
  const { tempUnit: u } = useSettings()
  const scopes = scope === undefined ? null : Array.isArray(scope) ? scope : [scope]
  const items = scopes ? advice.filter((a) => scopes.includes(a.scope)) : advice
  if (!items.length) return null
  const order: Severity[] = ['error', 'warn', 'tip', 'info']
  const sorted = [...items].sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity))
  return (
    <div className="stack-sm">
      {sorted.map((a, i) => (
        <Alert key={`${a.title}-${i}`} severity={a.severity} title={localizeTemps(a.title, u)}>
          {a.detail && <div>{localizeTemps(a.detail, u)}</div>}
          {action?.(a)}
        </Alert>
      ))}
    </div>
  )
}

export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  title?: ReactNode
  children: ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!open) return null
  return createPortal(
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="grabber" />
        {title && (
          <div className="row between" style={{ marginBottom: 10 }}>
            <h2 style={{ margin: 0 }}>{title}</h2>
            <button className="icon-btn" aria-label="Close" onClick={onClose}>
              <Icon name="x" />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>,
    document.body,
  )
}

export function Details({
  summary,
  children,
  open,
  icon,
}: {
  summary: ReactNode
  children: ReactNode
  open?: boolean
  icon?: IconName
}) {
  return (
    <details className="details" open={open}>
      <summary>
        {icon && <Icon name={icon} size={18} />}
        {summary}
      </summary>
      <div className="details-body">{children}</div>
    </details>
  )
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <div className="section-title">{children}</div>
}
