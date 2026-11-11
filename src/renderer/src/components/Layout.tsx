import type { ReactNode } from 'react'
import { AlertTriangle, BookOpen, Calculator, CheckCircle2, FlaskConical, GraduationCap, History, LayoutGrid, ListChecks, RefreshCw, Settings as SettingsIcon, Sparkles, WifiOff, XCircle } from 'lucide-react'
import { useStore, type Route } from '../hooks/useStore'
import { cx, relative } from '../utils/format'
import { Button, Select } from './ui'

const NAV: Array<{ section: string; items: Array<{ page: Route['page']; label: string; icon: ReactNode }> }> = [
  {
    section: 'Overview',
    items: [
      { page: 'dashboard', label: 'Dashboard', icon: <LayoutGrid size={16} /> },
      { page: 'courses', label: 'Courses', icon: <BookOpen size={16} /> },
      { page: 'assignments', label: 'Assignments', icon: <ListChecks size={16} /> }
    ]
  },
  {
    section: 'Plan',
    items: [
      { page: 'hypotheticals', label: 'Hypotheticals', icon: <FlaskConical size={16} /> },
      { page: 'calculator', label: 'Grade Calculator', icon: <Calculator size={16} /> },
      { page: 'gpa', label: 'GPA', icon: <GraduationCap size={16} /> }
    ]
  },
  { section: 'Insights', items: [{ page: 'history', label: 'History', icon: <History size={16} /> }] }
]

export function Sidebar() {
  const { route, navigate, data, auth, syncing, sync, progress, isDemo, activeHypos, settings } = useStore()
  const active = route.page === 'course' ? 'courses' : route.page
  const sync_ = data?.sync
  const failed = sync_?.lastStatus === 'error'
  return (
    <aside className="drag flex w-[236px] shrink-0 flex-col border-r border-line bg-sidebar">
      <div className="titlebar-spacer h-[52px] shrink-0" />
      <div className="mb-3 flex items-center gap-2.5 px-5">
        <Logo />
        <div className="leading-tight">
          <div className="text-[14px] font-semibold tracking-tight">GradeKiwi</div>
          <div className="text-[11px] text-ink-3">{data?.student?.name ?? 'FCPS StudentVUE'}</div>
        </div>
      </div>
      <nav className="no-drag flex-1 overflow-y-auto px-3 pb-3">
        {NAV.map((g) => (
          <div key={g.section} className="mt-4 first:mt-1">
            <div className="mb-1 px-2.5 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-ink-3">{g.section}</div>
            {g.items.map((it) => (
              <button
                key={it.page}
                onClick={() => navigate({ page: it.page } as Route)}
                className={cx(
                  'group flex h-8 w-full items-center gap-2.5 rounded-lg px-2.5 text-[13px] transition-[color,background-color] duration-200 ease-out active:!scale-100',
                  active === it.page ? 'bg-accent-soft font-medium text-accent-text' : 'text-ink-2 hover:bg-surface-3/60 hover:text-ink'
                )}
              >
                <span className={cx(active === it.page ? 'text-accent-text' : 'text-ink-3 group-hover:text-ink-2')}>{it.icon}</span>
                {it.label}
                {it.page === 'hypotheticals' && activeHypos.length > 0 && settings.hypotheticalsEnabled && (
                  <span className="ml-auto rounded-full bg-accent px-1.5 text-[10px] font-semibold leading-4 text-white tnum">{activeHypos.length}</span>
                )}
              </button>
            ))}
          </div>
        ))}
      </nav>
      <div className="no-drag border-t border-line p-3">
        {isDemo && (
          <div className="mb-2 flex items-center gap-2 rounded-lg px-2.5 py-2 text-[11.5px] font-medium" style={{ background: 'var(--grade-c-soft)', color: 'var(--grade-c-text)' }}>
            <Sparkles size={13} /> Showing demo data
          </div>
        )}
        <div className="flex items-center gap-2 rounded-lg px-2.5 py-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-[11.5px] font-medium text-ink-2">
              {syncing ? (
                <RefreshCw size={12} className="spin text-accent-text" />
              ) : !auth?.connected ? (
                <WifiOff size={12} className="text-ink-3" />
              ) : failed ? (
                <XCircle size={12} style={{ color: 'var(--grade-f)' }} />
              ) : (
                <CheckCircle2 size={12} style={{ color: 'var(--grade-a)' }} />
              )}
              <span className="truncate">{syncing ? (progress?.stage ?? 'Syncing…') : auth?.connected ? (failed ? 'Last sync failed' : 'StudentVUE connected') : 'Not connected'}</span>
            </div>
            <div className="mt-0.5 truncate text-[11px] text-ink-3" title={sync_?.lastSuccess ?? undefined}>
              {syncing && progress?.detail ? progress.detail : `Updated ${relative(sync_?.lastSuccess)}`}
            </div>
          </div>
          {auth?.connected && (
            <button
              onClick={() => void sync()}
              disabled={syncing}
              aria-label="Refresh from StudentVUE"
              title="Refresh from StudentVUE"
              className="flex h-7 w-7 items-center justify-center rounded-md text-ink-3 transition-colors hover:bg-surface-3 hover:text-ink disabled:opacity-50"
            >
              <RefreshCw size={14} className={syncing ? 'spin' : ''} />
            </button>
          )}
        </div>
        <button
          onClick={() => navigate({ page: 'settings' })}
          className={cx(
            'mt-1 flex h-8 w-full items-center gap-2.5 rounded-lg px-2.5 text-[13px] transition-colors',
            active === 'settings' ? 'bg-accent-soft font-medium text-accent-text' : 'text-ink-2 hover:bg-surface-3/60 hover:text-ink'
          )}
        >
          <SettingsIcon size={16} className={active === 'settings' ? '' : 'text-ink-3'} /> Settings
        </button>
      </div>
    </aside>
  )
}

