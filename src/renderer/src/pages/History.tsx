import { useMemo, useState } from 'react'
import { ArrowRight, GitCompareArrows, History as HistoryIcon } from 'lucide-react'
import type { Snapshot } from '@shared/types'
import { MultiLineChart } from '../components/charts'
import { Page, PageHeader } from '../components/Layout'
import { Card, CardHeader, Delta, EmptyState, GradeBadge, Notice, Pill, Select, Stat } from '../components/ui'
import { useStore } from '../hooks/useStore'
import { useThemeColors } from '../hooks/useThemeColors'
import { cx, dateTime, gpa, pct } from '../utils/format'
import { courseColorMap, gradeHistory } from '../utils/series'

/** Latest snapshot per calendar day — the unit used for trends. */
function daily(snaps: Snapshot[]): Snapshot[] {
  return [...new Map(snaps.map((s) => [s.takenAt.slice(0, 10), s])).values()]
}

export default function HistoryPage() {
  const { data, snapshots, settings, periodId } = useStore()
  const colors = useThemeColors()
  const [hidden, setHidden] = useState<Set<number>>(new Set())
  const [aId, setAId] = useState<number | null>(null)
  const [bId, setBId] = useState<number | null>(null)

  const colorMap = useMemo(() => (data ? courseColorMap(data, colors.series) : new Map<number, string>()), [data, colors.series])
  const history = useMemo(() => (data ? gradeHistory(data, snapshots, periodId, settings) : null), [data, snapshots, periodId, settings])
  const days = useMemo(() => daily(snapshots), [snapshots])
  const periodName = data?.periods.find((p) => p.id === periodId)?.name ?? null

  const completion = useMemo(
    () =>
      days.map((s) => {
        const cs = s.courses
        return { date: s.takenAt.slice(0, 10), graded: cs.reduce((a, c) => a + c.graded, 0), missing: cs.reduce((a, c) => a + c.missing, 0) }
      }),
    [days, periodName]
  )

  const A = snapshots.find((s) => s.id === (aId ?? snapshots[0]?.id)) ?? null
  const B = snapshots.find((s) => s.id === (bId ?? snapshots.at(-1)?.id)) ?? null
  const compareRows = useMemo(() => {
    if (!A || !B) return []
    const keys = [...new Set([...A.courses.map((c) => c.courseKey), ...B.courses.map((c) => c.courseKey)])]
    return keys.map((k) => {
      const a = A.courses.find((c) => c.courseKey === k)
      const b = B.courses.find((c) => c.courseKey === k)
      return { key: k, name: (b ?? a)!.courseName, a, b, delta: a?.percent != null && b?.percent != null ? b.percent - a.percent : null }
    })
  }, [A, B])

  if (!data) return null
  const series = (history?.series ?? []).filter((s) => !hidden.has(s.courseId)).map((s) => ({ ...s, color: colorMap.get(s.courseId)! }))
  const first = snapshots[0]
  const last = snapshots.at(-1)

  return (
    <>
      <PageHeader title="History" subtitle="Every successful sync saves a snapshot of your grades" period />
      <Page>
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <Stat label="Snapshots" icon={<HistoryIcon size={13} />} value={snapshots.length} sub={`${days.length} day${days.length === 1 ? '' : 's'}`} />
          <Stat label="First recorded" value={<span className="text-[18px]">{first ? dateTime(first.takenAt) : '—'}</span>} />
          <Stat label="GPA then → now" value={<span className="flex items-baseline gap-2 text-[22px]">{gpa(first?.gpaWeighted)}<ArrowRight size={14} className="self-center text-ink-3" />{gpa(last?.gpaWeighted)}</span>} sub="Weighted" />
          <Stat label="Change" value={<Delta value={first?.gpaWeighted != null && last?.gpaWeighted != null ? last.gpaWeighted - first.gpaWeighted : null} digits={2} />} sub="Weighted GPA since first snapshot" />
        </div>

        <Card className="mt-4">
          <CardHeader
            title="Course grades over time"
            subtitle={history?.source === 'snapshots' ? 'From saved snapshots' : 'Reconstructed from assignment dates. Saved snapshots take over after 3 days of syncing.'}
            action={history?.source === 'reconstructed' ? <Pill>Reconstructed</Pill> : undefined}
          />
          <div className="mb-3 flex flex-wrap gap-1.5">
            {data.courses.map((c) => {
              const off = hidden.has(c.id)
              return (
                <button
                  key={c.id}
                  onClick={() => {
                    const n = new Set(hidden)
                    if (off) n.delete(c.id)
                    else n.add(c.id)
                    setHidden(n)
                  }}
                  aria-pressed={!off}
                  className={cx('flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] transition-opacity', off ? 'border-line text-ink-3 opacity-60' : 'border-line-strong text-ink-2')}
                >
                  <span className="h-2 w-2 rounded-full" style={{ background: off ? 'var(--text-3)' : colorMap.get(c.id) }} />
                  {c.name}
                </button>
              )
            })}
          </div>
          {history && history.rows.length > 1 && series.length ? (
            <MultiLineChart rows={history.rows} series={series} height={300} />
          ) : (
            <EmptyState icon={<HistoryIcon size={18} />} title="Not enough history yet" body="Sync over a few days to build your history." />
          )}
        </Card>

        <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader title="GPA changes" subtitle="Latest snapshot per day" />
            {days.length >= 2 ? (
              <MultiLineChart
                rows={days.map((s) => ({ date: s.takenAt.slice(0, 10), uw: s.gpaUnweighted, w: s.gpaWeighted }))}
                series={[
                  { key: 'uw', name: 'Unweighted', color: colors['series-1'] },
                  { key: 'w', name: 'Weighted', color: colors['series-2'] }
                ]}
                yFormat={(v) => v.toFixed(1)}
                height={220}
              />
            ) : (
              <EmptyState icon={<HistoryIcon size={18} />} title="One day recorded so far" body="GPA changes appear after syncs on two different days." />
            )}
          </Card>
          <Card>
            <CardHeader title="Assignment completion" subtitle="Graded and missing assignments across all courses" />
            {completion.length >= 2 ? (
              <MultiLineChart
                rows={completion}
                series={[
                  { key: 'graded', name: 'Graded', color: colors['series-1'] },
                  { key: 'missing', name: 'Missing', color: colors['series-8'] }
                ]}
                yFormat={(v) => String(v)}
                yDomain={[0, 'auto']}
                height={220}
              />
            ) : (
              <EmptyState icon={<HistoryIcon size={18} />} title="One day recorded so far" body="Completion trends appear after syncs on two different days." />
            )}
          </Card>
        </div>

        <Card className="mt-4" padded={false}>
          <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
            <GitCompareArrows size={15} className="text-ink-3" />
            <span className="text-[13px] font-semibold">Compare two dates</span>
            <div className="flex-1" />
            <Select value={A?.id ?? ''} onChange={(e) => setAId(Number(e.target.value))} className="w-52" aria-label="From snapshot">
              {snapshots.map((s) => (
                <option key={s.id} value={s.id}>
                  {dateTime(s.takenAt)}
                </option>
              ))}
            </Select>
            <ArrowRight size={14} className="text-ink-3" />
            <Select value={B?.id ?? ''} onChange={(e) => setBId(Number(e.target.value))} className="w-52" aria-label="To snapshot">
              {snapshots.map((s) => (
                <option key={s.id} value={s.id}>
                  {dateTime(s.takenAt)}
                </option>
              ))}
            </Select>
          </div>
          {snapshots.length < 2 ? (
            <div className="p-4">
              <Notice>You need at least two snapshots to compare. Each sync or import adds one.</Notice>
            </div>
          ) : (
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="border-b border-line text-[11px] text-ink-3">
                  <th className="px-3 py-2 pl-4 text-left font-medium">Course</th>
                  <th className="px-3 py-2 text-right font-medium">{A && dateTime(A.takenAt)}</th>
                  <th className="px-3 py-2 text-right font-medium">{B && dateTime(B.takenAt)}</th>
                  <th className="px-3 py-2 text-right font-medium">Change</th>
                  <th className="px-3 py-2 pr-4 text-right font-medium">Graded</th>
                </tr>
              </thead>
              <tbody>
                {compareRows.map((r) => (
                  <tr key={r.key} className="border-b border-line last:border-0">
                    <td className="px-3 py-2 pl-4 font-medium">
                      {r.name}
                      <span className="ml-2 text-[11px] font-normal text-ink-3">{r.b?.periodName ?? r.a?.periodName}</span>
                    </td>
                    <td className="px-3 py-2 text-right tnum">
                      <span className="inline-flex items-center gap-2">
                        {pct(r.a?.percent)} <GradeBadge letter={r.a?.letter} size="sm" />
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tnum">
                      <span className="inline-flex items-center gap-2">
                        {pct(r.b?.percent)} <GradeBadge letter={r.b?.letter} size="sm" />
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Delta value={r.delta} digits={2} />
                    </td>
                    <td className="px-3 py-2 pr-4 text-right text-ink-2 tnum">
                      {r.a?.graded ?? '—'} → {r.b?.graded ?? '—'}
                    </td>
                  </tr>
                ))}
                <tr className="bg-surface-2 font-medium">
                  <td className="px-3 py-2 pl-4">Weighted GPA</td>
                  <td className="px-3 py-2 text-right tnum">{gpa(A?.gpaWeighted)}</td>
                  <td className="px-3 py-2 text-right tnum">{gpa(B?.gpaWeighted)}</td>
                  <td className="px-3 py-2 text-right">
                    <Delta value={A?.gpaWeighted != null && B?.gpaWeighted != null ? B.gpaWeighted - A.gpaWeighted : null} digits={2} />
                  </td>
                  <td />
                </tr>
              </tbody>
            </table>
          )}
        </Card>
      </Page>
    </>
  )
}
