// Copies the finished Windows executables from dist-win/ into GradeKiwi-Windows/ with a short README.
const fs = require('node:fs')
const path = require('node:path')
const root = path.join(__dirname, '..')
const from = path.join(root, 'dist-win')
const to = path.join(root, 'GradeKiwi-Windows')
const { version } = require(path.join(root, 'package.json'))

fs.rmSync(to, { recursive: true, force: true })
fs.mkdirSync(to, { recursive: true })
const exes = fs.readdirSync(from).filter((f) => f.endsWith('.exe') && !f.includes('__uninstaller'))
if (!exes.length) throw new Error('No .exe files found in dist-win/ — did the Windows build succeed?')
for (const f of exes) fs.copyFileSync(path.join(from, f), path.join(to, f))

fs.writeFileSync(
  path.join(to, 'README.txt'),
  `GradeKiwi ${version} for Windows
==========================

Same app as the macOS version (same code, features and data format).

GradeKiwi-Setup-${version}.exe
  Installer for Windows 10/11 (x64 and ARM64). Installs per-user, adds Start menu and
  desktop shortcuts, and can be removed from Settings > Apps.

GradeKiwi-${version}-Portable.exe
  Runs without installing (x64). Handy for trying it out.

First launch: the app is not code-signed, so Windows SmartScreen may show
"Windows protected your PC". Click "More info" > "Run anyway".

Your data is stored in %APPDATA%\\GradeKiwi (gradekiwi.db). Saved StudentVUE credentials are
encrypted with Windows Data Protection (DPAPI) for your Windows account.

To move your data from a Mac: Settings > Data > Export JSON on the Mac, then Import on Windows.
`.replace(/\n/g, '\r\n')
)
for (const f of fs.readdirSync(to)) console.log('collected', f, (fs.statSync(path.join(to, f)).size / 1048576).toFixed(1) + ' MB')
