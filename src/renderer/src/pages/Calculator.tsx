import { useMemo, useState } from 'react'
import { Calculator as CalcIcon, Download, GraduationCap, Plus, Target, Trash2 } from 'lucide-react'
import type { GradingMode } from '@shared/types'
import { assignmentImpact, computeGrade, neededOnFinal, solveNeededScore, type EngineConfig, type GradeItem } from '@shared/grading/engine'
import { assignmentsFor, engineConfigFor, engineOptions } from '@shared/grading/model'
import { letterFor, sortedScale } from '@shared/grading/scale'
import { Counter } from '../components/Counter'
import { Page, PageHeader } from '../components/Layout'
import { Button, Card, CardHeader, Delta, Field, GradeBadge, IconButton, Input, Notice, NumberInput, Segmented, Select, Toggle } from '../components/ui'
import { useStore } from '../hooks/useStore'
import { cx, num, pct } from '../utils/format'

interface CatRow {
  key: number
  name: string
  weight: number | null
  drop: number
}
interface ItemRow {
  key: number
  name: string
  category: string
  earned: number | null
  possible: number | null
  weight: number | null
  included: boolean
}

let seq = 1
const k = () => seq++

const START_CATS: CatRow[] = [
  { key: k(), name: 'Tests', weight: 60, drop: 0 },
  { key: k(), name: 'Homework', weight: 40, drop: 0 }
]
const START_ITEMS: ItemRow[] = [
  { key: k(), name: 'Test 1', category: 'Tests', earned: 88, possible: 100, weight: 1, included: true },
  { key: k(), name: 'Homework 1', category: 'Homework', earned: 9, possible: 10, weight: 1, included: true },
  { key: k(), name: 'Homework 2', category: 'Homework', earned: 10, possible: 10, weight: 1, included: true }
]

