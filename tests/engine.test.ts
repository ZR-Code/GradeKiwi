import { describe, expect, it } from 'vitest'
import { applyDrops, assignmentImpact, computeGrade, neededOnFinal, solveNeededScore, type GradeItem } from '@shared/grading/engine'
import { computeGpa, cumulativeBreakdown, cumulativeGpa, detectLevel, FCPS_LEVEL_BONUS, FCPS_SCALE, letterFor, pointsForLetter } from '@shared/grading/scale'
import { applyHypotheticals } from '@shared/grading/model'
import { parsePastedCourses, schoolYear } from '@shared/grading/pastCourses'
import type { Hypothetical } from '@shared/types'

let n = 0
const g = (category: string, earned: number | null, possible: number | null, status: GradeItem['status'] = 'graded'): GradeItem => ({
  id: ++n,
  category,
  earned,
  possible,
  status
})

describe('total points grading', () => {
  it('sums earned over possible', () => {
    const r = computeGrade([g('HW', 45, 50), g('Tests', 90, 100)], { mode: 'points', weights: {} })
    expect(r.percent).toBeCloseTo(90, 10)
  })
  it('returns null with nothing graded', () => {
    expect(computeGrade([g('HW', null, 10, 'not_graded')], { mode: 'points', weights: {} }).percent).toBeNull()
    expect(computeGrade([], { mode: 'points', weights: {} }).percent).toBeNull()
  })
  it('treats 0-possible items as extra credit', () => {
    const r = computeGrade([g('HW', 90, 100), g('EC', 5, 0)], { mode: 'points', weights: {} })
    expect(r.percent).toBeCloseTo(95, 10)
  })
  it('applies flat bonus percent', () => {
    const r = computeGrade([g('HW', 90, 100)], { mode: 'points', weights: {}, bonusPercent: 2 })
    expect(r.percent).toBeCloseTo(92, 10)
  })
})

describe('weighted category grading', () => {
  const weights = { Tests: 60, Homework: 40 }
  it('computes Σ(category average × weight)', () => {
    const r = computeGrade([g('Tests', 80, 100), g('Homework', 9, 10), g('Homework', 9, 10)], { mode: 'weighted', weights })
    expect(r.percent).toBeCloseTo(0.6 * 80 + 0.4 * 90, 10) // 84
  })
  it('renormalizes over non-empty categories', () => {
    const r = computeGrade([g('Tests', 80, 100), g('Homework', 90, 100)], { mode: 'weighted', weights: { Tests: 60, Homework: 30, Final: 10 } })
    expect(r.percent).toBeCloseTo((80 * 60 + 90 * 30) / 90, 10) // 83.333…
    expect(r.categories.find((c) => c.name === 'Final')?.percent).toBeNull()
  })
  it('matches categories case-insensitively', () => {
    const r = computeGrade([g('tests ', 50, 100), g('HOMEWORK', 100, 100)], { mode: 'weighted', weights })
    expect(r.percent).toBeCloseTo(0.6 * 50 + 0.4 * 100, 10)
  })
  it('ignores unweighted categories in weighted mode', () => {
    const r = computeGrade([g('Tests', 80, 100), g('Practice', 0, 100)], { mode: 'weighted', weights })
    expect(r.percent).toBeCloseTo(80, 10)
  })
})

describe('status handling', () => {
  const cfg = { mode: 'points' as const, weights: {} }
  it('excludes not graded and exempt', () => {
    const r = computeGrade([g('HW', 8, 10), g('HW', null, 10, 'not_graded'), g('HW', 0, 10, 'exempt')], cfg)
    expect(r.percent).toBeCloseTo(80, 10)
  })
  it('counts missing with a recorded score; missing without one only when configured', () => {
    expect(computeGrade([g('HW', 10, 10), g('HW', 0, 10, 'missing')], cfg).percent).toBeCloseTo(50, 10)
    const items = [g('HW', 10, 10), g('HW', null, 10, 'missing')]
    expect(computeGrade(items, cfg).percent).toBeCloseTo(100, 10)
    expect(computeGrade(items, cfg, { missingCountsAsZero: true }).percent).toBeCloseTo(50, 10)
  })
})

