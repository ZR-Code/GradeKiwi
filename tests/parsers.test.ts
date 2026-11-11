import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildEnvelope, StudentVueClient, StudentVueError, unwrapResponse, xmlEscape, type FetchLike } from '../src/main/studentvue/client'
import { displayTitle, parseGradebookXml, parsePoints } from '../src/main/studentvue/parsers/gradebook'
import { parseAttendanceXml, parseStudentInfoXml } from '../src/main/studentvue/parsers/student'
import { FCPS, mergeCourses, SynergySoapProvider } from '../src/main/studentvue/provider'
import { parseCsv } from '../src/main/importers/csv'
import { computeGrade } from '@shared/grading/engine'

const fixture = readFileSync(resolve(__dirname, 'fixtures/gradebook.xml'), 'utf8')

const wrap = (inner: string) =>
  `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><ProcessWebServiceRequestResponse xmlns="http://edupoint.com/webservices/"><ProcessWebServiceRequestResult>${xmlEscape(inner)}</ProcessWebServiceRequestResult></ProcessWebServiceRequestResponse></soap:Body></soap:Envelope>`

describe('SOAP envelope', () => {
  it('escapes credentials and nested params', () => {
    const env = buildEnvelope({ username: 'a<b', password: 'p&"w' }, 'Gradebook', { ChildIntID: 0, ReportPeriod: 1 })
    expect(env).toContain('<userID>a&lt;b</userID>')
    expect(env).toContain('<password>p&amp;&quot;w</password>')
    expect(env).toContain('<paramStr>&lt;Parms&gt;&lt;ChildIntID&gt;0&lt;/ChildIntID&gt;&lt;ReportPeriod&gt;1&lt;/ReportPeriod&gt;&lt;/Parms&gt;</paramStr>')
  })
  it('maps the real FCPS invalid-credential response to an auth error', () => {
    // Captured verbatim from sisstudent.fcps.edu on 2026-11-09 using a non-existent user id.
    const real =
      '<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema"><soap:Body><ProcessWebServiceRequestResponse xmlns="http://edupoint.com/webservices/"><ProcessWebServiceRequestResult>&lt;RT_ERROR ERROR_MESSAGE="Invalid user id or password (ID: 11000)" /&gt;</ProcessWebServiceRequestResult></ProcessWebServiceRequestResponse></soap:Body></soap:Envelope>'
    try {
      unwrapResponse(real)
      expect.fail('should throw')
    } catch (e) {
      expect(e).toBeInstanceOf(StudentVueError)
      expect((e as StudentVueError).kind).toBe('auth')
    }
  })
  it('unwraps escaped inner XML', () => {
    expect(unwrapResponse(wrap('<StudentInfo><FormattedName>Ada L</FormattedName></StudentInfo>'))).toContain('<FormattedName>Ada L</FormattedName>')
  })
})

describe('gradebook parser', () => {
  const gb = parseGradebookXml(fixture)
  it('reads periods and current period', () => {
    expect(gb.periods.map((p) => p.name)).toEqual(['Quarter 1', 'Quarter 2'])
    expect(gb.periods[1]!.startDate).toBe('2025-11-03')
    expect(gb.currentPeriod?.name).toBe('Quarter 1')
  })
  it('reads courses, teachers, marks and weights', () => {
    const calc = gb.courses[0]!
    expect(calc.name).toBe('AP Calculus BC')
    expect(calc.teacher).toBe('Nguyen, Linh')
    const m = calc.marks[0]!
    expect(m.letter).toBe('A-')
    expect(m.percent).toBe(91.4)
    expect(m.categories.map((c) => [c.name, c.weight])).toEqual([
      ['Tests', 70],
      ['Homework', 30]
    ])
  })
  it('distinguishes graded, missing, ungraded and exempt', () => {
    const a = gb.courses[0]!.marks[0]!.assignments
    expect(a.map((x) => x.status)).toEqual(['graded', 'graded', 'missing', 'not_graded', 'exempt'])
    expect(a[2]).toMatchObject({ earned: 0, possible: 10 }) // missing, recorded as zero
    expect(a[3]).toMatchObject({ earned: null, possible: 100, dueDate: '2025-10-30' })
    expect(a[0]!.description).toBe('Limits & continuity')
  })
  it("engine reproduces StudentVUE's category math", () => {
    const m = gb.courses[0]!.marks[0]!
    const items = m.assignments.map((x, i) => ({ id: i, category: x.category, earned: x.earned, possible: x.possible, status: x.status }))
    const weights = Object.fromEntries(m.categories.map((c) => [c.name, c.weight!]))
    // Tests 92/100 (70%), Homework 10/20 (30%) → 64.4 + 15 = 79.4
    expect(computeGrade(items, { mode: 'weighted', weights }).percent).toBeCloseTo(79.4, 6)
  })
  it('parses point strings', () => {
    expect(parsePoints('9.00 / 10.0000', null)).toEqual({ earned: 9, possible: 10 })
    expect(parsePoints('10.0000 Points Possible', 'Not Graded')).toEqual({ earned: null, possible: 10 })
    expect(parsePoints('', '8 out of 10.0000')).toEqual({ earned: 8, possible: 10 })
    expect(parsePoints('', '')).toEqual({ earned: null, possible: null })
  })
  it('cleans course titles', () => {
    expect(displayTitle('English 11 HN (115900)')).toBe('English 11 HN')
    expect(displayTitle('Art (Studio)')).toBe('Art (Studio)')
  })
  it('rejects DOCTYPE payloads', () => {
    expect(() => parseGradebookXml('<!DOCTYPE x [<!ENTITY a "b">]><Gradebook/>')).toThrow()
  })
  it('surfaces gradebook error messages', () => {
    expect(() => parseGradebookXml('<Gradebook ErrorMessage="Grade book not available" />')).toThrow('Grade book not available')
  })
})

