// Clearly labelled demo data for exploring the app without an account.
// Stored with source = 'demo'; the UI shows a persistent "Demo data" banner and it is replaced
// automatically when real data is synced or imported. Fictional names only.

import { computeGrade } from '@shared/grading/engine'
import { FCPS_SCALE, letterFor } from '@shared/grading/scale'
import type { NormalizedAssignment, NormalizedData } from './studentvue/normalized'
import { courseKey } from './studentvue/normalized'

function rng(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const day = (offset: number) => {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return d.toISOString().slice(0, 10)
}

interface Spec {
  title: string
  teacher: string
  room: string
  skill: number // typical percentage
  /** Which semester a half-credit course runs in; omitted = year-long. */
  semester?: 1 | 2
  cats: Array<{ name: string; weight: number | null; points: number; every: number; label: string }>
}

const SPECS: Spec[] = [
  { title: 'AP Calculus BC', teacher: 'Okafor, Daniel', room: '214', skill: 0.9, cats: [
    { name: 'Tests', weight: 70, points: 100, every: 14, label: 'Unit Test' },
    { name: 'Homework', weight: 30, points: 10, every: 3, label: 'Problem Set' }
  ] },
  { title: 'English 11 HN', teacher: 'Lindqvist, Mara', room: '108', skill: 0.88, cats: [
    { name: 'Writing', weight: 50, points: 50, every: 10, label: 'Essay' },
    { name: 'Reading', weight: 30, points: 20, every: 6, label: 'Reading Check' },
    { name: 'Participation', weight: 20, points: 10, every: 7, label: 'Seminar' }
  ] },
  { title: 'AP US History', teacher: 'Reyes, Gabriel', room: '231', skill: 0.84, cats: [
    { name: 'Tests', weight: 60, points: 60, every: 12, label: 'Period Exam' },
    { name: 'Classwork', weight: 25, points: 15, every: 5, label: 'DBQ Practice' },
    { name: 'Homework', weight: 15, points: 10, every: 4, label: 'Reading Notes' }
  ] },
  { title: 'Chemistry HN', teacher: 'Haddad, Sana', room: '305', skill: 0.8, cats: [
    { name: 'Tests', weight: 50, points: 80, every: 13, label: 'Unit Test' },
    { name: 'Labs', weight: 30, points: 25, every: 7, label: 'Lab Report' },
    { name: 'Homework', weight: 20, points: 10, every: 4, label: 'Worksheet' }
  ] },
  { title: 'Spanish 3', teacher: 'Moreno, Lucia', room: '122', skill: 0.92, cats: [
    { name: 'Assessments', weight: null, points: 50, every: 9, label: 'Prueba' },
    { name: 'Practice', weight: null, points: 10, every: 4, label: 'Práctica' }
  ] },
  { title: 'Computer Science', teacher: 'Tanaka, Hiro', room: '019', skill: 0.95, cats: [
    { name: 'Projects', weight: 60, points: 100, every: 12, label: 'Project' },
    { name: 'Quizzes', weight: 40, points: 20, every: 6, label: 'Quiz' }
  ] },
  { title: 'Health 10', teacher: 'Brennan, Kate', room: 'GYM', skill: 0.95, semester: 1, cats: [
    { name: 'Participation', weight: null, points: 10, every: 5, label: 'Participation Week' }
  ] },
  { title: 'Economics & Personal Finance', teacher: 'Ortiz, Sam', room: '140', skill: 0.88, semester: 2, cats: [
    { name: 'Assessments', weight: 60, points: 50, every: 9, label: 'Unit Check' },
    { name: 'Classwork', weight: 40, points: 10, every: 4, label: 'Budget Lab' }
  ] }
]

export function buildDemoData(): NormalizedData {
  const r = rng(20261109)
  // Four quarters; we're part-way through Quarter 3 (semester 2).
  const bounds = [
    [-140, -95],
    [-94, -48],
    [-47, 30],
    [31, 80]
  ] as const
  const periods = bounds.map(([a, b], index) => ({ index, name: `Quarter ${index + 1}`, startDate: day(a), endDate: day(b) }))
  const current = 2

  const courses = SPECS.map((spec, ci) => {
    // Active span: year-long courses run Q1→; semester courses run within their two quarters.
    const firstQ = spec.semester === 2 ? 2 : 0
    const lastQ = spec.semester === 1 ? 1 : current
    const start = bounds[firstQ]![0]
    const end = spec.semester === 1 ? bounds[1]![1] : 12 // a few upcoming items in the current quarter

    const all: NormalizedAssignment[] = []
    for (const cat of spec.cats) {
      let n = 1
      for (let d = start + Math.floor(r() * cat.every); d <= end; d += cat.every) {
        const future = d > 0
        const swing = (r() - 0.5) * 0.22
        let pct = Math.min(1.0, Math.max(0.45, spec.skill + swing))
        const missing = !future && r() < 0.035
        const exempt = !future && !missing && r() < 0.015
        if (missing) pct = 0
        const earned = Math.round(cat.points * pct * 2) / 2
        const status = future ? 'not_graded' : exempt ? 'exempt' : missing ? 'missing' : 'graded'
        all.push({
          sourceId: `demo-${ci}-${cat.name}-${n}`,
          name: `${cat.label} ${n}`,
          category: cat.name,
          date: day(d - 2),
          dueDate: day(d),
          earned: status === 'graded' || status === 'missing' ? earned : null,
          possible: cat.points,
          status,
          scoreText: status === 'graded' ? `${earned} out of ${cat.points}` : status === 'missing' ? `0 out of ${cat.points}` : status === 'exempt' ? 'Exempt' : 'Not Graded',
          pointsText: status === 'graded' || status === 'missing' ? `${earned} / ${cat.points}` : `${cat.points} Points Possible`,
          notes: missing ? 'Missing' : null,
          description: null
        })
        n++
      }
    }

    // Rolling gradebook: each quarter is a checkpoint of the same cumulative grade (everything so far).
    const weights = Object.fromEntries(spec.cats.filter((c) => c.weight != null).map((c) => [c.name, c.weight!]))
    const weighted = Object.keys(weights).length > 0
    const marks = periods
      .filter((p) => p.index >= firstQ && p.index <= lastQ)
      .map((p) => {
        const cutoff = p.index === current ? Infinity : bounds[p.index]![1]
        const assignments = all.filter((a) => {
          const due = Math.round((new Date(a.dueDate!).getTime() - new Date(day(0)).getTime()) / 86400000)
          return due <= cutoff
        })
        const percent = computeGrade(
          assignments.map((a, i) => ({ id: i, category: a.category, earned: a.earned, possible: a.possible, status: a.status })),
          { mode: weighted ? 'weighted' : 'points', weights }
        ).percent
        const pct = percent != null ? Math.round(percent * 10) / 10 : null
        return {
          periodIndex: p.index,
          markName: `Q${p.index + 1}`,
          letter: letterFor(pct, FCPS_SCALE),
          percent: pct,
          categories: spec.cats.filter((c) => c.weight != null).map((c) => ({ name: c.name, weight: c.weight, points: null, pointsPossible: null, mark: null })),
          assignments
        }
      })
    return { key: courseKey(spec.title), name: spec.title, period: String(ci + 1), room: spec.room, teacher: spec.teacher, teacherEmail: null, marks }
  })
  return {
    student: { name: 'Demo Student', permId: null, school: 'Demo High School', grade: '11' },
    periods,
    currentPeriodIndex: current,
    courses,
    attendance: [
      { date: day(-31), period: '3', course: 'AP US History', reason: 'Excused', note: 'Demo' },
      { date: day(-12), period: '1', course: 'AP Calculus BC', reason: 'Tardy', note: 'Demo' }
    ]
  }
}
