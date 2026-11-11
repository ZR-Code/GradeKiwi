import { useMemo, useState } from 'react'
import { AlertCircle, ArrowLeft, CheckCircle2, ClipboardList, FlaskConical, Mail, Search, SlidersHorizontal } from 'lucide-react'
import type { Assignment } from '@shared/types'
import { assignmentsFor, isUpcoming, latestPeriodFor, runningGrade, summarizeCourse } from '@shared/grading/model'
import { letterFor } from '@shared/grading/scale'
import { AssignmentDrawer, rowTone, SortHeader, StatusPill, type SortDir } from '../components/AssignmentParts'
import { MultiLineChart } from '../components/charts'
import { CourseSettingsModal } from '../components/CourseSettingsModal'
import { Page, PageHeader } from '../components/Layout'
import { Button, Card, CardHeader, EmptyState, GradeBadge, Input, Notice, Pill, ProgressBar, Select } from '../components/ui'
import { useStore } from '../hooks/useStore'
import { assignmentPct, band, bandVar, cx, num, pct, shortDate } from '../utils/format'
import { courseColorMap } from '../utils/series'
import { useThemeColors } from '../hooks/useThemeColors'
import { api } from '../services/api'

type SortKey = 'date' | 'name' | 'category' | 'score' | 'percent'

