// Visual QA harness: runs the built app with a throwaway profile, loads demo data,
// and captures every page in light and dark mode.
//   SHOT_DIR=/path npx electron scripts/shoot.cjs
const { app, BrowserWindow, nativeTheme } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')

const out = process.env.SHOT_DIR || path.join(os.tmpdir(), 'gk-shots')
fs.mkdirSync(out, { recursive: true })
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'gk-profile-')))

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

app.on('browser-window-created', (_e, win) => {
  win.webContents.on('console-message', (e) => {
    if (e.level === 'error' || e.level === 3) console.log('[renderer error]', e.message)
  })
  win.webContents.once('did-finish-load', async () => {
    const js = (s) => win.webContents.executeJavaScript(s)
    const shot = async (name) => {
      await wait(900)
      const img = await win.webContents.capturePage()
      fs.writeFileSync(path.join(out, `${name}.png`), img.toPNG())
      console.log('shot', name)
    }
    const click = (text, sel = 'button') =>
      js(`(() => { const b = [...document.querySelectorAll(${JSON.stringify(sel)})].find(x => x.textContent.trim().startsWith(${JSON.stringify(text)})); if (b) { b.click(); return true } return false })()`)
    try {
      await wait(1200)
      await shot('01-onboarding')
      await click('Try demo data')
      await wait(1500)
      await shot('02-dashboard')
      await js(`document.getElementById('main-scroll').scrollTo(0, 99999)`)
      await shot('03-dashboard-bottom')
      await click('Courses')
      await shot('04-courses')
      await js(`document.querySelector('[role=button]')?.click()`)
      await shot('05-course-detail')
      await js(`document.getElementById('main-scroll').scrollTo(0, 700)`)
      await shot('06-course-table')
      await js(`document.querySelector('tbody tr')?.click()`)
      await shot('07-assignment-drawer')
      await js(`document.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape'})); window.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape'}))`)
      await click('Assignments')
      await shot('08-assignments')
      // Build a scenario through the public bridge, exactly as the UI does.
      await js(`(async () => {
        const d = await window.gk.getData();
        const c = d.courses[0];
        const sid = await window.gk.createScenario('Ace the Unit 5 test');
        await window.gk.upsertHypothetical({ scenarioId: sid, courseId: c.id, periodId: d.currentPeriodId, kind: 'add', targetAssignmentId: null, name: 'Unit 5 Test', category: 'Tests', earned: 85, possible: 100, dueDate: null });
        const hw = d.assignments.find(a => a.courseId === c.id && a.status === 'graded' && a.category === 'Homework');
        if (hw) await window.gk.upsertHypothetical({ scenarioId: sid, courseId: c.id, periodId: hw.periodId, kind: 'override', targetAssignmentId: hw.id, name: hw.name, category: hw.category, earned: 0, possible: hw.possible, dueDate: null });
        await window.gk.createScenario('Miss next homework');
      })()`)
      await click('Dashboard')
      await wait(300)
      await click('Hypotheticals')
      await shot('09-hypotheticals')
      await click('Grade Calculator')
      await shot('10-calculator')
      await click('GPA')
      await shot('11-gpa')
      await click('History')
      await shot('12-history')
      await click('Settings')
      await shot('13-settings')
      nativeTheme.themeSource = 'dark'
      await click('Dashboard')
      await shot('14-dashboard-dark')
      await click('Hypotheticals')
      await shot('15-hypotheticals-dark')
      await click('Courses')
      await js(`document.querySelector('[role=button]')?.click()`)
      await shot('16-course-dark')
    } catch (e) {
      console.error('harness error', e)
    }
    app.quit()
  })
})

require(path.join(__dirname, '../out/main/index.js'))
