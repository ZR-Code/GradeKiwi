// Bridges stored data (courses, categories, assignments) to the pure engine.

import type { AppData, Assignment, Course, CourseConfig, CourseLevel, GradingPeriod, Hypothetical, Settings } from '../types'
import { computeGrade, type EngineConfig, type EngineOptions, type GradeItem, type GradeResult } from './engine'
import { computeGpa, FCPS_LEVEL_BONUS, FCPS_SCALE, letterFor } from './scale'

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  autoSyncOnLaunch: true,
  syncIntervalMinutes: 0,
  scaleName: 'FCPS (2025–26)',
  scale: FCPS_SCALE,
  levelBonus: FCPS_LEVEL_BONUS,
  bonusOnlyIfPassing: true,
  missingCountsAsZero: false,
  hypotheticalsEnabled: true,
  gpaRoundTo: 2,
  pastTerms: [],
  pastCourses: [],
  rememberCredentials: true
}

export const DEFAULT_COURSE_CONFIG: CourseConfig = {
  mode: 'auto',
  weights: null,
  dropLowest: {},
  bonusPercent: 0,
  level: null,
  customBonus: null,
  credits: null,
  excludeFromGpa: false
}

export function effectiveLevel(course: Course): CourseLevel {
  return course.config.level ?? course.detectedLevel
}

/** Category weights published by StudentVUE for this course and period. */
export function sourceWeights(data: AppData, courseId: number, periodId: number | null): Record<string, number> {
  const out: Record<string, number> = {}
  for (const c of data.categories) {
    if (c.courseId !== courseId || (periodId != null && c.periodId !== periodId)) continue
    if (c.weight != null && c.weight > 0) out[c.name] = c.weight
  }
  return out
}

/**
 * Resolves the grading policy: user override → StudentVUE category weights → total points.
 */
export function engineConfigFor(data: AppData, course: Course, periodId: number | null): EngineConfig & { origin: 'user' | 'studentvue' | 'default' } {
  const cfg = course.config
  const src = sourceWeights(data, course.id, periodId)
  const hasSrc = Object.keys(src).length > 0
  let mode: 'weighted' | 'points'
  if (cfg.mode === 'auto') mode = hasSrc || (cfg.weights && Object.keys(cfg.weights).length) ? 'weighted' : 'points'
  else mode = cfg.mode
  const weights = cfg.weights && Object.keys(cfg.weights).length ? cfg.weights : src
  const origin = cfg.mode !== 'auto' || (cfg.weights && Object.keys(cfg.weights).length) ? 'user' : hasSrc ? 'studentvue' : 'default'
  return { mode, weights, dropLowest: cfg.dropLowest, bonusPercent: cfg.bonusPercent, origin }
}

export function toItem(a: Assignment): GradeItem {
  return { id: a.id, name: a.name, category: a.category, earned: a.earned, possible: a.possible, status: a.status }
}

export function engineOptions(settings: Settings): EngineOptions {
  return { missingCountsAsZero: settings.missingCountsAsZero }
}

/** Applies hypotheticals to a list of real items without mutating them. */
export function applyHypotheticals(items: GradeItem[], hypos: Hypothetical[]): GradeItem[] {
  const overrides = new Map<number, Hypothetical>()
  const adds: GradeItem[] = []
  for (const h of hypos) {
    if (h.kind === 'override' && h.targetAssignmentId != null) overrides.set(h.targetAssignmentId, h)
    else
      adds.push({
        id: `h${h.id}`,
        name: h.name,
        category: h.category,
        earned: h.earned,
        possible: h.possible,
        status: h.earned == null ? 'not_graded' : 'graded',
        hypothetical: true
      })
  }
  const out = items.map((i) => {
    const o = typeof i.id === 'number' ? overrides.get(i.id) : undefined
    if (!o) return i
    return {
      ...i,
      earned: o.earned,
      possible: o.possible ?? i.possible,
      status: o.earned == null ? ('not_graded' as const) : ('graded' as const),
      hypothetical: true
    }
  })
  return [...out, ...adds]
}

export interface CourseSummary {
  course: Course
  periodId: number | null
  reportedPercent: number | null
  reportedLetter: string | null
  calc: GradeResult
  calcLetter: string | null
  /** Display values: StudentVUE's reported grade when available, otherwise ours. */
  percent: number | null
  letter: string | null
  graded: number
  missing: number
  upcoming: number
  total: number
  trend: number | null // change in running grade over the last ~14 days
  configOrigin: 'user' | 'studentvue' | 'default'
  /** Credits used for GPA, and whether they were detected rather than set by the user. */
  credits: number
  creditsAuto: boolean
}

export function assignmentsFor(data: AppData, courseId: number, periodId: number | null): Assignment[] {
  return data.assignments.filter((a) => a.courseId === courseId && (periodId == null || a.periodId === periodId))
}

export function isUpcoming(a: Assignment, now = new Date()): boolean {
  if (a.status !== 'not_graded') return false
  const d = a.dueDate ?? a.date
  if (!d) return false
  return d >= isoDay(now)
}

