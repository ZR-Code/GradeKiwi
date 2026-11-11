import type { ReactNode } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import type { Assignment } from '@shared/types'
import { assignmentImpact } from '@shared/grading/engine'
import { engineConfigFor, engineOptions, isUpcoming, toItem, assignmentsFor } from '@shared/grading/model'
import { letterFor } from '@shared/grading/scale'
import { useStore } from '../hooks/useStore'
import { assignmentPct, cx, daysUntil, longDate, num, pct } from '../utils/format'
import { Delta, Drawer, GradeBadge, Pill } from './ui'

export function StatusPill({ a }: { a: Assignment }) {
  if (a.status === 'missing') return <Pill tone="f">Missing</Pill>
  if (a.status === 'exempt') return <Pill>Exempt</Pill>
  if (a.status === 'not_graded') {
    if (isUpcoming(a)) {
      const d = daysUntil(a.dueDate ?? a.date)
      return <Pill tone="accent">{d === 0 ? 'Due today' : d === 1 ? 'Due tomorrow' : `Due in ${d}d`}</Pill>
    }
    return <Pill>Not graded</Pill>
  }
  return <Pill tone="a">Graded</Pill>
}

export function scoreLabel(a: Assignment): string {
  if (a.status === 'exempt') return 'Exempt'
  if (a.earned == null) return a.possible != null ? `— / ${num(a.possible)}` : (a.scoreText ?? '—')
  return `${num(a.earned)} / ${num(a.possible)}`
}

export function rowTone(a: Assignment): string {
  if (a.status === 'missing') return 'bg-[var(--grade-f-soft)] hover:brightness-[0.98]'
  if (isUpcoming(a)) return 'bg-accent-soft/60 hover:bg-accent-soft'
  return 'hover:bg-surface-2'
}

export type SortDir = 'asc' | 'desc'
export function SortHeader<K extends string>({ k, sort, dir, onSort, children, className }: { k: K; sort: K; dir: SortDir; onSort: (k: K) => void; children: ReactNode; className?: string }) {
  const active = sort === k
  return (
    <th className={cx('px-3 py-2 text-left text-[11px] font-medium text-ink-3', className)} aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button onClick={() => onSort(k)} className={cx('inline-flex items-center gap-1 hover:text-ink', active && 'text-ink')}>
        {children}
        {active ? dir === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} /> : <ArrowUpDown size={11} className="opacity-40" />}
      </button>
    </th>
  )
}

export function AssignmentDrawer({ a, onClose }: { a: Assignment | null; onClose: () => void }) {
  const { data, settings, navigate } = useStore()
  if (!a || !data) return <Drawer open={false} onClose={onClose} title="" children={null} />
  const course = data.courses.find((c) => c.id === a.courseId)
  const period = data.periods.find((p) => p.id === a.periodId)
  const p = assignmentPct(a.earned, a.possible)
  let impact: number | null = null
  if (course && (a.status === 'graded' || a.status === 'missing')) {
    const items = assignmentsFor(data, course.id, a.periodId).map(toItem)
    impact = assignmentImpact(items, a.id, engineConfigFor(data, course, a.periodId), engineOptions(settings)).delta
  }
  const rows: Array<[string, ReactNode]> = [
    ['Course', course?.name ?? '—'],
    ['Category', a.category ?? '—'],
    ['Grading period', period?.name ?? '—'],
    ['Assigned', longDate(a.date)],
    ['Due', longDate(a.dueDate)],
    ['Score (StudentVUE)', a.scoreText ?? '—'],
    ['Points (StudentVUE)', a.pointsText ?? '—'],
    ['First seen by GradeKiwi', longDate(a.firstSeen)]
  ]
  return (
    <Drawer
      open
      onClose={onClose}
      title={
        <div>
          <div className="truncate">{a.name}</div>
          <div className="mt-1.5">
            <StatusPill a={a} />
          </div>
        </div>
      }
    >
      <div className="flex items-end justify-between rounded-xl bg-surface-2 p-4">
        <div>
          <div className="text-xs text-ink-3">Score</div>
          <div className="mt-0.5 font-display text-[26px] font-semibold tracking-tight tnum">{scoreLabel(a)}</div>
          <div className="text-[12.5px] text-ink-2 tnum">{pct(p)}</div>
        </div>
        <GradeBadge letter={letterFor(p, settings.scale)} size="lg" />
      </div>
      {impact != null && (
        <div className="mt-3 rounded-xl border border-line p-4 text-[12.5px]">
          <div className="text-ink-3">Effect on course grade</div>
          <div className="mt-1 flex items-baseline gap-2">
            <Delta value={impact} className="text-[18px]" suffix=" pts" />
            <span className="text-ink-3">compared with this assignment not counting</span>
          </div>
        </div>
      )}
      {a.status === 'missing' && (
        <div className="mt-3 rounded-xl p-3 text-[12.5px]" style={{ background: 'var(--grade-f-soft)', color: 'var(--grade-f-text)' }}>
          StudentVUE marks this assignment as missing{a.earned != null ? ' and it is counted as recorded' : '. It has no score and is not counted unless you turn on “count missing as zero” in Settings'}.
        </div>
      )}
      <dl className="mt-4 divide-y divide-line text-[12.5px]">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4 py-2">
            <dt className="text-ink-3">{k}</dt>
            <dd className="text-right text-ink">{v}</dd>
          </div>
        ))}
      </dl>
      {a.notes && (
        <div className="mt-4">
          <div className="mb-1 text-xs font-medium text-ink-2">Teacher notes</div>
          <p className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-ink">{a.notes}</p>
        </div>
      )}
      {a.description && (
        <div className="mt-4">
          <div className="mb-1 text-xs font-medium text-ink-2">Description</div>
          <p className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-ink">{a.description}</p>
        </div>
      )}
      <button onClick={() => navigate({ page: 'hypotheticals' })} className="mt-6 text-[12.5px] font-medium text-accent-text hover:underline">
        Try a different score in Hypotheticals →
      </button>
    </Drawer>
  )
}
