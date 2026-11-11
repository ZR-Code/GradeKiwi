// Grade calculation engine. Pure functions, no I/O — tested in tests/engine.test.ts.
//
// Weighted category grading:  grade = Σ(categoryAverage × weight) / Σ(weights of non-empty categories)
//   (Synergy renormalizes over categories that have at least one counted assignment.)
// Total points grading:       grade = Σ earned / Σ possible × 100
//
// Inside a category, the average is points-based: Σ earned / Σ possible (× optional per-item weight).

import type { AssignmentStatus, GradingMode } from '../types'

export interface GradeItem {
  id: string | number
  name?: string
  category: string | null
  earned: number | null
  possible: number | null
  status: AssignmentStatus
  /** Multiplier applied to earned and possible (assignment weight). Default 1. */
  weight?: number
  hypothetical?: boolean
}

export interface EngineConfig {
  mode: GradingMode
  /** Category name -> weight in percent. Only used in weighted mode. */
  weights: Record<string, number>
  /** Category name -> number of lowest-scoring items to drop. */
  dropLowest?: Record<string, number>
  /** Flat percentage points added to the final grade (extra credit rule). */
  bonusPercent?: number
}

export interface EngineOptions {
  /** Count missing assignments that have no recorded score as 0 / possible. */
  missingCountsAsZero?: boolean
}

export interface CategoryResult {
  name: string
  weight: number | null
  earned: number
  possible: number
  percent: number | null
  counted: number
  dropped: Array<string | number>
  /** Effective share of the final grade after renormalization (0-1). */
  effectiveWeight: number | null
}

export interface GradeResult {
  percent: number | null
  mode: GradingMode
  categories: CategoryResult[]
  earned: number
  possible: number
  counted: number
}

const UNCATEGORIZED = 'Uncategorized'

export function catKey(name: string | null | undefined): string {
  const n = (name ?? '').trim()
  return n.length ? n : UNCATEGORIZED
}

/** Normalizes a category name for loose matching ("Tests " == "tests"). */
export function normCat(name: string | null | undefined): string {
  return catKey(name).toLowerCase().replace(/\s+/g, ' ')
}

interface Counted {
  id: string | number
  earned: number
  possible: number
}

/** Returns the earned/possible pair an item contributes, or null if it doesn't count. */
export function countedValue(item: GradeItem, opts: EngineOptions = {}): Counted | null {
  const w = item.weight ?? 1
  if (!(w > 0)) return null
  if (item.status === 'exempt' || item.status === 'not_graded') return null
  const possible = item.possible
  if (possible == null || !Number.isFinite(possible) || possible < 0) return null
  let earned = item.earned
  if (earned == null || !Number.isFinite(earned)) {
    if (item.status === 'missing' && opts.missingCountsAsZero) earned = 0
    else return null
  }
  // Pure extra credit (0 possible, >0 earned) still counts; 0/0 contributes nothing.
  if (possible === 0 && earned === 0) return null
  return { id: item.id, earned: earned * w, possible: possible * w }
}

function sum(xs: Counted[], k: 'earned' | 'possible'): number {
  let s = 0
  for (const x of xs) s += x[k]
  return s
}

/**
 * Drop the N items whose removal maximizes the category percentage.
 * Exhaustive for small inputs, greedy (repeatedly remove best single item) otherwise.
 */
export function applyDrops(items: Counted[], n: number): { kept: Counted[]; dropped: Counted[] } {
  // Never drop pure extra-credit items, and always keep at least one item.
  const droppable = items.filter((i) => i.possible > 0)
  const k = Math.min(Math.max(0, Math.floor(n)), droppable.length - 1)
  if (k <= 0) return { kept: items, dropped: [] }

  const pct = (xs: Counted[]): number => {
    const p = sum(xs, 'possible')
    return p > 0 ? sum(xs, 'earned') / p : -Infinity
  }

  let best: Counted[] = []
  if (combinations(droppable.length, k) <= 20000) {
    let bestPct = -Infinity
    const idx: number[] = []
    const rec = (start: number): void => {
      if (idx.length === k) {
        const drop = new Set(idx.map((i) => droppable[i]!))
        const p = pct(items.filter((x) => !drop.has(x)))
        if (p > bestPct + 1e-12) {
          bestPct = p
          best = [...drop]
        }
        return
      }
      for (let i = start; i < droppable.length; i++) {
        idx.push(i)
        rec(i + 1)
        idx.pop()
      }
    }
    rec(0)
  } else {
    let remaining = [...items]
    for (let r = 0; r < k; r++) {
      let bestItem: Counted | null = null
      let bestPct = -Infinity
      for (const cand of remaining) {
        if (!(cand.possible > 0) || best.includes(cand)) continue
        const p = pct(remaining.filter((x) => x !== cand))
        if (p > bestPct) {
          bestPct = p
          bestItem = cand
        }
      }
      if (!bestItem) break
      best.push(bestItem)
      remaining = remaining.filter((x) => x !== bestItem)
    }
  }
  const dropSet = new Set(best)
  return { kept: items.filter((x) => !dropSet.has(x)), dropped: best }
}

function combinations(n: number, k: number): number {
  let r = 1
  for (let i = 1; i <= k; i++) {
    r = (r * (n - k + i)) / i
    if (r > 1e9) return r
  }
  return r
}