export default function CalculatorPage() {
  const { data, settings, periodId, toast } = useStore()
  const [mode, setMode] = useState<GradingMode>('weighted')
  const [cats, setCats] = useState<CatRow[]>(START_CATS)
  const [items, setItems] = useState<ItemRow[]>(START_ITEMS)
  const [bonus, setBonus] = useState<number | null>(0)
  const [missingZero, setMissingZero] = useState(settings.missingCountsAsZero)
  const [loadCourse, setLoadCourse] = useState('')

  const config: EngineConfig = useMemo(
    () => ({
      mode,
      weights: Object.fromEntries(cats.filter((c) => c.weight != null && c.name.trim()).map((c) => [c.name.trim(), c.weight!])),
      dropLowest: Object.fromEntries(cats.filter((c) => c.drop > 0).map((c) => [c.name.trim(), c.drop])),
      bonusPercent: bonus ?? 0
    }),
    [mode, cats, bonus]
  )
  const engineItems: GradeItem[] = useMemo(
    () =>
      items
        .filter((i) => i.included)
        .map((i) => ({ id: i.key, name: i.name, category: i.category, earned: i.earned, possible: i.possible, status: i.earned == null ? 'not_graded' : 'graded', weight: i.weight ?? 1 })),
    [items]
  )
  const opts = { missingCountsAsZero: missingZero }
  const result = useMemo(() => computeGrade(engineItems, config, opts), [engineItems, config, missingZero]) // eslint-disable-line react-hooks/exhaustive-deps
  const letter = letterFor(result.percent, settings.scale)
  const totalWeight = cats.reduce((s, c) => s + (c.weight ?? 0), 0)

  const load = (courseId: number) => {
    if (!data) return
    const course = data.courses.find((c) => c.id === courseId)
    if (!course) return
    const cfg = engineConfigFor(data, course, periodId)
    const list = assignmentsFor(data, course.id, periodId).filter((a) => a.possible != null && (a.status === 'graded' || a.status === 'missing'))
    const names = [...new Set([...Object.keys(cfg.weights), ...list.map((a) => a.category ?? 'Uncategorized')])]
    setMode(cfg.mode)
    setCats(names.map((n) => ({ key: k(), name: n, weight: cfg.weights[n] ?? null, drop: cfg.dropLowest?.[n] ?? 0 })))
    setItems(list.map((a) => ({ key: k(), name: a.name, category: a.category ?? 'Uncategorized', earned: a.earned ?? (settings.missingCountsAsZero ? 0 : null), possible: a.possible, weight: 1, included: true })))
    setBonus(cfg.bonusPercent ?? 0)
    setMissingZero(engineOptions(settings).missingCountsAsZero ?? false)
    toast(`Copied ${list.length} graded assignments from ${course.name}. Changes here won't affect the course.`, 'info')
  }

  const catNames = cats.map((c) => c.name.trim()).filter(Boolean)
  const [justAdded, setJustAdded] = useState<number | null>(null)

  // New rows go to the top (a copied course can be long), get focus, and flash briefly.
  const addItem = () => {
    const key = k()
    setItems((xs) => [{ key, name: 'New assignment', category: catNames[0] ?? 'Uncategorized', earned: null, possible: 100, weight: 1, included: true }, ...xs])
    setJustAdded(key)
    window.setTimeout(() => setJustAdded((cur) => (cur === key ? null : cur)), 1400)
  }

  return (
    <>
      <PageHeader
        title="Grade Calculator"
        subtitle="A sandbox for any course. Start from scratch or copy a course, then experiment freely."
        actions={
          data && data.courses.length > 0 ? (
            <Select
              value={loadCourse}
              onChange={(e) => {
                setLoadCourse('')
                if (e.target.value) load(Number(e.target.value))
              }}
              className="w-56"
              aria-label="Copy from course"
            >
              <option value="">Copy from a course…</option>
              {data.courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          ) : undefined
        }
      />
      <Page>
        <div className="grid grid-cols-1 gap-5 2xl:grid-cols-[1fr_380px]">
          <div className="min-w-0 space-y-4">
            {/* Result */}
            <Card>
              <div className="flex flex-wrap items-center gap-6">
                <div>
                  <div className="text-xs font-medium text-ink-3">Calculated grade</div>
                  <div className="mt-1 flex items-center gap-3">
                    <span className="font-display text-[40px] font-semibold leading-none tracking-tight"><Counter value={result.percent} format={(n) => pct(n, 2)} /></span>
                    <GradeBadge letter={letter} size="lg" />
                  </div>
                  <div className="mt-2 text-[12px] text-ink-3">
                    {mode === 'weighted' ? 'Σ(category average × weight) ÷ Σ(weights of graded categories)' : 'Total earned ÷ total possible × 100'}
                    {bonus ? ` + ${bonus}% bonus` : ''}
                  </div>
                </div>
                <div className="flex-1" />
                <div className="flex flex-col items-end gap-2">
                  <Segmented
                    value={mode}
                    onChange={setMode}
                    options={[
                      { value: 'weighted', label: 'Weighted categories' },
                      { value: 'points', label: 'Total points' }
                    ]}
                  />
                  <label className="flex items-center gap-2 text-[12px] text-ink-2">
                    Count blank scores as zero
                    <Toggle checked={missingZero} onChange={setMissingZero} label="Count blank scores as zero" />
                  </label>
                </div>
              </div>
              {result.categories.length > 0 && (
                <div className="mt-5 grid grid-cols-2 gap-2 border-t border-line pt-4 md:grid-cols-4">
                  {result.categories.map((c) => (
                    <div key={c.name} className="rounded-lg bg-surface-2 px-3 py-2">
                      <div className="truncate text-[11.5px] text-ink-3">
                        {c.name}
                        {mode === 'weighted' && c.weight != null ? ` · ${num(c.weight)}%` : ''}
                      </div>
                      <div className="text-[15px] font-semibold tnum">{pct(c.percent)}</div>
                      <div className="text-[11px] text-ink-3 tnum">
                        {num(c.earned)}/{num(c.possible)}
                        {c.dropped.length ? ` · ${c.dropped.length} dropped` : ''}
                        {mode === 'weighted' && c.weight == null ? ' · no weight' : ''}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* Categories */}
            <Card padded={false}>
              <div className="flex items-center justify-between border-b border-line px-4 py-3">
                <div>
                  <div className="text-[13px] font-semibold">Categories</div>
                  <div className="text-[11.5px] text-ink-3 tnum">
                    {mode === 'weighted' ? `Weights total ${num(totalWeight)}%${Math.abs(totalWeight - 100) > 0.01 ? ' (normalized over graded categories)' : ''}` : 'Weights are ignored in total-points mode'}
                  </div>
                </div>
                <Button size="sm" icon={<Plus size={12} />} onClick={() => setCats([...cats, { key: k(), name: `Category ${cats.length + 1}`, weight: 0, drop: 0 }])}>
                  Category
                </Button>
              </div>
              <div className="grid grid-cols-[1fr_120px_120px_32px] gap-2 px-4 pt-2 text-[11px] font-medium text-ink-3">
                <span>Name</span>
                <span>Weight</span>
                <span>Drop lowest</span>
                <span />
              </div>
              <div className="px-4 pb-3">
                {cats.map((c) => (
                  <div key={c.key} className="grid grid-cols-[1fr_120px_120px_32px] items-center gap-2 py-1">
                    <Input
                      value={c.name}
                      onChange={(e) => {
                        const old = c.name
                        const name = e.target.value
                        setCats(cats.map((x) => (x.key === c.key ? { ...x, name } : x)))
                        setItems(items.map((i) => (i.category === old ? { ...i, category: name } : i)))
                      }}
                    />
                    <NumberInput value={c.weight} suffix="%" min={0} onChange={(v) => setCats(cats.map((x) => (x.key === c.key ? { ...x, weight: v } : x)))} />
                    <NumberInput value={c.drop} min={0} step={1} onChange={(v) => setCats(cats.map((x) => (x.key === c.key ? { ...x, drop: Math.max(0, Math.floor(v ?? 0)) } : x)))} />
                    <IconButton label={`Remove ${c.name}`} onClick={() => setCats(cats.filter((x) => x.key !== c.key))}>
                      <Trash2 size={13} />
                    </IconButton>
                  </div>
                ))}
              </div>
            </Card>

            {/* Assignments */}
            <Card padded={false}>
              <div className="flex items-center justify-between border-b border-line px-4 py-3">
                <div>
                  <div className="text-[13px] font-semibold">Assignments</div>
                  <div className="text-[11.5px] text-ink-3">Impact = how much the grade changes because this assignment counts. Untick to see the grade without it. Set possible to 0 for pure extra credit.</div>
                </div>
                <Button size="sm" icon={<Plus size={12} />} onClick={addItem}>
                  Assignment
                </Button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-[12.5px]">
                  <thead>
                    <tr className="text-[11px] text-ink-3">
                      <th className="w-8 px-2 py-2 pl-4 text-left font-medium">On</th>
                      <th className="px-2 py-2 text-left font-medium">Name</th>
                      <th className="px-2 py-2 text-left font-medium">Category</th>
                      <th className="w-24 px-2 py-2 text-left font-medium">Earned</th>
                      <th className="w-24 px-2 py-2 text-left font-medium">Possible</th>
                      <th className="w-20 px-2 py-2 text-left font-medium" title="Assignment weight multiplier">× Weight</th>
                      <th className="w-16 px-2 py-2 text-right font-medium">%</th>
                      <th className="w-20 px-2 py-2 text-right font-medium">Impact</th>
                      <th className="w-10 px-2 py-2 pr-4" />
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((i) => {
                      const p = i.earned != null && i.possible ? (i.earned / i.possible) * 100 : null
                      const impact = i.included ? assignmentImpact(engineItems, i.key, config, opts).delta : null
                      const dropped = result.categories.some((c) => c.dropped.includes(i.key))
                      return (
                        <tr key={i.key} className={cx('border-t border-line transition-[background-color,opacity] duration-700', !i.included && 'opacity-50', justAdded === i.key && 'animate-row-in bg-accent-soft')}>
                          <td className="px-2 py-1.5 pl-4">
                            <input type="checkbox" checked={i.included} onChange={(e) => setItems(items.map((x) => (x.key === i.key ? { ...x, included: e.target.checked } : x)))} className="accent-[var(--accent)]" aria-label={`Include ${i.name}`} />
                          </td>
                          <td className="px-2 py-1.5">
                            <Input
                              autoFocus={justAdded === i.key}
                              onFocus={(e) => justAdded === i.key && e.currentTarget.select()}
                              value={i.name}
                              onChange={(e) => setItems(items.map((x) => (x.key === i.key ? { ...x, name: e.target.value } : x)))} className="w-full min-w-32" />
                          </td>
                          <td className="px-2 py-1.5">
                            <Select value={i.category} onChange={(e) => setItems(items.map((x) => (x.key === i.key ? { ...x, category: e.target.value } : x)))} className="w-full min-w-28">
                              {[...new Set([...catNames, i.category])].map((n) => (
                                <option key={n} value={n}>
                                  {n}
                                </option>
                              ))}
                            </Select>
                          </td>
                          <td className="px-2 py-1.5">
                            <NumberInput value={i.earned} onChange={(v) => setItems(items.map((x) => (x.key === i.key ? { ...x, earned: v } : x)))} placeholder="—" />
                          </td>
                          <td className="px-2 py-1.5">
                            <NumberInput value={i.possible} min={0} onChange={(v) => setItems(items.map((x) => (x.key === i.key ? { ...x, possible: v } : x)))} />
                          </td>
                          <td className="px-2 py-1.5">
                            <NumberInput value={i.weight} min={0} onChange={(v) => setItems(items.map((x) => (x.key === i.key ? { ...x, weight: v } : x)))} />
                          </td>
                          <td className="px-2 py-1.5 text-right tnum">
                            {i.possible === 0 && i.earned ? <span className="text-ink-3">EC</span> : p != null ? p.toFixed(1) : '—'}
                          </td>
                          <td className="px-2 py-1.5 text-right">{dropped ? <span className="text-[11px] text-ink-3">dropped</span> : <Delta value={impact} digits={2} />}</td>
                          <td className="px-2 py-1.5 pr-4">
                            <IconButton label={`Remove ${i.name}`} onClick={() => setItems(items.filter((x) => x.key !== i.key))}>
                              <Trash2 size={13} />
                            </IconButton>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center gap-3 border-t border-line px-4 py-3">
                <span className="text-[12.5px] text-ink-2">Extra credit bonus (added to final grade)</span>
                <NumberInput value={bonus} onChange={setBonus} suffix="%" className="w-28" />
              </div>
            </Card>
          </div>

          <div className="space-y-4">
            <NeededTool items={engineItems} config={config} opts={opts} catNames={catNames} />
            <FinalTool current={result.percent} />
            <Card>
              <CardHeader title="Letter thresholds" subtitle={`${settings.scaleName} · edit in Settings`} icon={<GraduationCap size={14} className="text-ink-3" />} />
              <div className="grid grid-cols-4 gap-1.5 text-[11.5px]">
                {sortedScale(settings.scale).map((s) => (
                  <div key={s.letter} className="flex items-center justify-between rounded-md bg-surface-2 px-2 py-1">
                    <span className="font-semibold">{s.letter}</span>
                    <span className="text-ink-3 tnum">{s.min}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      </Page>
    </>
  )
}

function TargetInput({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  const { settings } = useStore()
  return (
    <div className="flex gap-2">
      <NumberInput value={value} onChange={onChange} suffix="%" className="w-28" />
      <Select value={settings.scale.find((s) => s.min === value)?.letter ?? ''} onChange={(e) => onChange(settings.scale.find((s) => s.letter === e.target.value)?.min ?? value)} className="flex-1" aria-label="Target letter">
        <option value="">Letter…</option>
        {sortedScale(settings.scale)
          .filter((s) => s.min > 0)
          .map((s) => (
            <option key={s.letter} value={s.letter}>
              {s.letter} ({s.min}%)
            </option>
          ))}
      </Select>
    </div>
  )
}

function NeededTool({ items, config, opts, catNames }: { items: GradeItem[]; config: EngineConfig; opts: { missingCountsAsZero: boolean }; catNames: string[] }) {
  const { settings } = useStore()
  const [category, setCategory] = useState(catNames[0] ?? '')
  const [possible, setPossible] = useState<number | null>(100)
  const [target, setTarget] = useState<number | null>(settings.scale.find((s) => s.letter.startsWith('A'))?.min ?? 90)
  const [allowEC, setAllowEC] = useState(false)
  const cat = catNames.includes(category) ? category : (catNames[0] ?? '')
  const r = possible && target != null ? solveNeededScore(items, config, { category: cat || null, possible }, target, opts, allowEC ? 200 : 100) : null
  return (
    <Card>
      <CardHeader title="Score needed on the next assignment" icon={<Target size={14} className="text-ink-3" />} subtitle="Also works for a target course grade" />
      <div className="space-y-3">
        <Field label="Category">
          <Select value={cat} onChange={(e) => setCategory(e.target.value)}>
            {catNames.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Points possible">
          <NumberInput value={possible} min={0} onChange={setPossible} />
        </Field>
        <Field label="Target course grade">
          <TargetInput value={target} onChange={setTarget} />
        </Field>
        <label className="flex items-center justify-between text-[12px] text-ink-2">
          Allow scores above 100%
          <Toggle checked={allowEC} onChange={setAllowEC} label="Allow scores above 100%" />
        </label>
      </div>
      <div className="mt-4 rounded-xl bg-surface-2 p-4">
        {!r ? (
          <div className="text-[12.5px] text-ink-3">Enter points and a target.</div>
        ) : r.alreadyMet ? (
          <div className="text-[13px]">
            <span className="font-semibold" style={{ color: 'var(--grade-a-text)' }}>
              Already there.
            </span>{' '}
            Even a 0 keeps you at or above {num(target)}%.
          </div>
        ) : !r.reachable ? (
          <div className="text-[13px]">
            <span className="font-semibold" style={{ color: 'var(--grade-f-text)' }}>
              Not reachable
            </span>{' '}
            with this assignment alone. A perfect score gets you to {pct(r.maxGrade, 2)}.
            {config.mode === 'weighted' && config.weights[cat] == null && <div className="mt-1 text-[12px] text-ink-3">This category has no weight, so it can't move the grade.</div>}
          </div>
        ) : (
          <>
            <div className="text-xs text-ink-3">You need at least</div>
            <div className="mt-1 font-display text-[28px] font-semibold tracking-tight tnum">
              {num(Math.ceil((r.needed ?? 0) * 100) / 100)} <span className="text-[15px] font-medium text-ink-3">/ {num(possible)}</span>
            </div>
            <div className="text-[12.5px] text-ink-2 tnum">{pct(r.neededPercent, 1)} on this assignment</div>
          </>
        )}
      </div>
    </Card>
  )
}

function FinalTool({ current }: { current: number | null }) {
  const { settings } = useStore()
  const [cur, setCur] = useState<number | null>(null)
  const [weight, setWeight] = useState<number | null>(20)
  const [target, setTarget] = useState<number | null>(settings.scale.find((s) => s.letter.startsWith('A'))?.min ?? 90)
  const c = cur ?? current
  const needed = c != null && weight != null && target != null ? neededOnFinal(c, weight, target) : null
  return (
    <Card>
      <CardHeader title="Final exam" icon={<CalcIcon size={14} className="text-ink-3" />} subtitle="When the final is a fixed share of the course grade" />
      <div className="space-y-3">
        <Field label="Current grade" hint={cur == null ? 'Using the calculator result. Type to override.' : undefined}>
          <div className="flex gap-2">
            <NumberInput value={c} onChange={setCur} suffix="%" className="flex-1" />
            {cur != null && (
              <Button size="sm" variant="ghost" onClick={() => setCur(null)} icon={<Download size={12} />}>
                Use result
              </Button>
            )}
          </div>
        </Field>
        <Field label="Final exam weight">
          <NumberInput value={weight} min={0} max={100} onChange={setWeight} suffix="%" />
        </Field>
        <Field label="Target course grade">
          <TargetInput value={target} onChange={setTarget} />
        </Field>
      </div>
      <div className="mt-4 rounded-xl bg-surface-2 p-4">
        {needed == null ? (
          <div className="text-[12.5px] text-ink-3">Enter a final weight between 0 and 100%.</div>
        ) : (
          <>
            <div className="text-xs text-ink-3">Needed on the final</div>
            <div className="mt-1 font-display text-[28px] font-semibold tracking-tight tnum" style={needed > 100 ? { color: 'var(--grade-f-text)' } : needed <= 0 ? { color: 'var(--grade-a-text)' } : undefined}>
              {needed.toFixed(2)}%
            </div>
            <div className="text-[12px] text-ink-3">
              {needed > 100 ? 'Above 100%, so not reachable without extra credit.' : needed <= 0 ? 'Target is locked in.' : `Formula: (target − current × (1 − w)) ÷ w`}
            </div>
          </>
        )}
      </div>
      <div className="mt-3">
        <Notice>For finals that count as a category instead, use “Score needed” above with that category.</Notice>
      </div>
    </Card>
  )
}
