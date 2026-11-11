import { useMemo, useState } from 'react'
import { ClipboardPaste, Plus, Trash2 } from 'lucide-react'
import type { CourseLevel, PastCourse, PastTerm } from '@shared/types'
import { computeGpa, LEVEL_LABELS, sortedScale } from '@shared/grading/scale'
import { newId, parsePastedCourses, schoolYear } from '@shared/grading/pastCourses'
import { useStore } from '../hooks/useStore'
import { cx, gpa } from '../utils/format'
import { Button, Card, CardHeader, Field, IconButton, Input, Modal, Notice, NumberInput, Select } from './ui'

type PastLevel = PastCourse['level']
const PAST_LEVELS = (Object.keys(LEVEL_LABELS) as CourseLevel[]).filter((l): l is PastLevel => l !== 'custom')

export function PastYearsCard() {
  const { settings, updateSettings } = useStore()
  const [pasteOpen, setPasteOpen] = useState(false)
  const courses = settings.pastCourses
  const setCourses = (pastCourses: PastCourse[]) => void updateSettings({ pastCourses })
  const setTerms = (pastTerms: PastTerm[]) => void updateSettings({ pastTerms })

  const years = useMemo(() => [...new Set(courses.map((c) => c.year))].sort((a, b) => b.localeCompare(a)), [courses])
  const letters = sortedScale(settings.scale).map((s) => s.letter)

  const addYear = () => {
    const taken = new Set(years)
    let off = -1
    while (taken.has(schoolYear(new Date(), off)) && off > -12) off--
    setCourses([...courses, { id: newId(), year: schoolYear(new Date(), off), name: 'Course', letter: letters[0] ?? 'A', level: 'regular', credits: 1 }])
  }

  return (
    <Card className="mt-4" padded={false}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div>
          <h3 className="text-[13px] font-semibold">Past years</h3>
          <p className="mt-0.5 max-w-xl text-xs leading-relaxed text-ink-3">
            StudentVUE only shares this school year's gradebook, so earlier years have to come from your report cards or transcript. Enter each course's final grade; GradeKiwi applies your scale and level bonuses.
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" icon={<ClipboardPaste size={12} />} onClick={() => setPasteOpen(true)}>
            Paste courses
          </Button>
          <Button size="sm" variant="primary" icon={<Plus size={12} />} onClick={addYear}>
            Add year
          </Button>
        </div>
      </div>

      {years.length === 0 && settings.pastTerms.length === 0 ? (
        <div className="px-5 py-8 text-center text-[12.5px] text-ink-3">No past years yet. Your cumulative GPA currently reflects this year only.</div>
      ) : (
        <div className="divide-y divide-line">
          {years.map((year) => {
            const rows = courses.filter((c) => c.year === year)
            const g = computeGpa(rows.map((c) => ({ letter: c.letter, level: c.level, credits: c.credits })), settings)
            return (
              <div key={year} className="animate-row-in px-5 py-4">
                <div className="mb-2 flex items-center gap-3">
                  <Input
                    defaultValue={year}
                    aria-label="School year"
                    className="h-7 w-28 font-semibold"
                    onBlur={(e) => {
                      const v = e.target.value.trim()
                      if (v && v !== year) setCourses(courses.map((c) => (c.year === year ? { ...c, year: v.slice(0, 40) } : c)))
                    }}
                  />
                  <span className="text-[12px] text-ink-3 tnum">
                    {g.credits} credit{g.credits === 1 ? '' : 's'} · {gpa(g.unweighted, settings.gpaRoundTo)} unweighted · {gpa(g.weighted, settings.gpaRoundTo)} weighted
                  </span>
                  <div className="flex-1" />
                  <Button size="sm" variant="ghost" icon={<Plus size={12} />} onClick={() => setCourses([...courses, { id: newId(), year, name: '', letter: letters[0] ?? 'A', level: 'regular', credits: 1 }])}>
                    Course
                  </Button>
                  <IconButton
                    label={`Remove ${year}`}
                    onClick={() => {
                      if (window.confirm(`Remove ${year} and its ${rows.length} course(s)?`)) setCourses(courses.filter((c) => c.year !== year))
                    }}
                  >
                    <Trash2 size={13} />
                  </IconButton>
                </div>
                <div className="grid grid-cols-[1fr_88px_150px_80px_28px] gap-2 px-0.5 pb-1 text-[11px] font-medium text-ink-3">
                  <span>Course</span>
                  <span>Final grade</span>
                  <span>Level</span>
                  <span>Credits</span>
                  <span />
                </div>
                <div className="space-y-1.5">
                  {rows.map((c) => (
                    <div key={c.id} className="grid grid-cols-[1fr_88px_150px_80px_28px] items-center gap-2">
                      <Input value={c.name} placeholder="Course name" onChange={(e) => setCourses(courses.map((x) => (x.id === c.id ? { ...x, name: e.target.value.slice(0, 120) } : x)))} />
                      <Select value={c.letter} onChange={(e) => setCourses(courses.map((x) => (x.id === c.id ? { ...x, letter: e.target.value } : x)))} aria-label="Final grade">
                        {[...new Set([...letters, c.letter])].map((l) => (
                          <option key={l} value={l}>
                            {l}
                          </option>
                        ))}
                      </Select>
                      <Select value={c.level} onChange={(e) => setCourses(courses.map((x) => (x.id === c.id ? { ...x, level: e.target.value as PastLevel } : x)))} aria-label="Level">
                        {PAST_LEVELS.map((l) => (
                          <option key={l} value={l}>
                            {LEVEL_LABELS[l]} +{settings.levelBonus[l]}
                          </option>
                        ))}
                      </Select>
                      <NumberInput value={c.credits} min={0} onChange={(v) => setCourses(courses.map((x) => (x.id === c.id ? { ...x, credits: Math.max(0, Math.min(10, v ?? 0)) } : x)))} />
                      <IconButton label={`Remove ${c.name || 'course'}`} onClick={() => setCourses(courses.filter((x) => x.id !== c.id))}>
                        <Trash2 size={13} />
                      </IconButton>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}

          {settings.pastTerms.length > 0 && (
            <div className="px-5 py-4">
              <div className="mb-2 text-[12.5px] font-semibold">Entered as a GPA only</div>
              <div className="grid grid-cols-[1fr_88px_88px_80px_28px] gap-2 pb-1 text-[11px] font-medium text-ink-3">
                <span>Term</span>
                <span>Unweighted</span>
                <span>Weighted</span>
                <span>Credits</span>
                <span />
              </div>
              <div className="space-y-1.5">
                {settings.pastTerms.map((t) => (
                  <div key={t.id} className="grid grid-cols-[1fr_88px_88px_80px_28px] items-center gap-2">
                    <Input value={t.name} onChange={(e) => setTerms(settings.pastTerms.map((x) => (x.id === t.id ? { ...x, name: e.target.value.slice(0, 80) } : x)))} />
                    <NumberInput value={t.gpaUnweighted} min={0} onChange={(v) => setTerms(settings.pastTerms.map((x) => (x.id === t.id ? { ...x, gpaUnweighted: Math.max(0, Math.min(10, v ?? 0)) } : x)))} />
                    <NumberInput value={t.gpaWeighted} min={0} placeholder="—" onChange={(v) => setTerms(settings.pastTerms.map((x) => (x.id === t.id ? { ...x, gpaWeighted: v == null ? null : Math.max(0, Math.min(10, v)) } : x)))} />
                    <NumberInput value={t.credits} min={0} onChange={(v) => setTerms(settings.pastTerms.map((x) => (x.id === t.id ? { ...x, credits: Math.max(0, Math.min(100, v ?? 0)) } : x)))} />
                    <IconButton label="Remove term" onClick={() => setTerms(settings.pastTerms.filter((x) => x.id !== t.id))}>
                      <Trash2 size={13} />
                    </IconButton>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      <div className="border-t border-line px-5 py-2.5 text-right">
        <button
          className="text-[11.5px] text-ink-3 hover:text-ink-2 hover:underline active:!scale-100"
          onClick={() => setTerms([...settings.pastTerms, { id: newId(), name: schoolYear(new Date(), -1), gpaUnweighted: 4, gpaWeighted: null, credits: 7 }])}
        >
          Only know a year's GPA? Add it as a GPA instead
        </button>
      </div>
      <PasteModal open={pasteOpen} onClose={() => setPasteOpen(false)} />
    </Card>
  )
}

function PasteModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { settings, updateSettings, toast } = useStore()
  const [year, setYear] = useState(schoolYear(new Date(), -1))
  const [text, setText] = useState('')
  const parsed = useMemo(() => parsePastedCourses(text, year.trim() || schoolYear(new Date(), -1), settings.scale), [text, year, settings.scale])
  const save = () => {
    void updateSettings({ pastCourses: [...settings.pastCourses, ...parsed.courses] })
    toast(`Added ${parsed.courses.length} course${parsed.courses.length === 1 ? '' : 's'} to ${year}`, 'ok')
    setText('')
    onClose()
  }
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Paste past courses"
      width={560}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!parsed.courses.length} onClick={save}>
            Add {parsed.courses.length || ''} course{parsed.courses.length === 1 ? '' : 's'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="School year">
          <Input value={year} onChange={(e) => setYear(e.target.value)} className="w-32" />
        </Field>
        <Field label="Courses" hint="One per line: Course, Grade, Level (optional), Credits (optional). Copy straight from a spreadsheet — tabs work too. Grades can be letters (B+) or percentages (88.5). Level is detected from AP / HN / IB / DE in the name if you leave it out.">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={8}
            spellCheck={false}
            placeholder={'English 10 HN, A-\nAP World History, B+, AP, 1\nGeometry\t91\nPE 9, A, Standard, 0.5'}
            className="no-drag w-full resize-y rounded-lg border border-line-strong bg-surface px-3 py-2 font-mono text-[12px] leading-relaxed text-ink outline-none placeholder:text-ink-3 focus:border-accent focus:ring-2 focus:ring-accent-soft"
          />
        </Field>
        {text.trim() && (
          <div className="rounded-lg border border-line">
            {parsed.courses.slice(0, 12).map((c) => (
              <div key={c.id} className="flex items-center justify-between border-b border-line px-3 py-1.5 text-[12px] last:border-0">
                <span className="truncate">{c.name}</span>
                <span className="shrink-0 text-ink-3 tnum">
                  <span className="font-semibold text-ink">{c.letter}</span> · {LEVEL_LABELS[c.level]} · {c.credits} cr
                </span>
              </div>
            ))}
            {parsed.courses.length > 12 && <div className="px-3 py-1.5 text-[11.5px] text-ink-3">+{parsed.courses.length - 12} more</div>}
          </div>
        )}
        {parsed.skipped.length > 0 && (
          <Notice tone="warn">
            Couldn't read {parsed.skipped.length} line{parsed.skipped.length === 1 ? '' : 's'}: <span className={cx('font-mono')}>{parsed.skipped.slice(0, 3).join(' | ')}</span>
          </Notice>
        )}
      </div>
    </Modal>
  )
}