export function computeGrade(items: GradeItem[], config: EngineConfig, opts: EngineOptions = {}): GradeResult {
  // Group counted items by category (case-insensitive), remembering display names.
  const groups = new Map<string, { name: string; items: Counted[] }>()
  const weightByNorm = new Map<string, { name: string; weight: number }>()
  for (const [name, weight] of Object.entries(config.weights)) {
    weightByNorm.set(normCat(name), { name, weight })
  }
  for (const [norm, w] of weightByNorm) groups.set(norm, { name: w.name, items: [] })

  for (const item of items) {
    const c = countedValue(item, opts)
    const norm = normCat(item.category)
    if (!groups.has(norm)) groups.set(norm, { name: catKey(item.category), items: [] })
    if (c) groups.get(norm)!.items.push(c)
  }

  const dropRules = new Map<string, number>()
  for (const [name, n] of Object.entries(config.dropLowest ?? {})) dropRules.set(normCat(name), n)

  const categories: CategoryResult[] = []
  let totalEarned = 0
  let totalPossible = 0
  let counted = 0

  for (const [norm, g] of groups) {
    const { kept, dropped } = applyDrops(g.items, dropRules.get(norm) ?? 0)
    const earned = sum(kept, 'earned')
    const possible = sum(kept, 'possible')
    const weight = weightByNorm.get(norm)?.weight ?? null
    categories.push({
      name: g.name,
      weight,
      earned,
      possible,
      percent: possible > 0 ? (earned / possible) * 100 : null,
      counted: kept.length,
      dropped: dropped.map((d) => d.id),
      effectiveWeight: null
    })
    totalEarned += earned
    totalPossible += possible
    counted += kept.length
  }

  let percent: number | null = null
  if (config.mode === 'points') {
    percent = totalPossible > 0 ? (totalEarned / totalPossible) * 100 : null
    for (const c of categories) c.effectiveWeight = totalPossible > 0 ? c.possible / totalPossible : null
  } else {
    // Only categories that are weighted and have a computable average participate.
    const active = categories.filter((c) => c.weight != null && c.weight > 0 && c.percent != null)
    const wsum = active.reduce((s, c) => s + (c.weight ?? 0), 0)
    if (wsum > 0) {
      percent = active.reduce((s, c) => s + (c.percent ?? 0) * (c.weight ?? 0), 0) / wsum
      for (const c of active) c.effectiveWeight = (c.weight ?? 0) / wsum
    }
    // Extra-credit-only categories (weighted, earned > 0 but 0 possible) add nothing here by design;
    // use bonusPercent for flat extra credit.
  }

  if (percent != null && config.bonusPercent) percent += config.bonusPercent

  categories.sort((a, b) => (b.weight ?? -1) - (a.weight ?? -1) || a.name.localeCompare(b.name))
  return { percent, mode: config.mode, categories, earned: totalEarned, possible: totalPossible, counted }
}

export interface SolveResult {
  /** Points needed on the new assignment, or null if unreachable. */
  needed: number | null
  /** Percent of the assignment's possible points. */
  neededPercent: number | null
  reachable: boolean
  alreadyMet: boolean
  /** Best grade achievable within the search ceiling. */
  maxGrade: number | null
}

/**
 * Score needed on a new assignment (category, possible) to reach `target` percent.
 * Grade is non-decreasing in the new score, so bisection is exact to 1e-6 and robust to drop rules.
 * `ceilingPercent` bounds the search (e.g. 100 = no extra credit on the assignment).
 */
export function solveNeededScore(
  items: GradeItem[],
  config: EngineConfig,
  newItem: { category: string | null; possible: number; weight?: number },
  target: number,
  opts: EngineOptions = {},
  ceilingPercent = 100
): SolveResult {
  const gradeWith = (earned: number): number | null =>
    computeGrade(
      [...items, { id: '__solve__', category: newItem.category, earned, possible: newItem.possible, status: 'graded', weight: newItem.weight }],
      config,
      opts
    ).percent

  const hi = (newItem.possible * ceilingPercent) / 100
  const atZero = gradeWith(0)
  const atMax = gradeWith(hi)
  if (atZero == null || atMax == null) return { needed: null, neededPercent: null, reachable: false, alreadyMet: false, maxGrade: atMax }
  if (atZero >= target) return { needed: 0, neededPercent: 0, reachable: true, alreadyMet: true, maxGrade: atMax }
  if (atMax < target - 1e-9) return { needed: null, neededPercent: null, reachable: false, alreadyMet: false, maxGrade: atMax }
  let lo = 0
  let h = hi
  for (let i = 0; i < 80; i++) {
    const mid = (lo + h) / 2
    const g = gradeWith(mid)
    if (g != null && g >= target) h = mid
    else lo = mid
  }
  return {
    needed: h,
    neededPercent: newItem.possible > 0 ? (h / newItem.possible) * 100 : null,
    reachable: true,
    alreadyMet: false,
    maxGrade: atMax
  }
}

/**
 * Final-exam formula when the final is a fixed share of the course grade:
 * target = current × (1 − w) + final × w  →  final = (target − current × (1 − w)) / w
 */
export function neededOnFinal(current: number, finalWeightPercent: number, target: number): number | null {
  const w = finalWeightPercent / 100
  if (!(w > 0) || w > 1) return null
  return (target - current * (1 - w)) / w
}

/** Course grade change from including vs. excluding one item. */
export function assignmentImpact(items: GradeItem[], id: GradeItem['id'], config: EngineConfig, opts: EngineOptions = {}) {
  const withIt = computeGrade(items, config, opts).percent
  const without = computeGrade(items.filter((i) => i.id !== id), config, opts).percent
  return { withIt, without, delta: withIt != null && without != null ? withIt - without : null }
}

/** Parses "20%", "20.00", 20 -> 20. Returns null for blank/invalid. */
export function parsePercent(v: string | number | null | undefined): number | null {
  if (v == null) return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const m = v.replace(/,/g, '').match(/-?\d+(\.\d+)?/)
  return m ? Number(m[0]) : null
}
