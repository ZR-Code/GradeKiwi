import { useMemo, useState } from 'react'
import { AlertCircle, CalendarClock, ClipboardList, Search } from 'lucide-react'
import type { Assignment } from '@shared/types'
import { isUpcoming } from '@shared/grading/model'
import { letterFor } from '@shared/grading/scale'
import { AssignmentDrawer, rowTone, SortHeader, StatusPill, type SortDir } from '../components/AssignmentParts'
import { Page, PageHeader, SyncErrorBanner } from '../components/Layout'
import { Card, EmptyState, GradeBadge, Input, Segmented, Select, Stat } from '../components/ui'
import { useStore } from '../hooks/useStore'
import { assignmentPct, cx, daysUntil, num, shortDate } from '../utils/format'

type SortKey = 'date' | 'course' | 'category' | 'grade' | 'name'
type Focus = 'all' | 'missing' | 'upcoming' | 'graded'

export default function Assignments() {
  const { data, settings, periodId } = useStore()
  const [q, setQ] = useState('')
  const [focus, setFocus] = useState<Focus>('all')
  const [courseId, setCourseId] = useState('')
  const [category, setCategory] = useState('')
  const [sort, setSort] = useState<SortKey>('date')
  const [dir, setDir] = useState<SortDir>('desc')
  const [selected, setSelected] = useState<Assignment | null>(null)

  const courseName = useMemo(() => new Map(data?.courses.map((c) => [c.id, c.name]) ?? []), [data])
  const inPeriod = useMemo(() => (data?.assignments ?? []).filter((a) => periodId == null || a.periodId === periodId), [data, periodId])
  const categories = useMemo(() => [...new Set(inPeriod.map((a) => a.category).filter((c): c is string => !!c))].sort(), [inPeriod])

  const rows = useMemo(() => {
    const ql = q.trim().toLowerCase()
    const list = inPeriod.filter(
      (a) =>
        (!ql || a.name.toLowerCase().includes(ql) || (courseName.get(a.courseId) ?? '').toLowerCase().includes(ql)) &&
        (!courseId || a.courseId === Number(courseId)) &&
        (!category || a.category === category) &&
        (focus === 'all' || (focus === 'missing' ? a.status === 'missing' : focus === 'upcoming' ? isUpcoming(a) : a.status === 'graded'))
    )
    const val = (a: Assignment): string | number => {
      switch (sort) {
        case 'date':
          return a.dueDate ?? a.date ?? ''
        case 'course':
          return (courseName.get(a.courseId) ?? '').toLowerCase()
        case 'category':
          return (a.category ?? '').toLowerCase()
        case 'grade':
          return assignmentPct(a.earned, a.possible) ?? -1
        case 'name':
          return a.name.toLowerCase()
      }
    }
    return [...list].sort((x, y) => {
      const a = val(x)
      const b = val(y)
      const c = a < b ? -1 : a > b ? 1 : 0
      return dir === 'asc' ? c : -c
    })
  }, [inPeriod, q, courseId, category, focus, sort, dir, courseName])

  const missing = inPeriod.filter((a) => a.status === 'missing').length
  const upcoming = inPeriod.filter((a) => isUpcoming(a))
  const soon = upcoming.filter((a) => (daysUntil(a.dueDate ?? a.date) ?? 99) <= 3).length
  const completed = inPeriod.filter((a) => a.status === 'graded').length

  const onSort = (k: SortKey) => {
    if (k === sort) setDir(dir === 'asc' ? 'desc' : 'asc')
    else {
      setSort(k)
      setDir(k === 'date' || k === 'grade' ? 'desc' : 'asc')
    }
  }

  return (
    <>
      <PageHeader title="Assignments" subtitle="Every assignment across your courses" period />
      <Page>
        <SyncErrorBanner />
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <Stat label="Total" value={inPeriod.length} sub="This grading period" />
          <Stat label="Completed" value={completed} sub={inPeriod.length ? `${Math.round((completed / inPeriod.length) * 100)}% graded` : '—'} />
          <Stat label="Missing" icon={<AlertCircle size={13} />} value={missing} tone={missing ? 'var(--grade-f-text)' : undefined} />
          <Stat label="Upcoming" icon={<CalendarClock size={13} />} value={upcoming.length} sub={`${soon} due within 3 days`} />
        </div>

        <Card className="mt-4" padded={false}>
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
            <Segmented
              value={focus}
              onChange={setFocus}
              options={[
                { value: 'all', label: 'All' },
                { value: 'missing', label: `Missing${missing ? ` · ${missing}` : ''}` },
                { value: 'upcoming', label: 'Upcoming' },
                { value: 'graded', label: 'Graded' }
              ]}
            />
            <div className="relative w-56">
              <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className="w-full pl-8" />
            </div>
            <Select value={courseId} onChange={(e) => setCourseId(e.target.value)} className="w-48" aria-label="Course">
              <option value="">All courses</option>
              {data?.courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            <Select value={category} onChange={(e) => setCategory(e.target.value)} className="w-40" aria-label="Category">
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </div>
          {rows.length === 0 ? (
            <EmptyState
              icon={<ClipboardList size={18} />}
              title={focus === 'missing' ? 'Nothing missing' : focus === 'upcoming' ? 'Nothing upcoming' : 'No assignments match'}
              body={focus === 'missing' ? 'You are all caught up for this grading period.' : 'Try another filter or grading period.'}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[12.5px]">
                <thead className="border-b border-line">
                  <tr>
                    <SortHeader k="name" sort={sort} dir={dir} onSort={onSort} className="pl-4">
                      Assignment
                    </SortHeader>
                    <SortHeader k="course" sort={sort} dir={dir} onSort={onSort}>
                      Course
                    </SortHeader>
                    <SortHeader k="date" sort={sort} dir={dir} onSort={onSort}>
                      Due
                    </SortHeader>
                    <SortHeader k="category" sort={sort} dir={dir} onSort={onSort}>
                      Category
                    </SortHeader>
                    <th className="px-3 py-2 text-left text-[11px] font-medium text-ink-3">Status</th>
                    <SortHeader k="grade" sort={sort} dir={dir} onSort={onSort} className="pr-4 text-right">
                      Grade
                    </SortHeader>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((a) => {
                    const p = assignmentPct(a.earned, a.possible)
                    const d = daysUntil(a.dueDate ?? a.date)
                    const urgent = isUpcoming(a) && d != null && d <= 3
                    return (
                      <tr key={a.id} onClick={() => setSelected(a)} className={cx('cursor-pointer border-b border-line transition-colors last:border-0', rowTone(a))}>
                        <td className="max-w-[300px] truncate px-3 py-2.5 pl-4 font-medium" title={a.name}>
                          {a.name}
                        </td>
                        <td className="max-w-[200px] truncate px-3 py-2.5 text-ink-2">{courseName.get(a.courseId)}</td>
                        <td className={cx('whitespace-nowrap px-3 py-2.5 tnum', urgent ? 'font-semibold text-accent-text' : 'text-ink-2')}>{shortDate(a.dueDate ?? a.date)}</td>
                        <td className="px-3 py-2.5 text-ink-2">{a.category ?? '—'}</td>
                        <td className="px-3 py-2.5">
                          <StatusPill a={a} />
                        </td>
                        <td className="px-3 py-2.5 pr-4 text-right tnum">
                          {p != null ? (
                            <span className="inline-flex items-center gap-2">
                              <span className="text-ink-3">
                                {num(a.earned)}/{num(a.possible)}
                              </span>
                              {p.toFixed(1)}%
                              <GradeBadge letter={letterFor(p, settings.scale)} size="sm" />
                            </span>
                          ) : (
                            <span className="text-ink-3">{a.possible != null ? `${num(a.possible)} pts` : '—'}</span>
                          )}
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
    </>
  )
}
