// Exposes a fixed, typed API to the renderer. No raw ipcRenderer access is leaked.

import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { CHANNELS, type GradeKiwiApi } from '@shared/ipc'
import type { SyncProgress } from '@shared/types'

const invoke = (ch: string, ...args: unknown[]) => ipcRenderer.invoke(ch, ...args)

const api: GradeKiwiApi = {
  platform: process.platform,
  appInfo: () => invoke(CHANNELS.appInfo),
  providerInfo: () => invoke(CHANNELS.providerInfo),
  authStatus: () => invoke(CHANNELS.authStatus),
  connect: (input) => invoke(CHANNELS.connect, input),
  disconnect: () => invoke(CHANNELS.disconnect),
  sync: () => invoke(CHANNELS.sync),
  onSyncProgress: (cb) => {
    const l = (_e: IpcRendererEvent, p: SyncProgress) => cb(p)
    ipcRenderer.on(CHANNELS.syncProgress, l)
    return () => ipcRenderer.removeListener(CHANNELS.syncProgress, l)
  },
  onDataChanged: (cb) => {
    const l = () => cb()
    ipcRenderer.on(CHANNELS.dataChanged, l)
    return () => ipcRenderer.removeListener(CHANNELS.dataChanged, l)
  },
  getData: () => invoke(CHANNELS.getData),
  snapshots: () => invoke(CHANNELS.snapshots),
  updateCourseConfig: (id, cfg) => invoke(CHANNELS.updateCourseConfig, id, cfg),
  getSettings: () => invoke(CHANNELS.getSettings),
  setSettings: (patch) => invoke(CHANNELS.setSettings, patch),
  scenarios: () => invoke(CHANNELS.scenarios),
  createScenario: (name) => invoke(CHANNELS.createScenario, name),
  renameScenario: (id, name) => invoke(CHANNELS.renameScenario, id, name),
  duplicateScenario: (id) => invoke(CHANNELS.duplicateScenario, id),
  deleteScenario: (id) => invoke(CHANNELS.deleteScenario, id),
  setScenarioEnabled: (id, en) => invoke(CHANNELS.setScenarioEnabled, id, en),
  upsertHypothetical: (h) => invoke(CHANNELS.upsertHypothetical, h),
  deleteHypothetical: (id) => invoke(CHANNELS.deleteHypothetical, id),
  importFile: () => invoke(CHANNELS.importFile),
  saveCsvTemplate: () => invoke(CHANNELS.saveCsvTemplate),
  exportData: (f) => invoke(CHANNELS.exportData, f),
  deleteAll: () => invoke(CHANNELS.deleteAll),
  loadDemo: () => invoke(CHANNELS.loadDemo),
  openExternal: (url) => invoke(CHANNELS.openExternal, url)
}

contextBridge.exposeInMainWorld('gk', api)
