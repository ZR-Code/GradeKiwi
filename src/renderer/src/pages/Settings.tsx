import { useEffect, useState, type ReactNode } from 'react'
import { Database, Download, FileUp, KeyRound, LogOut, Monitor, Moon, Palette, Plus, RefreshCw, ShieldCheck, SlidersHorizontal, Sparkles, Sun, Trash2 } from 'lucide-react'
import type { AppInfo, Course, ScaleStep } from '@shared/types'
import { engineConfigFor } from '@shared/grading/model'
import { LEVEL_LABELS, SCALE_PRESETS, sortedScale } from '@shared/grading/scale'
import { CourseSettingsModal } from '../components/CourseSettingsModal'
import { Page, PageHeader } from '../components/Layout'
import { Button, Card, Input, Modal, Notice, NumberInput, Pill, Segmented, Select, Toggle } from '../components/ui'
import { useStore } from '../hooks/useStore'
import { api, errorMessage } from '../services/api'
import { dateTime, relative } from '../utils/format'
import { isMac, secureStore, secureStoreShort, thisDevice } from '../utils/platform'

function Section({ icon, title, description, children }: { icon: ReactNode; title: string; description?: string; children: ReactNode }) {
  return (
    <section className="grid grid-cols-1 gap-4 border-b border-line py-7 first:pt-0 last:border-0 lg:grid-cols-[240px_1fr]">
      <div>
        <h2 className="flex items-center gap-2 text-[13.5px] font-semibold">
          <span className="text-ink-3">{icon}</span>
          {title}
        </h2>
        {description && <p className="mt-1 text-[12px] leading-relaxed text-ink-3">{description}</p>}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  )
}

