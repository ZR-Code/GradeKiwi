// Past-year courses: school-year labels and a forgiving parser for pasted spreadsheet rows.

import type { PastCourse, ScaleStep } from '../types'
import { detectLevel, letterFor, normalizeLetter } from './scale'

type PastLevel = PastCourse['level']

export const newId = (): string => globalThis.crypto.randomUUID()

/** "2025–26" for the school year containing `d` (FCPS years start in late August). */
export function schoolYear(d = new Date(), offset = 0): string {
  const start = (d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1) + offset
  return `${start}–${String((start + 1) % 100).padStart(2, '0')}`
}

/**
 * Parses pasted rows: "Course, Grade[, Level][, Credits]" separated by tabs or commas.
 * Grade may be a letter (B+) or a percentage (88.5) — percentages are converted with the active scale.
 */
export function parsePastedCourses(text: string, year: string, scale: ScaleStep[]): { courses: PastCourse[]; skipped: string[] } {
  const letters = new Set(scale.map((s) => normalizeLetter(s.letter)))
  const courses: PastCourse[] = []
  const skipped: string[] = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    const cells = (line.includes('\t') ? line.split('\t') : line.split(',')).map((c) => c.trim()).filter(Boolean)
    if (cells.length < 2 || /^(course|class)\b/i.test(cells[0]!)) {
      if (!/^(course|class)\b/i.test(cells[0] ?? '')) skipped.push(line)
      continue
    }
    const [name, gradeRaw, ...rest] = cells as [string, string, ...string[]]
    let letter: string | null = null
    const asNum = Number(gradeRaw.replace('%', ''))
    if (letters.has(normalizeLetter(gradeRaw))) letter = scale.find((s) => normalizeLetter(s.letter) === normalizeLetter(gradeRaw))!.letter
    else if (Number.isFinite(asNum)) letter = letterFor(asNum, scale)
    if (!letter) {
      skipped.push(line)
      continue
    }
    let level: PastLevel = (() => {
      const d = detectLevel(name)
      return d === 'custom' ? 'regular' : d
    })()
    let credits = 1
    for (const r of rest) {
      const n = Number(r)
      if (Number.isFinite(n)) credits = Math.max(0, Math.min(10, n))
      else {
        const d = detectLevel(r)
        if (d !== 'regular' && d !== 'custom') level = d
        else if (/^(standard|regular|reg)$/i.test(r)) level = 'regular'
      }
    }
    courses.push({ id: newId(), year, name: name.slice(0, 120), letter, level, credits })
  }
  return { courses, skipped }
}

