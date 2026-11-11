import type { AppData, Settings, Snapshot } from '@shared/types'
import { latestPeriodFor, runningGrade } from '@shared/grading/model'

/** Stable course → series slot (by schedule order), so a course keeps its color everywhere. */
export function courseColorMap(data: AppData, series: string[]): Map<number, string> {
  const m = new Map<number, string>()
  data.courses.forEach((c, i) => m.set(c.id, series[i % series.length]!))
  return m
}

export interface HistorySeries {
  rows: Array<Record<string, number | string | null>>
  series: Array<{ key: string; name: string; courseId: number }>
  source: 'snapshots' | 'reconstructed' | 'none'
}

/**
 * Grade history per course. Uses saved sync snapshots once there are at least 3 distinct days of them;
 * before that, reconstructs a running grade from assignment due dates (labelled in the UI).
 */
export function gradeHistory(data: AppData, snapshots: Snapshot[], periodId: number | null, settings: Settings, courseIds?: number[]): HistorySeries {
  const courses = data.courses.filter((c) => !courseIds || courseIds.includes(c.id))
  // Rolling gradebooks: a course has one continuous grade all year, so snapshots aren't split by quarter.
  const snaps = snapshots
  const days = new Set(snaps.map((s) => s.takenAt.slice(0, 10)))
  if (days.size >= 3) {
    const byDay = new Map<string, Record<string, number | string | null>>()
    for (const s of snaps) {
      const d = s.takenAt.slice(0, 10)
      const row = byDay.get(d) ?? { date: d }
      for (const c of courses) {
        const sc = s.courses.find((x) => x.courseKey === c.key)
        if (sc?.percent != null) row[`c${c.id}`] = Number(sc.percent.toFixed(2))
      }
      byDay.set(d, row)
    }
    return { rows: [...byDay.values()], series: courses.map((c) => ({ key: `c${c.id}`, name: c.name, courseId: c.id })), source: 'snapshots' }
  }
  const byDate = new Map<string, Record<string, number | string | null>>()
  for (const c of courses) {
    for (const p of runningGrade(data, c, latestPeriodFor(data, c.id, periodId) ?? periodId, settings)) {
      const row = byDate.get(p.date) ?? { date: p.date }
      row[`c${c.id}`] = Number(p.percent.toFixed(2))
      byDate.set(p.date, row)
    }
  }
  const rows = [...byDate.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)))
  return { rows, series: courses.map((c) => ({ key: `c${c.id}`, name: c.name, courseId: c.id })), source: rows.length ? 'reconstructed' : 'none' }
}
