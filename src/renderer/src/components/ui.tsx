import { useEffect, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react'
import { ChevronDown, Info, Loader2, X } from 'lucide-react'
import { band, bandVar, cx } from '../utils/format'
import { usePresence } from '../hooks/usePresence'

export function Card({ children, className, padded = true, onClick, interactive }: { children: ReactNode; className?: string; padded?: boolean; onClick?: () => void; interactive?: boolean }) {
  return (
    <div
      onClick={onClick}
      onKeyDown={onClick ? (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onClick()) : undefined}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      className={cx(
        'rounded-xl border border-line bg-surface shadow-card',
        padded && 'p-5',
        (interactive || onClick) && 'transition-[transform,box-shadow,border-color] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:border-line-strong hover:shadow-pop active:translate-y-0 active:duration-100',
        className
      )}
    >
      {children}
    </div>
  )
}

export function CardHeader({ title, subtitle, action, icon }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h3 className="flex items-center gap-2 text-[13px] font-semibold text-ink">
          {icon}
          {title}
        </h3>
        {subtitle && <p className="mt-0.5 text-xs text-ink-3">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export function Button({
  variant = 'secondary',
  size = 'md',
  loading,
  icon,
  children,
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: 'sm' | 'md'; loading?: boolean; icon?: ReactNode }) {
  return (
    <button
      {...rest}
      disabled={rest.disabled || loading}
      className={cx(
        'no-drag inline-flex select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-lg font-medium transition-[color,background-color,border-color,box-shadow,transform,opacity] duration-150 ease-out disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-8 px-3 text-[13px]',
        variant === 'primary' && 'bg-accent text-white shadow-sm hover:bg-accent-hover',
        variant === 'secondary' && 'border border-line-strong bg-surface text-ink shadow-[0_1px_1px_rgba(0,0,0,0.03)] hover:bg-surface-2',
        variant === 'ghost' && 'text-ink-2 hover:bg-surface-3/70 hover:text-ink',
        variant === 'danger' && 'border border-[var(--grade-f-soft)] bg-[var(--grade-f-soft)] text-[var(--grade-f-text)] hover:border-[var(--grade-f)]',
        className
      )}
    >
      {loading ? <Loader2 size={14} className="spin" /> : icon}
      {children}
    </button>
  )
}

export function IconButton({ label, children, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      {...rest}
      aria-label={label}
      title={label}
      className={cx('no-drag inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-3 transition-[color,background-color,transform] duration-150 hover:bg-surface-3/70 hover:text-ink disabled:opacity-40', className)}
    >
      {children}
    </button>
  )
}

export function GradeBadge({ letter, size = 'md', className }: { letter: string | null | undefined; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const b = band(letter)
  return (
    <span
      className={cx(
        'inline-flex shrink-0 items-center justify-center rounded-md font-semibold tnum',
        size === 'sm' && 'h-5 min-w-6 px-1 text-[11px]',
        size === 'md' && 'h-6 min-w-8 px-1.5 text-xs',
        size === 'lg' && 'h-9 min-w-11 px-2 text-base',
        className
      )}
      style={{ background: bandVar(b, '-soft'), color: bandVar(b, '-text') }}
    >
      {letter ?? '—'}
    </span>
  )
}

export function GradeDot({ letter }: { letter: string | null | undefined }) {
  return <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: bandVar(band(letter)) }} />
}

export function Pill({ children, tone = 'neutral', className }: { children: ReactNode; tone?: 'neutral' | 'accent' | 'a' | 'b' | 'c' | 'd' | 'f'; className?: string }) {
  const style =
    tone === 'neutral'
      ? { background: 'var(--surface-3)', color: 'var(--text-2)' }
      : tone === 'accent'
        ? { background: 'var(--accent-soft)', color: 'var(--accent-text)' }
        : { background: `var(--grade-${tone}-soft)`, color: `var(--grade-${tone}-text)` }
  return (
    <span className={cx('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium', className)} style={style}>
      {children}
    </span>
  )
}

export function Stat({ label, value, sub, icon, tone }: { label: string; value: ReactNode; sub?: ReactNode; icon?: ReactNode; tone?: string }) {
  return (
    <Card className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5 text-xs font-medium text-ink-3">
        {icon}
        {label}
      </div>
      <div className="font-display text-[26px] font-semibold leading-tight tracking-tight tnum" style={tone ? { color: tone } : undefined}>
        {value}
      </div>
      {sub && <div className="text-xs text-ink-3">{sub}</div>}
    </Card>
  )
}

export function Segmented<T extends string>({ value, onChange, options, size = 'md' }: { value: T; onChange: (v: T) => void; options: Array<{ value: T; label: ReactNode }>; size?: 'sm' | 'md' }) {
  const wrap = useRef<HTMLDivElement>(null)
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null)
  const [animate, setAnimate] = useState(false)
  // Measure the active tab so a single indicator can slide between options.
  useLayoutEffect(() => {
    const el = wrap.current?.querySelector<HTMLElement>('[aria-selected="true"]')
    if (el) setPill({ left: el.offsetLeft, width: el.offsetWidth })
  }, [value, options.length])
  useEffect(() => {
    const id = requestAnimationFrame(() => setAnimate(true))
    return () => cancelAnimationFrame(id)
  }, [])
  return (
    <div ref={wrap} className="no-drag relative inline-flex rounded-lg bg-surface-3/80 p-0.5" role="tablist">
      {pill && (
        <span
          aria-hidden
          className={cx('absolute bottom-0.5 top-0.5 rounded-md bg-surface shadow-sm', animate && 'transition-[left,width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]')}
          style={{ left: pill.left, width: pill.width }}
        />
      )}
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={o.value === value}
          onClick={() => onChange(o.value)}
          className={cx(
            'relative z-[1] rounded-md font-medium transition-colors duration-200 active:!scale-100',
            size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-[12.5px]',
            o.value === value ? 'text-ink' : 'text-ink-2 hover:text-ink'
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className={cx('no-drag relative inline-flex', className)}>
      <select
        {...rest}
        className="h-8 w-full appearance-none rounded-lg border border-line-strong bg-surface pl-2.5 pr-7 text-[13px] text-ink shadow-[0_1px_1px_rgba(0,0,0,0.03)] outline-none transition-colors hover:bg-surface-2 focus:border-accent"
      >
        {children}
      </select>
      <ChevronDown size={14} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-ink-3" />
    </div>
  )
}

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...rest}
      className={cx(
        'no-drag h-8 rounded-lg border border-line-strong bg-surface px-2.5 text-[13px] text-ink outline-none transition-colors placeholder:text-ink-3 focus:border-accent focus:ring-2 focus:ring-accent-soft',
        className
      )}
    />
  )
}

