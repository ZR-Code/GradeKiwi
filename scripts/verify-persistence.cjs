// Persistence check: run 1 loads demo data + a scenario + a setting; run 2 (fresh process, same
// profile) verifies everything survived the restart.  GK_PROFILE=/dir npx electron scripts/verify-persistence.cjs <1|2>
const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const phase = process.argv.at(-1)
app.setPath('userData', process.env.GK_PROFILE)
app.on('browser-window-created', (_e, win) => {
  win.webContents.once('did-finish-load', async () => {
    const js = (s) => win.webContents.executeJavaScript(s)
    await new Promise((r) => setTimeout(r, 800))
    if (phase === '1') {
      await js(`(async () => { await window.gk.loadDemo(); const d = await window.gk.getData();
        const sid = await window.gk.createScenario('Persist me');
        await window.gk.upsertHypothetical({ scenarioId: sid, courseId: d.courses[0].id, periodId: d.currentPeriodId, kind: 'add', targetAssignmentId: null, name: 'Final', category: 'Tests', earned: 90, possible: 100, dueDate: null });
        await window.gk.setSettings({ theme: 'dark', missingCountsAsZero: true }); })()`)
      console.log('PHASE1 wrote data')
    } else {
      const r = await js(`(async () => { const d = await window.gk.getData(); const s = await window.gk.scenarios(); const st = await window.gk.getSettings(); const sn = await window.gk.snapshots();
        return { courses: d.courses.length, assignments: d.assignments.length, scenarios: s.map(x => x.name + ':' + x.items.length), theme: st.theme, missingZero: st.missingCountsAsZero, snapshots: sn.length, source: d.sync.source } })()`)
      console.log('PHASE2 read', JSON.stringify(r))
    }
    app.quit()
  })
})
require(path.join(__dirname, '../out/main/index.js'))