export default function CourseDetail({ id }: { id: number }) {
  const { data, settings, periodId: viewPeriod, navigate } = useStore()
  const colors = useThemeColors()
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('')
  const [status, setStatus] = useState('')
  const [sort, setSort] = useState<SortKey>('date')
  const [dir, setDir] = useState<SortDir>('desc')
  const [selected, setSelected] = useState<Assignment | null>(null)
  const [showSettings, setShowSettings] = useState(false)

  const course = data?.courses.find((c) => c.id === id)
  // Rolling gradebook: use this course's latest checkpoint at or before the viewed period.
  const periodId = data && course ? (latestPeriodFor(data, course.id, viewPeriod) ?? viewPeriod) : viewPeriod
  const summary = useMemo(() => (data && course ? summarizeCourse(data, course, periodId, settings) : null), [data, course, periodId, settings])
  const assignments = useMemo(() => (data && course ? assignmentsFor(data, course.id, periodId) : []), [data, course, periodId])
  const running = useMemo(() => (data && course ? runningGrade(data, course, periodId, settings) : []), [data, course, periodId, settings])
  const categories = useMemo(() => [...new Set(assignments.map((a) => a.category ?? 'Uncategorized'))].sort(), [assignments])

  const rows = useMemo(() => {
    const ql = q.trim().toLowerCase()
    const list = assignments.filter(
      (a) =>
        (!ql || a.name.toLowerCase().includes(ql) || (a.notes ?? '').toLowerCase().includes(ql)) &&
        (!cat || (a.category ?? 'Uncategorized') === cat) &&
        (!status || (status === 'upcoming' ? isUpcoming(a) : a.status === status))
    )
    const val = (a: Assignment): string | number => {
      switch (sort) {
        case 'date':
          return a.dueDate ?? a.date ?? ''
        case 'name':
          return a.name.toLowerCase()
        case 'category':
          return (a.category ?? '').toLowerCase()
        case 'score':
          return a.earned ?? -1
        case 'percent':
          return assignmentPct(a.earned, a.possible) ?? -1
      }
    }
    return [...list].sort((x, y) => {
      const a = val(x)
      const b = val(y)
      const c = a < b ? -1 : a > b ? 1 : 0
      return dir === 'asc' ? c : -c
    })
  }, [assignments, q, cat, status, sort, dir])

  if (!data || !course || !summary) {
    return (
      <Page>
        <EmptyState icon={<ClipboardList size={18} />} title="Course not found" action={<Button onClick={() => navigate({ page: 'courses' })}>Back to courses</Button>} />
      </Page>
    )
  }

  const onSort = (k: SortKey) => {
    if (k === sort) setDir(dir === 'asc' ? 'desc' : 'asc')
    else {
      setSort(k)
      setDir(k === 'name' || k === 'category' ? 'asc' : 'desc')
    }
  }
  const graded = assignments.filter((a) => a.status === 'graded')
  const avgAssignment = graded.length ? graded.reduce((s, a) => s + (assignmentPct(a.earned, a.possible) ?? 0), 0) / graded.filter((a) => a.possible).length : null
  const mismatch = summary.reportedPercent != null && summary.calc.percent != null && Math.abs(summary.reportedPercent - summary.calc.percent) > 0.15
  const b = band(summary.letter)
  const color = courseColorMap(data, colors.series).get(course.id)!

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <button onClick={() => navigate({ page: 'courses' })} className="no-drag -ml-1 rounded-md p-1 text-ink-3 hover:bg-surface-3 hover:text-ink" aria-label="Back to courses">
              <ArrowLeft size={18} />
            </button>
            {course.name}
          </span>
        }
        subtitle={[course.period && `Period ${course.period}`, course.teacher, course.room && `Room ${course.room}`].filter(Boolean).join(' · ')}
        period
        actions={
          <>
            {course.teacherEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(course.teacherEmail) && (
              <Button icon={<Mail size={14} />} onClick={() => void api.openExternal(`mailto:${course.teacherEmail}`)}>
                Email
              </Button>
            )}
            <Button icon={<SlidersHorizontal size={14} />} onClick={() => setShowSettings(true)}>
              Grading
            </Button>
            <Button variant="primary" icon={<FlaskConical size={14} />} onClick={() => navigate({ page: 'hypotheticals' })}>
              What if…
            </Button>
          </>
        }
      />
      <Page>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[340px_1fr]">
          <Card>
            <div className="flex items-start justify-between">
              <div>
                <div className="text-xs font-medium text-ink-3">Current grade</div>
                <div className="mt-1 font-display text-[44px] font-semibold leading-none tracking-tight tnum">{pct(summary.percent, 1)}</div>
              </div>
              <GradeBadge letter={summary.letter} size="lg" />
            </div>
            <div className="mt-4">
              <ProgressBar value={summary.percent} color={bandVar(b)} />
            </div>
            <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 text-[12.5px]">
              <div>
                <dt className="text-ink-3">Completed</dt>
                <dd className="font-medium tnum">
                  {summary.graded} of {summary.total}
                </dd>
              </div>
              <div>
                <dt className="text-ink-3">Assignment average</dt>
                <dd className="font-medium tnum">{pct(avgAssignment)}</dd>
              </div>
              <div>
                <dt className="text-ink-3">Missing</dt>
                <dd className="font-medium tnum" style={summary.missing ? { color: 'var(--grade-f-text)' } : undefined}>
                  {summary.missing}
                </dd>
              </div>
              <div>
                <dt className="text-ink-3">Upcoming</dt>
                <dd className="font-medium tnum">{summary.upcoming}</dd>
              </div>
            </dl>
            <div className="mt-5 border-t border-line pt-4 text-[12px] text-ink-3">
              <div className="flex items-center justify-between">
                <span>Grading method</span>
                <span className="font-medium text-ink-2">
                  {summary.calc.mode === 'weighted' ? 'Weighted categories' : 'Total points'}
                  {summary.configOrigin === 'user' ? ' (custom)' : summary.configOrigin === 'studentvue' ? ' (from StudentVUE)' : ''}
                </span>
              </div>
              <div className="mt-1.5 flex items-center justify-between">
                <span>GradeKiwi calculation</span>
                <span className="font-medium text-ink-2 tnum">
                  {pct(summary.calc.percent, 2)} {summary.calcLetter && `· ${summary.calcLetter}`}
                </span>
              </div>
              {summary.reportedPercent != null && (
                <div className="mt-1.5 flex items-center justify-between">
                  <span>StudentVUE reports</span>
                  <span className="font-medium text-ink-2 tnum">
                    {pct(summary.reportedPercent, 2)} {summary.reportedLetter && `· ${summary.reportedLetter}`}
                  </span>
                </div>
              )}
            </div>
            {mismatch && (
              <div className="mt-3">
                <Notice tone="warn">
                  GradeKiwi's calculation differs from StudentVUE by {Math.abs(summary.reportedPercent! - summary.calc.percent!).toFixed(2)} points. The teacher may use rules StudentVUE doesn't expose. Adjust them in{' '}
                  <button className="underline underline-offset-2" onClick={() => setShowSettings(true)}>
                    grading settings
                  </button>
                  .
                </Notice>
              </div>
            )}
          </Card>

          <div className="flex min-w-0 flex-col gap-4">
            <Card>
              <CardHeader title="Category averages" subtitle={summary.calc.mode === 'weighted' ? 'Weights from ' + (summary.configOrigin === 'user' ? 'your settings' : 'StudentVUE') : 'Total-points grading: every point counts equally'} />
              {summary.calc.categories.length === 0 ? (
                <div className="text-[12.5px] text-ink-3">No categories yet.</div>
              ) : (
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 2xl:grid-cols-3">
                  {summary.calc.categories.map((c) => {
                    const l = letterFor(c.percent, settings.scale)
                    return (
                      <div key={c.name} className="rounded-lg border border-line p-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-[12.5px] font-medium">{c.name}</span>
                          {c.weight != null && summary.calc.mode === 'weighted' && <Pill>{num(c.weight)}%</Pill>}
                        </div>
                        <div className="mt-2 flex items-baseline justify-between">
                          <span className="text-[18px] font-semibold tracking-tight tnum">{pct(c.percent)}</span>
                          <span className="text-[11.5px] text-ink-3 tnum">
                            {num(c.earned)} / {num(c.possible)} pts
                          </span>
                        </div>
                        <div className="mt-2">
                          <ProgressBar value={c.percent} color={bandVar(band(l))} />
                        </div>
                        <div className="mt-1.5 text-[11px] text-ink-3">
                          {c.counted} counted{c.dropped.length ? ` · ${c.dropped.length} dropped` : ''}
                          {c.effectiveWeight != null && summary.calc.mode === 'weighted' && c.weight != null && Math.abs(c.effectiveWeight * 100 - c.weight) > 0.05 ? ` · effective ${(c.effectiveWeight * 100).toFixed(1)}%` : ''}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </Card>
            <Card>
              <CardHeader title="Running grade" subtitle="Course grade after each graded date, calculated by GradeKiwi" />
              {running.length > 1 ? (
                <MultiLineChart rows={running.map((r) => ({ date: r.date, g: Number(r.percent.toFixed(2)) }))} series={[{ key: 'g', name: course.name, color }]} height={180} />
              ) : (
                <div className="py-6 text-center text-[12.5px] text-ink-3">Appears after grades on at least two dates.</div>
              )}
            </Card>
          </div>
        </div>

        <Card className="mt-4" padded={false}>
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
            <div className="relative w-64">
              <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search assignments" className="w-full pl-8" />
            </div>
            <Select value={cat} onChange={(e) => setCat(e.target.value)} className="w-44" aria-label="Category">
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
            <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-40" aria-label="Status">
              <option value="">All statuses</option>
              <option value="graded">Graded</option>
              <option value="missing">Missing</option>
              <option value="upcoming">Upcoming</option>
              <option value="not_graded">Not graded</option>
              <option value="exempt">Exempt</option>
            </Select>
            <div className="flex-1" />
            <span className="flex items-center gap-3 text-[11.5px] text-ink-3">
              <span className="flex items-center gap-1">
                <CheckCircle2 size={12} /> {rows.length} shown
              </span>
              {summary.missing > 0 && (
                <span className="flex items-center gap-1" style={{ color: 'var(--grade-f-text)' }}>
                  <AlertCircle size={12} /> {summary.missing} missing
                </span>
              )}
            </span>
          </div>
          {rows.length === 0 ? (
            <EmptyState icon={<ClipboardList size={18} />} title="No assignments match" body="Try clearing the filters or choosing another grading period." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[12.5px]">
                <thead className="border-b border-line">
                  <tr>
                    <SortHeader k="name" sort={sort} dir={dir} onSort={onSort} className="pl-4">
                      Assignment
                    </SortHeader>
                    <SortHeader k="category" sort={sort} dir={dir} onSort={onSort}>
                      Category
                    </SortHeader>
                    <SortHeader k="score" sort={sort} dir={dir} onSort={onSort} className="text-right">
                      Score
                    </SortHeader>
                    <th className="px-3 py-2 text-right text-[11px] font-medium text-ink-3">Total points</th>
                    <SortHeader k="percent" sort={sort} dir={dir} onSort={onSort} className="text-right">
                      Percentage
                    </SortHeader>
                    <SortHeader k="date" sort={sort} dir={dir} onSort={onSort}>
                      Due
                    </SortHeader>
                    <th className="px-3 py-2 pr-4 text-left text-[11px] font-medium text-ink-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((a) => {
                    const p = assignmentPct(a.earned, a.possible)
                    const l = letterFor(p, settings.scale)
                    return (
                      <tr key={a.id} onClick={() => setSelected(a)} className={cx('cursor-pointer border-b border-line transition-colors last:border-0', rowTone(a))}>
                        <td className="max-w-[320px] truncate px-3 py-2.5 pl-4 font-medium text-ink" title={a.name}>
                          {a.name}
                        </td>
                        <td className="px-3 py-2.5 text-ink-2">{a.category ?? '—'}</td>
                        <td className="px-3 py-2.5 text-right tnum">{a.status === 'exempt' ? 'Exempt' : a.earned != null ? num(a.earned) : '—'}</td>
                        <td className="px-3 py-2.5 text-right text-ink-2 tnum">{num(a.possible)}</td>
                        <td className="px-3 py-2.5 text-right tnum">
                          {p != null ? (
                            <span className="inline-flex items-center gap-2">
                              {p.toFixed(1)}%
                              <GradeBadge letter={l} size="sm" />
                            </span>
                          ) : (
                            <span className="text-ink-3">—</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-ink-2 tnum">{shortDate(a.dueDate ?? a.date)}</td>
                        <td className="px-3 py-2.5 pr-4">
                          <StatusPill a={a} />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </Page>
      <AssignmentDrawer a={selected} onClose={() => setSelected(null)} />
      <CourseSettingsModal course={course} open={showSettings} onClose={() => setShowSettings(false)} />
    </>
  )
}