/** Numeric input that keeps a local string while typing and commits parsed numbers (or null). */
export function NumberInput({ value, onChange, className, placeholder, min, max, step = 'any', suffix }: { value: number | null; onChange: (v: number | null) => void; className?: string; placeholder?: string; min?: number; max?: number; step?: number | 'any'; suffix?: string }) {
  const [text, setText] = useState(value == null ? '' : String(value))
  const focused = useRef(false)
  useEffect(() => {
    if (!focused.current) setText(value == null ? '' : String(Number(value.toFixed(4))))
  }, [value])
  return (
    <div className={cx('relative', className)}>
      <Input
        type="number"
        inputMode="decimal"
        value={text}
        min={min}
        max={max}
        step={step}
        placeholder={placeholder}
        onFocus={() => (focused.current = true)}
        onBlur={() => {
          focused.current = false
          setText(value == null ? '' : String(Number(value.toFixed(4))))
        }}
        onChange={(e) => {
          setText(e.target.value)
          const t = e.target.value.trim()
          if (t === '') onChange(null)
          else {
            const n = Number(t)
            if (Number.isFinite(n)) onChange(n)
          }
        }}
        className={cx('w-full tnum', suffix && 'pr-7')}
      />
      {suffix && <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-ink-3">{suffix}</span>}
    </div>
  )
}

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: string; disabled?: boolean }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx('no-drag relative inline-flex h-[22px] w-[38px] shrink-0 items-center rounded-full transition-colors duration-200 disabled:opacity-50', checked ? 'bg-accent' : 'bg-surface-3 ring-1 ring-inset ring-line-strong')}
    >
      <span className={cx('inline-block h-[18px] w-[18px] rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.25)] transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]', checked ? 'translate-x-[18px]' : 'translate-x-[2px]')} />
    </button>
  )
}

