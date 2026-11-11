import { useMemo, type ReactNode } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useThemeColors, type ThemeColors } from '../hooks/useThemeColors'
import { band, shortDate } from '../utils/format'

export function ChartTooltip({ active, payload, label, render }: { active?: boolean; payload?: Array<{ payload: Record<string, unknown>; name?: string; value?: number; color?: string; dataKey?: string }>; label?: string | number; render?: (p: Record<string, unknown>) => ReactNode }) {
  if (!active || !payload?.length) return null
  return (
    <div className="pointer-events-none min-w-36 rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-pop">
      {render ? (
        render(payload[0]!.payload)
      ) : (
        <>
          {label != null && <div className="mb-1 font-medium text-ink-2">{typeof label === 'string' && /^\d{4}-/.test(label) ? shortDate(label) : label}</div>}
          {payload
            .filter((p) => p.value != null)
            .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
            .map((p) => (
              <div key={String(p.dataKey)} className="flex items-center justify-between gap-4 py-0.5">
                <span className="flex items-center gap-1.5 text-ink-2">
                  <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
                  {p.name}
                </span>
                <span className="font-medium text-ink tnum">{typeof p.value === 'number' ? p.value.toFixed(2) : p.value}</span>
              </div>
            ))}
        </>
      )}
    </div>
  )
}

const axisProps = (c: ThemeColors) => ({ stroke: c.grid, tickLine: false, axisLine: false, tick: { fill: c['text-3'], fontSize: 11 } })

export function bandColor(c: ThemeColors, letter: string | null | undefined): string {
  return c[`grade-${band(letter)}` as const]
}

/** Multi-series line chart over dates (one line per course). Series colors follow the course, not its rank. */
export function MultiLineChart({
  rows,
  series,
  height = 260,
  yDomain,
  yFormat = (v: number) => `${v}%`,
  tooltipDigits
}: {
  rows: Array<Record<string, number | string | null>>
  series: Array<{ key: string; name: string; color: string }>
  height?: number
  yDomain?: [number | 'auto' | 'dataMin', number | 'auto' | 'dataMax']
  yFormat?: (v: number) => string
  tooltipDigits?: number
}) {
  const c = useThemeColors()
  void tooltipDigits
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
        <CartesianGrid vertical={false} stroke={c.grid} />
        <XAxis dataKey="date" {...axisProps(c)} tickFormatter={(d: string) => shortDate(d)} minTickGap={28} />
        <YAxis {...axisProps(c)} domain={yDomain ?? [(min: number) => Math.max(0, Math.floor(min / 10) * 10), (max: number) => Math.ceil(max / 10) * 10]} tickFormatter={yFormat} width={48} allowDecimals />
        <Tooltip content={<ChartTooltip />} cursor={{ stroke: c['text-3'], strokeDasharray: '3 3' }} />
        {series.length > 1 && <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 11.5, paddingTop: 8 }} formatter={(v: string) => <span style={{ color: c['text-2'] }}>{v}</span>} />}
        {series.map((s) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.name}
            stroke={s.color}
            strokeWidth={2}
            dot={rows.length <= 12 ? { r: 3, strokeWidth: 2, stroke: c.surface, fill: s.color } : false}
            activeDot={{ r: 4.5, strokeWidth: 2, stroke: c.surface }}
            connectNulls
            isAnimationActive
            animationDuration={500}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}

