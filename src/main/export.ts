// Export to JSON (full, re-importable) and CSV (flat assignments, matches the CSV import template).

import type { AppData } from '@shared/types'
import type { Database } from './database/database'
import type { NormalizedData } from './studentvue/normalized'

export function toNormalized(data: AppData): NormalizedData {
  const periodIndex = new Map(data.periods.map((p) => [p.id, p.index]))
  return {
    student: data.student ? { name: data.student.name, permId: data.student.permId, school: data.student.school, grade: data.student.grade } : null,
    periods: data.periods.map((p) => ({ index: p.index, name: p.name, startDate: p.startDate, endDate: p.endDate })),
    currentPeriodIndex: data.currentPeriodId != null ? (periodIndex.get(data.currentPeriodId) ?? null) : null,
    courses: data.courses.map((c) => {
      const periodIds = new Set([...data.marks.filter((m) => m.courseId === c.id).map((m) => m.periodId), ...data.assignments.filter((a) => a.courseId === c.id).map((a) => a.periodId)])
      return {
        key: c.key,
        name: c.name,
        period: c.period,
        room: c.room,
        teacher: c.teacher,
        teacherEmail: c.teacherEmail,
        marks: [...periodIds].map((pid) => {
          const m = data.marks.find((x) => x.courseId === c.id && x.periodId === pid)
          return {
            periodIndex: periodIndex.get(pid) ?? 0,
            markName: m?.markName ?? 'Mark',
            letter: m?.letter ?? null,
            percent: m?.percent ?? null,
            categories: data.categories
              .filter((x) => x.courseId === c.id && x.periodId === pid)
              .map((x) => ({ name: x.name, weight: x.weight, points: x.points, pointsPossible: x.pointsPossible, mark: x.mark })),
            assignments: data.assignments
              .filter((a) => a.courseId === c.id && a.periodId === pid)
              .map((a) => ({
                sourceId: a.sourceId,
                name: a.name,
                category: a.category,
                date: a.date,
                dueDate: a.dueDate,
                earned: a.earned,
                possible: a.possible,
                status: a.status,
                scoreText: a.scoreText,
                pointsText: a.pointsText,
                notes: a.notes,
                description: a.description
              }))
          }
        })
      }
    }),
    attendance: data.attendance
  }
}

export function exportJson(db: Database): string {
  const data = db.getAppData()
  return JSON.stringify(
    {
      gradekiwi: true,
      version: 1,
      exportedAt: new Date().toISOString(),
      source: data.sync.source,
      data: toNormalized(data),
      courseSettings: data.courses.map((c) => ({ key: c.key, config: c.config })),
      snapshots: db.listSnapshots(),
      scenarios: db.listScenarios(),
      settings: db.getSettings()
    },
    null,
    2
  )
}

function csvCell(v: unknown): string {
  if (v == null) return ''
  let s = String(v)
  // Neutralize spreadsheet formula injection.
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d/.test(s)) s = `'${s}`
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function exportCsv(db: Database): string {
  const data = db.getAppData()
  const course = new Map(data.courses.map((c) => [c.id, c]))
  const period = new Map(data.periods.map((p) => [p.id, p.name]))
  const header = ['Course', 'Teacher', 'Period', 'Grading Period', 'Assignment', 'Category', 'Earned', 'Possible', 'Percent', 'Date', 'Due Date', 'Status', 'Notes']
  const lines = [header.join(',')]
  for (const a of data.assignments) {
    const c = course.get(a.courseId)
    if (!c) continue
    const pct = a.earned != null && a.possible ? ((a.earned / a.possible) * 100).toFixed(2) : ''
    lines.push(
      [c.name, c.teacher, c.period, period.get(a.periodId), a.name, a.category, a.earned, a.possible, pct, a.date, a.dueDate, a.status.replace('_', ' '), a.notes]
        .map(csvCell)
        .join(',')
    )
  }
  return lines.join('\n') + '\n'
}