export function isoDay(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function summarizeCourse(data: AppData, course: Course, periodId: number | null, settings: Settings): CourseSummary {
  const assignments = assignmentsFor(data, course.id, periodId)
  const cfg = engineConfigFor(data, course, periodId)
  const opts = engineOptions(settings)
  const items = assignments.map(toItem)
  const calc = computeGrade(items, cfg, opts)
  const mark = data.marks.find((m) => m.courseId === course.id && m.periodId === periodId)
  const reportedPercent = mark?.percent ?? null
  const reportedLetter = mark?.letter ?? null
  const percent = reportedPercent ?? calc.percent
  const letter = reportedLetter ?? letterFor(percent, settings.scale)

  // Trend: running grade now vs. 14 days ago, from assignment dates.
  const cutoff = isoDay(new Date(Date.now() - 14 * 86400000))
  const before = computeGrade(
    assignments.filter((a) => (a.dueDate ?? a.date ?? '') <= cutoff).map(toItem),
    cfg,
    opts
  ).percent
  const trend = before != null && calc.percent != null ? calc.percent - before : null

  return {
    course,
    periodId,
    reportedPercent,
    reportedLetter,
    calc,
    calcLetter: letterFor(calc.percent, settings.scale),
    percent,
    letter,
    graded: assignments.filter((a) => a.status === 'graded').length,
    missing: assignments.filter((a) => a.status === 'missing').length,
    upcoming: assignments.filter((a) => isUpcoming(a)).length,
    total: assignments.length,
    trend,
    configOrigin: cfg.origin,
    credits: effectiveCredits(data, course),
    creditsAuto: course.config.credits == null
  }
}

// ── Rolling gradebooks ──────────────────────────────────────────────────────
// FCPS gradebooks roll: a year-long course has ONE grade that accumulates all year, and each
// grading period is just a checkpoint of it. Semester (half-credit) courses run for half the year.
// So a course's grade is its latest checkpoint — never an average of quarters.

/** Grading periods (in order) in which a course has a mark or any assignments. */
export function coursePeriods(data: AppData, courseId: number): GradingPeriod[] {
  const ids = new Set<number>()
  for (const m of data.marks) if (m.courseId === courseId && (m.percent != null || m.letter)) ids.add(m.periodId)
  for (const a of data.assignments) if (a.courseId === courseId) ids.add(a.periodId)
  return data.periods.filter((p) => ids.has(p.id)).sort((a, b) => a.index - b.index)
}

/** The checkpoint that holds a course's grade as of `asOfPeriodId` (latest period at or before it with data). */
export function latestPeriodFor(data: AppData, courseId: number, asOfPeriodId: number | null): number | null {
  const asOf = asOfPeriodId == null ? Infinity : (data.periods.find((p) => p.id === asOfPeriodId)?.index ?? Infinity)
  return coursePeriods(data, courseId).filter((p) => p.index <= asOf).at(-1)?.id ?? null
}

/**
 * One summary per course using its current (year-to-date) grade as of the viewed period.
 * Semester courses that already ended keep their final grade; courses that haven't started are left out.
 */
export function yearSummaries(data: AppData, settings: Settings, asOfPeriodId: number | null): CourseSummary[] {
  const out: CourseSummary[] = []
  for (const c of data.courses) {
    const pid = latestPeriodFor(data, c.id, asOfPeriodId)
    if (pid == null && coursePeriods(data, c.id).length > 0) continue // starts later in the year
    out.push(summarizeCourse(data, c, pid ?? asOfPeriodId, settings))
  }
  return out
}

/**
 * Credits when the user hasn't set them: 0.5 for a semester course, otherwise 1.
 * Detectable only with four quarter-style periods, and only once the course is visibly confined to one
 * semester (it ended after semester 1, or it started in semester 2). Users can always override.
 */
export function detectedCredits(data: AppData, courseId: number): number {
  const ps = [...data.periods].sort((a, b) => a.index - b.index)
  if (ps.length !== 4) return 1
  const pos = coursePeriods(data, courseId).map((p) => ps.findIndex((x) => x.id === p.id))
  if (pos.length === 0) return 1
  const current = ps.findIndex((p) => p.id === data.currentPeriodId)
  if (pos.every((i) => i <= 1) && current >= 2) return 0.5
  if (pos.every((i) => i >= 2)) return 0.5
  return 1
}

export function effectiveCredits(data: AppData, course: Course): number {
  return course.config.credits ?? detectedCredits(data, course.id)
}

export function gpaFromSummaries(summaries: CourseSummary[], settings: Settings, letterOverride?: (s: CourseSummary) => string | null) {
  return computeGpa(
    summaries
      .filter((s) => !s.course.config.excludeFromGpa)
      .map((s) => ({
        letter: letterOverride ? letterOverride(s) : s.letter,
        level: effectiveLevel(s.course),
        customBonus: s.course.config.customBonus,
        credits: s.credits
      })),
    settings
  )
}

/**
 * Reconstructs a running course grade over time from assignment dates (for charts before
 * multiple syncs exist). Labelled "reconstructed" in the UI.
 */
export function runningGrade(data: AppData, course: Course, periodId: number | null, settings: Settings): Array<{ date: string; percent: number }> {
  const assignments = assignmentsFor(data, course.id, periodId).filter((a) => a.status === 'graded' || a.status === 'missing')
  const dates = [...new Set(assignments.map((a) => a.dueDate ?? a.date).filter((d): d is string => !!d))].sort()
  const cfg = engineConfigFor(data, course, periodId)
  const opts = engineOptions(settings)
  const out: Array<{ date: string; percent: number }> = []
  for (const d of dates) {
    const r = computeGrade(
      assignments.filter((a) => (a.dueDate ?? a.date ?? '') <= d).map(toItem),
      cfg,
      opts
    )
    // Skip the first one or two graded items: a single score swings the grade wildly.
    if (r.percent != null && r.counted >= 3) out.push({ date: d, percent: r.percent })
  }
  return out
}
