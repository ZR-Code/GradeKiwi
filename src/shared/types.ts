// Domain types shared by the main process, preload bridge and renderer.

export type AssignmentStatus = 'graded' | 'not_graded' | 'missing' | 'exempt'
export type GradingMode = 'weighted' | 'points'
export type CourseLevel = 'regular' | 'honors' | 'ap' | 'ib' | 'av' | 'dual' | 'custom'
export type DataSource = 'studentvue' | 'import' | 'demo'

export interface Student {
  name: string | null
  permId: string | null
  school: string | null
  grade: string | null
  updatedAt: string
}

export interface GradingPeriod {
  id: number
  name: string
  index: number
  startDate: string | null // ISO yyyy-mm-dd
  endDate: string | null
}

export interface CategoryWeight {
  id: number
  courseId: number
  periodId: number
  name: string
  weight: number | null // percent 0-100, null when the source doesn't weight
  points: number | null
  pointsPossible: number | null
  mark: string | null
}

export interface CourseMark {
  courseId: number
  periodId: number
  markName: string
  letter: string | null
  percent: number | null
}

export interface CourseConfig {
  mode: 'auto' | GradingMode
  weights: Record<string, number> | null // user override, percent
  dropLowest: Record<string, number> // category -> N
  bonusPercent: number // flat extra credit added to course grade
  level: CourseLevel | null // null = use detected
  customBonus: number | null
  credits: number | null // null = automatic (full-year 1, semester course 0.5)
  excludeFromGpa: boolean
}

export interface Course {
  id: number
  key: string
  name: string
  period: string | null
  room: string | null
  teacher: string | null
  teacherEmail: string | null
  detectedLevel: CourseLevel
  config: CourseConfig
}

export interface Assignment {
  id: number
  courseId: number
  periodId: number
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
  firstSeen: string
  updatedAt: string
}

export interface AttendanceRecord {
  date: string | null
  period: string | null
  course: string | null
  reason: string | null
  note: string | null
}

export interface SyncInfo {
  lastSuccess: string | null
  lastAttempt: string | null
  lastStatus: 'ok' | 'error' | null
  lastMessage: string | null
  source: DataSource | null
}

export interface AppData {
  student: Student | null
  periods: GradingPeriod[]
  currentPeriodId: number | null
  courses: Course[]
  marks: CourseMark[]
  categories: CategoryWeight[]
  assignments: Assignment[]
  attendance: AttendanceRecord[]
  sync: SyncInfo
}

export interface SnapshotCourse {
  courseKey: string
  courseName: string
  periodName: string | null
  percent: number | null
  letter: string | null
  graded: number
  missing: number
  total: number
}

export interface Snapshot {
  id: number
  takenAt: string
  source: DataSource
  gpaUnweighted: number | null
  gpaWeighted: number | null
  courses: SnapshotCourse[]
}

export interface Hypothetical {
  id: number
  scenarioId: number
  courseId: number
  periodId: number | null
  kind: 'add' | 'override'
  targetAssignmentId: number | null
  name: string
  category: string | null
  earned: number | null
  possible: number | null
  dueDate: string | null
}

export interface Scenario {
  id: number
  name: string
  enabled: boolean
  createdAt: string
  updatedAt: string
  items: Hypothetical[]
}

export interface ScaleStep {
  letter: string
  min: number // minimum percent
  points: number // unweighted GPA points
}

export interface PastTerm {
  id: string
  name: string
  gpaUnweighted: number
  gpaWeighted: number | null
  credits: number
}

/** A finished course from a previous year (entered from a report card or transcript). */
export interface PastCourse {
  id: string
  year: string // e.g. "2024–25"
  name: string
  letter: string
  level: Exclude<CourseLevel, 'custom'>
  credits: number
}

export interface Settings {
  theme: 'system' | 'light' | 'dark'
  autoSyncOnLaunch: boolean
  syncIntervalMinutes: number // 0 = off
  scaleName: string
  scale: ScaleStep[]
  levelBonus: Record<Exclude<CourseLevel, 'custom'>, number>
  bonusOnlyIfPassing: boolean
  missingCountsAsZero: boolean
  hypotheticalsEnabled: boolean
  gpaRoundTo: number
  pastTerms: PastTerm[]
  pastCourses: PastCourse[]
  rememberCredentials: boolean
}

export interface AuthStatus {
  connected: boolean
  username: string | null
  remembered: boolean
  provider: string
  keychainAvailable: boolean
}

export interface SyncProgress {
  stage: string
  detail?: string
  fraction?: number
}

export interface SyncResult {
  ok: boolean
  message: string
  courses?: number
  assignments?: number
}

export interface ImportResult {
  ok: boolean
  message: string
}

export interface AppInfo {
  name: string
  version: string
  electron: string
  dataPath: string
  platform: string
  arch: string
}

export interface ProviderInfo {
  id: string
  name: string
  baseUrl: string
  notes: string[]
}