export function Logo({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id="gk-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6366f1" />
          <stop offset="1" stopColor="#4338ca" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="15" fill="url(#gk-g)" />
      <path d="M14 44 L25 31 L33 38 L49 20" fill="none" stroke="white" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="49" cy="20" r="4.5" fill="#a5f3c4" />
    </svg>
  )
}

/** Sticky page header that doubles as the window drag region. */
export function PageHeader({ title, subtitle, actions, period = false }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; period?: boolean }) {
  return (
    <header className="page-header drag sticky top-0 z-20 border-b border-line bg-bg/85 px-8 pb-3.5 pt-4 backdrop-blur-xl">
      <div className="flex min-h-[38px] items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="truncate font-display text-[22px] font-semibold tracking-tight">{title}</h1>
          {subtitle && <div className="mt-0.5 truncate text-[12.5px] text-ink-3">{subtitle}</div>}
        </div>
        <div className="no-drag flex shrink-0 items-center gap-2">
          {period && <PeriodSelect />}
          {actions}
        </div>
      </div>
    </header>
  )
}

export function PeriodSelect() {
  const { data, periodId, setPeriodId } = useStore()
  if (!data || data.periods.length === 0) return null
  return (
    <Select value={periodId ?? ''} onChange={(e) => setPeriodId(e.target.value ? Number(e.target.value) : null)} aria-label="Grading period" className="w-40">
      {data.periods.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
          {p.id === data.currentPeriodId ? ' (current)' : ''}
        </option>
      ))}
    </Select>
  )
}

export function Page({ children }: { children: ReactNode }) {
  // Page-to-page motion is handled by the View Transition on #main-scroll (see styles.css).
  return <div className="px-8 pb-12 pt-6">{children}</div>
}

export function SyncErrorBanner() {
  const { data, auth, sync, syncing } = useStore()
  if (!auth?.connected || data?.sync.lastStatus !== 'error') return null
  return (
    <div className="mb-5 flex items-center gap-3 rounded-xl px-4 py-3 text-[12.5px]" style={{ background: 'var(--grade-f-soft)', color: 'var(--grade-f-text)' }}>
      <AlertTriangle size={15} className="shrink-0" />
      <div className="flex-1">
        <span className="font-semibold">Couldn't refresh from StudentVUE.</span> {data.sync.lastMessage} Showing your last saved data.
      </div>
      <Button size="sm" onClick={() => void sync()} loading={syncing}>
        Try again
      </Button>
    </div>
  )
}
