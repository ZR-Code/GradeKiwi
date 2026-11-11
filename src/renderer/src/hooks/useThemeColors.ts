import { useEffect, useState } from 'react'

const KEYS = [
  'text', 'text-2', 'text-3', 'grid', 'surface', 'border', 'accent',
  'grade-a', 'grade-b', 'grade-c', 'grade-d', 'grade-f', 'grade-none',
  'series-1', 'series-2', 'series-3', 'series-4', 'series-5', 'series-6', 'series-7', 'series-8'
] as const
export type ThemeColors = Record<(typeof KEYS)[number], string> & { dark: boolean; series: string[] }

function read(): ThemeColors {
  const cs = getComputedStyle(document.documentElement)
  const out = {} as Record<string, string>
  for (const k of KEYS) out[k] = cs.getPropertyValue(`--${k}`).trim()
  const dark = window.matchMedia('(prefers-color-scheme: dark)').matches
  return { ...(out as ThemeColors), dark, series: [1, 2, 3, 4, 5, 6, 7, 8].map((i) => out[`series-${i}`]!) }
}

/** Resolved CSS token values for Recharts (SVG attributes can't reliably use var()). */
export function useThemeColors(): ThemeColors {
  const [c, setC] = useState(read)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const on = () => setC(read())
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return c
}