describe('student info and attendance', () => {
  it('parses student info', () => {
    const s = parseStudentInfoXml('<StudentInfo><FormattedName>Ada Lovelace</FormattedName><PermID>1234567</PermID><Grade>11</Grade><CurrentSchool>Example HS</CurrentSchool></StudentInfo>')
    expect(s).toEqual({ name: 'Ada Lovelace', permId: '1234567', school: 'Example HS', grade: '11' })
  })
  it('parses period attendance', () => {
    const r = parseAttendanceXml(
      '<Attendance Type="Period"><Absences><Absence AbsenceDate="9/28/2025" Reason="" Note="Dr"><Periods><Period Number="1" Name="Excused" Reason="Excused" Course="AP Calculus BC" /><Period Number="2" Name="Tardy" Reason="Tardy" Course="English" /></Periods></Absence></Absences></Attendance>'
    )
    expect(r).toHaveLength(2)
    expect(r[0]).toMatchObject({ date: '2025-09-28', period: '1', reason: 'Excused', note: 'Dr' })
  })
})

describe('provider (mocked transport)', () => {
  it('fetches all started periods and merges courses', async () => {
    const calls: string[] = []
    const q2 = fixture.replace('<ReportingPeriod GradePeriod="Quarter 1"', '<ReportingPeriod GradePeriod="Quarter 2"')
    const fetchImpl: FetchLike = async (_url, init) => {
      const method = init.body.match(/<methodName>(\w+)<\/methodName>/)![1]!
      const period = init.body.match(/ReportPeriod&gt;(\d)/)?.[1]
      calls.push(`${method}${period ?? ''}`)
      const inner =
        method === 'StudentInfo'
          ? '<StudentInfo><FormattedName>Ada</FormattedName></StudentInfo>'
          : method === 'Attendance'
            ? '<Attendance><Absences/></Attendance>'
            : period === '1'
              ? q2
              : fixture
      return { ok: true, status: 200, text: async () => wrap(inner) }
    }
    const p = new SynergySoapProvider({ ...FCPS }, fetchImpl)
    const data = await p.fetchAll({ username: 'u', password: 'p' }, () => {})
    expect(calls).toEqual(['StudentInfo', 'Gradebook', 'Gradebook1', 'Attendance'])
    expect(data.courses).toHaveLength(2)
    expect(data.courses[0]!.marks.map((m) => m.periodIndex)).toEqual([0, 1])
    expect(data.currentPeriodIndex).toBe(0)
  }, 15000)
  it('mergeCourses keeps one course per key', () => {
    const gb = parseGradebookXml(fixture)
    const merged = mergeCourses(new Map([[0, gb], [1, gb]]))
    expect(merged).toHaveLength(2)
  })
})

describe('CSV import', () => {
  it('parses the documented template with quoting', () => {
    const csv = [
      'Course,Teacher,Grading Period,Assignment,Category,Earned,Possible,Due Date,Status',
      '"Chemistry, HN",Smith,Quarter 1,Lab 1,Labs,18,20,2025-09-10,',
      'Chemistry HN,Smith,Quarter 1,Quiz,"Quizzes",,10,09/12/2025,missing'
    ].join('\n')
    const d = parseCsv(csv)
    expect(d.courses).toHaveLength(2)
    expect(d.courses[0]!.marks[0]!.assignments[0]).toMatchObject({ earned: 18, possible: 20, status: 'graded' })
    expect(d.courses[1]!.marks[0]!.assignments[0]).toMatchObject({ earned: null, status: 'missing', dueDate: '2025-09-12' })
  })
})

// Live check against the real FCPS endpoint. Opt-in: LIVE_FCPS=1 npx vitest run
// With FCPS_USER/FCPS_PASS set it performs a full read-only sync; otherwise it only verifies
// that a deliberately invalid login is rejected with an auth error.
describe.runIf(process.env.LIVE_FCPS === '1')('live FCPS', () => {
  const nodeFetch: FetchLike = (url, init) => fetch(url, init)
  it('reaches FCPS and maps responses', async () => {
    const p = new SynergySoapProvider(FCPS, nodeFetch)
    if (process.env.FCPS_USER && process.env.FCPS_PASS) {
      const d = await p.fetchAll({ username: process.env.FCPS_USER, password: process.env.FCPS_PASS }, () => {})
      console.log(`courses=${d.courses.length} periods=${d.periods.length} assignments=${d.courses.reduce((s, c) => s + c.marks.reduce((t, m) => t + m.assignments.length, 0), 0)}`)
      expect(d.courses.length).toBeGreaterThan(0)
    } else {
      const c = new StudentVueClient(FCPS.baseUrl, { username: 'gradekiwi-probe-nonexistent', password: 'x' }, nodeFetch)
      await expect(c.call('StudentInfo', { ChildIntID: 0 })).rejects.toMatchObject({ kind: 'auth' })
    }
  }, 120000)
})
