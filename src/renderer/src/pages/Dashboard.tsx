import { useMemo, useState, type ReactNode } from 'react'
import { BookOpen, RefreshCw, Target } from 'lucide-react'
import { gpaFromSummaries, isUpcoming } from '@shared/grading/model'
import { letterFor } from '@shared/grading/scale'
import { AssignmentBars, CourseBars, MultiLineChart } from '../components/charts'
import { Counter } from '../components/Counter'
import { CourseCard } from '../components/CourseCard'
import { Page, PageHeader, SyncErrorBanner } from '../components/Layout'
import { Button, Card, EmptyState, Segmented } from '../components/ui'
import { useStore } from '../hooks/useStore'
import { useThemeColors } from '../hooks/useThemeColors'
import { assignmentPct, daysUntil, relative } from '../utils/format'
import { courseColorMap, gradeHistory } from '../utils/series'

type Insight = 'trend' | 'courses' | 'recent'

function greeting(): string {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

/** One metric in the summary strip. */
function Metric({ label, children, sub, tone }: { label: string; children: ReactNode; sub: ReactNode; tone?: string }) {
  return (
    <div className="min-w-0 px-5 py-4 first:pl-6">
      <div className="text-xs font-medium text-ink-3">{label}</div>
      <div className="mt-1 font-display text-[28px] font-semibold leading-tight tracking-tight" style={tone ? { color: tone } : undefined}>
        {children}
      </div>
      <div className="mt-0.5 truncate text-xs text-ink-3">{sub}</div>
    </div>
  )
}

export default function Dashboard() {
  const { data, summaries, settings, snapshots, periodId, auth, sync, syncing, navigate } = useStore()
  const colors = useThemeColors()
  const [insight, setInsight] = useState<Insight>('trend')

  const gpaRes = useMemo(() => gpaFromSummaries(summaries, settings), [summaries, settings])
  const graded = summaries.filter((s) => s.percent != null)
  const avg = graded.length ? graded.reduce((a, s) => a + (s.percent ?? 0), 0) / graded.length : null
  const missing = summaries.reduce((a, s) => a + s.missing, 0)
  const coursesWithMissing = summaries.filter((s) => s.missing > 0).length
  const upcoming = useMemo(() => (data ? data.assignments.filter((a) => isUpcoming(a) && (periodId == null || a.periodId === periodId)) : []), [data, periodId])
  const dueThisWeek = upcoming.filter((a) => (daysUntil(a.dueDate ?? a.date) ?? 99) <= 7).length

  const colorMap = useMemo(() => (data ? courseColorMap(data, colors.series) : new Map<number, string>()), [data, colors.series])
  const history = useMemo(() => (data ? gradeHistory(data, snapshots, periodId, settings) : null), [data, snapshots, periodId, settings])
  const recent = useMemo(() => {
    if (!data) return []
    const name = new Map(data.courses.map((c) => [c.id, c.name]))
    return data.assignments
      .filter((a) => (a.status === 'graded' || a.status === 'missing') && a.possible && (periodId == null || a.periodId === periodId))
      .slice(0, 24)
      .reverse()
      .map((a) => {
        const p = assignmentPct(a.earned, a.possible) ?? 0
        return { id: a.id, label: a.name, course: name.get(a.courseId) ?? '', percent: p, letter: letterFor(p, settings.scale), date: a.dueDate ?? a.date, score: `${a.earned ?? 0} / ${a.possible}` }
      })
  }, [data, periodId, settings.scale])

  if (!data) return null
  const firstName = data.student?.name?.split(/[ ,]/).filter(Boolean)[0]
  const source = data.sync.source === 'demo' ? 'Demo data (fictional)' : data.sync.source === 'import' ? 'Imported data' : 'FCPS StudentVUE'

  return (
    <>
      <PageHeader
        title={`${greeting()}${firstName && data.sync.source !== 'demo' ? `, ${firstName}` : ''}`}
        subtitle={`${source} · Updated ${relative(data.sync.lastSuccess)}`}
        period
        actions={
          auth?.connected && (
            <Button icon={<RefreshCw size={14} className={syncing ? 'spin' : ''} />} onClick={() => void sync()} disabled={syncing}>
              {syncing ? 'Syncing' : 'Refresh'}
            </Button>
          )
        }
      />
      <Page>
        <SyncErrorBanner />

        {/* Summary strip: four numbers, no chrome. */}
        <Card padded={false} className="grid grid-cols-2 divide-line lg:grid-cols-4 lg:divide-x">
          <Metric label="GPA" sub={<>Weighted <Counter value={gpaRes.weighted} format={(n) => n.toFixed(2)} /></>}>
            <Counter value={gpaRes.unweighted} format={(n) => n.toFixed(2)} />
          </Metric>
          <Metric label="Average grade" sub={letterFor(avg, settings.scale) ?? 'No grades yet'}>
            <Counter value={avg} format={(n) => `${n.toFixed(1)}%`} />
          </Metric>
          <Metric label="Missing" tone={missing > 0 ? 'var(--grade-f-text)' : undefined} sub={missing > 0 ? `In ${coursesWithMissing} course${coursesWithMissing === 1 ? '' : 's'}` : 'All caught up'}>
            <button onClick={() => navigate({ page: 'assignments' })} className="rounded-md hover:opacity-80 active:!scale-100">
              <Counter value={missing} format={(n) => String(Math.round(n))} />
            </button>
          </Metric>
          <Metric label="Due this week" sub={`${upcoming.length} upcoming in total`}>
            <Counter value={dueThisWeek} format={(n) => String(Math.round(n))} />
          </Metric>
        </Card>

        <div className="mb-3 mt-8 flex items-center justify-between">
          <h2 className="text-[13px] font-semibold">Courses</h2>
        </div>
        {summaries.length === 0 ? (
          <Card>
            <EmptyState icon={<BookOpen size={18} />} title="No courses for this period" body="Try a different grading period." />
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {summaries.map((s) => (
              <CourseCard key={s.course.id} s={s} />
            ))}
          </div>
        )}

        <Card className="mt-8">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-[13px] font-semibold">Insights</h3>
              <p className="mt-0.5 text-xs text-ink-3">
                {insight === 'trend'
                  ? history?.source === 'snapshots'
                    ? 'Course grades over time, from your saved syncs'
                    : 'Course grades over time, reconstructed from assignment dates'
                  : insight === 'courses'
                    ? 'Current percentage in each course'
                    : 'Your last 24 graded assignments, oldest to newest'}
              </p>
            </div>
            <Segmented
              value={insight}
              onChange={setInsight}
              options={[
                { value: 'trend', label: 'Trend' },
                { value: 'courses', label: 'By course' },
                { value: 'recent', label: 'Recent work' }
              ]}
            />
          </div>
          <div key={insight} className="animate-fade">
            {insight === 'trend' &&
              (history && history.rows.length > 1 ? (
                <MultiLineChart rows={history.rows} series={history.series.map((s) => ({ ...s, color: colorMap.get(s.courseId)! }))} height={280} />
              ) : (
                <EmptyState icon={<Target size={18} />} title="Not enough history yet" body="The trend appears once graded work spans a few dates." />
              ))}
            {insight === 'courses' && <CourseBars rows={summaries.map((s) => ({ name: s.course.name, percent: s.percent, letter: s.letter }))} />}
            {insight === 'recent' && (recent.length ? <AssignmentBars rows={recent} height={280} /> : <EmptyState icon={<Target size={18} />} title="No graded assignments yet" />)}
          </div>
          <div className="mt-3 text-right text-[12px]">
            <button onClick={() => navigate({ page: 'history' })} className="font-medium text-accent-text hover:underline active:!scale-100">
              GPA trend and full history →
            </button>
          </div>
        </Card>
      </Page>
    </>
  )
}
