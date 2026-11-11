import { useEffect, useRef, useState } from 'react'

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Number that eases to its new value (ease-out cubic, ~450ms) instead of jumping.
 * Renders `fallback` for null/NaN. Formatting is the caller's choice.
 */
export function Counter({ value, format, fallback = '—', duration = 450 }: { value: number | null | undefined; format: (n: number) => string; fallback?: string; duration?: number }) {
  const valid = value != null && Number.isFinite(value)
  const [shown, setShown] = useState<number | null>(valid ? value : null)
  const from = useRef<number | null>(shown)
  const raf = useRef(0)

  useEffect(() => {
    cancelAnimationFrame(raf.current)
    if (!valid) {
      setShown(null)
      from.current = null
      return
    }
    const start = from.current
    if (start == null || start === value || reduced()) {
      setShown(value)
      from.current = value
      return
    }
    const t0 = performance.now()
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / duration)
      const e = 1 - Math.pow(1 - p, 3)
      const v = start + (value - start) * e
      setShown(v)
      from.current = v
      if (p < 1) raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
  }, [value, valid, duration])

  return <span className="tnum">{shown == null ? fallback : format(shown)}</span>
}
