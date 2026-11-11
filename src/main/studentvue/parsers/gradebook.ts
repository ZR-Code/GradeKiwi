// Parses the Synergy "Gradebook" web-service XML (same format the StudentVUE app receives).
// Format reference: community documentation of the Synergy SOAP API (github.com/StudentVue/docs)
// and the StudentVue.js / python studentvue libraries.

import type { AssignmentStatus } from '@shared/types'
import { courseKey, type NormalizedAssignment, type NormalizedCategory, type NormalizedCourse, type NormalizedPeriod } from '../normalized'
import { isoDate, list, node, num, parseXml, str, type XmlNode } from './xml'

export interface ParsedGradebook {
  periods: NormalizedPeriod[]
  currentPeriod: { name: string; startDate: string | null; endDate: string | null } | null
  courses: Array<Omit<NormalizedCourse, 'marks'> & { marks: Array<Omit<NormalizedCourse['marks'][number], 'periodIndex'>> }>
}

export class GradebookFormatError extends Error {}

export function parseGradebookXml(xml: string): ParsedGradebook {
  const doc = parseXml(xml)
  const gb = node(doc['Gradebook'])
  if (!gb) throw new GradebookFormatError('Response did not contain a <Gradebook> element.')
  const err = str(gb, 'ErrorMessage')
  if (err) throw new GradebookFormatError(err)

  const periods: NormalizedPeriod[] = list(node(gb['ReportingPeriods'])?.['ReportPeriod']).map((p, i) => ({
    index: num(str(p, 'Index')) ?? i,
    name: str(p, 'GradePeriod') ?? `Period ${i + 1}`,
    startDate: isoDate(str(p, 'StartDate')),
    endDate: isoDate(str(p, 'EndDate'))
  }))

  const cur = node(gb['ReportingPeriod'])
  const currentPeriod = cur
    ? { name: str(cur, 'GradePeriod') ?? '', startDate: isoDate(str(cur, 'StartDate')), endDate: isoDate(str(cur, 'EndDate')) }
    : null

  const courses = list(node(gb['Courses'])?.['Course']).map(parseCourse)
  // Disambiguate duplicate titles (e.g. two "Study Hall" sections).
  const seen = new Map<string, number>()
  for (const c of courses) {
    const k = seen.get(c.key) ?? 0
    seen.set(c.key, k + 1)
    if (k > 0) c.key = `${c.key}#${c.period ?? k}`
  }
  return { periods, currentPeriod, courses }
}

function parseCourse(c: XmlNode): ParsedGradebook['courses'][number] {
  const title = str(c, 'Title') ?? str(c, 'CourseName') ?? 'Untitled course'
  const marks = list(node(c['Marks'])?.['Mark']).map((m) => {
    const categories: NormalizedCategory[] = list(node(m['GradeCalculationSummary'])?.['AssignmentGradeCalc'])
      .filter((g) => (str(g, 'Type') ?? '').toUpperCase() !== 'TOTAL')
      .map((g) => ({
        name: str(g, 'Type') ?? 'Uncategorized',
        weight: num((str(g, 'Weight') ?? '').replace('%', '')),
        points: num(str(g, 'Points')),
        pointsPossible: num(str(g, 'PointsPossible')),
        mark: str(g, 'CalculatedMark')
      }))
    return {
      markName: str(m, 'MarkName') ?? 'Mark',
      letter: cleanLetter(str(m, 'CalculatedScoreString')),
      percent: num(str(m, 'CalculatedScoreRaw')),
      categories,
      assignments: list(node(m['Assignments'])?.['Assignment']).map(parseAssignment)
    }
  })
  return {
    key: courseKey(title),
    name: displayTitle(title),
    period: str(c, 'Period'),
    room: str(c, 'Room'),
    teacher: str(c, 'Staff'),
    teacherEmail: str(c, 'StaffEMail'),
    marks
  }
}

function cleanLetter(s: string | null): string | null {
  if (!s) return null
  const t = s.trim()
  if (!t || /^n\/?a$/i.test(t)) return null
  return t
}

/** "Algebra 2 HN (310334)" -> "Algebra 2 HN". Keeps the full title in the course key. */
export function displayTitle(title: string): string {
  return title.replace(/\s*\(\s*(?=[A-Z0-9-]*\d)[A-Z0-9-]{3,}\s*\)\s*$/i, '').trim() || title.trim()
}

export function parseAssignment(a: XmlNode, i = 0): NormalizedAssignment {
  const name = str(a, 'Measure') ?? str(a, 'Name') ?? 'Untitled assignment'
  const scoreText = str(a, 'Score')
  const pointsText = str(a, 'Points')
  const notes = str(a, 'Notes')
  const date = isoDate(str(a, 'Date'))
  const dueDate = isoDate(str(a, 'DueDate')) ?? date
  const { earned, possible } = parsePoints(pointsText, scoreText)
  const status = deriveStatus(scoreText, notes, earned, a)
  return {
    sourceId: str(a, 'GradebookID') ?? `${name}|${dueDate ?? ''}|${i}`,
    name,
    category: str(a, 'Type'),
    date,
    dueDate,
    earned: status === 'not_graded' ? null : earned,
    possible,
    status,
    scoreText,
    pointsText,
    notes,
    description: str(a, 'MeasureDescription')
  }
}

/**
 * Points: "9.00 / 10.0000" (graded) | "10.0000 Points Possible" (ungraded) | "".
 * Score:  "9 out of 10.0000" | "Not Graded" | "95" with ScoreType percent.
 */
export function parsePoints(points: string | null, score: string | null): { earned: number | null; possible: number | null } {
  const p = (points ?? '').replace(/,/g, '')
  let m = p.match(/^\s*(-?\d*\.?\d+)\s*\/\s*(\d*\.?\d+)\s*$/)
  if (m) return { earned: Number(m[1]), possible: Number(m[2]) }
  m = p.match(/^\s*(\d*\.?\d+)\s*Points?\s*Possible/i)
  if (m) return { earned: null, possible: Number(m[1]) }
  const s = (score ?? '').replace(/,/g, '')
  m = s.match(/^\s*(-?\d*\.?\d+)\s*out\s*of\s*(\d*\.?\d+)\s*$/i)
  if (m) return { earned: Number(m[1]), possible: Number(m[2]) }
  return { earned: null, possible: null }
}

function deriveStatus(score: string | null, notes: string | null, earned: number | null, raw: XmlNode): AssignmentStatus {
  const s = (score ?? '').trim().toLowerCase()
  const n = (notes ?? '').toLowerCase()
  const flag = (k: string) => (str(raw, k) ?? '').toLowerCase() === 'true'
  if (/\b(exempt|excused)\b/.test(s) || /^(ex|exc)$/.test(s) || /\bexempt\b/.test(n)) return 'exempt'
  if (flag('IsMissing') || flag('Missing') || /\bmissing\b/.test(s) || /^m$/.test(s) || /\bmissing\b/.test(n)) return 'missing'
  if (earned == null || s === 'not graded' || s === 'not due') return 'not_graded'
  return 'graded'
}
