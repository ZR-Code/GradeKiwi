// The complete renderer ↔ main contract. Preload exposes exactly these methods; main validates every input.

import type {
  AppData,
  AppInfo,
  AuthStatus,
  CourseConfig,
  Hypothetical,
  ImportResult,
  ProviderInfo,
  Scenario,
  Settings,
  Snapshot,
  SyncProgress,
  SyncResult
} from './types'

export const CHANNELS = {
  appInfo: 'app:info',
  providerInfo: 'auth:provider',
  authStatus: 'auth:status',
  connect: 'auth:connect',
  disconnect: 'auth:disconnect',
  sync: 'sync:run',
  syncProgress: 'sync:progress', // main → renderer event
  dataChanged: 'data:changed', // main → renderer event
  getData: 'data:get',
  snapshots: 'data:snapshots',
  updateCourseConfig: 'course:config',
  getSettings: 'settings:get',
  setSettings: 'settings:set',
  scenarios: 'hypo:list',
  createScenario: 'hypo:create',
  renameScenario: 'hypo:rename',
  duplicateScenario: 'hypo:duplicate',
  deleteScenario: 'hypo:delete',
  setScenarioEnabled: 'hypo:enable',
  upsertHypothetical: 'hypo:upsert',
  deleteHypothetical: 'hypo:remove',
  importFile: 'data:import',
  saveCsvTemplate: 'data:csv-template',
  exportData: 'data:export',
  deleteAll: 'data:delete-all',
  loadDemo: 'data:demo',
  openExternal: 'shell:open'
} as const

export interface GradeKiwiApi {
  /** 'darwin' | 'win32' | … — from the sandboxed preload's process.platform. */
  readonly platform: string
  appInfo(): Promise<AppInfo>
  providerInfo(): Promise<ProviderInfo>
  authStatus(): Promise<AuthStatus>
  connect(input: { username: string; password: string; remember: boolean }): Promise<{ ok: boolean; message: string }>
  disconnect(): Promise<void>
  sync(): Promise<SyncResult>
  onSyncProgress(cb: (p: SyncProgress) => void): () => void
  onDataChanged(cb: () => void): () => void
  getData(): Promise<AppData>
  snapshots(): Promise<Snapshot[]>
  updateCourseConfig(courseId: number, config: CourseConfig): Promise<void>
  getSettings(): Promise<Settings>
  setSettings(patch: Partial<Settings>): Promise<Settings>
  scenarios(): Promise<Scenario[]>
  createScenario(name: string): Promise<number>
  renameScenario(id: number, name: string): Promise<void>
  duplicateScenario(id: number): Promise<number>
  deleteScenario(id: number): Promise<void>
  setScenarioEnabled(id: number, enabled: boolean): Promise<void>
  upsertHypothetical(h: Omit<Hypothetical, 'id'> & { id?: number }): Promise<number>
  deleteHypothetical(id: number): Promise<void>
  importFile(): Promise<ImportResult>
  saveCsvTemplate(): Promise<ImportResult>
  exportData(format: 'json' | 'csv'): Promise<ImportResult>
  deleteAll(): Promise<void>
  loadDemo(): Promise<SyncResult>
  openExternal(url: string): Promise<void>
}
