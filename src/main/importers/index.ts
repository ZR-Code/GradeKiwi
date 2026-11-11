// File import: detects format and returns NormalizedData. All parsing happens locally.

import { z } from 'zod'
import { mergeCourses } from '../studentvue/provider'
import type { NormalizedData } from '../studentvue/normalized'
import { unwrapResponse } from '../studentvue/client'
import { parseGradebookXml } from '../studentvue/parsers/gradebook'
import { parseCsv } from './csv'

const MAX_BYTES = 20 * 1024 * 1024

const status = z.enum(['graded', 'not_graded', 'missing', 'exempt'])
const nstr = z.string().max(2000).nullable()
const nnum = z.number().finite().nullable()

export const normalizedSchema = z.object({
  student: z.object({ name: nstr, permId: nstr, school: nstr, grade: nstr }).nullable(),
  periods: z.array(z.object({ index: z.number().int(), name: z.string().max(200), startDate: nstr, endDate: nstr })).max(50),
  currentPeriodIndex: z.number().int().nullable(),
  courses: z
    .array(
      z.object({
        key: z.string().max(500),
        name: z.string().max(500),
        period: nstr,
        room: nstr,
        teacher: nstr,
        teacherEmail: nstr,
        marks: z.array(
          z.object({
            periodIndex: z.number().int(),
            markName: z.string().max(200),
            letter: nstr,
            percent: nnum,
            categories: z.array(z.object({ name: z.string().max(200), weight: nnum, points: nnum, pointsPossible: nnum, mark: nstr })).max(100),
            assignments: z
              .array(
                z.object({
                  sourceId: z.string().max(500),
                  name: z.string().max(1000),
                  category: nstr,
                  date: nstr,
                  dueDate: nstr,
                  earned: nnum,
                  possible: nnum,
                  status,
                  scoreText: nstr,
                  pointsText: nstr,
                  notes: nstr,
                  description: z.string().max(20000).nullable()
                })
              )
              .max(5000)
          })
        )
      })
    )
    .max(100),
  attendance: z
    .array(z.object({ date: nstr, period: nstr, course: nstr, reason: nstr, note: nstr }))
    .max(10000)
    .nullable()
})

export type ImportFormat = 'json' | 'csv' | 'xml'

export function detectFormat(fileName: string, text: string): ImportFormat {
  const lower = fileName.toLowerCase()
  if (lower.endsWith('.json')) return 'json'
  if (lower.endsWith('.xml')) return 'xml'
  if (lower.endsWith('.csv')) return 'csv'
  const t = text.trimStart()
  if (t.startsWith('{')) return 'json'
  if (t.startsWith('<')) return 'xml'
  return 'csv'
}

export function parseImport(fileName: string, text: string): NormalizedData {
  if (Buffer.byteLength(text) > MAX_BYTES) throw new Error('File is larger than 20 MB.')
  const format = detectFormat(fileName, text)
  if (format === 'json') {
    let raw: unknown
    try {
      raw = JSON.parse(text)
    } catch {
      throw new Error('The file is not valid JSON.')
    }
    const payload = raw && typeof raw === 'object' && 'gradekiwi' in raw ? (raw as unknown as { data: unknown }).data : raw
    const parsed = normalizedSchema.safeParse(payload)
    if (!parsed.success) throw new Error('This JSON file is not a GradeKiwi export.')
    return parsed.data
  }
  if (format === 'xml') {
    // Accept either a raw <Gradebook> document or a full SOAP response envelope.
    const inner = text.includes('ProcessWebServiceRequestResult') ? unwrapResponse(text) : text
    const gb = parseGradebookXml(inner)
    const idx = gb.periods.find((p) => p.name === gb.currentPeriod?.name)?.index ?? 0
    return {
      student: null,
      periods: gb.periods.length ? gb.periods : [{ index: 0, name: gb.currentPeriod?.name || 'Imported', startDate: null, endDate: null }],
      currentPeriodIndex: idx,
      courses: mergeCourses(new Map([[idx, gb]])),
      attendance: null
    }
  }
  return parseCsv(text)
}
