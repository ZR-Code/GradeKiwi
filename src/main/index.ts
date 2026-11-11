import { app, BrowserWindow, Menu, nativeTheme, net, session, shell } from 'electron'
import { join } from 'node:path'
import type { Settings } from '@shared/types'
import { CHANNELS } from '@shared/ipc'
import { Database } from './database/database'
import { registerIpc } from './ipc'
import { CredentialStore } from './security/keychain'
import type { FetchLike } from './studentvue/client'
import { FCPS, SynergySoapProvider } from './studentvue/provider'
import { SyncService } from './studentvue/synchronization'

app.setName('GradeKiwi')
// Grade data is private: everything the app creates (DB, WAL, credentials) is owner-only.
process.umask(0o077)

if (!app.requestSingleInstanceLock()) app.quit()

let win: BrowserWindow | null = null
let syncTimer: NodeJS.Timeout | null = null

const netFetch: FetchLike = (url, init) => net.fetch(url, { ...init, credentials: 'omit', cache: 'no-store' } as RequestInit)

const isMac = process.platform === 'darwin'

/** Solid window colors for platforms without vibrancy (match --bg in styles.css). */
function chromeColors() {
  const dark = nativeTheme.shouldUseDarkColors
  return { background: dark ? '#161618' : '#f7f7f5', symbol: dark ? '#ededf0' : '#18181b' }
}

/** Window caption buttons drawn by Windows over our own header (same 52px height as the header). */
function titleBarOverlay() {
  return { color: '#00000000', symbolColor: chromeColors().symbol, height: 52 }
}

function createWindow(): BrowserWindow {
  const chrome: Electron.BrowserWindowConstructorOptions = isMac
    ? { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 18, y: 18 }, vibrancy: 'sidebar', visualEffectState: 'followWindow', backgroundColor: '#00000000' }
    : { titleBarStyle: 'hidden', titleBarOverlay: titleBarOverlay(), backgroundColor: chromeColors().background, autoHideMenuBar: true }
  const w = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 980,
    minHeight: 640,
    show: false,
    title: 'GradeKiwi',
    ...chrome,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false
    }
  })
  w.once('ready-to-show', () => w.show())
  // No popups, no navigation away from the app bundle.
  w.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\/(sisstudent\.)?fcps\.edu\//.test(url) || /^https:\/\/www\.fcps\.edu\//.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  w.webContents.on('will-navigate', (e, url) => {
    if (url !== w.webContents.getURL()) e.preventDefault()
  })
  if (process.env.ELECTRON_RENDERER_URL && !app.isPackaged) void w.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void w.loadFile(join(__dirname, '../renderer/index.html'))
  return w
}

function scheduleSync(settings: Settings, sync: SyncService): void {
  if (syncTimer) clearInterval(syncTimer)
  syncTimer = null
  if (settings.syncIntervalMinutes >= 30) {
    syncTimer = setInterval(() => {
      void sync.sync().then(() => win?.webContents.send(CHANNELS.dataChanged))
    }, settings.syncIntervalMinutes * 60_000)
  }
}

app.whenReady().then(async () => {
  // Deny every permission request (camera, notifications, etc.) — the app needs none.
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false))
  session.defaultSession.setPermissionCheckHandler(() => false)

  const userData = app.getPath('userData')
  const db = new Database(join(userData, 'gradekiwi.db'))
  const creds = new CredentialStore(userData)
  await creds.init()
  const provider = new SynergySoapProvider(FCPS, netFetch)
  const sync = new SyncService(db, creds, provider, (p) => win?.webContents.send(CHANNELS.syncProgress, p))

  const settings = db.getSettings()
  nativeTheme.themeSource = settings.theme

  registerIpc({
    db,
    creds,
    provider,
    sync,
    getWindow: () => win,
    onSettingsChanged: (s) => scheduleSync(s, sync)
  })

  // Keep window chrome in step with light/dark mode where there's no vibrancy (Windows).
  nativeTheme.on('updated', () => {
    if (isMac || !win) return
    win.setBackgroundColor(chromeColors().background)
    win.setTitleBarOverlay(titleBarOverlay())
  })

  if (!isMac) Menu.setApplicationMenu(null) // Windows: no menu bar; editing shortcuts still work natively.
  if (isMac) {
    Menu.setApplicationMenu(
      Menu.buildFromTemplate([
        { role: 'appMenu' },
        { role: 'editMenu' },
        { label: 'View', submenu: [{ role: 'reload', visible: !app.isPackaged }, { role: 'toggleDevTools', visible: !app.isPackaged }, { role: 'togglefullscreen' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }] },
        { role: 'windowMenu' }
      ])
    )
  }

  win = createWindow()
  win.on('closed', () => (win = null))

  // Automatic sync on launch (renderer shows cached data immediately; works offline).
  win.webContents.once('did-finish-load', () => {
    if (settings.autoSyncOnLaunch && creds.load()) {
      void sync.sync().then(() => win?.webContents.send(CHANNELS.dataChanged))
    }
  })
  scheduleSync(settings, sync)

  app.on('activate', () => {
    if (!win) {
      win = createWindow()
      win.on('closed', () => (win = null))
    }
  })
  app.on('before-quit', () => db.close())
})

app.on('second-instance', () => {
  if (win) {
    if (win.isMinimized()) win.restore()
    win.focus()
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// Hard-block any webview attachments or new web contents with node access.
app.on('web-contents-created', (_e, contents) => {
  contents.on('will-attach-webview', (e) => e.preventDefault())
})