describe('dropped assignments', () => {
  it('drops the lowest item', () => {
    const r = computeGrade([g('HW', 5, 10), g('HW', 9, 10), g('HW', 10, 10)], { mode: 'points', weights: {}, dropLowest: { HW: 1 } })
    expect(r.percent).toBeCloseTo(95, 10)
  })
  it('drops the item that maximizes the result, not just the lowest percentage', () => {
    // Dropping 0/10 (0%) gives 140/200 = 70%; dropping 50/100 (50%) gives 90/110 ≈ 81.8%.
    const r = computeGrade([g('Q', 50, 100), g('Q', 0, 10), g('Q', 90, 100)], { mode: 'points', weights: {}, dropLowest: { Q: 1 } })
    expect(r.percent).toBeCloseTo((90 / 110) * 100, 10)
  })
  it('never drops every item', () => {
    const { kept } = applyDrops([{ id: 1, earned: 1, possible: 10 }], 3)
    expect(kept).toHaveLength(1)
  })
})

describe('solvers', () => {
  it('finds the score needed (points mode)', () => {
    const items = [g('T', 90, 100)]
    expect(solveNeededScore(items, { mode: 'points', weights: {} }, { category: 'T', possible: 100 }, 95).needed).toBeCloseTo(100, 4)
    expect(solveNeededScore(items, { mode: 'points', weights: {} }, { category: 'T', possible: 100 }, 85).needed).toBeCloseTo(80, 4)
  })
  it('finds the score needed (weighted)', () => {
    // Tests 50%: 80/100, HW 50%: 100% → 90. Target 92 → tests avg 84 → (80 + x)/200 = .84 → x = 88.
    const items = [g('Tests', 80, 100), g('HW', 10, 10)]
    const r = solveNeededScore(items, { mode: 'weighted', weights: { Tests: 50, HW: 50 } }, { category: 'Tests', possible: 100 }, 92)
    expect(r.needed).toBeCloseTo(88, 4)
  })
  it('reports unreachable and already-met targets', () => {
    const items = [g('T', 50, 100)]
    expect(solveNeededScore(items, { mode: 'points', weights: {} }, { category: 'T', possible: 10 }, 90).reachable).toBe(false)
    expect(solveNeededScore(items, { mode: 'points', weights: {} }, { category: 'T', possible: 10 }, 40).alreadyMet).toBe(true)
  })
  it('final exam formula', () => {
    expect(neededOnFinal(88, 20, 90)).toBeCloseTo(98, 10)
    expect(neededOnFinal(88, 0, 90)).toBeNull()
  })
  it('assignment impact', () => {
    const a = g('T', 50, 100)
    const r = assignmentImpact([g('T', 100, 100), a], a.id, { mode: 'points', weights: {} })
    expect(r.delta).toBeCloseTo(-25, 10)
  })
})

describe('hypotheticals', () => {
  const base: Omit<Hypothetical, 'id' | 'kind' | 'targetAssignmentId' | 'earned' | 'possible'> = {
    scenarioId: 1,
    courseId: 1,
    periodId: null,
    name: 'x',
    category: 'Tests',
    dueDate: null
  }
  it('adds new items and overrides existing ones without mutating originals', () => {
    const real = [g('Tests', 60, 100)]
    const realId = real[0]!.id as number
    const out = applyHypotheticals(real, [
      { ...base, id: 1, kind: 'override', targetAssignmentId: realId, earned: 90, possible: 100 },
      { ...base, id: 2, kind: 'add', targetAssignmentId: null, earned: 85, possible: 100 }
    ])
    expect(real[0]!.earned).toBe(60)
    expect(computeGrade(out, { mode: 'points', weights: {} }).percent).toBeCloseTo(87.5, 10)
  })
  it('example from spec: weighted course, add an 85/100 test', () => {
    const items = [g('Tests', 270, 300), g('Homework', 95, 100)]
    const cfg = { mode: 'weighted' as const, weights: { Tests: 70, Homework: 30 } }
    const before = computeGrade(items, cfg).percent!
    expect(before).toBeCloseTo(0.7 * 90 + 0.3 * 95, 10) // 91.5
    const after = computeGrade(applyHypotheticals(items, [{ ...base, id: 3, kind: 'add', targetAssignmentId: null, earned: 85, possible: 100 }]), cfg).percent!
    expect(after).toBeCloseTo(0.7 * (355 / 400) * 100 + 0.3 * 95, 10) // 90.625
  })
})