export function Field({ label, hint, children, className }: { label: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cx('flex flex-col gap-1.5', className)}>
      <span className="text-xs font-medium text-ink-2">{label}</span>
      {children}
      {hint && <span className="text-[11.5px] leading-snug text-ink-3">{hint}</span>}
    </label>
  )
}

export function EmptyState({ icon, title, body, action }: { icon: ReactNode; title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-surface-3 text-ink-3">{icon}</div>
      <div className="text-[14px] font-semibold text-ink">{title}</div>
      {body && <div className="mt-1 max-w-sm text-[12.5px] leading-relaxed text-ink-3">{body}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function Notice({ children, tone = 'info', icon }: { children: ReactNode; tone?: 'info' | 'warn' | 'error'; icon?: ReactNode }) {
  const t = tone === 'info' ? 'accent' : tone === 'warn' ? 'grade-c' : 'grade-f'
  return (
    <div
      className="flex items-start gap-2.5 rounded-lg px-3 py-2.5 text-[12.5px] leading-relaxed"
      style={{ background: `var(--${t}-soft)`, color: tone === 'info' ? 'var(--text-2)' : `var(--${t}-text)` }}
    >
      <span className="mt-0.5 shrink-0" style={{ color: tone === 'info' ? 'var(--accent-text)' : undefined }}>
        {icon ?? <Info size={14} />}
      </span>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

export function Modal({ open, onClose, title, children, footer, width = 460 }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; width?: number }) {
  const { mounted, leaving } = usePresence(open)
  useEffect(() => {
    if (!open) return
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [open, onClose])
  if (!mounted) return null
  return (
    <div className={cx('no-drag fixed inset-0 z-50 flex items-center justify-center bg-black/25 p-6 backdrop-blur-[2px]', leaving ? 'pointer-events-none animate-fade-out' : 'animate-fade')} onMouseDown={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} className={cx('w-full rounded-2xl border border-line bg-surface shadow-pop', leaving ? 'animate-pop-out' : 'animate-pop')} style={{ maxWidth: width }} onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h2 className="text-[14px] font-semibold">{title}</h2>
          <IconButton label="Close" onClick={onClose}>
            <X size={15} />
          </IconButton>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>
  )
}

export function Drawer({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode }) {
  const { mounted, leaving } = usePresence(open)
  // Keep showing the last content while the drawer slides out.
  const last = useRef<{ title: ReactNode; children: ReactNode }>({ title, children })
  if (open) last.current = { title, children }
  useEffect(() => {
    if (!open) return
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [open, onClose])
  if (!mounted) return null
  return (
    <div className={cx('no-drag fixed inset-0 z-40 bg-black/15', leaving ? 'pointer-events-none animate-fade-out' : 'animate-fade')} onMouseDown={onClose}>
      <aside className={cx('absolute bottom-3 right-3 top-3 flex w-[400px] flex-col rounded-2xl border border-line bg-surface shadow-pop', leaving ? 'animate-drawer-out' : 'animate-drawer')} onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0 text-[15px] font-semibold">{last.current.title}</div>
          <IconButton label="Close" onClick={onClose}>
            <X size={15} />
          </IconButton>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{last.current.children}</div>
      </aside>
    </div>
  )
}

export function ProgressBar({ value, color }: { value: number | null; color?: string }) {
  const v = value == null ? 0 : Math.max(0, Math.min(100, value))
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
      <div className="h-full rounded-full transition-[width,background-color] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]" style={{ width: `${v}%`, background: color ?? 'var(--accent)' }} />
    </div>
  )
}

export function Delta({ value, digits = 2, suffix = '', className }: { value: number | null; digits?: number; suffix?: string; className?: string }) {
  if (value == null || !Number.isFinite(value)) return <span className={cx('text-ink-3', className)}>—</span>
  const r = Number(value.toFixed(digits))
  const tone = r > 0 ? 'var(--grade-a-text)' : r < 0 ? 'var(--grade-f-text)' : 'var(--text-3)'
  return (
    <span className={cx('tnum font-medium', className)} style={{ color: tone }}>
      {r > 0 ? '+' : r < 0 ? '−' : '±'}
      {Math.abs(r).toFixed(digits)}
      {suffix}
    </span>
  )
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 mt-8 flex items-center justify-between first:mt-0">
      <h2 className="text-[13px] font-semibold text-ink">{children}</h2>
      {action}
    </div>
  )
}
