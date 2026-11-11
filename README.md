# GradeKiwi

A private, local-first macOS grade tracker for **Fairfax County Public Schools (FCPS) StudentVUE**: gradebook sync, grade history, a hypothetical-grade simulator, a grade calculator and a GPA calculator. Inspired by GradeWave. Not affiliated with FCPS or Edupoint.

Electron 45 · React 19 · TypeScript (strict) · Vite (electron-vite) · Tailwind CSS 4 · Recharts · Lucide · SQLite (Node's built-in `node:sqlite`) · Electron Builder.

## Quick start

```bash
npm install
npm run dev          # run with hot reload
npm test             # grade engine, parsers, SQLite layer (44 tests)
npm run build        # typecheck + production bundle → out/
npm run package      # universal .app → dist/mac-universal/
npm run make:dmg     # universal DMG → dist/GradeKiwi-1.0.0-universal.dmg
npm run make:win     # Windows installer + portable .exe → GradeKiwi-Windows/
npm run make:icons   # regenerate build/icon.png and the DMG background
```

No backend, no analytics. The app talks only to `sisstudent.fcps.edu`.

## FCPS StudentVUE integration: findings (verified 2026-11-09)

| Question | Finding |
|---|---|
| Is the standard Synergy SOAP API available for FCPS? | **Yes.** `https://sisstudent.fcps.edu/SVUE/Service/PXPCommunication.asmx` is live, publishes a WSDL (`ProcessWebServiceRequest`, `AuthenticateUser`, …), and is reachable by non-browser clients (no Cloudflare challenge on the endpoint). |
| What does it return? | Standard Synergy responses. A deliberately invalid login returns `<RT_ERROR ERROR_MESSAGE="Invalid user id or password (ID: 11000)" />`. This exact response is a test fixture, and an opt-in live test re-checks it. |
| How does the FCPS *web* portal authenticate? | **SSO only.** `sisstudent.fcps.edu/svue` shows no password form, only "Login FCPS SSO" (SAML via `sis.fcps.edu/SIS/samlssoportal.aspx` → ForgeRock at `aic.fcps.edu`). |
| Does password login work at all? | FCPS's StudentVUE app page says the app offers **User Name and Password** sign-in (FCPS network credentials) as well as SSO, and that *"the username/password option is temporarily available and will be removed by December 2026 (date TBD)."* That app option uses this same SOAP service. |
| Why do generic integrations "not recognize FCPS"? | Most look districts up by ZIP code and assume a URL. GradeKiwi hard-codes FCPS's verified base URL (`https://sisstudent.fcps.edu/SVUE`). |
| Gradebook data available | Courses, teacher, room, period, grading periods (`ReportingPeriods`), per-period marks (`CalculatedScoreString`/`Raw`), category weights and totals (`GradeCalculationSummary`), assignments (name, category, assigned/due dates, score, points, notes, description), and attendance (`Attendance`). Submission dates are not exposed by this API. |

**What was not verified:** a successful sign-in with real FCPS credentials. I had none, and I did not attempt to bypass anything. The success path follows the documented Synergy response format (community docs at github.com/StudentVue/docs and the StudentVue.js / python `studentvue` libraries) and is covered by fixture-based tests. To verify against your own account:

```bash
read -s FCPS_PASS && export FCPS_PASS   # avoids putting the password in shell history
LIVE_FCPS=1 FCPS_USER=<student id> npx vitest run -t "live FCPS"
```

### Limitations

1. **Password sign-in is scheduled for removal by FCPS (by December 2026, date TBD).** After that, direct sync stops working and the app says so. Your existing data and history stay available offline.
2. **No SSO sync yet.** FCPS's SSO is a browser SAML flow. There is no documented token or API that a third-party app can use after SSO, and the portal's post-login gradebook endpoints aren't public, so I did not guess at them. The provider interface (`src/main/studentvue/provider.ts`) is designed so an SSO-based provider can be added later without touching the rest of the app.
3. **Secure fallback: file import** (Settings → Data, or the first-run screen). It accepts:
   - Synergy gradebook XML, either a raw `<Gradebook>` or a full SOAP response
   - CSV. A template is available in the app. Columns: `Course, Teacher, Grading Period, Assignment, Category, Earned, Possible, Due Date, Status, Weight, …`
   - GradeKiwi JSON exports (full round trip)
4. Teachers' exact rounding and rules may differ from what StudentVUE exposes. Each course page shows GradeKiwi's calculation next to StudentVUE's reported grade and flags differences larger than 0.15 points.

### Security

- Credentials are encrypted with Electron `safeStorage`, whose key lives in the **macOS login Keychain**. Only ciphertext is written (`credentials.enc`, mode 600). "Stay signed in" off keeps credentials in memory only.
- Passwords, tokens and request bodies are never logged. Sync errors are reduced to a sanitized message.
- Renderer: `contextIsolation`, `sandbox`, no `nodeIntegration`, strict CSP, navigation and pop-ups blocked, all permission requests denied.
- IPC: a fixed allowlist of channels (`src/shared/ipc.ts`). The sender frame is checked and every argument is validated with zod.
- XML parsing rejects `DOCTYPE` (no entity expansion), and imports are size-limited and schema-validated.
- All app files are owner-only (`umask 077`). CSV exports neutralize spreadsheet formula injection.
- Requests are sequential and spaced at least 400 ms apart. Background sync can't run more often than every 30 minutes.

## Grade math

- **Weighted categories:** `Σ(category average × weight) ÷ Σ(weights of categories that have grades)`. Synergy renormalizes over non-empty categories, and so does GradeKiwi. A category's average is points-based: `Σ earned ÷ Σ possible`.
- **Total points:** `Σ earned ÷ Σ possible × 100`.
- **Statuses:** *graded* counts. *Not graded* and *exempt* never count. *Missing* counts at its recorded score (usually 0). Missing with no score counts as 0 only if you enable it in Settings.
- **Drop lowest N:** drops the items whose removal maximizes the category (exhaustive search for small sets), not just the lowest percentages.
- **Extra credit:** items with 0 possible points add to the numerator. A flat course bonus is also supported.
- **Solvers:** bisection on the target grade for "score needed", which stays exact even with drop rules. The final-exam formula is `(target − current × (1 − w)) ÷ w`.
- **Policy resolution:** your per-course override → category weights published by StudentVUE → total points.

### Grading scale and GPA

Nothing is assumed: the scale, points and level bonuses are all editable. The default preset is FCPS's published scale from the [FCPS Postsecondary Profile](https://www.fcps.edu/about-fcps/performance-and-accountability/fcps-postsecondary-profile), verified Nov 2026: A 93–100 (4.0), A− 90–92 (3.7), B+ 87–89 (3.3), B 83–86 (3.0), B− 80–82 (2.7), C+ 77–79 (2.3), C 73–76 (2.0), C− 70–72 (1.7), D+ 67–69 (1.3), D 60–66 (1.0), F (0.0). Weighting is Honors +0.5 and AP / IB / AV / Dual Enrollment +1.0. FCPS's page doesn't say whether the bonus applies to an F, so that's a toggle.

## Architecture

```
src/
  shared/              types, IPC contract, grade engine (pure, tested)
    grading/engine.ts  weighted/points math, drops, extra credit, solvers
    grading/scale.ts   scales, GPA, level detection
    grading/model.ts   stored data → engine (policy resolution, summaries, hypotheticals)
  main/
    index.ts           window, security policy, lifecycle, auto-sync
    ipc.ts             allowlisted, zod-validated handlers
    database/          node:sqlite + migrations (upserts keep stable ids; snapshots kept forever)
    studentvue/        SOAP client, parsers, provider abstraction, sync orchestration
    importers/         CSV / JSON / Synergy XML
    security/keychain.ts
    export.ts, demo.ts
  preload/index.ts     typed contextBridge API (window.gk)
  renderer/src/        React UI: pages/, components/, hooks/, utils/
tests/                 engine, parsers (incl. real FCPS error fixture), database
scripts/               icon/DMG asset renderer, screenshot QA harness, persistence check
```

Hypothetical data lives in separate tables (`scenarios`, `hypotheticals`) and references real assignments only by id. It is applied in memory and never written over StudentVUE data. Demo data is stored with `source = 'demo'`, is labelled everywhere in the UI, and is replaced automatically by real data.

## Distribution: signing and notarization

The DMG is **universal (Apple Silicon + Intel)** and **ad-hoc signed** (`identity: "-"`) with the hardened runtime. It is **not** Developer ID–signed or notarized. On first launch, macOS will ask you to confirm. Right-click the app → Open, or allow it in System Settings → Privacy & Security.

To sign and notarize with an Apple Developer account:

1. Remove `identity: "-"` from `electron-builder.yml` and set `CSC_LINK` / `CSC_KEY_PASSWORD` (Developer ID Application certificate).
2. Set `notarize: true` and export `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`.
3. Run `npm run make:dmg`.

Data location: `~/Library/Application Support/GradeKiwi/` (`gradekiwi.db`, `credentials.enc`).

## Windows

`npm run make:win` builds on macOS (no Wine needed) and collects the results in `GradeKiwi-Windows/`:

- `GradeKiwi-Setup-1.0.0.exe`: per-user NSIS installer for Windows 10/11, containing both x64 and ARM64 builds
- `GradeKiwi-1.0.0-Portable.exe`: x64, runs without installing

It's the same app: the packaged code is byte-identical to the macOS build. Platform differences are limited to:

- **Window chrome:** native Windows caption buttons instead of traffic lights, and a solid sidebar instead of vibrancy.
- **Wording:** "this PC" instead of "this Mac", and Windows Data Protection instead of the Keychain.
- **Credential storage:** Electron `safeStorage` encrypts with DPAPI, tied to the Windows user account.

Data lives in `%APPDATA%\GradeKiwi`. The executables aren't Authenticode-signed, so SmartScreen warns on first run (More info → Run anyway). Set `CSC_LINK` / `CSC_KEY_PASSWORD` to sign.
