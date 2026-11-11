// Orchestrates provider → database → snapshot. Single-flight: concurrent requests share one run.

import type { DataSource, SyncProgress, SyncResult } from '@shared/types'
import type { Database } from '../database/database'
import type { CredentialStore } from '../security/keychain'
import { StudentVueError } from './client'
import type { NormalizedData } from './normalized'
import type { GradeProvider } from './provider'

export class SyncService {
  private inFlight: Promise<SyncResult> | null = null

  constructor(
    private readonly db: Database,
    private readonly creds: CredentialStore,
    private readonly provider: GradeProvider,
    private readonly emit: (p: SyncProgress) => void
  ) {}

  get running(): boolean {
    return this.inFlight != null
  }

  sync(): Promise<SyncResult> {
    if (!this.inFlight) {
      this.inFlight = this.doSync().finally(() => {
        this.inFlight = null
      })
    }
    return this.inFlight
  }

  private async doSync(): Promise<SyncResult> {
    const creds = this.creds.load()
    if (!creds) return { ok: false, message: 'Not connected to StudentVUE.' }
    const logId = this.db.logSyncStart('studentvue')
    try {
      const data = await this.provider.fetchAll(creds, this.emit)
      this.emit({ stage: 'Saving', fraction: 0.95 })
      const r = this.ingest(data, 'studentvue', logId)
      return r
    } catch (e) {
      const message = e instanceof StudentVueError ? e.message : 'Sync failed unexpectedly. Your saved data is unchanged.'
      // Only the sanitized message is logged — never request bodies or credentials.
      console.error('[sync] failed:', e instanceof StudentVueError ? `${e.kind}: ${e.message}` : (e as Error)?.name)
      this.db.logSyncEnd(logId, 'error', message)
      this.emit({ stage: 'Failed', detail: message, fraction: 1 })
      return { ok: false, message }
    }
  }

  /** Shared by sync, file import and demo loading. */
  ingest(data: NormalizedData, source: DataSource, logId?: number): SyncResult {
    const id = logId ?? this.db.logSyncStart(source)
    const counts = this.db.applyNormalized(data, source)
    this.db.createSnapshot(source)
    const message = `Updated ${counts.courses} courses and ${counts.assignments} assignments.`
    this.db.logSyncEnd(id, 'ok', message)
    this.emit({ stage: 'Done', detail: message, fraction: 1 })
    return { ok: true, message, ...counts }
  }
}
