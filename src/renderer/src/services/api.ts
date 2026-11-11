import type { GradeKiwiApi } from '@shared/ipc'

/** Typed handle to the preload bridge. The renderer has no other path to the system. */
export const api: GradeKiwiApi = window.gk

/** Strips Electron's "Error invoking remote method" prefix for display. */
export function errorMessage(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e)
  return m.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}
