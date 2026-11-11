// Provider-neutral shape that every integration (SOAP sync, file import, demo) produces.
// The synchronization layer only ever consumes this, so providers can change independently.

import type { AssignmentStatus, AttendanceRecord } from '@shared/types'

export interface NormalizedAssignment {
  sourceId: string
  name: string
  category: string | null
  date: string | null
  dueDate: string | null
  earned: number | null
  possible: number | null
  status: AssignmentStatus
  scoreText: string | null
  pointsText: string | null
  notes: string | null
  description: string | null
}

export interface NormalizedCategory {
  name: string
  weight: number | null
  points: number | null
  pointsPossible: number | null
  mark: string | null
}

export interface NormalizedMark {
  periodIndex: number
  markName: string
  letter: string | null
  percent: number | null
  categories: NormalizedCategory[]
  assignments: NormalizedAssignment[]
}

export interface NormalizedCourse {
  key: string
  name: string
  period: string | null
  room: string | null
  teacher: string | null
  teacherEmail: string | null
  marks: NormalizedMark[]
}

export interface NormalizedPeriod {
  index: number
  name: string
  startDate: string | null
  endDate: string | null
}

export interface NormalizedData {
  student: { name: string | null; permId: string | null; school: string | null; grade: string | null } | null
  periods: NormalizedPeriod[]
  currentPeriodIndex: number | null
  courses: NormalizedCourse[]
  attendance: AttendanceRecord[] | null // null = provider doesn't supply attendance (keep existing)
}

export function courseKey(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, ' ')
}
