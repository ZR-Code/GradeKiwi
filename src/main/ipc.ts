// IPC handlers. Every channel is explicitly registered here; every input is validated with zod.

import { app, BrowserWindow, dialog, ipcMain, nativeTheme, shell, type IpcMainInvokeEvent } from 'electron'
import { readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename } from 'node:path'
import { z } from 'zod'
import { CHANNELS } from '@shared/ipc'
import type { AuthStatus, Settings } from '@shared/types'
import type { Database } from './database/database'
import { buildDemoData } from './demo'
import { exportCsv, exportJson } from './export'
import { CSV_TEMPLATE } from './importers/csv'
import { parseImport } from './importers'
import type { CredentialStore } from './security/keychain'
import { StudentVueError } from './studentvue/client'
import type { GradeProvider } from './studentvue/provider'
import type { SyncService } from './studentvue/synchronization'

const id = z.number().int().positive()
const name = z.string().trim().min(1).max(120)
const nnum = z.number().finite().min(-1e6).max(1e6).nullable()
const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable()

const courseConfigSchema = z.object({
  mode: z.enum(['auto', 'weighted', 'points']),
  weights: z.record(z.string().max(200), z.number().finite().min(0).max(1000)).nullable(),
  dropLowest: z.record(z.string().max(200), z.number().int().min(0).max(50)),
  bonusPercent: z.number().finite().min(-100).max(100),
  level: z.enum(['regular', 'honors', 'ap', 'ib', 'av', 'dual', 'custom']).nullable(),
  customBonus: z.number().finite().min(0).max(5).nullable(),
  credits: z.number().finite().min(0).max(10).nullable(),
  excludeFromGpa: z.boolean()
})

const settingsPatch = z
  .object({
    theme: z.enum(['system', 'light', 'dark']),
    autoSyncOnLaunch: z.boolean(),
    syncIntervalMinutes: z.number().int().refine((v) => v === 0 || (v >= 30 && v <= 1440), 'Interval must be 0 or 30–1440 minutes'),
    scaleName: z.string().max(80),
    scale: z
      .array(z.object({ letter: z.string().trim().min(1).max(4), min: z.number().finite().min(0).max(200), points: z.number().finite().min(0).max(10) }))
      .min(1)
      .max(30),
    levelBonus: z.object({ regular: z.number(), honors: z.number(), ap: z.number(), ib: z.number(), av: z.number(), dual: z.number() }),
    bonusOnlyIfPassing: z.boolean(),
    missingCountsAsZero: z.boolean(),
    hypotheticalsEnabled: z.boolean(),
    gpaRoundTo: z.number().int().min(1).max(4),
    pastTerms: z
      .array(
        z.object({
          id: z.string().max(64),
          name: z.string().max(80),
          gpaUnweighted: z.number().min(0).max(10),
          gpaWeighted: z.number().min(0).max(10).nullable(),
          credits: z.number().min(0).max(100)
        })
      )
      .max(40),
    pastCourses: z
      .array(
        z.object({
          id: z.string().max(64),
          year: z.string().trim().max(40),
          name: z.string().max(120),
          letter: z.string().trim().min(1).max(4),
          level: z.enum(['regular', 'honors', 'ap', 'ib', 'av', 'dual']),
          credits: z.number().finite().min(0).max(10)
        })
      )
      .max(300),
    rememberCredentials: z.boolean()
  })
  .partial()
  .strict()

const hypoSchema = z.object({
  id: id.optional(),
  scenarioId: id,
  courseId: id,
  periodId: id.nullable(),
  kind: z.enum(['add', 'override']),
  targetAssignmentId: id.nullable(),
  name: z.string().trim().min(1).max(200),
  category: z.string().max(200).nullable(),
  earned: nnum,
  possible: z.number().finite().min(0).max(1e6).nullable(),
  dueDate: isoDay
})

