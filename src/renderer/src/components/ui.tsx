/** Small control kit styled after AppKit. */
import {
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type Ref,
  useEffect,
  useRef
} from 'react'
import { t } from '@shared/i18n'
import { CloseIcon } from './Icons'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'primary' | 'destructive' | 'plain'
  busy?: boolean
}

export function Button({ variant = 'default', busy, children, disabled, className, ...rest }: ButtonProps): ReactElement {
  return (
    <button
      type="button"
      className={`btn btn-${variant} ${className ?? ''}`}
      disabled={disabled || busy}
      {...rest}
    >
      {busy ? <Spinner /> : null}
      <span>{children}</span>
    </button>
  )
}

type FieldProps = InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement>; invalid?: boolean }

export function TextField({ invalid, className, ...rest }: FieldProps): ReactElement {
  return (
    <input
      className={`field ${invalid ? 'field-invalid' : ''} ${className ?? ''}`}
      autoComplete="off"
      autoCorrect="off"
      autoCapitalize="off"
      spellCheck={false}
      {...rest}
    />
  )
}

export function Switch({ checked, onChange, disabled }: { checked: boolean; onChange: (value: boolean) => void; disabled?: boolean }): ReactElement {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      className={`switch ${checked ? 'switch-on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="switch-knob" />
    </button>
  )
}

export const Spinner = (): ReactElement => <span className="spinner" aria-label={t().common.loading} />

/** A grouped, inset list like the ones in System Settings. */
export function Group({ title, footer, children }: { title?: string; footer?: ReactNode; children: ReactNode }): ReactElement {
  return (
    <section className="group">
      {title ? <h3 className="group-title">{title}</h3> : null}
      <div className="group-body">{children}</div>
      {footer ? <p className="group-footer">{footer}</p> : null}
    </section>
  )
}

export function Row({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children?: ReactNode }): ReactElement {
  return (
    <div className="row">
      <div className="row-text">
        <div className="row-label">{label}</div>
        {hint ? <div className="row-hint">{hint}</div> : null}
      </div>
      {children ? <div className="row-control">{children}</div> : null}
    </div>
  )
}

interface SheetProps {
  title: string
  onClose: () => void
  onBack?: () => void
  width?: number
  children: ReactNode
  footer?: ReactNode
}

export function Sheet({ title, onClose, onBack, width = 460, children, footer }: SheetProps): ReactElement {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const panel = ref.current
    const first = panel?.querySelector<HTMLElement>('[autofocus], input:not([disabled]), textarea')
    ;(first ?? panel)?.focus()
    return () => previous?.focus?.()
  }, [])

  return (
    <div className="sheet-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div
        ref={ref}
        className="sheet"
        style={{ width }}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.stopPropagation()
            onClose()
          }
        }}
      >
        <header className="sheet-header">
          {onBack ? (
            <button type="button" className="icon-btn" onClick={onBack} aria-label={t().common.back}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 3.5 5.5 8l4.5 4.5" />
              </svg>
            </button>
          ) : null}
          <h2>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label={t().common.close}>
            <CloseIcon size={14} />
          </button>
        </header>
        <div className="sheet-body">{children}</div>
        {footer ? <footer className="sheet-footer">{footer}</footer> : null}
      </div>
    </div>
  )
}

export const ErrorText = ({ children }: { children: ReactNode }): ReactElement | null =>
  children ? <p className="error-text" role="alert">{children}</p> : null
