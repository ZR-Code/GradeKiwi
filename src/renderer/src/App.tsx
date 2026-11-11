import { CheckCircle2, Info, XCircle } from 'lucide-react'
import { Sidebar } from './components/Layout'
import { useStore } from './hooks/useStore'
import { cx } from './utils/format'
import Assignments from './pages/Assignments'
import CalculatorPage from './pages/Calculator'
import Connect from './pages/Connect'
import CourseDetail from './pages/CourseDetail'
import Courses from './pages/Courses'
import Dashboard from './pages/Dashboard'
import GPA from './pages/GPA'
import HistoryPage from './pages/History'
import Hypotheticals from './pages/Hypotheticals'
import SettingsPage from './pages/Settings'

export default function App() {
  const { ready, hasData, auth, route } = useStore()
  if (!ready) return <div className="h-full bg-bg" />

  // First run (no data, not connected): full-window onboarding.
  if ((!hasData && !auth?.connected) || route.page === 'connect') {
    return (
      <div className="h-full bg-bg">
        <Connect />
        <Toasts />
      </div>
    )
  }

  return (
    <div className="flex h-full">
      <Sidebar />
      <main id="main-scroll" className="relative min-w-0 flex-1 overflow-y-auto bg-bg">
        <div key={route.page === 'course' ? `course-${route.id}` : route.page}>
          {route.page === 'dashboard' && <Dashboard />}
          {route.page === 'courses' && <Courses />}
          {route.page === 'course' && <CourseDetail id={route.id} />}
          {route.page === 'assignments' && <Assignments />}
          {route.page === 'hypotheticals' && <Hypotheticals />}
          {route.page === 'calculator' && <CalculatorPage />}
          {route.page === 'gpa' && <GPA />}
          {route.page === 'history' && <HistoryPage />}
          {route.page === 'settings' && <SettingsPage />}
        </div>
      </main>
      <Toasts />
    </div>
  )
}

function Toasts() {
  const { toasts } = useStore()
  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-[60] flex w-[340px] flex-col gap-2" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={cx('flex items-start gap-2.5 rounded-xl border border-line bg-surface px-3.5 py-3 text-[12.5px] leading-snug shadow-pop', t.leaving ? 'animate-pop-out' : 'animate-pop')}>
          <span className="mt-px shrink-0">
            {t.kind === 'ok' ? <CheckCircle2 size={15} style={{ color: 'var(--grade-a)' }} /> : t.kind === 'error' ? <XCircle size={15} style={{ color: 'var(--grade-f)' }} /> : <Info size={15} className="text-accent-text" />}
          </span>
          <span className="text-ink">{t.message}</span>
        </div>
      ))}
    </div>
  )
}
