import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, ChevronDown, Copy, FlaskConical, Pencil, Plus, Repeat, Sparkles, Target, Trash2, Wand2, X } from 'lucide-react'
import type { AppData, Course, Hypothetical, Scenario, Settings } from '@shared/types'
import { computeGrade, normCat, solveNeededScore, type GradeResult } from '@shared/grading/engine'
import { applyHypotheticals, assignmentsFor, engineConfigFor, engineOptions, gpaFromSummaries, isUpcoming, toItem } from '@shared/grading/model'
import { letterFor, sortedScale } from '@shared/grading/scale'
import { Counter } from '../components/Counter'
import { Page, PageHeader } from '../components/Layout'
import { Button, Card, Delta, EmptyState, Field, GradeBadge, IconButton, Input, Modal, Notice, NumberInput, Pill, Select, Toggle } from '../components/ui'
import { useStore } from '../hooks/useStore'
import { api, errorMessage } from '../services/api'
import { cx, gpa, num, pct } from '../utils/format'

type Draft = Hypothetical

interface Projection {
  course: Course
  periodId: number | null
  orig: GradeResult
  proj: GradeResult
  reported: number | null
  unweightedCats: string[]
}

/** Highest-weighted category (or the first one used) — a sensible default for a new hypothetical. */
function defaultCategory(data: AppData, course: Course, periodId: number | null): string | null {
  const cfg = engineConfigFor(data, course, periodId)
  return Object.entries(cfg.weights).sort((a, b) => b[1] - a[1])[0]?.[0] ?? assignmentsFor(data, course.id, periodId)[0]?.category ?? null
}

function project(data: AppData, settings: Settings, course: Course, periodId: number | null, hypos: Hypothetical[]): Projection {
  const items = assignmentsFor(data, course.id, periodId).map(toItem)
  const cfg = engineConfigFor(data, course, periodId)
  const opts = engineOptions(settings)
  const mine = hypos.filter((h) => h.courseId === course.id && (h.periodId ?? data.currentPeriodId) === periodId)
  const weighted = new Set(Object.keys(cfg.weights).map(normCat))
  return {
    course,
    periodId,
    orig: computeGrade(items, cfg, opts),
    proj: computeGrade(applyHypotheticals(items, mine), cfg, opts),
    reported: data.marks.find((m) => m.courseId === course.id && m.periodId === periodId)?.percent ?? null,
    unweightedCats: cfg.mode === 'weighted' ? [...new Set(mine.filter((h) => h.kind === 'add' && !weighted.has(normCat(h.category))).map((h) => h.category ?? 'Uncategorized'))] : []
  }
}

