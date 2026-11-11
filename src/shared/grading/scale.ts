// Letter-grade scales and GPA math. No scale is assumed: the user picks or edits one in Settings.

import type { CourseLevel, PastCourse, PastTerm, ScaleStep, Settings } from '../types'

export interface ScalePreset {
  id: string
  name: string
  source: string
  steps: ScaleStep[]
}

/**
 * Verified 2026-11-09 against FCPS "Postsecondary Profile" (fcps.edu/about-fcps/performance-and-accountability/fcps-postsecondary-profile).
 * D− was removed for 2025-26; D covers 60–66. FCPS lists F as 50–59 (minimum-grade policy); anything below 60 maps to F here.
 */
export const FCPS_SCALE: ScaleStep[] = [
  { letter: 'A', min: 93, points: 4.0 },
  { letter: 'A-', min: 90, points: 3.7 },
  { letter: 'B+', min: 87, points: 3.3 },
  { letter: 'B', min: 83, points: 3.0 },
  { letter: 'B-', min: 80, points: 2.7 },
  { letter: 'C+', min: 77, points: 2.3 },
  { letter: 'C', min: 73, points: 2.0 },
  { letter: 'C-', min: 70, points: 1.7 },
  { letter: 'D+', min: 67, points: 1.3 },
  { letter: 'D', min: 60, points: 1.0 },
  { letter: 'F', min: 0, points: 0.0 }
]

export const SCALE_PRESETS: ScalePreset[] = [
  { id: 'fcps', name: 'FCPS (2025–26)', source: 'FCPS Postsecondary Profile, verified Nov 2026', steps: FCPS_SCALE },
  {
    id: 'standard10',
    name: '10-point (no +/−)',
    source: 'Common A/B/C/D/F scale',
    steps: [
      { letter: 'A', min: 90, points: 4 },
      { letter: 'B', min: 80, points: 3 },
      { letter: 'C', min: 70, points: 2 },
      { letter: 'D', min: 60, points: 1 },
      { letter: 'F', min: 0, points: 0 }
    ]
  },
  {
    id: 'plusminus10',
    name: '10-point with +/−',
    source: 'Common plus/minus scale',
    steps: [
      { letter: 'A+', min: 97, points: 4.0 },
      { letter: 'A', min: 93, points: 4.0 },
      { letter: 'A-', min: 90, points: 3.7 },
      { letter: 'B+', min: 87, points: 3.3 },
      { letter: 'B', min: 83, points: 3.0 },
      { letter: 'B-', min: 80, points: 2.7 },
      { letter: 'C+', min: 77, points: 2.3 },
      { letter: 'C', min: 73, points: 2.0 },
      { letter: 'C-', min: 70, points: 1.7 },
      { letter: 'D+', min: 67, points: 1.3 },
      { letter: 'D', min: 63, points: 1.0 },
      { letter: 'D-', min: 60, points: 0.7 },
      { letter: 'F', min: 0, points: 0 }
    ]
  }
]

/** FCPS weighting (same source): HN +0.5; AP, AV, IB, DE +1.0. */
export const FCPS_LEVEL_BONUS: Settings['levelBonus'] = { regular: 0, honors: 0.5, ap: 1, ib: 1, av: 1, dual: 1 }

export const LEVEL_LABELS: Record<CourseLevel, string> = {
  regular: 'Standard',
  honors: 'Honors',
  ap: 'AP',
  ib: 'IB',
  av: 'Advanced',
  dual: 'Dual Enrollment',
  custom: 'Custom'
}

export function sortedScale(scale: ScaleStep[]): ScaleStep[] {
  return [...scale].sort((a, b) => b.min - a.min)
}

export function letterFor(percent: number | null | undefined, scale: ScaleStep[]): string | null {
  if (percent == null || !Number.isFinite(percent)) return null
  // Synergy-style rounding: compare against the value rounded to 2 decimals to avoid 92.9999 issues.
  const p = Math.round(percent * 100) / 100
  for (const s of sortedScale(scale)) if (p >= s.min) return s.letter
  return sortedScale(scale).at(-1)?.letter ?? null
}

export function pointsForLetter(letter: string | null | undefined, scale: ScaleStep[]): number | null {
  if (!letter) return null
  const clean = normalizeLetter(letter)
  const hit = scale.find((s) => normalizeLetter(s.letter) === clean)
  if (hit) return hit.points
  // Fall back to the base letter (e.g. "A+" on a scale without +/−).
  const base = scale.find((s) => normalizeLetter(s.letter) === clean.charAt(0))
  return base ? base.points : null
}

export function normalizeLetter(letter: string): string {
  return letter.trim().toUpperCase().replace(/[–—−]/g, '-')
}