function Row({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 border-b border-line px-4 py-3 last:border-0">
      <div className="min-w-0">
        <div className="text-[13px] text-ink">{label}</div>
        {hint && <div className="mt-0.5 text-[11.5px] leading-snug text-ink-3">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

export default function SettingsPage() {
  const { auth, provider, data, settings, updateSettings, refresh, navigate, toast, sync, syncing, isDemo } = useStore()
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [editing, setEditing] = useState<Course | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  useEffect(() => void api.appInfo().then(setInfo), [])

  const run = async (fn: () => Promise<{ ok: boolean; message: string }>) => {
    try {
      const r = await fn()
      if (!/cancelled/i.test(r.message)) toast(r.message, r.ok ? 'ok' : 'error')
      await refresh()
    } catch (e) {
      toast(errorMessage(e), 'error')
    }
  }

  const setScale = (scale: ScaleStep[], name = 'Custom') => void updateSettings({ scale, scaleName: name })

  return (
    <>
      <PageHeader title="Settings" />
      <Page>
        <div className="max-w-[960px]">
          <Section icon={<KeyRound size={15} />} title="StudentVUE account" description={`Credentials are encrypted with ${secureStore} and sent only to FCPS over HTTPS.`}>
            <Card padded={false}>
              <Row
                label={auth?.connected ? <span className="flex items-center gap-2">Connected as <span className="font-semibold">{auth.username}</span></span> : 'Not connected'}
                hint={auth?.connected ? `${provider?.name} · ${auth.remembered ? `saved with ${secureStoreShort}` : 'this session only'}` : 'Connect to sync grades automatically.'}
              >
                {auth?.connected ? (
                  <Button
                    variant="danger"
                    icon={<LogOut size={14} />}
                    onClick={async () => {
                      await api.disconnect()
                      await refresh()
                      toast(`Disconnected. Saved credentials were erased. Your synced data is still on ${thisDevice}.`, 'ok')
                    }}
                  >
                    Disconnect
                  </Button>
                ) : (
                  <Button variant="primary" onClick={() => navigate({ page: 'connect' })}>
                    Connect
                  </Button>
                )}
              </Row>
              <Row label={isMac ? 'Keychain encryption' : 'Credential encryption'} hint={`Provided by ${isMac ? 'macOS' : 'Windows'} through Electron safeStorage.`}>
                {auth?.keychainAvailable ? <Pill tone="a">Available</Pill> : <Pill tone="f">Unavailable</Pill>}
              </Row>
            </Card>
            {provider && (
              <details className="mt-3 text-[12px] text-ink-3">
                <summary className="cursor-pointer select-none font-medium text-ink-2">FCPS integration details</summary>
                <ul className="mt-2 list-disc space-y-1.5 pl-4 leading-relaxed">
                  {provider.notes.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              </details>
            )}
          </Section>

          <Section icon={<RefreshCw size={15} />} title="Synchronization" description="GradeKiwi works offline with your last sync. Requests are spaced out and never run in parallel.">
            <Card padded={false}>
              <Row label="Sync when GradeKiwi opens">
                <Toggle checked={settings.autoSyncOnLaunch} onChange={(v) => void updateSettings({ autoSyncOnLaunch: v })} label="Sync when GradeKiwi opens" />
              </Row>
              <Row label="Sync in the background" hint="While the app is open.">
                <Select value={settings.syncIntervalMinutes} onChange={(e) => void updateSettings({ syncIntervalMinutes: Number(e.target.value) })} className="w-36">
                  <option value={0}>Off</option>
                  <option value={60}>Every hour</option>
                  <option value={180}>Every 3 hours</option>
                  <option value={360}>Every 6 hours</option>
                  <option value={720}>Every 12 hours</option>
                  <option value={1440}>Daily</option>
                </Select>
              </Row>
              <Row
                label="Last successful sync"
                hint={data?.sync.lastStatus === 'error' ? <span style={{ color: 'var(--grade-f-text)' }}>Last attempt failed: {data.sync.lastMessage}</span> : data?.sync.lastMessage}
              >
                <div className="flex items-center gap-3">
                  <span className="text-[12.5px] text-ink-2" title={dateTime(data?.sync.lastSuccess)}>
                    {relative(data?.sync.lastSuccess)}
                  </span>
                  {auth?.connected && (
                    <Button size="sm" icon={<RefreshCw size={12} className={syncing ? 'spin' : ''} />} onClick={() => void sync()} disabled={syncing}>
                      Sync now
                    </Button>
                  )}
                </div>
              </Row>
            </Card>
          </Section>

          <Section icon={<Palette size={15} />} title="Appearance">
            <Card padded={false}>
              <Row label="Theme">
                <Segmented
                  value={settings.theme}
                  onChange={(theme) => void updateSettings({ theme })}
                  options={[
                    { value: 'system', label: <span className="flex items-center gap-1.5"><Monitor size={13} />System</span> },
                    { value: 'light', label: <span className="flex items-center gap-1.5"><Sun size={13} />Light</span> },
                    { value: 'dark', label: <span className="flex items-center gap-1.5"><Moon size={13} />Dark</span> }
                  ]}
                />
              </Row>
            </Card>
          </Section>

          <Section icon={<SlidersHorizontal size={15} />} title="Grading scale & GPA" description="GradeKiwi doesn't assume a policy. The FCPS preset matches FCPS's published scale (verified Nov 2026). Confirm with your school.">
            <Card padded={false}>
              <Row label="Preset">
                <Select
                  value={SCALE_PRESETS.find((p) => p.name === settings.scaleName)?.id ?? ''}
                  onChange={(e) => {
                    const p = SCALE_PRESETS.find((x) => x.id === e.target.value)
                    if (p) setScale(p.steps, p.name)
                  }}
                  className="w-48"
                >
                  {!SCALE_PRESETS.some((p) => p.name === settings.scaleName) && <option value="">Custom</option>}
                  {SCALE_PRESETS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </Row>
              <div className="border-b border-line px-4 py-3">
                <div className="mb-2 grid grid-cols-[1fr_1fr_1fr_28px] gap-2 text-[11px] font-medium text-ink-3">
                  <span>Letter</span>
                  <span>Minimum %</span>
                  <span>GPA points</span>
                  <span />
                </div>
                <div className="space-y-1.5">
                  {sortedScale(settings.scale).map((s, i) => (
                    <div key={`${s.letter}-${i}`} className="grid grid-cols-[1fr_1fr_1fr_28px] items-center gap-2">
                      <Input
                        defaultValue={s.letter}
                        maxLength={4}
                        onBlur={(e) => {
                          const v = e.target.value.trim()
                          if (v && v !== s.letter) setScale(settings.scale.map((x) => (x === s ? { ...x, letter: v } : x)))
                        }}
                      />
                      <NumberInput value={s.min} min={0} onChange={(v) => v != null && setScale(settings.scale.map((x) => (x === s ? { ...x, min: v } : x)))} />
                      <NumberInput value={s.points} min={0} onChange={(v) => v != null && setScale(settings.scale.map((x) => (x === s ? { ...x, points: v } : x)))} />
                      <button aria-label={`Remove ${s.letter}`} className="text-ink-3 hover:text-ink disabled:opacity-30" disabled={settings.scale.length <= 1} onClick={() => setScale(settings.scale.filter((x) => x !== s))}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
                <Button size="sm" variant="ghost" className="mt-2" icon={<Plus size={12} />} onClick={() => setScale([...settings.scale, { letter: 'X', min: 0, points: 0 }])}>
                  Add step
                </Button>
              </div>
              <div className="border-b border-line px-4 py-3">
                <div className="mb-2 text-[13px]">Weighted GPA bonus by course level</div>
                <div className="grid grid-cols-3 gap-3 md:grid-cols-6">
                  {(Object.keys(settings.levelBonus) as Array<keyof typeof settings.levelBonus>).map((l) => (
                    <label key={l} className="flex flex-col gap-1 text-[11px] text-ink-3">
                      {LEVEL_LABELS[l]}
                      <NumberInput value={settings.levelBonus[l]} min={0} max={5} onChange={(v) => v != null && void updateSettings({ levelBonus: { ...settings.levelBonus, [l]: v } })} />
                    </label>
                  ))}
                </div>
              </div>
              <Row label="No bonus for failing grades" hint="Weighting is not added to an F (0 points). FCPS's published policy doesn't address this; change it if your school differs.">
                <Toggle checked={settings.bonusOnlyIfPassing} onChange={(v) => void updateSettings({ bonusOnlyIfPassing: v })} label="No bonus for failing grades" />
              </Row>
              <Row label="Count missing assignments as zero" hint="Only affects missing work with no score recorded. StudentVUE usually records a score itself.">
                <Toggle checked={settings.missingCountsAsZero} onChange={(v) => void updateSettings({ missingCountsAsZero: v })} label="Count missing as zero" />
              </Row>
              <Row label="GPA decimal places">
                <Select value={settings.gpaRoundTo} onChange={(e) => void updateSettings({ gpaRoundTo: Number(e.target.value) })} className="w-20">
                  {[1, 2, 3, 4].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </Select>
              </Row>
            </Card>
          </Section>

          <Section icon={<SlidersHorizontal size={15} />} title="Course category weights" description="Weights come from StudentVUE when your teacher publishes them. Override them here if your syllabus differs.">
            <Card padded={false}>
              {data?.courses.length ? (
                data.courses.map((c) => {
                  const cfg = engineConfigFor(data, c, data.currentPeriodId)
                  return (
                    <Row
                      key={c.id}
                      label={c.name}
                      hint={`${cfg.mode === 'weighted' ? Object.entries(cfg.weights).map(([k, v]) => `${k} ${v}%`).join(' · ') || 'Weighted' : 'Total points'} · ${cfg.origin === 'user' ? 'custom' : cfg.origin === 'studentvue' ? 'from StudentVUE' : 'default'}`}
                    >
                      <Button size="sm" onClick={() => setEditing(c)}>
                        Edit
                      </Button>
                    </Row>
                  )
                })
              ) : (
                <div className="px-4 py-3 text-[12.5px] text-ink-3">No courses yet.</div>
              )}
            </Card>
          </Section>

          <Section icon={<Database size={15} />} title="Data" description={`Everything is stored locally in a SQLite database on ${thisDevice}.`}>
            <Card padded={false}>
              <Row label="Import gradebook file" hint="GradeKiwi JSON export, CSV, or Synergy gradebook XML. Use this if direct sync isn't available.">
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() => void run(api.saveCsvTemplate)}>
                    CSV template
                  </Button>
                  <Button size="sm" icon={<FileUp size={12} />} onClick={() => void run(api.importFile)}>
                    Import…
                  </Button>
                </div>
              </Row>
              <Row label="Export data" hint="JSON includes history, scenarios and settings and can be imported again. CSV lists every assignment.">
                <div className="flex gap-2">
                  <Button size="sm" icon={<Download size={12} />} onClick={() => void run(() => api.exportData('csv'))}>
                    CSV
                  </Button>
                  <Button size="sm" icon={<Download size={12} />} onClick={() => void run(() => api.exportData('json'))}>
                    JSON
                  </Button>
                </div>
              </Row>
              <Row label="Demo data" hint={isDemo ? 'Demo data is loaded. Connecting or importing replaces it.' : 'Fictional grades for trying the app. Replaces current data.'}>
                <Button
                  size="sm"
                  icon={<Sparkles size={12} />}
                  onClick={async () => {
                    if (data?.courses.length && !isDemo && !window.confirm(`Loading demo data replaces your current grades, history and scenarios on ${thisDevice}. Continue?`)) return
                    await run(async () => {
                      const r = await api.loadDemo()
                      return { ok: r.ok, message: 'Loaded demo data' }
                    })
                  }}
                >
                  {isDemo ? 'Reload demo' : 'Load demo'}
                </Button>
              </Row>
              <Row label={<span style={{ color: 'var(--grade-f-text)' }}>Delete all StudentVUE data</span>} hint={`Removes grades, assignments, history snapshots and scenarios from ${thisDevice}. Settings stay.`}>
                <Button size="sm" variant="danger" icon={<Trash2 size={12} />} onClick={() => setConfirmDelete(true)}>
                  Delete…
                </Button>
              </Row>
            </Card>
          </Section>

          <Section icon={<ShieldCheck size={15} />} title="About">
            <Card padded={false}>
              <Row label="Version">
                <span className="text-[12.5px] text-ink-2 tnum">
                  {info?.name} {info?.version} · Electron {info?.electron} · {info?.arch}
                </span>
              </Row>
              <Row label="Data location">
                <span className="block max-w-[420px] truncate text-[12px] text-ink-2" title={info?.dataPath}>
                  {info?.dataPath}
                </span>
              </Row>
              <Row label="Privacy" hint="No analytics, no external servers. GradeKiwi only talks to sisstudent.fcps.edu.">
                <Pill tone="a">Local only</Pill>
              </Row>
            </Card>
            <p className="mt-3 text-[11.5px] leading-relaxed text-ink-3">GradeKiwi is an independent project. It isn't affiliated with or endorsed by Fairfax County Public Schools or Edupoint.</p>
          </Section>
        </div>
      </Page>

      {editing && <CourseSettingsModal course={editing} open onClose={() => setEditing(null)} />}
      <Modal
        open={confirmDelete}
        onClose={() => {
          setConfirmDelete(false)
          setConfirmText('')
        }}
        title="Delete all data?"
        footer={
          <>
            <Button onClick={() => setConfirmDelete(false)}>Cancel</Button>
            <Button
              variant="danger"
              disabled={confirmText.toLowerCase() !== 'delete'}
              onClick={async () => {
                await api.deleteAll()
                setConfirmDelete(false)
                setConfirmText('')
                await refresh()
                toast(`All StudentVUE data was deleted from ${thisDevice}.`, 'ok')
              }}
            >
              Delete everything
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-[12.5px] text-ink-2">
          <p>This permanently removes all grades, assignments, history snapshots and hypothetical scenarios from {thisDevice}. It can't be undone. Export first if you want a copy.</p>
          {auth?.connected && <Notice>Your account stays connected. Disconnect separately to erase saved credentials.</Notice>}
          <label className="block">
            Type <span className="font-semibold text-ink">delete</span> to confirm
            <Input autoFocus value={confirmText} onChange={(e) => setConfirmText(e.target.value)} className="mt-1.5 w-full" />
          </label>
        </div>
      </Modal>
    </>
  )
}
