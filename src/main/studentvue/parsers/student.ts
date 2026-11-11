import type { AttendanceRecord } from '@shared/types'
import { isoDate, list, node, parseXml, str } from './xml'

export function parseStudentInfoXml(xml: string): { name: string | null; permId: string | null; school: string | null; grade: string | null } {
  const doc = parseXml(xml)
  const s = node(doc['StudentInfo'])
  if (!s) return { name: null, permId: null, school: null, grade: null }
  return {
    name: str(s, 'FormattedName') ?? str(s, 'NickName'),
    permId: str(s, 'PermID'),
    school: str(s, 'CurrentSchool'),
    grade: str(s, 'Grade')
  }
}

export function parseAttendanceXml(xml: string): AttendanceRecord[] {
  const doc = parseXml(xml)
  const att = node(doc['Attendance'])
  if (!att) return []
  const out: AttendanceRecord[] = []
  for (const a of list(node(att['Absences'])?.['Absence'])) {
    const date = isoDate(str(a, 'AbsenceDate'))
    const periods = list(node(a['Periods'])?.['Period'])
    if (periods.length === 0) {
      out.push({ date, period: null, course: null, reason: str(a, 'Reason') ?? str(a, 'CodeAllDayDescription'), note: str(a, 'Note') })
    }
    for (const p of periods) {
      out.push({
        date,
        period: str(p, 'Number'),
        course: str(p, 'Course'),
        reason: str(p, 'Reason') ?? str(p, 'Name'),
        note: str(a, 'Note')
      })
    }
  }
  return out
}
