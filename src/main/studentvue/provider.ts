// Provider abstraction. A provider turns credentials into NormalizedData.
// Adding an SSO-based provider later only requires implementing this interface.

import type { ProviderInfo, SyncProgress } from '@shared/types'
import { StudentVueClient, StudentVueError, type Credentials, type FetchLike } from './client'
import { courseKey, type NormalizedCourse, type NormalizedData } from './normalized'
import { parseGradebookXml, type ParsedGradebook } from './parsers/gradebook'
import { parseAttendanceXml, parseStudentInfoXml } from './parsers/student'

export interface GradeProvider {
  readonly info: ProviderInfo
  /** Verifies credentials with one lightweight request. Returns the student's display name if available. */
  validate(creds: Credentials): Promise<{ studentName: string | null }>
  fetchAll(creds: Credentials, onProgress: (p: SyncProgress) => void): Promise<NormalizedData>
}

export const FCPS: ProviderInfo = {
  id: 'fcps-soap',
  name: 'Fairfax County Public Schools',
  baseUrl: 'https://sisstudent.fcps.edu/SVUE',
  notes: [
    'Uses the Synergy StudentVUE web service at sisstudent.fcps.edu/SVUE/Service/PXPCommunication.asmx — the same service used by the StudentVUE app for username/password sign-in.',
    'Sign in with your FCPS network user name (student ID) and password.',
    'FCPS states the username/password option is temporary and will be removed by December 2026 (date TBD). After that, only FCPS SSO works and direct sync will stop; use file import instead.',
    'The FCPS web portal itself is SSO-only (SAML via aic.fcps.edu). GradeKiwi never automates or bypasses that login.'
  ]
}

export class SynergySoapProvider implements GradeProvider {
  constructor(
    readonly info: ProviderInfo,
    private readonly fetchImpl: FetchLike
  ) {}

  private client(creds: Credentials): StudentVueClient {
    return new StudentVueClient(this.info.baseUrl, creds, this.fetchImpl)
  }

  async validate(creds: Credentials): Promise<{ studentName: string | null }> {
    const c = this.client(creds)
    const xml = await c.call('StudentInfo', { ChildIntID: 0 })
    return { studentName: parseStudentInfoXml(xml).name }
  }

  async fetchAll(creds: Credentials, onProgress: (p: SyncProgress) => void): Promise<NormalizedData> {
    const c = this.client(creds)
    onProgress({ stage: 'Signing in', fraction: 0.05 })
    const student = parseStudentInfoXml(await c.call('StudentInfo', { ChildIntID: 0 }))

    onProgress({ stage: 'Loading gradebook', fraction: 0.15 })
    const first = parseGradebookXml(await c.call('Gradebook', { ChildIntID: 0 }))
    const periods = first.periods
    const currentIdx = periods.find((p) => p.name === first.currentPeriod?.name)?.index ?? null

    const byIndex = new Map<number, ParsedGradebook>()
    if (currentIdx != null) byIndex.set(currentIdx, first)

    // Fetch each grading period that has started (future periods have no data yet).
    const today = new Date().toISOString().slice(0, 10)
    const toFetch = periods.filter((p) => !byIndex.has(p.index) && (!p.startDate || p.startDate <= today))
    let done = 0
    for (const p of toFetch) {
      onProgress({ stage: 'Loading gradebook', detail: p.name, fraction: 0.15 + (0.65 * done) / Math.max(1, toFetch.length) })
      try {
        byIndex.set(p.index, parseGradebookXml(await c.call('Gradebook', { ChildIntID: 0, ReportPeriod: p.index })))
      } catch (e) {
        if (e instanceof StudentVueError && e.kind === 'auth') throw e
        // One unavailable period shouldn't fail the whole sync.
      }
      done++
    }
    if (currentIdx == null && periods.length === 0) byIndex.set(0, first)

    onProgress({ stage: 'Loading attendance', fraction: 0.85 })
    let attendance = null
    try {
      attendance = parseAttendanceXml(await c.call('Attendance', { ChildIntID: 0 }))
    } catch (e) {
      if (e instanceof StudentVueError && e.kind === 'auth') throw e
      attendance = null // Attendance may be disabled by the district; keep previous data.
    }

    return {
      student,
      periods: periods.length ? periods : [{ index: 0, name: first.currentPeriod?.name || 'Current', startDate: first.currentPeriod?.startDate ?? null, endDate: first.currentPeriod?.endDate ?? null }],
      currentPeriodIndex: currentIdx ?? 0,
      courses: mergeCourses(byIndex),
      attendance
    }
  }
}

/** Merges per-period gradebooks into one course list with marks tagged by period index. */
export function mergeCourses(byIndex: Map<number, ParsedGradebook>): NormalizedCourse[] {
  const courses = new Map<string, NormalizedCourse>()
  for (const [periodIndex, gb] of [...byIndex.entries()].sort((a, b) => a[0] - b[0])) {
    for (const c of gb.courses) {
      const key = c.key || courseKey(c.name)
      let existing = courses.get(key)
      if (!existing) {
        existing = { ...c, key, marks: [] }
        courses.set(key, existing)
      } else {
        // Later periods have the most current teacher/room.
        existing.teacher = c.teacher ?? existing.teacher
        existing.teacherEmail = c.teacherEmail ?? existing.teacherEmail
        existing.room = c.room ?? existing.room
        existing.period = c.period ?? existing.period
      }
      for (const m of c.marks) existing.marks.push({ ...m, periodIndex })
    }
  }
  return [...courses.values()]
}