const EXTERNAL_ALLOW = [/^mailto:[^\s@/?#]+@[^\s@/?#]+\.[a-z]{2,}$/i, /^https:\/\/sisstudent\.fcps\.edu\//, /^https:\/\/(www\.)?fcps\.edu\//, /^https:\/\/github\.com\/StudentVue\//]

export interface IpcDeps {
  db: Database
  creds: CredentialStore
  provider: GradeProvider
  sync: SyncService
  getWindow: () => BrowserWindow | null
  onSettingsChanged: (s: Settings) => void
}

/** Rejects calls that don't come from our own window's top frame. */
function checkSender(e: IpcMainInvokeEvent, deps: IpcDeps): void {
  const win = deps.getWindow()
  if (!win || e.sender !== win.webContents || e.senderFrame !== win.webContents.mainFrame) throw new Error('Unauthorized IPC sender')
}

export function registerIpc(deps: IpcDeps): void {
  const { db, creds, provider, sync } = deps
  const notify = () => deps.getWindow()?.webContents.send(CHANNELS.dataChanged)

  const handle = <T>(channel: string, fn: (...args: unknown[]) => T | Promise<T>) => {
    ipcMain.handle(channel, async (e, ...args) => {
      checkSender(e, deps)
      return fn(...args)
    })
  }

  handle(CHANNELS.appInfo, () => ({
    name: app.getName(),
    version: app.getVersion(),
    electron: process.versions.electron,
    dataPath: app.getPath('userData'),
    platform: process.platform,
    arch: process.arch
  }))

  handle(CHANNELS.providerInfo, () => provider.info)

  handle(CHANNELS.authStatus, (): AuthStatus => {
    const c = creds.load()
    return { connected: !!c, username: c?.username ?? null, remembered: creds.remembered, provider: provider.info.name, keychainAvailable: creds.keychainAvailable }
  })

  handle(CHANNELS.connect, async (raw) => {
    const input = z.object({ username: z.string().trim().min(1).max(100), password: z.string().min(1).max(256), remember: z.boolean() }).parse(raw)
    try {
      await provider.validate({ username: input.username, password: input.password })
    } catch (e) {
      if (e instanceof StudentVueError) return { ok: false, message: e.message }
      return { ok: false, message: 'Could not verify your account. Please try again.' }
    }
    await creds.save({ username: input.username, password: input.password }, input.remember)
    db.setSettings({ rememberCredentials: input.remember })
    const r = await sync.sync()
    notify()
    return { ok: r.ok, message: r.ok ? 'Connected to FCPS StudentVUE.' : r.message }
  })

  handle(CHANNELS.disconnect, () => {
    creds.erase()
    notify()
  })

  handle(CHANNELS.sync, async () => {
    const r = await sync.sync()
    notify()
    return r
  })

  handle(CHANNELS.getData, () => db.getAppData())
  handle(CHANNELS.snapshots, () => db.listSnapshots())

  handle(CHANNELS.updateCourseConfig, (cid, cfg) => {
    db.updateCourseConfig(id.parse(cid), courseConfigSchema.parse(cfg))
  })

  handle(CHANNELS.getSettings, () => db.getSettings())
  handle(CHANNELS.setSettings, (patch) => {
    const s = db.setSettings(settingsPatch.parse(patch) as Partial<Settings>)
    if (s.theme) nativeTheme.themeSource = s.theme
    deps.onSettingsChanged(s)
    return s
  })

  handle(CHANNELS.scenarios, () => db.listScenarios())
  handle(CHANNELS.createScenario, (n) => db.createScenario(name.parse(n)))
  handle(CHANNELS.renameScenario, (sid, n) => db.renameScenario(id.parse(sid), name.parse(n)))
  handle(CHANNELS.duplicateScenario, (sid) => {
    const s = db.listScenarios().find((x) => x.id === id.parse(sid))
    if (!s) throw new Error('Scenario not found')
    return db.duplicateScenario(s.id, `${s.name} copy`.slice(0, 120))
  })
  handle(CHANNELS.deleteScenario, (sid) => db.deleteScenario(id.parse(sid)))
  handle(CHANNELS.setScenarioEnabled, (sid, en) => db.setScenarioEnabled(id.parse(sid), z.boolean().parse(en)))
  handle(CHANNELS.upsertHypothetical, (h) => db.upsertHypothetical(hypoSchema.parse(h)))
  handle(CHANNELS.deleteHypothetical, (hid) => db.deleteHypothetical(id.parse(hid)))

  handle(CHANNELS.importFile, async () => {
    const win = deps.getWindow()
    const opts = {
      title: 'Import gradebook data',
      properties: ['openFile' as const],
      filters: [
        { name: 'Gradebook files', extensions: ['csv', 'json', 'xml'] },
        { name: 'All files', extensions: ['*'] }
      ]
    }
    const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    const file = res.filePaths[0]
    if (res.canceled || !file) return { ok: false, message: 'Import cancelled.' }
    try {
      if (statSync(file).size > 20 * 1024 * 1024) throw new Error('File is larger than 20 MB.')
      const data = parseImport(basename(file), readFileSync(file, 'utf8'))
      const r = sync.ingest(data, 'import')
      notify()
      return { ok: true, message: `Imported ${basename(file)} — ${r.message}` }
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : 'Import failed.' }
    }
  })

  handle(CHANNELS.saveCsvTemplate, async () => {
    const win = deps.getWindow()
    const opts = { defaultPath: 'GradeKiwi-import-template.csv' }
    const res = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts)
    if (res.canceled || !res.filePath) return { ok: false, message: 'Cancelled.' }
    writeFileSync(res.filePath, CSV_TEMPLATE)
    return { ok: true, message: `Saved template to ${basename(res.filePath)}` }
  })

  handle(CHANNELS.exportData, async (fmt) => {
    const format = z.enum(['json', 'csv']).parse(fmt)
    const win = deps.getWindow()
    const stamp = new Date().toISOString().slice(0, 10)
    const opts = { defaultPath: `GradeKiwi-${stamp}.${format}`, filters: [{ name: format.toUpperCase(), extensions: [format] }] }
    const res = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts)
    if (res.canceled || !res.filePath) return { ok: false, message: 'Export cancelled.' }
    writeFileSync(res.filePath, format === 'json' ? exportJson(db) : exportCsv(db), { mode: 0o600 })
    return { ok: true, message: `Exported to ${basename(res.filePath)}` }
  })

  handle(CHANNELS.deleteAll, () => {
    db.deleteAllData()
    notify()
  })

  handle(CHANNELS.loadDemo, () => {
    const r = sync.ingest(buildDemoData(), 'demo')
    notify()
    return r
  })

  handle(CHANNELS.openExternal, async (url) => {
    const u = z.string().url().parse(url)
    if (!EXTERNAL_ALLOW.some((re) => re.test(u))) throw new Error('URL not allowed')
    await shell.openExternal(u)
  })
}
