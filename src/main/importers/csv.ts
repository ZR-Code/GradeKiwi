// CSV import for student-owned gradebook data (secure alternative when direct sync is unavailable).
// Columns (header names are case-insensitive; only Course and Assignment are required):
//   Course, Teacher, Period, Grading Period, Assignment, Category, Earned, Possible,
//   Date, Due Date, Status (graded|missing|exempt|not graded), Notes, Course Percent, Course Letter, Weight

import type { AssignmentStatus } from '@shared/types'
import { courseKey, type NormalizedCourse, type NormalizedData } from '../studentvue/normalized'
import { isoDate, num } from '../studentvue/parsers/xml'

export function splitCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  const s = text.replace(/^﻿/, '')
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!
    if (quoted) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          field += '"'
          i++
        } else quoted = false
      } else field += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') {
      row.push(field)
      field = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else field += ch
  }
  if (field.length || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((r) => r.some((c) => c.trim().length))
}

const ALIASES: Record<string, string[]> = {
  course: ['course', 'course name', 'class'],
  teacher: ['teacher', 'staff', 'instructor'],
  period: ['period', 'class period'],
  gradingPeriod: ['grading period', 'quarter', 'term', 'marking period'],
  assignment: ['assignment', 'assignment name', 'name', 'measure'],
  category: ['category', 'type', 'assignment type'],
  earned: ['earned', 'score', 'points earned', 'earned points'],
  possible: ['possible', 'total points', 'points possible', 'max points', 'out of'],
  date: ['date', 'assigned', 'assigned date'],
  dueDate: ['due date', 'due'],
  status: ['status'],
  notes: ['notes', 'comment', 'comments'],
  coursePercent: ['course percent', 'course grade', 'course %'],
  courseLetter: ['course letter', 'letter grade'],
  weight: ['weight', 'category weight']
}

export function parseCsv(text: string): NormalizedData {
  const rows = splitCsv(text)
  if (rows.length < 2) throw new Error('The CSV file has no data rows.')
  const header = rows[0]!.map((h) => h.trim().toLowerCase())
  const col: Record<string, number> = {}
  for (const [key, names] of Object.entries(ALIASES)) {
    const idx = header.findIndex((h) => names.includes(h))
    if (idx >= 0) col[key] = idx
  }
  if (col.course == null || col.assignment == null) throw new Error('CSV must include "Course" and "Assignment" columns.')

  const periodNames: string[] = []
  const courses = new Map<string, NormalizedCourse>()
  const get = (r: string[], k: string) => {
    const i = col[k]
    const v = i == null ? '' : (r[i] ?? '').trim()
    return v.length ? v : null
  }

  rows.slice(1).forEach((r, rowIdx) => {
    const courseName = get(r, 'course')
    const name = get(r, 'assignment')
    if (!courseName || !name) return
    const gp = get(r, 'gradingPeriod') ?? 'Imported'
    if (!periodNames.includes(gp)) periodNames.push(gp)
    const periodIndex = periodNames.indexOf(gp)
    const key = courseKey(courseName)
    let c = courses.get(key)
    if (!c) {
      c = { key, name: courseName, period: get(r, 'period'), room: null, teacher: get(r, 'teacher'), teacherEmail: null, marks: [] }
      courses.set(key, c)
    }
    let mark = c.marks.find((m) => m.periodIndex === periodIndex)
    if (!mark) {
      mark = { periodIndex, markName: gp, letter: null, percent: null, categories: [], assignments: [] }
      c.marks.push(mark)
    }
    const cp = num(get(r, 'coursePercent')?.replace('%', ''))
    if (cp != null) mark.percent = cp
    mark.letter = get(r, 'courseLetter') ?? mark.letter
    const category = get(r, 'category')
    const w = num(get(r, 'weight')?.replace('%', ''))
    if (category && w != null && !mark.categories.some((x) => x.name === category)) {
      mark.categories.push({ name: category, weight: w, points: null, pointsPossible: null, mark: null })
    }
    const earned = num(get(r, 'earned'))
    const possible = num(get(r, 'possible'))
    const status = parseStatus(get(r, 'status'), earned)
    const date = isoDate(get(r, 'date'))
    mark.assignments.push({
      sourceId: `csv:${name}|${isoDate(get(r, 'dueDate')) ?? date ?? ''}|${rowIdx}`,
      name,
      category,
      date,
      dueDate: isoDate(get(r, 'dueDate')) ?? date,
      earned: status === 'not_graded' || status === 'exempt' ? null : earned,
      possible,
      status,
      scoreText: get(r, 'earned'),
      pointsText: possible != null ? `${earned ?? '—'} / ${possible}` : null,
      notes: get(r, 'notes'),
      description: null
    })
  })

  if (courses.size === 0) throw new Error('No rows with both a course and an assignment were found.')
  return {
    student: null,
    periods: periodNames.map((name, index) => ({ index, name, startDate: null, endDate: null })),
    currentPeriodIndex: periodNames.length - 1,
    courses: [...courses.values()],
    attendance: null
  }
}

function parseStatus(s: string | null, earned: number | null): AssignmentStatus {
  const t = (s ?? '').toLowerCase()
  if (t.startsWith('miss')) return 'missing'
  if (t.startsWith('ex')) return 'exempt'
  if (t.includes('not') || t === 'ungraded' || t === 'pending') return 'not_graded'
  return earned == null ? 'not_graded' : 'graded'
}

export const CSV_TEMPLATE =
  'Course,Teacher,Grading Period,Assignment,Category,Earned,Possible,Due Date,Status,Weight\n' +
  'Chemistry HN,Smith,Quarter 1,Lab 1,Labs,18,20,2025-09-10,graded,40\n' +
  'Chemistry HN,Smith,Quarter 1,Unit 1 Test,Tests,,100,2025-09-30,not graded,60\n'
