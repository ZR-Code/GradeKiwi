// SQLite persistence (Node's built-in node:sqlite — no native modules to rebuild).

import { DatabaseSync, type SQLInputValue } from 'node:sqlite'
import type {
  AppData,
  Assignment,
  AssignmentStatus,
  CategoryWeight,
  Course,
  CourseConfig,
  CourseMark,
  DataSource,
  GradingPeriod,
  Hypothetical,
  Scenario,
  Settings,
  Snapshot,
  SnapshotCourse,
  SyncInfo
} from '@shared/types'
import { DEFAULT_COURSE_CONFIG, DEFAULT_SETTINGS, gpaFromSummaries, yearSummaries } from '@shared/grading/model'
import { detectLevel } from '@shared/grading/scale'
import type { NormalizedData } from '../studentvue/normalized'
import { migrations } from './migrations'

type Row = Record<string, SQLInputValue>
const now = () => new Date().toISOString()

export class Database {
  readonly db: DatabaseSync

  constructor(path: string) {
    this.db = new DatabaseSync(path)
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;')
    this.migrate()
  }

  close(): void {
    this.db.close()
  }

  private migrate(): void {
    const v = (this.db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version
    for (let i = v; i < migrations.length; i++) {
      this.tx(() => {
        this.db.exec(migrations[i]!)
        this.db.exec(`PRAGMA user_version = ${i + 1}`)
      })
    }
  }

  tx<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const r = fn()
      this.db.exec('COMMIT')
      return r
    } catch (e) {
      this.db.exec('ROLLBACK')
      throw e
    }
  }

  private all<T>(sql: string, ...params: SQLInputValue[]): T[] {
    return this.db.prepare(sql).all(...params) as T[]
  }
  private get<T>(sql: string, ...params: SQLInputValue[]): T | undefined {
    return this.db.prepare(sql).get(...params) as T | undefined
  }
  private run(sql: string, ...params: SQLInputValue[]) {
    return this.db.prepare(sql).run(...params)
  }

  // ───────────────────────── settings ─────────────────────────

  getSettings(): Settings {
    const rows = this.all<{ key: string; value: string }>('SELECT key, value FROM settings')
    const out: Record<string, unknown> = { ...DEFAULT_SETTINGS }
    for (const r of rows) {
      if (r.key.startsWith('__')) continue
      try {
        out[r.key] = JSON.parse(r.value)
      } catch {
        /* ignore corrupt value; default wins */
      }
    }
    return out as unknown as Settings
  }

  setSettings(patch: Partial<Settings>): Settings {
    this.tx(() => {
      for (const [k, v] of Object.entries(patch)) {
        if (!(k in DEFAULT_SETTINGS) || v === undefined) continue
        this.run('INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', k, JSON.stringify(v))
      }
    })
    return this.getSettings()
  }

  private meta(key: string): string | null {
    return this.get<{ value: string }>('SELECT value FROM settings WHERE key = ?', `__${key}`)?.value ?? null
  }
  private setMeta(key: string, value: string | null): void {
    if (value == null) this.run('DELETE FROM settings WHERE key = ?', `__${key}`)
    else this.run('INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', `__${key}`, value)
  }

  dataSource(): DataSource | null {
    return (this.meta('source') as DataSource | null) ?? null
  }

  // ───────────────────────── sync ─────────────────────────

  /**
   * Upserts normalized data. Assignment rows keep stable ids (so hypothetical overrides survive),
   * user course configs are never overwritten, and data from a different source replaces old data.
   */
  applyNormalized(data: NormalizedData, source: DataSource): { courses: number; assignments: number } {
    return this.tx(() => {
      const prev = this.dataSource()
      if (prev && prev !== source) this.clearGradeData()
      this.setMeta('source', source)
      const ts = now()

      if (data.student) {
        const s = data.student
        this.run(
          `INSERT INTO student(id, name, perm_id, school, grade, updated_at) VALUES (1, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET name = excluded.name, perm_id = excluded.perm_id, school = excluded.school, grade = excluded.grade, updated_at = excluded.updated_at`,
          s.name,
          s.permId,
          s.school,
          s.grade,
          ts
        )
      }

      const periodIdByIndex = new Map<number, number>()
      for (const p of data.periods) {
        this.run(
          `INSERT INTO grading_periods(name, idx, start_date, end_date) VALUES (?, ?, ?, ?)
           ON CONFLICT(name) DO UPDATE SET idx = excluded.idx, start_date = COALESCE(excluded.start_date, start_date), end_date = COALESCE(excluded.end_date, end_date)`,
          p.name,
          p.index,
          p.startDate,
          p.endDate
        )
        periodIdByIndex.set(p.index, this.get<{ id: number }>('SELECT id FROM grading_periods WHERE name = ?', p.name)!.id)
      }
      const curPeriodId = data.currentPeriodIndex != null ? (periodIdByIndex.get(data.currentPeriodIndex) ?? null) : null
      this.setMeta('currentPeriodId', curPeriodId != null ? String(curPeriodId) : null)

      const ensurePeriod = (index: number): number => {
        const id = periodIdByIndex.get(index)
        if (id != null) return id
        const name = `Period ${index + 1}`
        this.run('INSERT INTO grading_periods(name, idx) VALUES (?, ?) ON CONFLICT(name) DO NOTHING', name, index)
        const got = this.get<{ id: number }>('SELECT id FROM grading_periods WHERE name = ?', name)!.id
        periodIdByIndex.set(index, got)
        return got
      }

      let nAssignments = 0
      const seenCourseIds: number[] = []
      for (const c of data.courses) {
        this.run(
          `INSERT INTO courses(key, name, period, room, teacher, teacher_email, active, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)
           ON CONFLICT(key) DO UPDATE SET name = excluded.name, period = excluded.period, room = excluded.room,
             teacher = excluded.teacher, teacher_email = excluded.teacher_email, active = 1, updated_at = excluded.updated_at`,
          c.key,
          c.name,
          c.period,
          c.room,
          c.teacher,
          c.teacherEmail,
          ts
        )
        const courseId = this.get<{ id: number }>('SELECT id FROM courses WHERE key = ?', c.key)!.id
        seenCourseIds.push(courseId)

        // Group marks by period; choose the mark with the most assignments as the period's primary mark.
        const byPeriod = new Map<number, typeof c.marks>()
        for (const m of c.marks) byPeriod.set(m.periodIndex, [...(byPeriod.get(m.periodIndex) ?? []), m])

        for (const [pIndex, marks] of byPeriod) {
          const periodId = ensurePeriod(pIndex)
          const primary = [...marks].sort((a, b) => b.assignments.length - a.assignments.length)[0]!
          const scored = marks.find((m) => m.percent != null || m.letter) ?? primary
          this.run(
            `INSERT INTO course_marks(course_id, period_id, mark_name, letter, percent) VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(course_id, period_id) DO UPDATE SET mark_name = excluded.mark_name, letter = excluded.letter, percent = excluded.percent`,
            courseId,
            periodId,
            scored.markName,
            scored.letter,
            scored.percent
          )

          this.run('DELETE FROM categories WHERE course_id = ? AND period_id = ?', courseId, periodId)
          const cats = marks.flatMap((m) => m.categories)
          const seenCat = new Set<string>()
          for (const cat of cats) {
            if (seenCat.has(cat.name)) continue
            seenCat.add(cat.name)
            this.run(
              'INSERT INTO categories(course_id, period_id, name, weight, points, points_possible, mark) VALUES (?, ?, ?, ?, ?, ?, ?)',
              courseId,
              periodId,
              cat.name,
              cat.weight,
              cat.points,
              cat.pointsPossible,
              cat.mark
            )
          }

          const sourceIds: string[] = []
          for (const a of marks.flatMap((m) => m.assignments)) {
            if (sourceIds.includes(a.sourceId)) continue
            sourceIds.push(a.sourceId)
            this.run(
              `INSERT INTO assignments(course_id, period_id, source_id, name, category, date, due_date, earned, possible, status,
                 score_text, points_text, notes, description, first_seen, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(course_id, period_id, source_id) DO UPDATE SET
                 name = excluded.name, category = excluded.category, date = excluded.date, due_date = excluded.due_date,
                 earned = excluded.earned, possible = excluded.possible, status = excluded.status,
                 score_text = excluded.score_text, points_text = excluded.points_text, notes = excluded.notes,
                 description = excluded.description, updated_at = excluded.updated_at`,
              courseId,
              periodId,
              a.sourceId,
              a.name,
              a.category,
              a.date,
              a.dueDate,
              a.earned,
              a.possible,
              a.status,
              a.scoreText,
              a.pointsText,
              a.notes,
              a.description,
              ts,
              ts
            )
            nAssignments++
          }
          // Remove assignments the teacher deleted (for this course & period only).
          const placeholders = sourceIds.map(() => '?').join(',')
          this.run(
            `DELETE FROM assignments WHERE course_id = ? AND period_id = ?${sourceIds.length ? ` AND source_id NOT IN (${placeholders})` : ''}`,
            courseId,
            periodId,
            ...sourceIds
          )
        }
      }
      // Courses no longer on the schedule stay in the DB (history) but are marked inactive.
      if (seenCourseIds.length) {
        this.run(`UPDATE courses SET active = 0 WHERE id NOT IN (${seenCourseIds.map(() => '?').join(',')})`, ...seenCourseIds)
      }

      if (data.attendance) {
        this.run('DELETE FROM attendance')
        for (const a of data.attendance) {
          this.run('INSERT INTO attendance(date, period, course, reason, note) VALUES (?, ?, ?, ?, ?)', a.date, a.period, a.course, a.reason, a.note)
        }
      }
      return { courses: data.courses.length, assignments: nAssignments }
    })
  }

  logSyncStart(source: DataSource): number {
    return Number(this.run('INSERT INTO sync_log(started_at, source, status) VALUES (?, ?, ?)', now(), source, 'running').lastInsertRowid)
  }

  logSyncEnd(id: number, status: 'ok' | 'error', message: string): void {
    const r = this.run('UPDATE sync_log SET finished_at = ?, status = ?, message = ? WHERE id = ?', now(), status, message, id)
    // The row may have been cleared when the data source changed during this sync.
    if (Number(r.changes) === 0) {
      this.run('INSERT INTO sync_log(started_at, finished_at, source, status, message) VALUES (?, ?, ?, ?, ?)', now(), now(), this.dataSource() ?? 'studentvue', status, message)
    }
  }

  syncInfo(): SyncInfo {
    const last = this.get<{ started_at: string; status: string; message: string | null }>('SELECT started_at, status, message FROM sync_log ORDER BY id DESC LIMIT 1')
    const ok = this.get<{ finished_at: string }>("SELECT finished_at FROM sync_log WHERE status = 'ok' ORDER BY id DESC LIMIT 1")
    return {
      lastAttempt: last?.started_at ?? null,
      lastSuccess: ok?.finished_at ?? null,
      lastStatus: last ? (last.status === 'ok' ? 'ok' : last.status === 'error' ? 'error' : null) : null,
      lastMessage: last?.message ?? null,
      source: this.dataSource()
    }
  }

  // ───────────────────────── reads ─────────────────────────

  getAppData(): AppData {
    const student = this.get<{ name: string | null; perm_id: string | null; school: string | null; grade: string | null; updated_at: string }>('SELECT * FROM student WHERE id = 1')
    const periods = this.all<{ id: number; name: string; idx: number; start_date: string | null; end_date: string | null }>('SELECT * FROM grading_periods ORDER BY idx, id').map(
      (p): GradingPeriod => ({ id: p.id, name: p.name, index: p.idx, startDate: p.start_date, endDate: p.end_date })
    )
    const courses = this.all<{
      id: number
      key: string
      name: string
      period: string | null
      room: string | null
      teacher: string | null
      teacher_email: string | null
      config: string
    }>('SELECT * FROM courses WHERE active = 1 ORDER BY CAST(period AS INTEGER), period, name').map(
      (c): Course => ({
        id: c.id,
        key: c.key,
        name: c.name,
        period: c.period,
        room: c.room,
        teacher: c.teacher,
        teacherEmail: c.teacher_email,
        detectedLevel: detectLevel(c.name),
        config: parseConfig(c.config)
      })
    )
    const marks = this.all<{ course_id: number; period_id: number; mark_name: string; letter: string | null; percent: number | null }>('SELECT * FROM course_marks').map(
      (m): CourseMark => ({ courseId: m.course_id, periodId: m.period_id, markName: m.mark_name, letter: m.letter, percent: m.percent })
    )
    const categories = this.all<{ id: number; course_id: number; period_id: number; name: string; weight: number | null; points: number | null; points_possible: number | null; mark: string | null }>(
      'SELECT * FROM categories'
    ).map(
      (c): CategoryWeight => ({ id: c.id, courseId: c.course_id, periodId: c.period_id, name: c.name, weight: c.weight, points: c.points, pointsPossible: c.points_possible, mark: c.mark })
    )
    const assignments = this.all<Record<string, unknown>>('SELECT * FROM assignments ORDER BY COALESCE(due_date, date) DESC, id DESC').map(
      (a): Assignment => ({
        id: a.id as number,
        courseId: a.course_id as number,
        periodId: a.period_id as number,
        sourceId: a.source_id as string,
        name: a.name as string,
        category: a.category as string | null,
        date: a.date as string | null,
        dueDate: a.due_date as string | null,
        earned: a.earned as number | null,
        possible: a.possible as number | null,
        status: a.status as AssignmentStatus,
        scoreText: a.score_text as string | null,
        pointsText: a.points_text as string | null,
        notes: a.notes as string | null,
        description: a.description as string | null,
        firstSeen: a.first_seen as string,
        updatedAt: a.updated_at as string
      })
    )
    const attendance = this.all<{ date: string | null; period: string | null; course: string | null; reason: string | null; note: string | null }>(
      'SELECT date, period, course, reason, note FROM attendance ORDER BY date DESC'
    )
    const cur = this.meta('currentPeriodId')
    let currentPeriodId = cur ? Number(cur) : null
    if (currentPeriodId != null && !periods.some((p) => p.id === currentPeriodId)) currentPeriodId = null
    return {
      student: student ? { name: student.name, permId: student.perm_id, school: student.school, grade: student.grade, updatedAt: student.updated_at } : null,
      periods,
      currentPeriodId: currentPeriodId ?? periods.at(-1)?.id ?? null,
      courses,
      marks,
      categories,
      assignments,
      attendance,
      sync: this.syncInfo()
    }
  }

  updateCourseConfig(courseId: number, config: CourseConfig): void {
    this.run('UPDATE courses SET config = ? WHERE id = ?', JSON.stringify(config), courseId)
  }

  // ───────────────────────── snapshots ─────────────────────────

  createSnapshot(source: DataSource): number {
    const data = this.getAppData()
    const settings = this.getSettings()
    // Each course's year-to-date grade (rolling gradebook); ended semester courses keep their final grade.
    const summaries = yearSummaries(data, settings, data.currentPeriodId)
    const gpa = gpaFromSummaries(summaries, settings)
    const periodName = data.periods.find((p) => p.id === data.currentPeriodId)?.name ?? null
    return this.tx(() => {
      const id = Number(this.run('INSERT INTO snapshots(taken_at, source, gpa_unweighted, gpa_weighted) VALUES (?, ?, ?, ?)', now(), source, gpa.unweighted, gpa.weighted).lastInsertRowid)
      for (const s of summaries) {
        this.run(
          'INSERT INTO snapshot_courses(snapshot_id, course_key, course_name, period_name, percent, letter, graded, missing, total) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          id,
          s.course.key,
          s.course.name,
          data.periods.find((p) => p.id === s.periodId)?.name ?? periodName,
          s.percent,
          s.letter,
          s.graded,
          s.missing,
          s.total
        )
      }
      return id
    })
  }

  listSnapshots(): Snapshot[] {
    const snaps = this.all<{ id: number; taken_at: string; source: DataSource; gpa_unweighted: number | null; gpa_weighted: number | null }>('SELECT * FROM snapshots ORDER BY taken_at')
    const courses = this.all<{
      snapshot_id: number
      course_key: string
      course_name: string
      period_name: string | null
      percent: number | null
      letter: string | null
      graded: number
      missing: number
      total: number
    }>('SELECT * FROM snapshot_courses')
    const by = new Map<number, SnapshotCourse[]>()
    for (const c of courses) {
      by.set(c.snapshot_id, [
        ...(by.get(c.snapshot_id) ?? []),
        { courseKey: c.course_key, courseName: c.course_name, periodName: c.period_name, percent: c.percent, letter: c.letter, graded: c.graded, missing: c.missing, total: c.total }
      ])
    }
    return snaps.map((s) => ({ id: s.id, takenAt: s.taken_at, source: s.source, gpaUnweighted: s.gpa_unweighted, gpaWeighted: s.gpa_weighted, courses: by.get(s.id) ?? [] }))
  }

  // ───────────────────────── hypotheticals ─────────────────────────

  listScenarios(): Scenario[] {
    const scen = this.all<{ id: number; name: string; enabled: number; created_at: string; updated_at: string }>('SELECT * FROM scenarios ORDER BY id')
    const items = this.all<Record<string, unknown>>('SELECT * FROM hypotheticals ORDER BY id').map(
      (h): Hypothetical => ({
        id: h.id as number,
        scenarioId: h.scenario_id as number,
        courseId: h.course_id as number,
        periodId: h.period_id as number | null,
        kind: h.kind as 'add' | 'override',
        targetAssignmentId: h.target_assignment_id as number | null,
        name: h.name as string,
        category: h.category as string | null,
        earned: h.earned as number | null,
        possible: h.possible as number | null,
        dueDate: h.due_date as string | null
      })
    )
    return scen.map((s) => ({ id: s.id, name: s.name, enabled: !!s.enabled, createdAt: s.created_at, updatedAt: s.updated_at, items: items.filter((i) => i.scenarioId === s.id) }))
  }

  createScenario(name: string): number {
    const ts = now()
    return Number(this.run('INSERT INTO scenarios(name, enabled, created_at, updated_at) VALUES (?, 1, ?, ?)', name, ts, ts).lastInsertRowid)
  }

  renameScenario(id: number, name: string): void {
    this.run('UPDATE scenarios SET name = ?, updated_at = ? WHERE id = ?', name, now(), id)
  }

  setScenarioEnabled(id: number, enabled: boolean): void {
    this.run('UPDATE scenarios SET enabled = ?, updated_at = ? WHERE id = ?', enabled ? 1 : 0, now(), id)
  }

  deleteScenario(id: number): void {
    this.run('DELETE FROM scenarios WHERE id = ?', id)
  }

  duplicateScenario(id: number, name: string): number {
    return this.tx(() => {
      const newId = this.createScenario(name)
      this.run(
        `INSERT INTO hypotheticals(scenario_id, course_id, period_id, kind, target_assignment_id, name, category, earned, possible, due_date)
         SELECT ?, course_id, period_id, kind, target_assignment_id, name, category, earned, possible, due_date FROM hypotheticals WHERE scenario_id = ?`,
        newId,
        id
      )
      return newId
    })
  }

  upsertHypothetical(h: Omit<Hypothetical, 'id'> & { id?: number }): number {
    const vals: Row = {
      scenario_id: h.scenarioId,
      course_id: h.courseId,
      period_id: h.periodId,
      kind: h.kind,
      target_assignment_id: h.targetAssignmentId,
      name: h.name,
      category: h.category,
      earned: h.earned,
      possible: h.possible,
      due_date: h.dueDate
    }
    this.run('UPDATE scenarios SET updated_at = ? WHERE id = ?', now(), h.scenarioId)
    if (h.id) {
      const sets = Object.keys(vals).map((k) => `${k} = ?`).join(', ')
      this.run(`UPDATE hypotheticals SET ${sets} WHERE id = ?`, ...Object.values(vals), h.id)
      return h.id
    }
    return Number(
      this.run(`INSERT INTO hypotheticals(${Object.keys(vals).join(', ')}) VALUES (${Object.keys(vals).map(() => '?').join(', ')})`, ...Object.values(vals)).lastInsertRowid
    )
  }

  deleteHypothetical(id: number): void {
    this.run('DELETE FROM hypotheticals WHERE id = ?', id)
  }

  // ───────────────────────── deletion ─────────────────────────

  private clearGradeData(): void {
    this.db.exec(`
      DELETE FROM hypotheticals; DELETE FROM scenarios;
      DELETE FROM assignments; DELETE FROM categories; DELETE FROM course_marks;
      DELETE FROM courses; DELETE FROM grading_periods; DELETE FROM attendance; DELETE FROM student;
      DELETE FROM snapshot_courses; DELETE FROM snapshots; DELETE FROM sync_log;
      DELETE FROM settings WHERE key LIKE '\\_\\_%' ESCAPE '\\';
    `)
  }

  /** Deletes all StudentVUE/imported data, history and scenarios. Keeps preferences. */
  deleteAllData(): void {
    this.tx(() => this.clearGradeData())
    this.db.exec('VACUUM')
  }
}

function parseConfig(json: string): CourseConfig {
  try {
    const v = JSON.parse(json) as Partial<CourseConfig>
    return { ...DEFAULT_COURSE_CONFIG, ...v, dropLowest: v.dropLowest ?? {} }
  } catch {
    return { ...DEFAULT_COURSE_CONFIG }
  }
}
