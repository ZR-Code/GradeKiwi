import { useMemo } from 'react'
import { AlertCircle, CheckCircle2, TrendingDown, TrendingUp, Minus } from 'lucide-react'
import { runningGrade, type CourseSummary } from '@shared/grading/model'
import { useStore } from '../hooks/useStore'
import { band, bandVar, pct } from '../utils/format'
import { Sparkline } from './charts'
import { Counter } from './Counter'
import { Card, GradeBadge, ProgressBar } from './ui'

export function CourseCard({ s }: { s: CourseSummary }) {
  const { navigate, data, settings } = useStore()
  const spark = useMemo(() => (data ? runningGrade(data, s.course, s.periodId, settings).map((p) => p.percent).slice(-14) : []), [data, s, settings])
  const b = band(s.letter)
  const trendIcon = s.trend == null || Math.abs(s.trend) < 0.05 ? <Minus size={12} /> : s.trend > 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />
  const trendColor = s.trend == null || Math.abs(s.trend) < 0.05 ? 'var(--text-3)' : s.trend > 0 ? 'var(--grade-a-text)' : 'var(--grade-f-text)'
  return (
    <Card onClick={() => navigate({ page: 'course', id: s.course.id })} className="group relative overflow-hidden" padded={false}>
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-[13.5px] font-semibold text-ink" title={s.course.name}>
              {s.course.name}
            </div>
            <div className="mt-0.5 truncate text-xs text-ink-3">
              {s.course.period ? `Period ${s.course.period} · ` : ''}
              {s.course.teacher ?? 'No teacher listed'}
            </div>
          </div>
          <GradeBadge letter={s.letter} />
        </div>
        <div className="mt-4 flex items-end justify-between gap-2">
          <div>
            <div className="font-display text-[26px] font-semibold leading-none tracking-tight">
              <Counter value={s.percent} format={(n) => pct(n, 1)} />
            </div>
            <div className="mt-1.5 flex items-center gap-1 text-[11.5px] font-medium tnum" style={{ color: trendColor }} title="Change in running grade over the last 14 days">
              {trendIcon}
              {s.trend == null ? 'No trend yet' : `${s.trend >= 0 ? '+' : '−'}${Math.abs(s.trend).toFixed(1)} in 2 wks`}
            </div>
          </div>
          <Sparkline values={spark} color={bandVar(b)} />
        </div>
        <div className="mt-3">
          <ProgressBar value={s.percent} color={bandVar(b)} />
        </div>
        <div className="mt-3 flex items-center gap-3 text-[11.5px] text-ink-3">
          <span className="flex items-center gap-1">
            <CheckCircle2 size={12} /> {s.graded} graded
          </span>
          {s.missing > 0 ? (
            <span className="flex items-center gap-1 font-medium" style={{ color: 'var(--grade-f-text)' }}>
              <AlertCircle size={12} /> {s.missing} missing
            </span>
          ) : (
            <span>0 missing</span>
          )}
          {s.upcoming > 0 && <span className="ml-auto">{s.upcoming} upcoming</span>}
        </div>
      </div>
    </Card>
  )
}
