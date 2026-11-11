import { describe, expect, it } from 'vitest'
import type { AppData, Assignment, Course, CourseMark } from '@shared/types'
import { DEFAULT_COURSE_CONFIG, DEFAULT_SETTINGS, detectedCredits, gpaFromSummaries, latestPeriodFor, yearSummaries } from '@shared/grading/model'

// Four quarters; Q1 = 1 … Q4 = 4.
const periods = [1, 2, 3, 4].map((i) => ({ id: i, name: `Quarter ${i}`, index: i - 1, startDate: null, endDate: null }))
const course = (id: number, name: string, credits: number | null = null): Course => ({
  id,
  key: name.toLowerCase(),
  name,
  period: String(id),
  room: null,
  teacher: null,
  teacherEmail: null,
  detectedLevel: 'regular',
  config: { ...DEFAULT_COURSE_CONFIG, credits }
})
const mark = (courseId: number, periodId: number, letter: string, percent: number): CourseMark => ({ courseId, periodId, markName: 'M', letter, percent })
let aid = 0
const asg = (courseId: number, periodId: number): Assignment => ({
  id: ++aid,
  courseId,
  periodId,
  sourceId: String(aid),
  name: 'x',
  category: null,
  date: null,
  dueDate: null,
  earned: 9,
  possible: 10,
  status: 'graded',
  scoreText: null,
  pointsText: null,
  notes: null,
  description: null,
  firstSeen: '',
  updatedAt: ''
})

function data(currentPeriodId: number, courses: Course[], marks: CourseMark[]): AppData {
  return {
    student: null,
    periods,
    currentPeriodId,
    courses,
    marks,
    categories: [],
    assignments: marks.map((m) => asg(m.courseId, m.periodId)),
    attendance: [],
    sync: { lastSuccess: null, lastAttempt: null, lastStatus: null, lastMessage: null, source: 'import' }
  }
}

describe('rolling gradebooks', () => {
  // Year-long English (rolling: B in Q1 → A- by Q3), semester-1 Health (ended after Q2), semester-2 Econ (from Q3).
  const d = data(
    3,
    [course(1, 'English'), course(2, 'Health'), course(3, 'Economics')],
    [mark(1, 1, 'B', 84), mark(1, 2, 'B+', 88), mark(1, 3, 'A-', 91), mark(2, 1, 'A', 95), mark(2, 2, 'A', 96), mark(3, 3, 'C', 75)]
  )

  it("uses each course's latest checkpoint, never an average of quarters", () => {
    expect(latestPeriodFor(d, 1, 3)).toBe(3)
    expect(latestPeriodFor(d, 2, 3)).toBe(2) // semester course keeps its final grade
    const s = yearSummaries(d, DEFAULT_SETTINGS, 3)
    expect(s.map((x) => [x.course.name, x.letter])).toEqual([
      ['English', 'A-'],
      ['Health', 'A'],
      ['Economics', 'C']
    ])
  })

  it('detects half-credit semester courses once they are visibly semester-only', () => {
    expect(detectedCredits(d, 1)).toBe(1)
    expect(detectedCredits(d, 2)).toBe(0.5) // only Q1–Q2, and we're in Q3
    expect(detectedCredits(d, 3)).toBe(0.5) // starts in Q3
    // Mid-semester-1 a semester course is indistinguishable from a year course → 1 until it ends.
    expect(detectedCredits(data(2, [course(2, 'Health')], [mark(2, 1, 'A', 95), mark(2, 2, 'A', 96)]), 2)).toBe(1)
  })

  it('GPA counts every course once, weighted by credits', () => {
    const g = gpaFromSummaries(yearSummaries(d, DEFAULT_SETTINGS, 3), DEFAULT_SETTINGS)
    // English A- 3.7 × 1, Health A 4.0 × 0.5, Econ C 2.0 × 0.5 → (3.7 + 2 + 1) / 2
    expect(g.credits).toBe(2)
    expect(g.unweighted).toBeCloseTo((3.7 + 2 + 1) / 2, 10)
  })

  it('respects user-set credits and the viewed checkpoint', () => {
    const d2 = { ...d, courses: [course(1, 'English', 1), course(2, 'Health', 1)] }
    expect(gpaFromSummaries(yearSummaries(d2, DEFAULT_SETTINGS, 3), DEFAULT_SETTINGS).credits).toBe(2)
    // Viewing Q1: English is B (its Q1 checkpoint); Economics hasn't started and is left out.
    const q1 = yearSummaries(d, DEFAULT_SETTINGS, 1)
    expect(q1.map((x) => [x.course.name, x.letter])).toEqual([
      ['English', 'B'],
      ['Health', 'A']
    ])
  })
})
