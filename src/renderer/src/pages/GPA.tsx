import { useMemo, useState } from 'react'
import { FlaskConical, GraduationCap } from 'lucide-react'
import type { CourseLevel } from '@shared/types'
import { computeGrade } from '@shared/grading/engine'
import { applyHypotheticals, assignmentsFor, detectedCredits, effectiveLevel, engineConfigFor, engineOptions, gpaFromSummaries, toItem, type CourseSummary } from '@shared/grading/model'
import { cumulativeBreakdown, LEVEL_LABELS, letterFor, pointsForLetter, sortedScale } from '@shared/grading/scale'
import { Counter } from '../components/Counter'
import { Page, PageHeader } from '../components/Layout'
import { PastYearsCard } from '../components/PastYears'
import { Card, CardHeader, Delta, GradeBadge, Notice, Pill, Select, Stat, Toggle } from '../components/ui'
import { useStore } from '../hooks/useStore'
import { api, errorMessage } from '../services/api'
import { cx, gpa, pct } from '../utils/format'

const fmtCredits = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1))

export default function GPA() {
  const { data, summaries, settings, activeHypos, refresh, toast, navigate, periodId } = useStore()
  const [whatIf, setWhatIf] = useState<Record<number, string>>({})
  const [includeCurrent, setIncludeCurrent] = useState(true)

  // Rolling gradebooks: `summaries` holds one year-to-date grade per course (ended semester courses keep
  // their final grade), so this year's GPA is simply those letters weighted by credits.
  const current = useMemo(() => gpaFromSummaries(summaries, settings), [summaries, settings])

  // Projected letters: manual what-if > enabled hypotheticals (applied at the course's own checkpoint) > actual.
  const hypoLetter = useMemo(() => {
    const m = new Map<number, string | null>()
    if (!data) return m
    for (const s of summaries) {
      const hs = activeHypos.filter((h) => h.courseId === s.course.id && (h.periodId ?? data.currentPeriodId) === s.periodId)
      if (!hs.length) continue
      const cfg = engineConfigFor(data, s.course, s.periodId)
      const items = assignmentsFor(data, s.course.id, s.periodId).map(toItem)
      m.set(s.course.id, letterFor(computeGrade(applyHypotheticals(items, hs), cfg, engineOptions(settings)).percent, settings.scale))
    }
    return m
  }, [data, summaries, activeHypos, settings])

  const projectedLetter = (s: CourseSummary) => whatIf[s.course.id] || (hypoLetter.has(s.course.id) ? hypoLetter.get(s.course.id)! : s.letter)
  const projected = useMemo(() => gpaFromSummaries(summaries, settings, projectedLetter), [summaries, settings, whatIf, hypoLetter]) // eslint-disable-line react-hooks/exhaustive-deps
  const anyProjection = Object.values(whatIf).some(Boolean) || hypoLetter.size > 0

  // Cumulative = past years' courses + GPA-only terms + this year's courses, all by credits.
  const thisYear = (g: typeof current) => (includeCurrent ? { unweighted: g.unweighted, weighted: g.weighted, credits: g.credits } : null)
  const cumulative = useMemo(() => cumulativeBreakdown(settings.pastCourses, settings.pastTerms, thisYear(current), settings), [settings, includeCurrent, current]) // eslint-disable-line react-hooks/exhaustive-deps
  const projectedCumulative = useMemo(() => cumulativeBreakdown(settings.pastCourses, settings.pastTerms, thisYear(projected), settings), [settings, includeCurrent, projected]) // eslint-disable-line react-hooks/exhaustive-deps
  const diff = (a: number | null, b: number | null) => (a != null && b != null ? a - b : null)

  const isLatestView = periodId === data?.currentPeriodId
  const viewedName = data?.periods.find((p) => p.id === periodId)?.name

  const saveCourse = async (courseId: number, patch: Partial<CourseSummary['course']['config']>) => {
    const c = data?.courses.find((x) => x.id === courseId)
    if (!c) return
    try {
      await api.updateCourseConfig(courseId, { ...c.config, ...patch })
      await refresh()
    } catch (e) {
      toast(errorMessage(e), 'error')
    }
  }

  const d = settings.gpaRoundTo

  return (
    <>
      <PageHeader title="GPA" subtitle={`Scale: ${settings.scaleName} · change it in Settings`} period />
      <Page>
        {!isLatestView && viewedName && (
          <div className="mb-4">
            <Notice>Showing GPA as of {viewedName}: each course's grade at that checkpoint. Switch to the current period for today's GPA.</Notice>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <Stat label="This year · unweighted" icon={<GraduationCap size={13} />} value={gpa(current.unweighted, d)} sub={`${current.counted} courses · ${fmtCredits(current.credits)} credits`} />
          <Stat label="This year · weighted" icon={<GraduationCap size={13} />} value={gpa(current.weighted, d)} sub="With course-level bonuses" />
          <Stat
            label="Projected this year"
            icon={<FlaskConical size={13} />}
            value={
              <span className="flex items-baseline gap-2">
                {gpa(projected.weighted, d)}
                {anyProjection && <Delta value={diff(projected.weighted, current.weighted)} digits={d} className="text-[13px]" />}
              </span>
            }
            sub={anyProjection ? `Weighted · unweighted ${gpa(projected.unweighted, d)}` : 'Set what-if letters or enable hypotheticals'}
          />
          <Stat
            label="Cumulative"
            icon={<GraduationCap size={13} />}
            value={
              <span className="flex items-baseline gap-2">
                {gpa(cumulative.total.unweighted, d)}
                {anyProjection && <Delta value={diff(projectedCumulative.total.unweighted, cumulative.total.unweighted)} digits={d} className="text-[13px]" />}
              </span>
            }
            sub={
              anyProjection ? (
                <span>
                  Projected <span className="font-medium text-ink-2">{gpa(projectedCumulative.total.unweighted, d)}</span> · weighted{' '}
                  <span className="font-medium text-ink-2">{gpa(projectedCumulative.total.weighted, d)}</span>
                </span>
              ) : cumulative.hasPastData ? (
                `Unweighted · ${fmtCredits(cumulative.total.credits)} credits, all years`
              ) : (
                <span style={{ color: 'var(--grade-c-text)' }}>This year only · add past years below</span>
              )
            }
          />
        </div>

        <Card className="mt-4" padded={false}>
          <div className="border-b border-line px-4 py-3">
            <div className="text-[13px] font-semibold">This year's courses</div>
            <div className="text-[11.5px] text-ink-3">
              Each course counts once with its current year-to-date grade. Semester courses count half a credit and keep their final grade after they end. What-if letters are temporary.
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="border-b border-line text-[11px] text-ink-3">
                  <th className="px-3 py-2 pl-4 text-left font-medium">Course</th>
                  <th className="px-3 py-2 text-right font-medium">Grade</th>
                  <th className="px-3 py-2 text-left font-medium">Letter</th>
                  <th className="px-3 py-2 text-left font-medium">Level</th>
                  <th className="px-3 py-2 text-left font-medium">Length · credits</th>
                  <th className="whitespace-nowrap px-3 py-2 text-right font-medium">Points (UW / W)</th>
                  <th className="px-3 py-2 text-left font-medium">What-if</th>
                  <th className="px-3 py-2 pr-4 text-center font-medium">In GPA</th>
                </tr>
              </thead>
              <tbody>
                {summaries.map((s) => {
                  const lvl = effectiveLevel(s.course)
                  const pts = pointsForLetter(s.letter, settings.scale)
                  const bonus = lvl === 'custom' ? (s.course.config.customBonus ?? 0) : settings.levelBonus[lvl]
                  const wpts = pts == null ? null : pts + (settings.bonusOnlyIfPassing && pts <= 0 ? 0 : bonus)
                  const hl = hypoLetter.get(s.course.id)
                  const ended = data && s.periodId != null && periodId != null && s.periodId !== periodId
                  const auto = data ? detectedCredits(data, s.course.id) : 1
                  const creditValue = s.course.config.credits == null ? 'auto' : String(s.course.config.credits)
                  return (
                    <tr key={s.course.id} className={cx('border-b border-line transition-opacity last:border-0', s.course.config.excludeFromGpa && 'opacity-50')}>
                      <td className="max-w-[260px] px-3 py-2 pl-4 font-medium">
                        <div className="flex items-center gap-2">
                          <button className="truncate hover:underline" onClick={() => navigate({ page: 'course', id: s.course.id })}>
                            {s.course.name}
                          </button>
                          {ended && <Pill>Final · {data!.periods.find((p) => p.id === s.periodId)?.name}</Pill>}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right tnum">{pct(s.percent)}</td>
                      <td className="px-3 py-2">
                        <GradeBadge letter={s.letter} size="sm" />
                      </td>
                      <td className="px-3 py-2">
                        <Select value={lvl} onChange={(e) => void saveCourse(s.course.id, { level: e.target.value as CourseLevel })} className="w-44" aria-label="Course level">
                          {(Object.keys(LEVEL_LABELS) as CourseLevel[]).map((l) => (
                            <option key={l} value={l}>
                              {LEVEL_LABELS[l]}
                              {l !== 'custom' ? ` +${settings.levelBonus[l]}` : ''}
                              {l === s.course.detectedLevel && s.course.config.level == null ? ' · auto' : ''}
                            </option>
                          ))}
                        </Select>
                      </td>
                      <td className="px-3 py-2">
                        <Select
                          value={creditValue}
                          onChange={(e) => void saveCourse(s.course.id, { credits: e.target.value === 'auto' ? null : Number(e.target.value) })}
                          className="w-44"
                          aria-label="Course length and credits"
                        >
                          <option value="auto">Auto · {auto === 0.5 ? 'semester 0.5' : 'full year 1'}</option>
                          <option value="1">Full year · 1</option>
                          <option value="0.5">Semester · 0.5</option>
                          <option value="0">No credit · 0</option>
                          {!['auto', '1', '0.5', '0'].includes(creditValue) && <option value={creditValue}>Custom · {creditValue}</option>}
                        </Select>
                      </td>
                      <td className="px-3 py-2 text-right text-ink-2 tnum">{pts == null ? '—' : `${pts.toFixed(1)} / ${wpts!.toFixed(1)}`}</td>
                      <td className="px-3 py-2">
                        <Select value={whatIf[s.course.id] ?? ''} onChange={(e) => setWhatIf({ ...whatIf, [s.course.id]: e.target.value })} className="w-24" aria-label="What-if letter">
                          <option value="">{hl ? `${hl}*` : '—'}</option>
                          {sortedScale(settings.scale).map((st) => (
                            <option key={st.letter} value={st.letter}>
                              {st.letter}
                            </option>
                          ))}
                        </Select>
                      </td>
                      <td className="px-3 py-2 pr-4 text-center">
                        <Toggle checked={!s.course.config.excludeFromGpa} onChange={(v) => void saveCourse(s.course.id, { excludeFromGpa: !v })} label={`Include ${s.course.name} in GPA`} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="border-t border-line px-4 py-2.5 text-[11.5px] text-ink-3">
            “Auto” counts a course as a half-credit semester course once its grades are confined to one semester. Mid-way through semester 1 that can't be told yet, so set semester courses yourself.
            {hypoLetter.size > 0 && ' * Letter projected from your enabled hypothetical scenarios.'}
          </div>
        </Card>

        <Card className="mt-4">
          <CardHeader title="Cumulative GPA" subtitle="Every course you've taken, weighted by credits" />
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-ink-3">Unweighted</div>
                  <div className="text-[28px] font-semibold tracking-tight tnum">{gpa(cumulative.total.unweighted, d)}</div>
                </div>
                <div>
                  <div className="text-xs text-ink-3">Weighted</div>
                  <div className="text-[28px] font-semibold tracking-tight tnum">{gpa(cumulative.total.weighted, d)}</div>
                </div>
              </div>
              {anyProjection && (
                <div className="animate-row-in mt-4 rounded-xl bg-accent-soft px-4 py-3">
                  <div className="flex items-center gap-1.5 text-[11.5px] font-medium text-accent-text">
                    <FlaskConical size={12} /> Projected cumulative
                  </div>
                  <div className="mt-1.5 grid grid-cols-2 gap-4">
                    {(['unweighted', 'weighted'] as const).map((k) => (
                      <div key={k}>
                        <div className="text-[11px] capitalize text-ink-3">{k}</div>
                        <div className="flex items-baseline gap-2">
                          <span className="text-[22px] font-semibold tracking-tight">
                            <Counter value={projectedCumulative.total[k]} format={(n) => n.toFixed(d)} />
                          </span>
                          <Delta value={diff(projectedCumulative.total[k], cumulative.total[k])} digits={d} className="text-[12px]" />
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-1.5 text-[11px] leading-snug text-ink-3">All past years plus this year's courses, using your what-if letters and enabled hypotheticals.</div>
                </div>
              )}
            </div>
            <div>
              <dl className="divide-y divide-line text-[12.5px]">
                <div className="flex items-center justify-between py-2">
                  <dt className="text-ink-2">
                    Past years <span className="text-ink-3">({cumulative.past.years} year{cumulative.past.years === 1 ? '' : 's'}, {fmtCredits(cumulative.past.credits)} credits)</span>
                  </dt>
                  <dd className="text-ink-2 tnum">
                    {gpa(cumulative.past.unweighted, d)} / {gpa(cumulative.past.weighted, d)}
                  </dd>
                </div>
                {cumulative.summaryTerms.credits > 0 && (
                  <div className="flex items-center justify-between py-2">
                    <dt className="text-ink-2">
                      GPA-only entries <span className="text-ink-3">({fmtCredits(cumulative.summaryTerms.credits)} credits)</span>
                    </dt>
                    <dd className="text-ink-2 tnum">
                      {gpa(cumulative.summaryTerms.unweighted, d)} / {gpa(cumulative.summaryTerms.weighted, d)}
                    </dd>
                  </div>
                )}
                <div className="flex items-center justify-between py-2">
                  <dt className="flex items-center gap-2 text-ink-2">
                    <Toggle checked={includeCurrent} onChange={setIncludeCurrent} label="Include this year" />
                    This year so far <span className="text-ink-3">({fmtCredits(current.credits)} credits)</span>
                  </dt>
                  <dd className="text-ink-2 tnum">
                    {gpa(current.unweighted, d)} / {gpa(current.weighted, d)}
                    {anyProjection && (
                      <span className="ml-1.5 font-medium text-accent-text">
                        → {gpa(projected.unweighted, d)} / {gpa(projected.weighted, d)}
                      </span>
                    )}
                  </dd>
                </div>
              </dl>
              <div className="mt-2 text-[11px] text-ink-3">Shown as unweighted / weighted.</div>
              {!cumulative.hasPastData && (
                <div className="mt-3">
                  <Notice tone="warn">With no past years entered, this is the same as this year's GPA. Add earlier years below to make it truly cumulative.</Notice>
                </div>
              )}
            </div>
          </div>
        </Card>

        <PastYearsCard />
      </Page>
    </>
  )
}
