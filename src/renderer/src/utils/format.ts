import { gradeBand } from '@shared/grading/scale'

export function pct(v: number | null | undefined, digits = 1): string {
  if (v == null || !Number.isFinite(v)) return '—'
  return `${v.toFixed(digits)}%`
}

export function num(v: number | null | undefined, digits = 2): string {
  if (v == null || !Number.isFinite(v)) return '—'
  return Number.isInteger(v) && digits <= 2 ? String(v) : v.toFixed(digits).replace(/\.?0+$/, '') || '0'
}

export function gpa(v: number | null | undefined, digits = 2): string {
  if (v == null || !Number.isFinite(v)) return '—'
  return v.toFixed(digits)
}

export function signed(v: number | null | undefined, digits = 1, suffix = ''): string {
  if (v == null || !Number.isFinite(v)) return '—'
  const r = Number(v.toFixed(digits))
  if (r === 0) return `±0${suffix}`
  return `${r > 0 ? '+' : '−'}${Math.abs(r).toFixed(digits)}${suffix}`
}

const parseDay = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(y!, (m ?? 1) - 1, d ?? 1)
}

export function shortDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = iso.length > 10 ? new Date(iso) : parseDay(iso)
  const sameYear = d.getFullYear() === new Date().getFullYear()
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) })
}

export function longDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = iso.length > 10 ? new Date(iso) : parseDay(iso)
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' })
}

export function dateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export function relative(iso: string | null | undefined): string {
  if (!iso) return 'never'
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 45) return 'just now'
  if (diff < 3600) return `${Math.round(diff / 60)} min ago`
  if (diff < 86400) return `${Math.round(diff / 3600)} hr ago`
  const days = Math.round(diff / 86400)
  return days === 1 ? 'yesterday' : `${days} days ago`
}

/** Days from today until an ISO day (negative = past). */
export function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null
  const t = new Date()
  t.setHours(0, 0, 0, 0)
  return Math.round((parseDay(iso).getTime() - t.getTime()) / 86400000)
}

export type Band = 'a' | 'b' | 'c' | 'd' | 'f' | 'none'

export function band(letter: string | null | undefined): Band {
  const b = gradeBand(letter)
  return b ? (b.toLowerCase() as Band) : 'none'
}

export const bandVar = (b: Band, kind: '' | '-soft' | '-text' = '') => `var(--grade-${b}${kind})`

export function assignmentPct(earned: number | null, possible: number | null): number | null {
  if (earned == null || possible == null || possible === 0) return null
  return (earned / possible) * 100
}

export function cx(...xs: Array<string | false | null | undefined>): string {
  return xs.filter(Boolean).join(' ')
}