/** Band used for color coding: A/B/C/D/F, or null for non-letter marks (P, NG, I...). */
export function gradeBand(letter: string | null | undefined): 'A' | 'B' | 'C' | 'D' | 'F' | null {
  if (!letter) return null
  const c = normalizeLetter(letter).charAt(0)
  return c === 'A' || c === 'B' || c === 'C' || c === 'D' || c === 'F' ? c : null
}

/** Suggests a level from the course title. The user can always override it. */
export function detectLevel(title: string): CourseLevel {
  const t = ` ${title.toUpperCase()} `
  if (/\bAP\b/.test(t) || t.includes('ADVANCED PLACEMENT')) return 'ap'
  if (/\bIB\b/.test(t) || t.includes('INTL BACC') || t.includes('INTERNATIONAL BACC')) return 'ib'
  if (/\bDE\b/.test(t) || t.includes('DUAL ENR')) return 'dual'
  if (/\bHN\b/.test(t) || /\bHON(ORS)?\b/.test(t)) return 'honors'
  if (/\bAV\b/.test(t)) return 'av'
  return 'regular'
}

export interface GpaCourseInput {
  letter: string | null
  level: CourseLevel
  customBonus?: number | null
  credits: number
}

export interface GpaResult {
  unweighted: number | null
  weighted: number | null
  credits: number
  counted: number
}

export function computeGpa(courses: GpaCourseInput[], settings: Pick<Settings, 'scale' | 'levelBonus' | 'bonusOnlyIfPassing'>): GpaResult {
  let uw = 0
  let w = 0
  let credits = 0
  let counted = 0
  for (const c of courses) {
    const pts = pointsForLetter(c.letter, settings.scale)
    if (pts == null || !(c.credits > 0)) continue
    const bonus = c.level === 'custom' ? (c.customBonus ?? 0) : (settings.levelBonus[c.level] ?? 0)
    const applied = settings.bonusOnlyIfPassing && pts <= 0 ? 0 : bonus
    uw += pts * c.credits
    w += (pts + applied) * c.credits
    credits += c.credits
    counted++
  }
  if (credits === 0) return { unweighted: null, weighted: null, credits: 0, counted: 0 }
  return { unweighted: uw / credits, weighted: w / credits, credits, counted }
}

/** Combines past terms with a current term into a cumulative GPA (credit-weighted). */
export function cumulativeGpa(
  terms: Array<{ gpaUnweighted: number; gpaWeighted: number | null; credits: number }>
): { unweighted: number | null; weighted: number | null; credits: number } {
  let c = 0
  let u = 0
  let w = 0
  let wc = 0
  for (const t of terms) {
    if (!(t.credits > 0)) continue
    c += t.credits
    u += t.gpaUnweighted * t.credits
    if (t.gpaWeighted != null) {
      w += t.gpaWeighted * t.credits
      wc += t.credits
    }
  }
  return { unweighted: c ? u / c : null, weighted: wc ? w / wc : null, credits: c }
}

export interface CumulativeBreakdown {
  past: GpaResult & { years: number }
  summaryTerms: { unweighted: number | null; weighted: number | null; credits: number }
  thisYear: { unweighted: number | null; weighted: number | null; credits: number }
  total: { unweighted: number | null; weighted: number | null; credits: number }
  hasPastData: boolean
}

/**
 * Cumulative GPA = credit-weighted quality points across every course ever taken:
 * past courses (graded individually with the current scale and level bonuses),
 * past terms entered only as a GPA, and this year's in-progress courses.
 */
export function cumulativeBreakdown(
  pastCourses: PastCourse[],
  pastTerms: PastTerm[],
  thisYear: { unweighted: number | null; weighted: number | null; credits: number } | null,
  settings: Pick<Settings, 'scale' | 'levelBonus' | 'bonusOnlyIfPassing'>
): CumulativeBreakdown {
  const past = computeGpa(pastCourses.map((c) => ({ letter: c.letter, level: c.level, credits: c.credits })), settings)
  const summaryTerms = cumulativeGpa(pastTerms)
  const parts: Array<{ gpaUnweighted: number; gpaWeighted: number | null; credits: number }> = []
  if (past.unweighted != null) parts.push({ gpaUnweighted: past.unweighted, gpaWeighted: past.weighted, credits: past.credits })
  for (const t of pastTerms) parts.push(t)
  const ty = thisYear && thisYear.unweighted != null ? thisYear : { unweighted: null, weighted: null, credits: 0 }
  if (ty.unweighted != null && ty.credits > 0) parts.push({ gpaUnweighted: ty.unweighted, gpaWeighted: ty.weighted, credits: ty.credits })
  return {
    past: { ...past, years: new Set(pastCourses.map((c) => c.year)).size },
    summaryTerms,
    thisYear: ty,
    total: cumulativeGpa(parts),
    hasPastData: past.credits > 0 || summaryTerms.credits > 0
  }
}
