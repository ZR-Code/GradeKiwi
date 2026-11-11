import { XMLParser } from 'fast-xml-parser'

// Elements that may repeat and must always parse as arrays.
const ARRAY_TAGS = new Set([
  'ReportPeriod',
  'Course',
  'Mark',
  'Assignment',
  'AssignmentGradeCalc',
  'Absence',
  'Period',
  'PeriodTotal',
  'Resource',
  'Standard'
])

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  parseAttributeValue: false,
  parseTagValue: false,
  trimValues: true,
  // Never expand DOCTYPE entities from untrusted input.
  processEntities: true,
  htmlEntities: false,
  isArray: (name) => ARRAY_TAGS.has(name)
})

export type XmlNode = Record<string, unknown>

export function parseXml(xml: string): XmlNode {
  if (/<!DOCTYPE/i.test(xml)) throw new Error('XML with DOCTYPE declarations is not accepted.')
  return parser.parse(xml) as XmlNode
}

export function node(v: unknown): XmlNode | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as XmlNode) : null
}

export function list(v: unknown): XmlNode[] {
  if (Array.isArray(v)) return v.filter((x): x is XmlNode => !!node(x))
  const n = node(v)
  return n ? [n] : []
}

export function str(n: XmlNode | null | undefined, key: string): string | null {
  if (!n) return null
  const v = n[key]
  if (v == null) return null
  if (typeof v === 'string' || typeof v === 'number') {
    const s = String(v).trim()
    return s.length ? s : null
  }
  const inner = node(v)
  if (inner && typeof inner['#text'] === 'string') {
    const s = inner['#text'].trim()
    return s.length ? s : null
  }
  return null
}

export function num(s: string | null | undefined): number | null {
  if (s == null) return null
  const cleaned = s.replace(/,/g, '').trim()
  if (!/^-?\d*\.?\d+$/.test(cleaned)) return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

/** "9/10/2020" or "2020-09-10" -> "2020-09-10". */
export function isoDate(s: string | null | undefined): string | null {
  if (!s) return null
  const t = s.trim()
  let m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (m) return `${m[3]}-${m[1]!.padStart(2, '0')}-${m[2]!.padStart(2, '0')}`
  m = t.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  return null
}
