import { useState } from 'react'
import { ArrowLeft, ExternalLink, FileUp, KeyRound, Lock, ShieldCheck, Sparkles } from 'lucide-react'
import { Logo } from '../components/Layout'
import { Button, Field, Input, Notice, Toggle } from '../components/ui'
import { useStore } from '../hooks/useStore'
import { api, errorMessage } from '../services/api'
import { secureStore, thisDevice } from '../utils/platform'

export default function Connect() {
  const { provider, refresh, navigate, hasData, toast, auth } = useStore()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(true)
  const [busy, setBusy] = useState<null | 'connect' | 'import' | 'demo'>(null)
  const [error, setError] = useState<string | null>(null)

  const done = async () => {
    await refresh()
    navigate({ page: 'dashboard' })
  }

  const connect = async () => {
    setBusy('connect')
    setError(null)
    try {
      const r = await api.connect({ username: username.trim(), password, remember })
      if (r.ok) {
        setPassword('')
        toast(r.message, 'ok')
        await done()
      } else setError(r.message)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="window-top-bar drag h-[52px] shrink-0" />
      <div className="mx-auto grid w-full max-w-[980px] flex-1 grid-cols-1 items-center gap-12 px-10 pb-16 md:grid-cols-[1fr_420px]">
        <div className="animate-page">
          {(hasData || auth?.connected) && (
            <button onClick={() => navigate({ page: 'dashboard' })} className="no-drag mb-8 flex items-center gap-1.5 text-[12.5px] text-ink-3 hover:text-ink">
              <ArrowLeft size={14} /> Back to GradeKiwi
            </button>
          )}
          <Logo size={52} />
          <h1 className="mt-6 font-display text-[34px] font-semibold leading-[1.1] tracking-tight">
            Your grades,
            <br />
            <span className="text-ink-3">without the guesswork.</span>
          </h1>
          <p className="mt-4 max-w-md text-[14px] leading-relaxed text-ink-2">
            GradeKiwi pulls your gradebook from FCPS StudentVUE, keeps a history of every change, and lets you test “what if” scores before they happen.
          </p>
          <ul className="mt-7 space-y-3 text-[13px] text-ink-2">
            <li className="flex items-start gap-2.5">
              <Lock size={15} className="mt-0.5 shrink-0 text-accent-text" />
              <span>Your password is encrypted with {secureStore}. Nothing is sent anywhere except FCPS.</span>
            </li>
            <li className="flex items-start gap-2.5">
              <ShieldCheck size={15} className="mt-0.5 shrink-0 text-accent-text" />
              <span>All data stays on {thisDevice}, and it works offline with your last sync.</span>
            </li>
          </ul>
        </div>

        <div className="animate-pop rounded-2xl border border-line bg-surface p-6 shadow-pop">
          <div className="flex items-center gap-2 text-[15px] font-semibold">
            <KeyRound size={16} className="text-accent-text" /> Connect FCPS StudentVUE
          </div>
          <p className="mt-1 text-[12.5px] text-ink-3">Use your FCPS network user name (student ID) and password.</p>
          <form
            className="mt-5 flex flex-col gap-3.5"
            onSubmit={(e) => {
              e.preventDefault()
              if (username.trim() && password) void connect()
            }}
          >
            <Field label="User name">
              <Input autoFocus value={username} onChange={(e) => setUsername(e.target.value)} placeholder="1234567" autoComplete="username" spellCheck={false} />
            </Field>
            <Field label="Password">
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
            </Field>
            <div className="flex items-center justify-between gap-3 py-1">
              <div>
                <div className="text-[12.5px] font-medium text-ink">Stay signed in</div>
                <div className="text-[11.5px] text-ink-3">Save with {secureStore} for automatic sync</div>
              </div>
              <Toggle checked={remember} onChange={setRemember} label="Stay signed in" />
            </div>
            {error && <Notice tone="error">{error}</Notice>}
            <Button type="submit" variant="primary" className="mt-1 h-9" loading={busy === 'connect'} disabled={!username.trim() || !password || busy != null}>
              {busy === 'connect' ? 'Connecting…' : 'Connect and sync'}
            </Button>
          </form>

          <Notice tone="warn">
            <span className="font-medium">About FCPS sign-in:</span> FCPS says password sign-in is temporary and will be removed by December 2026. Once it's gone, use file import below.{' '}
            <button type="button" className="underline underline-offset-2" onClick={() => void api.openExternal('https://www.fcps.edu/resources/technology/student-information-system-sis/sis-studentvue/sis-studentvue-mobile-app')}>
              FCPS notice
            </button>
          </Notice>

          <div className="my-5 flex items-center gap-3 text-[11px] uppercase tracking-wider text-ink-3">
            <div className="h-px flex-1 bg-line" /> or <div className="h-px flex-1 bg-line" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button
              icon={<FileUp size={14} />}
              loading={busy === 'import'}
              disabled={busy != null}
              onClick={async () => {
                setBusy('import')
                try {
                  const r = await api.importFile()
                  if (r.ok) {
                    toast(r.message, 'ok')
                    await done()
                  } else if (r.message !== 'Import cancelled.') setError(r.message)
                } finally {
                  setBusy(null)
                }
              }}
            >
              Import file
            </Button>
            <Button
              icon={<Sparkles size={14} />}
              loading={busy === 'demo'}
              disabled={busy != null}
              onClick={async () => {
                setBusy('demo')
                try {
                  await api.loadDemo()
                  toast('Loaded demo data. It is fictional and will be replaced when you connect.', 'info')
                  await done()
                } finally {
                  setBusy(null)
                }
              }}
            >
              Try demo data
            </Button>
          </div>
          <p className="mt-3 text-[11.5px] leading-relaxed text-ink-3">
            Import accepts GradeKiwi JSON exports, CSV (
            <button type="button" className="underline underline-offset-2" onClick={() => void api.saveCsvTemplate().then((r) => r.ok && toast(r.message, 'ok'))}>
              get template
            </button>
            ), or Synergy gradebook XML.
          </p>
          {provider && (
            <details className="mt-4 text-[11.5px] text-ink-3">
              <summary className="cursor-pointer select-none font-medium text-ink-2">How the FCPS connection works</summary>
              <ul className="mt-2 list-disc space-y-1.5 pl-4 leading-relaxed">
                {provider.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
              <button type="button" className="mt-2 flex items-center gap-1 underline underline-offset-2" onClick={() => void api.openExternal('https://sisstudent.fcps.edu/SVUE/')}>
                Open the official FCPS StudentVUE portal <ExternalLink size={11} />
              </button>
            </details>
          )}
        </div>
      </div>
    </div>
  )
}
