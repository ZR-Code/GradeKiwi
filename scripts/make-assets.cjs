// Renders build/icon.png (1024², Apple icon grid) and the DMG background (1x + 2x) with Electron.
//   npm run make:icons
const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

const out = path.join(__dirname, '..', 'build')

const ICON = `<!doctype html><html><body style="margin:0;background:transparent">
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#6d6cf6"/><stop offset="1" stop-color="#3f32c8"/>
    </linearGradient>
    <linearGradient id="hl" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
    <filter id="sh" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="14" stdDeviation="16" flood-color="#14104a" flood-opacity=".35"/>
    </filter>
  </defs>
  <!-- 824px body on the 1024 canvas, per the macOS icon grid -->
  <g filter="url(#sh)">
    <rect x="100" y="100" width="824" height="824" rx="185" fill="url(#bg)"/>
    <rect x="100" y="100" width="824" height="824" rx="185" fill="url(#hl)"/>
  </g>
  <g stroke="#fff" stroke-opacity=".13" stroke-width="6">
    <line x1="230" y1="380" x2="794" y2="380"/><line x1="230" y1="520" x2="794" y2="520"/><line x1="230" y1="660" x2="794" y2="660"/>
  </g>
  <path d="M250 690 L425 495 L548 600 L760 352" fill="none" stroke="#fff" stroke-width="66" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="760" cy="352" r="62" fill="#a7f3c8"/>
  <circle cx="760" cy="352" r="62" fill="none" stroke="#fff" stroke-width="14"/>
</svg></body></html>`

const DMG = (scale) => `<!doctype html><html><body style="margin:0;width:${600 * scale}px;height:${400 * scale}px;overflow:hidden">
<div style="width:600px;height:400px;transform:scale(${scale});transform-origin:0 0;position:relative;
  background:linear-gradient(180deg,#fbfbfa 0%,#f1f1ee 100%);font-family:-apple-system,BlinkMacSystemFont,sans-serif">
  <div style="position:absolute;top:44px;width:100%;text-align:center;font-size:20px;font-weight:600;color:#18181b;letter-spacing:-.2px">Install GradeKiwi</div>
  <div style="position:absolute;top:74px;width:100%;text-align:center;font-size:12.5px;color:#7a7a84">Drag the app into your Applications folder</div>
  <svg style="position:absolute;left:250px;top:186px" width="100" height="40" viewBox="0 0 100 40">
    <path d="M8 20 H84 M70 8 L86 20 L70 32" fill="none" stroke="#a1a1aa" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="0"/>
  </svg>
  <div style="position:absolute;bottom:22px;width:100%;text-align:center;font-size:10.5px;color:#a1a1aa">Not affiliated with FCPS or Edupoint</div>
</div></body></html>`

async function render(html, width, height, file) {
  const win = new BrowserWindow({ width, height, show: false, frame: false, transparent: true, webPreferences: { offscreen: true } })
  const tmp = path.join(require('node:os').tmpdir(), `gk-asset-${process.pid}-${file}.html`)
  fs.writeFileSync(tmp, html)
  await win.loadFile(tmp)
  fs.rmSync(tmp, { force: true })
  await new Promise((r) => setTimeout(r, 400))
  const img = await win.webContents.capturePage({ x: 0, y: 0, width, height })
  fs.writeFileSync(path.join(out, file), img.resize({ width, height }).toPNG())
  win.destroy()
  console.log('wrote', file, width, height)
}

// Keep running between renders (Electron quits by default when the last window closes).
app.on('window-all-closed', () => {})

app.whenReady().then(async () => {
  fs.mkdirSync(out, { recursive: true })
  await render(ICON, 1024, 1024, 'icon.png')
  await render(DMG(1), 600, 400, 'dmg-background.png')
  await render(DMG(2), 1200, 800, 'dmg-background@2x.png')
  app.quit()
})
