import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Database } from '../src/main/database/database'
import { parseImport } from '../src/main/importers'

const xml = readFileSync(resolve(__dirname, 'fixtures/gradebook.xml'), 'utf8')

let dir: string
let db: Database
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'gk-'))
  db = new Database(join(dir, 'test.db'))
})
afterEach(() => {
  db.close()
  rmSync(dir, { recursive: true, force: true })
})

describe('database', () => {
  it('imports, and re-sync updates rather than duplicates', () => {
    const data = parseImport('gb.xml', xml)
    db.applyNormalized(data, 'import')
    const first = db.getAppData()
    expect(first.courses).toHaveLength(2)
    expect(first.assignments).toHaveLength(6)
    const idBefore = first.assignments.find((a) => a.sourceId === '1004')!.id

    // Teacher grades Unit 2 Test and deletes HW 1.3.
    const updated = parseImport(
      'gb.xml',
      xml
        .replace('Score="Not Graded" ScoreType="Raw Score" Points="100.0000 Points Possible"', 'Score="88 out of 100.0000" ScoreType="Raw Score" Points="88.00 / 100.0000"')
        .replace(/<Assignment GradebookID="1005"[^>]*\/>/, '')
    )
    db.applyNormalized(updated, 'import')
    const second = db.getAppData()
    expect(second.assignments).toHaveLength(5)
    const graded = second.assignments.find((a) => a.sourceId === '1004')!
    expect(graded.id).toBe(idBefore)
    expect(graded).toMatchObject({ earned: 88, status: 'graded' })
  })

  it('preserves user course config and hypotheticals across syncs', () => {
    db.applyNormalized(parseImport('gb.xml', xml), 'import')
    const course = db.getAppData().courses[0]!
    db.updateCourseConfig(course.id, { ...course.config, level: 'honors', credits: 0.5 })
    const sid = db.createScenario('What if')
    const target = db.getAppData().assignments.find((a) => a.sourceId === '1001')!
    db.upsertHypothetical({ scenarioId: sid, courseId: course.id, periodId: target.periodId, kind: 'override', targetAssignmentId: target.id, name: 'Retake', category: 'Tests', earned: 100, possible: 100, dueDate: null })
    db.applyNormalized(parseImport('gb.xml', xml), 'import')
    const after = db.getAppData()
    expect(after.courses[0]!.config).toMatchObject({ level: 'honors', credits: 0.5 })
    expect(db.listScenarios()[0]!.items).toHaveLength(1)
    // Hypotheticals never touch real rows.
    expect(after.assignments.find((a) => a.sourceId === '1001')!.earned).toBe(92)
  })

  it('records snapshots that survive later changes', () => {
    db.applyNormalized(parseImport('gb.xml', xml), 'import')
    db.createSnapshot('import')
    db.applyNormalized(parseImport('gb.xml', xml.replace('CalculatedScoreRaw="91.4"', 'CalculatedScoreRaw="95.0"')), 'import')
    db.createSnapshot('import')
    const snaps = db.listSnapshots()
    expect(snaps).toHaveLength(2)
    expect(snaps.map((s) => s.courses.find((c) => c.courseName === 'AP Calculus BC')!.percent)).toEqual([91.4, 95])
    expect(snaps[0]!.gpaUnweighted).not.toBeNull()
  })

  it('switching data source replaces old data; delete wipes everything but settings', () => {
    db.applyNormalized(parseImport('gb.xml', xml), 'demo')
    db.setSettings({ theme: 'dark' })
    db.createScenario('demo scenario')
    db.applyNormalized(parseImport('gb.xml', xml), 'import')
    expect(db.listScenarios()).toHaveLength(0)
    expect(db.dataSource()).toBe('import')
    db.deleteAllData()
    expect(db.getAppData().courses).toHaveLength(0)
    expect(db.listSnapshots()).toHaveLength(0)
    expect(db.getSettings().theme).toBe('dark')
    expect(db.dataSource()).toBeNull()
  })
})
