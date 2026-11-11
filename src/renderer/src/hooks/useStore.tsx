import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import type { AppData, AuthStatus, Hypothetical, ProviderInfo, Scenario, Settings, Snapshot, SyncProgress, SyncResult } from '@shared/types'
import { DEFAULT_SETTINGS, yearSummaries, type CourseSummary } from '@shared/grading/model'
import { api } from '../services/api'

export type Route =
  | { page: 'dashboard' }
  | { page: 'courses' }
  | { page: 'course'; id: number }
  | { page: 'assignments' }
  | { page: 'hypotheticals' }
  | { page: 'calculator' }
  | { page: 'gpa' }
  | { page: 'history' }
  | { page: 'settings' }
  | { page: 'connect' }

export interface Toast {
  id: number
  message: string
  kind: 'ok' | 'error' | 'info'
  leaving?: boolean
}

type DocWithVT = Document & { startViewTransition?: (cb: () => void) => unknown }

/** Runs a UI change inside a View Transition (cross-fade of the content pane) when supported. */
export function withViewTransition(change: () => void): void {
  const doc = document as DocWithVT
  if (!doc.startViewTransition || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    change()
    return
  }
  doc.startViewTransition(() => flushSync(change))
}

interface StoreValue {
  ready: boolean
  data: AppData | null
  hasData: boolean
  isDemo: boolean
  settings: Settings
  scenarios: Scenario[]
  snapshots: Snapshot[]
  auth: AuthStatus | null
  provider: ProviderInfo | null
  syncing: boolean
  progress: SyncProgress | null
  periodId: number | null
  setPeriodId: (id: number | null) => void
  summaries: CourseSummary[]
  /** Hypotheticals from enabled scenarios when the global toggle is on. */
  activeHypos: Hypothetical[]
  route: Route
  navigate: (r: Route) => void
  refresh: () => Promise<void>
  sync: () => Promise<SyncResult>
  updateSettings: (patch: Partial<Settings>) => Promise<void>
  toast: (message: string, kind?: Toast['kind']) => void
  toasts: Toast[]
}

const Ctx = createContext<StoreValue | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [data, setData] = useState<AppData | null>(null)
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [scenarios, setScenarios] = useState<Scenario[]>([])
  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [auth, setAuth] = useState<AuthStatus | null>(null)
  const [provider, setProvider] = useState<ProviderInfo | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [progress, setProgress] = useState<SyncProgress | null>(null)
  const [periodId, setPeriodIdRaw] = useState<number | null>(null)
  const setPeriodId = useCallback((id: number | null) => withViewTransition(() => setPeriodIdRaw(id)), [])
  const [route, setRoute] = useState<Route>({ page: 'dashboard' })
  const [toasts, setToasts] = useState<Toast[]>([])
  const toastId = useRef(0)

  const toast = useCallback((message: string, kind: Toast['kind'] = 'info') => {
    const id = ++toastId.current
    setToasts((t) => [...t, { id, message, kind }])
    const life = kind === 'error' ? 7000 : 4000
    setTimeout(() => setToasts((t) => t.map((x) => (x.id === id ? { ...x, leaving: true } : x))), life)
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), life + 180)
  }, [])

  const refresh = useCallback(async () => {
    const [d, s, sc, sn, a] = await Promise.all([api.getData(), api.getSettings(), api.scenarios(), api.snapshots(), api.authStatus()])
    setData(d)
    setSettings(s)
    setScenarios(sc)
    setSnapshots(sn)
    setAuth(a)
    setPeriodIdRaw((cur) => (cur != null && d.periods.some((p) => p.id === cur) ? cur : d.currentPeriodId))
  }, [])

  useEffect(() => {
    void (async () => {
      setProvider(await api.providerInfo())
      await refresh()
      setReady(true)
    })()
    const offData = api.onDataChanged(() => void refresh())
    const offProg = api.onSyncProgress((p) => {
      setProgress(p)
      setSyncing(p.fraction == null || p.fraction < 1)
      if (p.fraction === 1) setTimeout(() => setProgress(null), 1500)
    })
    return () => {
      offData()
      offProg()
    }
  }, [refresh])

  const sync = useCallback(async () => {
    setSyncing(true)
    try {
      const r = await api.sync()
      toast(r.message, r.ok ? 'ok' : 'error')
      await refresh()
      return r
    } finally {
      setSyncing(false)
    }
  }, [refresh, toast])

  const updateSettings = useCallback(async (patch: Partial<Settings>) => {
    setSettings((s) => ({ ...s, ...patch }))
    try {
      setSettings(await api.setSettings(patch))
    } catch (e) {
      toast(e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': /, '') : 'Could not save settings', 'error')
      setSettings(await api.getSettings())
    }
  }, [toast])

  // Rolling gradebooks: one year-to-date grade per course as of the viewed period.
  const summaries = useMemo(() => (data ? yearSummaries(data, settings, periodId) : []), [data, periodId, settings])

  const activeHypos = useMemo(
    () => (settings.hypotheticalsEnabled ? scenarios.filter((s) => s.enabled).flatMap((s) => s.items) : []),
    [scenarios, settings.hypotheticalsEnabled]
  )

  const navigate = useCallback((r: Route) => {
    withViewTransition(() => {
      setRoute(r)
      document.getElementById('main-scroll')?.scrollTo({ top: 0 })
    })
  }, [])

  const value: StoreValue = {
    ready,
    data,
    hasData: !!data && data.courses.length > 0,
    isDemo: data?.sync.source === 'demo',
    settings,
    scenarios,
    snapshots,
    auth,
    provider,
    syncing,
    progress,
    periodId,
    setPeriodId,
    summaries,
    activeHypos,
    route,
    navigate,
    refresh,
    sync,
    updateSettings,
    toast,
    toasts
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useStore(): StoreValue {
  const v = useContext(Ctx)
  if (!v) throw new Error('useStore outside provider')
  return v
}