describe('scales and GPA', () => {
  it('maps percentages with the FCPS scale', () => {
    expect(letterFor(93, FCPS_SCALE)).toBe('A')
    expect(letterFor(92.99, FCPS_SCALE)).toBe('A-')
    expect(letterFor(66.5, FCPS_SCALE)).toBe('D')
    expect(letterFor(59.9, FCPS_SCALE)).toBe('F')
    expect(pointsForLetter('B+', FCPS_SCALE)).toBe(3.3)
    expect(pointsForLetter('b−', FCPS_SCALE)).toBe(2.7)
  })
  it('computes unweighted and weighted GPA', () => {
    const s = { scale: FCPS_SCALE, levelBonus: FCPS_LEVEL_BONUS, bonusOnlyIfPassing: true }
    const r = computeGpa(
      [
        { letter: 'A', level: 'regular', credits: 1 },
        { letter: 'B+', level: 'ap', credits: 1 },
        { letter: 'F', level: 'honors', credits: 1 },
        { letter: 'P', level: 'regular', credits: 1 } // non-letter mark ignored
      ],
      s
    )
    expect(r.counted).toBe(3)
    expect(r.unweighted).toBeCloseTo((4 + 3.3 + 0) / 3, 10)
    expect(r.weighted).toBeCloseTo((4 + 4.3 + 0) / 3, 10)
  })
  it('cumulative GPA is credit weighted', () => {
    const r = cumulativeGpa([
      { gpaUnweighted: 4, gpaWeighted: 4.5, credits: 3 },
      { gpaUnweighted: 3, gpaWeighted: null, credits: 1 }
    ])
    expect(r.unweighted).toBeCloseTo(3.75, 10)
    expect(r.weighted).toBeCloseTo(4.5, 10)
  })
  it('detects course level from title', () => {
    expect(detectLevel('AP Calculus BC')).toBe('ap')
    expect(detectLevel('English 10 HN')).toBe('honors')
    expect(detectLevel('IB Biology HL')).toBe('ib')
    expect(detectLevel('Chapter Book')).toBe('regular')
  })
})

describe('cumulative GPA', () => {
  const s = { scale: FCPS_SCALE, levelBonus: FCPS_LEVEL_BONUS, bonusOnlyIfPassing: true }
  it('combines past courses, GPA-only terms and this year by credits', () => {
    const r = cumulativeBreakdown(
      [
        { id: '1', year: '2024–25', name: 'English 10', letter: 'A', level: 'regular', credits: 1 },
        { id: '2', year: '2024–25', name: 'AP World', letter: 'B', level: 'ap', credits: 1 }
      ],
      [{ id: 't', name: '9th grade', gpaUnweighted: 3, gpaWeighted: null, credits: 2 }],
      { unweighted: 3.5, weighted: 3.8, credits: 2 },
      s
    )
    // Unweighted: (4 + 3 + 3×2 + 3.5×2) / 6 = 20/6
    expect(r.total.unweighted).toBeCloseTo(20 / 6, 10)
    // Weighted only counts credits that have a weighted value: (4 + 4 + 3.8×2) / 4
    expect(r.total.weighted).toBeCloseTo((4 + 4 + 7.6) / 4, 10)
    expect(r.past.years).toBe(1)
    expect(r.hasPastData).toBe(true)
  })
  it('with no past data, cumulative equals this year and says so', () => {
    const r = cumulativeBreakdown([], [], { unweighted: 3.5, weighted: 3.8, credits: 7 }, s)
    expect(r.hasPastData).toBe(false)
    expect(r.total.unweighted).toBeCloseTo(3.5, 10)
  })
})

describe('pasted past courses', () => {
  it('reads letters, percentages, levels and credits; skips headers and junk', () => {
    const { courses, skipped } = parsePastedCourses(
      ['Course, Grade, Level, Credits', 'English 10 HN, A-', 'AP World History\tB+\tAP\t1', 'Geometry, 91', 'PE 9, A, Standard, 0.5', 'nonsense line'].join('\n'),
      '2024–25',
      FCPS_SCALE
    )
    expect(courses.map((c) => [c.name, c.letter, c.level, c.credits])).toEqual([
      ['English 10 HN', 'A-', 'honors', 1],
      ['AP World History', 'B+', 'ap', 1],
      ['Geometry', 'A-', 'regular', 1],
      ['PE 9', 'A', 'regular', 0.5]
    ])
    expect(skipped).toEqual(['nonsense line'])
  })
  it('labels school years starting in July', () => {
    expect(schoolYear(new Date(2026, 10, 9))).toBe('2026–27')
    expect(schoolYear(new Date(2026, 2, 1))).toBe('2025–26')
    expect(schoolYear(new Date(2026, 10, 9), -1)).toBe('2025–26')
  })
})
