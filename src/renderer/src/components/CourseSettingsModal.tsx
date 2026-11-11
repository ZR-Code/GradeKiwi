import { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { Course, CourseConfig, CourseLevel } from '@shared/types'
import { sourceWeights } from '@shared/grading/model'
import { LEVEL_LABELS } from '@shared/grading/scale'
import { useStore } from '../hooks/useStore'
import { api, errorMessage } from '../services/api'
import { Button, Field, Input, Modal, Notice, NumberInput, Segmented, Select, Toggle } from './ui'

/** Per-course grading policy overrides. Never modifies imported StudentVUE data. */
export function CourseSettingsModal({ course, open, onClose }: { course: Course; open: boolean; onClose: () => void }) {
  const { data, periodId, refresh, toast } = useStore()
  const [cfg, setCfg] = useState<CourseConfig>(course.config)
  const [saving, setSaving] = useState(false)
  useEffect(() => setCfg(course.config), [course, open])

  const src = useMemo(() => (data ? sourceWeights(data, course.id, periodId) : {}), [data, course.id, periodId])
  const categories = useMemo(() => {
    const names = new Set<string>(Object.keys(src))
    for (const a of data?.assignments ?? []) if (a.courseId === course.id && a.category) names.add(a.category)
    return [...names]
  }, [data, course.id, src])

  const customWeights = cfg.weights != null
  const weights = cfg.weights ?? src
  const total = Object.values(weights).reduce((a, b) => a + b, 0)

  const save = async () => {
    setSaving(true)
    try {
      await api.updateCourseConfig(course.id, cfg)
      await refresh()
      toast(`Saved grading settings for ${course.name}`, 'ok')
      onClose()
    } catch (e) {
      toast(errorMessage(e), 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Grading settings · ${course.name}`}
      width={560}
      footer={
        <>
          <Button variant="ghost" onClick={() => setCfg({ mode: 'auto', weights: null, dropLowest: {}, bonusPercent: 0, level: null, customBonus: null, credits: null, excludeFromGpa: false })}>
            Reset to StudentVUE
          </Button>
          <div className="flex-1" />
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => void save()} loading={saving}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <Notice>These settings only change how GradeKiwi calculates grades. Your imported StudentVUE grades are never modified.</Notice>
        <Field label="Grading method" hint={cfg.mode === 'auto' ? (Object.keys(src).length ? 'Automatic: StudentVUE publishes category weights for this course, so weighted categories are used.' : 'Automatic: no category weights were published, so total points are used.') : undefined}>
          <Segmented
            value={cfg.mode}
            onChange={(mode) => setCfg({ ...cfg, mode })}
            options={[
              { value: 'auto', label: 'Automatic' },
              { value: 'weighted', label: 'Weighted categories' },
              { value: 'points', label: 'Total points' }
            ]}
          />
        </Field>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium text-ink-2">Categories</span>
            <label className="flex items-center gap-2 text-xs text-ink-2">
              Custom weights
              <Toggle checked={customWeights} onChange={(v) => setCfg({ ...cfg, weights: v ? { ...src } : null })} label="Custom weights" />
            </label>
          </div>
          <div className="overflow-hidden rounded-lg border border-line">
            <div className="grid grid-cols-[1fr_110px_110px_32px] gap-2 border-b border-line bg-surface-2 px-3 py-1.5 text-[11px] font-medium text-ink-3">
              <span>Category</span>
              <span>Weight</span>
              <span>Drop lowest</span>
              <span />
            </div>
            {[...new Set([...categories, ...Object.keys(weights)])].map((name) => (
              <div key={name} className="grid grid-cols-[1fr_110px_110px_32px] items-center gap-2 border-b border-line px-3 py-1.5 last:border-0">
                <span className="truncate text-[12.5px]">{name}</span>
                <NumberInput
                  value={weights[name] ?? null}
                  suffix="%"
                  placeholder={customWeights ? '0' : '—'}
                  onChange={(v) => {
                    const w = { ...(cfg.weights ?? src) }
                    if (v == null) delete w[name]
                    else w[name] = v
                    setCfg({ ...cfg, weights: w })
                  }}
                />
                <NumberInput
                  value={cfg.dropLowest[name] ?? 0}
                  min={0}
                  step={1}
                  onChange={(v) => setCfg({ ...cfg, dropLowest: { ...cfg.dropLowest, [name]: Math.max(0, Math.floor(v ?? 0)) } })}
                />
                {customWeights && !categories.includes(name) ? (
                  <button
                    className="text-ink-3 hover:text-ink"
                    aria-label={`Remove ${name}`}
                    onClick={() => {
                      const w = { ...(cfg.weights ?? {}) }
                      delete w[name]
                      setCfg({ ...cfg, weights: w })
                    }}
                  >
                    <Trash2 size={13} />
                  </button>
                ) : (
                  <span />
                )}
              </div>
            ))}
          </div>
          <div className="mt-2 flex items-center justify-between text-[11.5px] text-ink-3">
            <span className="tnum">Total weight: {total.toFixed(1)}%{Math.abs(total - 100) > 0.01 && total > 0 ? ' — weights are normalized over categories with grades' : ''}</span>
            {customWeights && <AddCategory onAdd={(n) => setCfg({ ...cfg, weights: { ...(cfg.weights ?? {}), [n]: 0 } })} />}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Extra credit bonus" hint="Flat percentage points added to the course grade.">
            <NumberInput value={cfg.bonusPercent} suffix="%" onChange={(v) => setCfg({ ...cfg, bonusPercent: v ?? 0 })} />
          </Field>
          <Field label="Length · credits" hint="Semester courses count half a credit.">
            <Select value={cfg.credits == null ? 'auto' : String(cfg.credits)} onChange={(e) => setCfg({ ...cfg, credits: e.target.value === 'auto' ? null : Number(e.target.value) })}>
              <option value="auto">Automatic</option>
              <option value="1">Full year · 1</option>
              <option value="0.5">Semester · 0.5</option>
              <option value="0">No credit · 0</option>
              {cfg.credits != null && ![1, 0.5, 0].includes(cfg.credits) && <option value={String(cfg.credits)}>Custom · {cfg.credits}</option>}
            </Select>
          </Field>
          <Field label="Course level" hint={`Detected from the title: ${LEVEL_LABELS[course.detectedLevel]}`}>
            <Select value={cfg.level ?? ''} onChange={(e) => setCfg({ ...cfg, level: (e.target.value || null) as CourseLevel | null })}>
              <option value="">Use detected ({LEVEL_LABELS[course.detectedLevel]})</option>
              {(Object.keys(LEVEL_LABELS) as CourseLevel[]).map((l) => (
                <option key={l} value={l}>
                  {LEVEL_LABELS[l]}
                </option>
              ))}
            </Select>
          </Field>
          {cfg.level === 'custom' ? (
            <Field label="Custom GPA bonus">
              <NumberInput value={cfg.customBonus} min={0} max={5} onChange={(v) => setCfg({ ...cfg, customBonus: v })} />
            </Field>
          ) : (
            <Field label="Include in GPA">
              <div className="flex h-8 items-center">
                <Toggle checked={!cfg.excludeFromGpa} onChange={(v) => setCfg({ ...cfg, excludeFromGpa: !v })} label="Include in GPA" />
              </div>
            </Field>
          )}
        </div>
      </div>
    </Modal>
  )
}

function AddCategory({ onAdd }: { onAdd: (name: string) => void }) {
  const [name, setName] = useState('')
  return (
    <div className="flex items-center gap-1.5">
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New category" className="h-7 w-32 text-xs" />
      <Button
        size="sm"
        icon={<Plus size={12} />}
        disabled={!name.trim()}
        onClick={() => {
          onAdd(name.trim())
          setName('')
        }}
      >
        Add
      </Button>
    </div>
  )
}