/** Horizontal ranked bars, colored by grade band, with the letter shown in the tooltip and axis. */
export function CourseBars({ rows, height }: { rows: Array<{ name: string; percent: number | null; letter: string | null }>; height?: number }) {
  const c = useThemeColors()
  const data = rows.filter((r) => r.percent != null).sort((a, b) => (b.percent ?? 0) - (a.percent ?? 0))
  const min = Math.max(0, Math.floor(Math.min(...data.map((d) => d.percent ?? 100), 100) / 10) * 10 - 10)
  return (
    <ResponsiveContainer width="100%" height={height ?? Math.max(160, data.length * 34 + 20)}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 0 }} barCategoryGap={8}>
        <CartesianGrid horizontal={false} stroke={c.grid} />
        <XAxis type="number" domain={[min, 100]} {...axisProps(c)} tickFormatter={(v: number) => `${v}%`} />
        <YAxis type="category" dataKey="name" {...axisProps(c)} width={150} tick={{ fill: c['text-2'], fontSize: 11.5 }} tickFormatter={(s: string) => (s.length > 22 ? `${s.slice(0, 21)}…` : s)} />
        <Tooltip
          cursor={{ fill: c.grid }}
          content={<ChartTooltip render={(p) => <div><div className="font-medium text-ink">{String(p.name)}</div><div className="mt-0.5 text-ink-2 tnum">{(p.percent as number).toFixed(2)}% · {String(p.letter ?? '—')}</div></div>} />}
        />
        <Bar dataKey="percent" radius={[0, 4, 4, 0]} maxBarSize={18} isAnimationActive animationDuration={500}>
          {data.map((d) => (
            <Cell key={d.name} fill={bandColor(c, d.letter)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

/** Vertical bars for recent assignments (percent), colored by the letter that percent maps to. */
export function AssignmentBars({ rows, height = 220 }: { rows: Array<{ id: number | string; label: string; course: string; percent: number; letter: string | null; date: string | null; score: string }>; height?: number }) {
  const c = useThemeColors()
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -8 }} barCategoryGap={3}>
        <CartesianGrid vertical={false} stroke={c.grid} />
        <XAxis dataKey="id" {...axisProps(c)} tick={false} height={6} />
        <YAxis {...axisProps(c)} domain={[0, (max: number) => Math.max(100, Math.ceil(max / 10) * 10)]} tickFormatter={(v: number) => `${v}%`} width={48} />
        <ReferenceLine y={90} stroke={c['text-3']} strokeDasharray="3 4" strokeOpacity={0.5} />
        <Tooltip
          cursor={{ fill: c.grid }}
          content={
            <ChartTooltip
              render={(p) => (
                <div>
                  <div className="font-medium text-ink">{String(p.label)}</div>
                  <div className="text-ink-3">
                    {String(p.course)} · {shortDate(p.date as string)}
                  </div>
                  <div className="mt-1 text-ink-2 tnum">
                    {String(p.score)} · {(p.percent as number).toFixed(1)}%
                  </div>
                </div>
              )}
            />
          }
        />
        <Bar dataKey="percent" radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive animationDuration={500}>
          {rows.map((d) => (
            <Cell key={d.id} fill={bandColor(c, d.letter)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

/** Category averages with their weight; single series, so no legend. */
export function CategoryBars({ rows, height }: { rows: Array<{ name: string; percent: number | null; weight: number | null; letter: string | null }>; height?: number }) {
  const c = useThemeColors()
  const data = useMemo(() => rows.filter((r) => r.percent != null), [rows])
  return (
    <ResponsiveContainer width="100%" height={height ?? Math.max(120, data.length * 36 + 20)}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 0 }} barCategoryGap={8}>
        <CartesianGrid horizontal={false} stroke={c.grid} />
        <XAxis type="number" domain={[0, (max: number) => Math.max(100, Math.ceil(max / 10) * 10)]} {...axisProps(c)} tickFormatter={(v: number) => `${v}%`} />
        <YAxis
          type="category"
          dataKey="name"
          {...axisProps(c)}
          width={130}
          tick={{ fill: c['text-2'], fontSize: 11.5 }}
          tickFormatter={(s: string) => {
            const w = data.find((d) => d.name === s)?.weight
            const label = s.length > 14 ? `${s.slice(0, 13)}…` : s
            return w != null ? `${label} · ${w}%` : label
          }}
        />
        <Tooltip
          cursor={{ fill: c.grid }}
          content={<ChartTooltip render={(p) => <div><div className="font-medium text-ink">{String(p.name)}</div><div className="mt-0.5 text-ink-2 tnum">Average {(p.percent as number).toFixed(2)}%{p.weight != null ? ` · weight ${String(p.weight)}%` : ''}</div></div>} />}
        />
        <Bar dataKey="percent" radius={[0, 4, 4, 0]} maxBarSize={18} isAnimationActive animationDuration={500}>
          {data.map((d) => (
            <Cell key={d.name} fill={bandColor(c, d.letter)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

/** Letter-grade distribution: count of courses per band, in A→F order. */
export function DistributionBars({ counts, height = 180 }: { counts: Array<{ letter: string; count: number }>; height?: number }) {
  const c = useThemeColors()
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={counts} margin={{ top: 8, right: 8, bottom: 0, left: -20 }} barCategoryGap="22%">
        <CartesianGrid vertical={false} stroke={c.grid} />
        <XAxis dataKey="letter" {...axisProps(c)} tick={{ fill: c['text-2'], fontSize: 12, fontWeight: 600 }} />
        <YAxis {...axisProps(c)} allowDecimals={false} width={40} />
        <Tooltip cursor={{ fill: c.grid }} content={<ChartTooltip render={(p) => <div className="text-ink tnum"><span className="font-semibold">{String(p.letter)}</span> · {String(p.count)} course{p.count === 1 ? '' : 's'}</div>} />} />
        <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={44} isAnimationActive animationDuration={500}>
          {counts.map((d) => (
            <Cell key={d.letter} fill={bandColor(c, d.letter)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

/** Radial GPA gauge: value / max. */
export function GpaRing({ value, max = 4, size = 132, label }: { value: number | null; max?: number; size?: number; label?: string }) {
  const r = (size - 14) / 2
  const circ = 2 * Math.PI * r
  const frac = value == null ? 0 : Math.max(0, Math.min(1, value / max))
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={9} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={9}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - frac)}
          style={{ transition: 'stroke-dashoffset 0.8s cubic-bezier(0.22,1,0.36,1)' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="font-display text-[28px] font-semibold leading-none tracking-tight tnum">{value == null ? '—' : value.toFixed(2)}</div>
        {label && <div className="mt-1 text-[11px] text-ink-3">{label}</div>}
      </div>
    </div>
  )
}

export function Sparkline({ values, color, width = 72, height = 24 }: { values: number[]; color: string; width?: number; height?: number }) {
  if (values.length < 2) return <div style={{ width, height }} />
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * (width - 4) + 2},${height - 2 - ((v - min) / span) * (height - 4)}`)
  return (
    <svg width={width} height={height} aria-hidden="true">
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={pts.at(-1)!.split(',')[0]} cy={pts.at(-1)!.split(',')[1]} r={2.5} fill={color} />
    </svg>
  )
}