export default function Hypotheticals() {
  const { data, settings, scenarios, refresh, updateSettings, toast, summaries } = useStore()
  const [selectedId, setSelectedId] = useState<number | null>(scenarios[0]?.id ?? null)
  const [draft, setDraft] = useState<Draft[]>([])
  const [version, setVersion] = useState(0)
  const [renaming, setRenaming] = useState<Scenario | null>(null)
  const [modal, setModal] = useState<null | 'change' | 'bulk'>(null)
  const [addCourseIdRaw, setAddCourseId] = useState<number | null>(null)
  const addCourseId = data?.courses.some((c) => c.id === addCourseIdRaw) ? addCourseIdRaw! : (data?.courses[0]?.id ?? 0)
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>())

  const selected = scenarios.find((s) => s.id === selectedId) ?? null

  useEffect(() => {
    if (selectedId == null && scenarios[0]) setSelectedId(scenarios[0].id)
    if (selectedId != null && !scenarios.some((s) => s.id === selectedId)) setSelectedId(scenarios[0]?.id ?? null)
  }, [scenarios, selectedId])

  // Load draft when switching scenarios or after structural changes (add/delete).
  useEffect(() => {
    setDraft(scenarios.find((s) => s.id === selectedId)?.items ?? [])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, version])

  useEffect(() => () => timers.current.forEach((t) => clearTimeout(t)), [])

  // Pick up scenarios changed elsewhere (another page, an import) when the page opens.
  useEffect(() => {
    void refresh().then(() => setVersion((v) => v + 1))
  }, [refresh])

  const reload = useCallback(async () => {
    await refresh()
    setVersion((v) => v + 1)
  }, [refresh])

  const persist = useCallback(
    (h: Draft) => {
      const prev = timers.current.get(h.id)
      if (prev) clearTimeout(prev)
      timers.current.set(
        h.id,
        setTimeout(() => {
          timers.current.delete(h.id)
          api.upsertHypothetical(h).then(() => void refresh(), (e) => toast(errorMessage(e), 'error'))
        }, 450)
      )
    },
    [refresh, toast]
  )

  const update = (id: number, patch: Partial<Draft>) => {
    setDraft((d) =>
      d.map((h) => {
        if (h.id !== id) return h
        const next = { ...h, ...patch }
        if (next.name.trim()) persist(next)
        return next
      })
    )
  }

  const removeItem = async (id: number) => {
    setDraft((d) => d.filter((h) => h.id !== id))
    await api.deleteHypothetical(id)
    await reload()
  }

  const newScenario = async (name = 'New scenario') => {
    const id = await api.createScenario(name)
    await refresh()
    setSelectedId(id)
    setVersion((v) => v + 1)
    return id
  }

  const addItem = async (courseId: number = addCourseId) => {
    if (!data || data.courses.length === 0) return
    const sid = selectedId ?? (await newScenario('My scenario'))
    const course = data.courses.find((c) => c.id === courseId) ?? data.courses[0]!
    setAddCourseId(course.id)
    await api.upsertHypothetical({ scenarioId: sid, courseId: course.id, periodId: data.currentPeriodId, kind: 'add', targetAssignmentId: null, name: 'Hypothetical assignment', category: defaultCategory(data, course, data.currentPeriodId), earned: 100, possible: 100, dueDate: null })
    await reload()
  }

  /** Course picker + Add button, used in the toolbar and empty states. */
  const addControl = (primaryLabel: string) => (
    <div className="flex items-center gap-2">
      <Select value={addCourseId} onChange={(e) => setAddCourseId(Number(e.target.value))} className="w-52" aria-label="Course for the new assignment">
        {data?.courses.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </Select>
      <Button variant="primary" icon={<Plus size={14} />} onClick={() => void addItem()}>
        {primaryLabel}
      </Button>
    </div>
  )

  // Projections for the selected scenario. The global toggle pauses all hypotheticals.
  const active = settings.hypotheticalsEnabled
  const projections = useMemo(() => {
    if (!data) return []
    const keys = new Map<string, { course: Course; periodId: number | null }>()
    for (const h of draft) {
      const course = data.courses.find((c) => c.id === h.courseId)
      if (!course) continue
      const p = h.periodId ?? data.currentPeriodId
      keys.set(`${course.id}:${p}`, { course, periodId: p })
    }
    return [...keys.values()].map(({ course, periodId }) => project(data, settings, course, periodId, active ? draft : []))
  }, [data, settings, draft, active])

  const gpaImpact = useMemo(() => {
    // Only projections at each course's current checkpoint change this year's GPA (rolling gradebooks).
    const relevant = projections.filter((p) => summaries.some((s) => s.course.id === p.course.id && s.periodId === p.periodId))
    if (!relevant.length) return null
    const byCourse = new Map(relevant.map((p) => [p.course.id, p]))
    const before = gpaFromSummaries(summaries, settings, (s) => (byCourse.has(s.course.id) ? letterFor(byCourse.get(s.course.id)!.orig.percent, settings.scale) : s.letter))
    const after = gpaFromSummaries(summaries, settings, (s) => (byCourse.has(s.course.id) ? letterFor(byCourse.get(s.course.id)!.proj.percent, settings.scale) : s.letter))
    return { before, after }
  }, [projections, summaries, settings])

  if (!data) return null
  const grouped = data.courses.map((c) => ({ course: c, items: draft.filter((h) => h.courseId === c.id) })).filter((g) => g.items.length)

  return (
    <>
      <PageHeader
        title="Hypotheticals"
        subtitle="Try scores before they happen. Your real StudentVUE grades are never changed."
        actions={
          <>
            <label className="flex items-center gap-2 text-[12.5px] text-ink-2">
              Apply hypotheticals
              <Toggle checked={settings.hypotheticalsEnabled} onChange={(v) => void updateSettings({ hypotheticalsEnabled: v })} label="Apply hypotheticals" />
            </label>
            <Button icon={<Plus size={14} />} onClick={() => void newScenario()}>
              New scenario
            </Button>
          </>
        }
      />
      <Page>
        {!settings.hypotheticalsEnabled && (
          <div className="mb-4">
            <Notice tone="warn">All hypotheticals are turned off, so projections match your real grades. Turn on “Apply hypotheticals” to see their effect.</Notice>
          </div>
        )}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[240px_1fr]">
          {/* Scenario list */}
          <div>
            <div className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">Scenarios</div>
            {scenarios.length === 0 ? (
              <div className="rounded-xl border border-dashed border-line-strong p-4 text-[12.5px] text-ink-3">No scenarios yet. Create one to start experimenting.</div>
            ) : (
              <div className="space-y-1">
                {scenarios.map((s) => (
                  <div
                    key={s.id}
                    onClick={() => setSelectedId(s.id)}
                    className={cx('group flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 transition-colors', s.id === selectedId ? 'bg-surface shadow-card ring-1 ring-line' : 'hover:bg-surface-3/60')}
                  >
                    <div className="min-w-0 flex-1">
                      <div className={cx('truncate text-[13px]', s.id === selectedId ? 'font-semibold' : 'font-medium text-ink-2')}>{s.name}</div>
                      <div className="text-[11px] text-ink-3">
                        {s.items.length} item{s.items.length === 1 ? '' : 's'}
                        {!s.enabled && ' · off'}
                      </div>
                    </div>
                    <div onClick={(e) => e.stopPropagation()}>
                      <Toggle
                        checked={s.enabled}
                        label={`Enable ${s.name}`}
                        onChange={async (v) => {
                          await api.setScenarioEnabled(s.id, v)
                          await refresh()
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-4 rounded-xl bg-surface-2 p-3 text-[11.5px] leading-relaxed text-ink-3">
              Enabled scenarios also feed the GPA page's projected GPA. This page shows the selected scenario on its own.
            </div>
          </div>

          {/* Selected scenario */}
          <div className="min-w-0">
            {!selected ? (
              <Card>
                <EmptyState
                  icon={<FlaskConical size={18} />}
                  title="Create your first scenario"
                  body="Scenarios hold hypothetical assignments, like “95 on the Unit 5 test” or “miss next week's homework”."
                  action={addControl('Add a hypothetical assignment')}
                />
              </Card>
            ) : (
              <>
                <div className="mb-4 flex flex-wrap items-center gap-2">
                  <h2 className="mr-1 text-[17px] font-semibold tracking-tight">{selected.name}</h2>
                  {!selected.enabled && <Pill>Off</Pill>}
                  <IconButton label="Rename scenario" onClick={() => setRenaming(selected)}>
                    <Pencil size={14} />
                  </IconButton>
                  <IconButton
                    label="Duplicate scenario"
                    onClick={async () => {
                      const id = await api.duplicateScenario(selected.id)
                      await refresh()
                      setSelectedId(id)
                      setVersion((v) => v + 1)
                      toast('Scenario duplicated', 'ok')
                    }}
                  >
                    <Copy size={14} />
                  </IconButton>
                  <IconButton
                    label="Delete scenario"
                    onClick={async () => {
                      if (!window.confirm(`Delete “${selected.name}” and its ${selected.items.length} hypothetical item(s)?`)) return
                      await api.deleteScenario(selected.id)
                      await reload()
                    }}
                  >
                    <Trash2 size={14} />
                  </IconButton>
                  <div className="flex-1" />
                  <Button icon={<Repeat size={14} />} onClick={() => setModal('change')}>
                    Change a real score
                  </Button>
                  <Button icon={<Wand2 size={14} />} onClick={() => setModal('bulk')}>
                    Fill remaining work
                  </Button>
                  {addControl('Add assignment')}
                </div>

                {projections.length > 0 && (
                  <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
                    {projections.map((p) => (
                      <ImpactCard key={`${p.course.id}:${p.periodId}`} p={p} periodName={data.periods.find((x) => x.id === p.periodId)?.name} />
                    ))}
                    {gpaImpact && (
                      <Card>
                        <div className="text-xs font-medium text-ink-3">GPA this year</div>
                        <div className="mt-3 grid grid-cols-2 gap-3">
                          {(['unweighted', 'weighted'] as const).map((k) => (
                            <div key={k}>
                              <div className="text-[11px] capitalize text-ink-3">{k}</div>
                              <div className="mt-0.5 flex items-baseline gap-1.5 text-[18px] font-semibold tracking-tight tnum">
                                <span className="text-ink-3">{gpa(gpaImpact.before[k])}</span>
                                <ArrowRight size={13} className="text-ink-3" />
                                <span>{gpa(gpaImpact.after[k])}</span>
                              </div>
                              <Delta value={gpaImpact.after[k] != null && gpaImpact.before[k] != null ? gpaImpact.after[k]! - gpaImpact.before[k]! : null} digits={2} className="text-[12px]" />
                            </div>
                          ))}
                        </div>
                        <div className="mt-3 text-[11px] leading-snug text-ink-3">Affected courses use GradeKiwi-calculated letters before and after, so the change is like-for-like.</div>
                      </Card>
                    )}
                  </div>
                )}

                {grouped.length === 0 ? (
                  <Card>
                    <EmptyState
                      icon={<Sparkles size={18} />}
                      title="This scenario is empty"
                      body="Add a hypothetical assignment, or change the score of a real one to see how your grade would move."
                      action={addControl('Add assignment')}
                    />
                  </Card>
                ) : (
                  <div className="space-y-4">
                    {grouped.map((g) => (
                      <Card key={g.course.id} padded={false}>
                        <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
                          <div className="text-[13px] font-semibold">{g.course.name}</div>
                          <Button size="sm" variant="ghost" icon={<Plus size={12} />} onClick={() => void addItem(g.course.id)}>
                            Add to this course
                          </Button>
                        </div>
                        <div className="divide-y divide-line">
                          {g.items.map((h) => (
                            <ItemRow key={h.id} h={h} allDraft={draft} onChange={(patch) => update(h.id, patch)} onRemove={() => void removeItem(h.id)} />
                          ))}
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </Page>

      <RenameModal scenario={renaming} onClose={() => setRenaming(null)} onDone={reload} />
      {selected && modal === 'change' && <ChangeRealModal scenarioId={selected.id} onClose={() => setModal(null)} onDone={reload} />}
      {selected && modal === 'bulk' && <BulkModal scenarioId={selected.id} onClose={() => setModal(null)} onDone={reload} />}
    </>
  )
}

function ImpactCard({ p, periodName }: { p: Projection; periodName?: string }) {
  const { settings } = useStore()
  const before = p.orig.percent
  const after = p.proj.percent
  const lb = letterFor(before, settings.scale)
  const la = letterFor(after, settings.scale)
  const changedCats = p.proj.categories
    .map((c) => ({ c, o: p.orig.categories.find((x) => normCat(x.name) === normCat(c.name)) }))
    .filter(({ c, o }) => (o?.percent ?? null) !== c.percent && c.percent != null)
  return (
    <Card>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-[13px] font-semibold">{p.course.name}</div>
          <div className="text-[11px] text-ink-3">{periodName}</div>
        </div>
        <div className="flex items-center gap-1.5">
          <GradeBadge letter={lb} size="sm" />
          <ArrowRight size={12} className="text-ink-3" />
          <GradeBadge letter={la} size="sm" />
        </div>
      </div>
      <div className="mt-3 flex items-end justify-between">
        <div>
          <div className="text-[11px] text-ink-3">Original → projected</div>
          <div className="mt-0.5 flex items-baseline gap-1.5 font-display text-[22px] font-semibold tracking-tight tnum">
            <span className="text-ink-3">{pct(before, 2)}</span>
            <ArrowRight size={14} className="self-center text-ink-3" />
            <span><Counter value={after} format={(n) => pct(n, 2)} /></span>
          </div>
        </div>
        <Delta value={before != null && after != null ? after - before : null} digits={2} className="text-[14px]" />
      </div>
      {changedCats.length > 0 && (
        <div className="mt-3 space-y-1 border-t border-line pt-2.5 text-[11.5px]">
          {changedCats.map(({ c, o }) => (
            <div key={c.name} className="flex items-center justify-between gap-2">
              <span className="truncate text-ink-2">{c.name} average</span>
              <span className="tnum text-ink-2">
                {pct(o?.percent ?? null)} → <span className="font-medium text-ink">{pct(c.percent)}</span>
              </span>
            </div>
          ))}
        </div>
      )}
      {p.unweightedCats.length > 0 && (
        <div className="mt-2.5 text-[11.5px]" style={{ color: 'var(--grade-c-text)' }}>
          “{p.unweightedCats.join('”, “')}” has no weight in this course, so it doesn't affect the grade.
        </div>
      )}
      {p.reported != null && before != null && Math.abs(p.reported - before) > 0.15 && <div className="mt-2 text-[11px] text-ink-3">StudentVUE reports {pct(p.reported, 2)}; projections use GradeKiwi's calculation.</div>}
    </Card>
  )
}

function ItemRow({ h, allDraft, onChange, onRemove }: { h: Draft; allDraft: Draft[]; onChange: (p: Partial<Draft>) => void; onRemove: () => void }) {
  const { data, settings, toast } = useStore()
  const [target, setTarget] = useState('')
  if (!data) return null
  const course = data.courses.find((c) => c.id === h.courseId)!
  const periodId = h.periodId ?? data.currentPeriodId
  const cfg = engineConfigFor(data, course, periodId)
  const cats = [...new Set([...Object.keys(cfg.weights), ...assignmentsFor(data, course.id, periodId).map((a) => a.category).filter((c): c is string => !!c)])]
  const target_ = h.kind === 'override' ? data.assignments.find((a) => a.id === h.targetAssignmentId) : null
  const p = h.earned != null && h.possible ? (h.earned / h.possible) * 100 : null

  const solve = () => {
    const step = settings.scale.find((s) => s.letter === target)
    if (!step || !h.possible) return
    const items = applyHypotheticals(
      assignmentsFor(data, course.id, periodId).map(toItem),
      allDraft.filter((x) => x.id !== h.id && x.courseId === h.courseId && (x.periodId ?? data.currentPeriodId) === periodId)
    ).filter((i) => !(h.kind === 'override' && i.id === h.targetAssignmentId))
    const r = solveNeededScore(items, cfg, { category: h.category, possible: h.possible }, step.min, engineOptions(settings), 300)
    if (!r.reachable) {
      toast(`A ${step.letter} (${step.min}%) isn't reachable with this assignment alone. Even ${num(h.possible * 3)} points only gets ${pct(r.maxGrade, 2)}.`, 'error')
      return
    }
    onChange({ earned: Math.ceil((r.needed ?? 0) * 100) / 100 })
  }

  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-3 px-4 py-3 xl:grid-cols-[minmax(160px,1.4fr)_minmax(120px,1fr)_88px_88px_70px_auto_32px]">
      <div className="min-w-0">
        {h.kind === 'override' ? (
          <div className="flex items-center gap-2">
            <Pill tone="accent">Changed</Pill>
            <span className="truncate text-[13px] font-medium" title={target_?.name}>
              {target_?.name ?? h.name}
            </span>
          </div>
        ) : (
          <>
            <Input value={h.name} onChange={(e) => onChange({ name: e.target.value })} className="w-full" aria-label="Assignment name" />
            <label className="relative mt-1 inline-flex max-w-full items-center gap-1 text-[11.5px] text-ink-3 hover:text-ink-2">
              <span className="shrink-0">Course:</span>
              <select
                value={h.courseId}
                onChange={(e) => {
                  const next = data.courses.find((c) => c.id === Number(e.target.value))
                  if (next) onChange({ courseId: next.id, category: defaultCategory(data, next, periodId) })
                }}
                className="no-drag min-w-0 cursor-pointer appearance-none truncate rounded bg-transparent pr-4 font-medium text-ink-2 outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-accent-soft"
                aria-label="Move to course"
              >
                {data.courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <ChevronDown size={11} className="pointer-events-none -ml-4" />
            </label>
          </>
        )}
        {h.kind === 'override' && target_ && (
          <div className="mt-0.5 text-[11px] text-ink-3">
            Real: {target_.earned != null ? `${num(target_.earned)} / ${num(target_.possible)}` : target_.status.replace('_', ' ')}
          </div>
        )}
      </div>
      <div className="hidden xl:block">
        {h.kind === 'override' ? (
          <span className="text-[12.5px] text-ink-2">{h.category ?? '—'}</span>
        ) : (
          <Select value={h.category ?? ''} onChange={(e) => onChange({ category: e.target.value || null })} className="w-full" aria-label="Category">
            {cats.map((c) => (
              <option key={c} value={c}>
                {c}
                {cfg.mode === 'weighted' && cfg.weights[c] != null ? ` (${cfg.weights[c]}%)` : ''}
              </option>
            ))}
            <option value="">Uncategorized</option>
          </Select>
        )}
      </div>
      <NumberInput value={h.earned} onChange={(v) => onChange({ earned: v })} placeholder="Score" className="hidden xl:block" />
      <NumberInput value={h.possible} onChange={(v) => onChange({ possible: v == null ? null : Math.max(0, v) })} placeholder="Out of" className="hidden xl:block" />
      <div className="hidden text-right text-[12.5px] font-medium tnum xl:block">{p != null ? `${p.toFixed(1)}%` : '—'}</div>
      <div className="hidden items-center gap-1 xl:flex">
        <Select value={target} onChange={(e) => setTarget(e.target.value)} className="w-[72px]" aria-label="Target letter">
          <option value="">Goal</option>
          {sortedScale(settings.scale)
            .filter((s) => s.min > 0)
            .map((s) => (
              <option key={s.letter} value={s.letter}>
                {s.letter}
              </option>
            ))}
        </Select>
        <IconButton label="Find the score needed for this goal" disabled={!target || !h.possible} onClick={solve}>
          <Target size={14} />
        </IconButton>
      </div>
      <IconButton label="Remove" onClick={onRemove}>
        <X size={14} />
      </IconButton>
      {/* Compact layout for narrow windows */}
      <div className="col-span-2 grid grid-cols-3 gap-2 xl:hidden">
        <NumberInput value={h.earned} onChange={(v) => onChange({ earned: v })} placeholder="Score" />
        <NumberInput value={h.possible} onChange={(v) => onChange({ possible: v == null ? null : Math.max(0, v) })} placeholder="Out of" />
        <div className="flex items-center justify-end text-[12.5px] font-medium tnum">{p != null ? `${p.toFixed(1)}%` : '—'}</div>
      </div>
    </div>
  )
}

function RenameModal({ scenario, onClose, onDone }: { scenario: Scenario | null; onClose: () => void; onDone: () => Promise<void> }) {
  const [name, setName] = useState('')
  useEffect(() => setName(scenario?.name ?? ''), [scenario])
  const save = async () => {
    if (!scenario || !name.trim()) return
    await api.renameScenario(scenario.id, name.trim())
    await onDone()
    onClose()
  }
  return (
    <Modal
      open={!!scenario}
      onClose={onClose}
      title="Rename scenario"
      width={380}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => void save()} disabled={!name.trim()}>
            Save
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={120} className="w-full" />
      </form>
    </Modal>
  )
}

/** Retake an exam, miss an assignment, or change any real score — stored as an override, never applied to real data. */
function ChangeRealModal({ scenarioId, onClose, onDone }: { scenarioId: number; onClose: () => void; onDone: () => Promise<void> }) {
  const { data, periodId } = useStore()
  const [courseId, setCourseId] = useState<number>(data?.courses[0]?.id ?? 0)
  const list = useMemo(() => (data ? assignmentsFor(data, courseId, periodId).filter((a) => a.possible != null && a.status !== 'exempt') : []), [data, courseId, periodId])
  const [aid, setAid] = useState<number | null>(null)
  const a = list.find((x) => x.id === aid) ?? null
  const [earned, setEarned] = useState<number | null>(null)
  useEffect(() => setAid(list[0]?.id ?? null), [list])
  useEffect(() => setEarned(a?.possible ?? null), [a])
  const save = async () => {
    if (!a) return
    await api.upsertHypothetical({ scenarioId, courseId, periodId: a.periodId, kind: 'override', targetAssignmentId: a.id, name: a.name, category: a.category, earned, possible: a.possible, dueDate: a.dueDate })
    await onDone()
    onClose()
  }
  return (
    <Modal
      open
      onClose={onClose}
      title="Change a real score"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => void save()} disabled={!a}>
            Add to scenario
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Course">
          <Select value={courseId} onChange={(e) => setCourseId(Number(e.target.value))}>
            {data?.courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Assignment" hint="Retake an exam, plan for an upcoming assignment, or see what missing it would do.">
          <Select value={aid ?? ''} onChange={(e) => setAid(Number(e.target.value))}>
            {list.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name} — {x.earned != null ? `${num(x.earned)}/${num(x.possible)}` : isUpcoming(x) ? 'upcoming' : x.status.replace('_', ' ')}
              </option>
            ))}
          </Select>
        </Field>
        {a && (
          <Field label={`New score (out of ${num(a.possible)})`}>
            <div className="flex items-center gap-2">
              <NumberInput value={earned} onChange={setEarned} className="w-28" />
              <Button size="sm" onClick={() => setEarned(a.possible)}>
                Full marks
              </Button>
              <Button size="sm" onClick={() => setEarned(0)}>
                Missed (0)
              </Button>
            </div>
          </Field>
        )}
      </div>
    </Modal>
  )
}

/** “What if I get X% on all remaining work in a category?” — creates overrides for every ungraded item. */
function BulkModal({ scenarioId, onClose, onDone }: { scenarioId: number; onClose: () => void; onDone: () => Promise<void> }) {
  const { data, periodId, toast } = useStore()
  const [courseId, setCourseId] = useState<number>(data?.courses[0]?.id ?? 0)
  const [category, setCategory] = useState('')
  const [percent, setPercent] = useState<number | null>(100)
  const remaining = useMemo(
    () => (data ? assignmentsFor(data, courseId, periodId).filter((a) => a.status === 'not_graded' && a.possible != null && (!category || a.category === category)) : []),
    [data, courseId, periodId, category]
  )
  const cats = useMemo(() => (data ? [...new Set(assignmentsFor(data, courseId, periodId).map((a) => a.category).filter((c): c is string => !!c))] : []), [data, courseId, periodId])
  const save = async () => {
    for (const a of remaining) {
      await api.upsertHypothetical({ scenarioId, courseId, periodId: a.periodId, kind: 'override', targetAssignmentId: a.id, name: a.name, category: a.category, earned: Math.round(((a.possible ?? 0) * (percent ?? 0)) / 100 * 100) / 100, possible: a.possible, dueDate: a.dueDate })
    }
    toast(`Added ${remaining.length} item(s) at ${percent}%`, 'ok')
    await onDone()
    onClose()
  }
  return (
    <Modal
      open
      onClose={onClose}
      title="Fill remaining work"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => void save()} disabled={!remaining.length || percent == null}>
            Add {remaining.length} item{remaining.length === 1 ? '' : 's'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-[12.5px] text-ink-2">Score every ungraded assignment in a course at the same percentage, e.g. “What if I get 100% on all remaining homework?”</p>
        <Field label="Course">
          <Select value={courseId} onChange={(e) => setCourseId(Number(e.target.value))}>
            {data?.courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Category">
          <Select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All categories</option>
            {cats.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Score on each">
          <NumberInput value={percent} onChange={setPercent} suffix="%" className="w-32" />
        </Field>
        {remaining.length === 0 && <Notice>No ungraded assignments match. Add hypothetical assignments for future work instead.</Notice>}
      </div>
    </Modal>
  )
}
