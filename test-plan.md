# LEOS — Test Plan

Automated pre-production test strategy for LEOS (Tauri v2 desktop app: React/Vite
frontend + Rust/SQLite API server on `:8787`).

Status legend: ✅ implemented · 🟡 partial / proof-of-concept · ⬜ planned

---

## 1. How the harness works

LEOS ships as a Tauri desktop app, and **Playwright cannot attach to Tauri's
WebView2 window**. The frontend, however, talks to the Rust backend purely over
HTTP (`fetch` → `http://localhost:8787`) — *not* Tauri IPC — for every data flow.
The only Tauri-specific surfaces are the native `.leosdb` file-picker dialogs.

So the harness has three layers, each isolated from production data:

| Layer | Tool | What it drives | Isolation |
|---|---|---|---|
| **E2E (UI)** | Playwright (Chromium) | The real React frontend, served by Vite, pointed at an isolated API server | Vite on `:5199`, server on `:8799`, temp data dir |
| **API** | Vitest | The 315-route Rust HTTP API directly | server on `:8788`, temp data dir |
| **DB** | Vitest + better-sqlite3 | The live `school.sqlite` the test server wrote | read-only open of the temp DB |

**Isolation guarantee.** The Rust server was given two test-only env overrides
(`server/src/lib.rs`): `LEOS_DATA_DIR` (throwaway temp folder) and `LEOS_PORT`
(dedicated port). The suite launches its own server instances with these set, so
it **never** reads or writes the real `%LOCALAPPDATA%\LEOS` data. Everything runs
locally, offline, with no shared state between runs.

Seed credentials (from the server seed): `admin` / `ChangeMe@3201`; master key
`ChangeMe@3201`.

---

## 2. Test categories

| Category | Layer | Status | Notes |
|---|---|---|---|
| Smoke | E2E | ✅ | App boots, gate renders, login reachable (`@smoke` tag) |
| Login / auth | E2E + API | ✅ | Valid/invalid login, token required, `/auth/me` |
| Navigation | E2E | 🟡 | Ribbon tab + action nav helper exists; per-module nav tests planned |
| CRUD | E2E + API + DB | 🟡 | Students proven end-to-end; other modules planned |
| Validation | API | 🟡 | Required-field enforcement (students); expand per form |
| Permission (L1–L5) | API | ⬜ | Level-gated routes; login as each level, assert allow/deny |
| Error handling | API | 🟡 | 401/422 covered; 404/500 paths planned |
| Offline / local server | API | ✅ | Whole suite is offline by construction |
| Installer | manual/script | ⬜ | See §5 — partial automation only on Windows |
| Regression | all | ⬜ | Whole suite run in CI on each change |

---

## 3. Per-module "production-ready" gate

A module is considered production-ready when its row in
[`test-inventory.md`](test-inventory.md) is green for:

1. Smoke (screen renders)
2. CRUD (create / read / update / delete or archive)
3. Validation (required fields, bad input rejected)
4. Permission (visible/usable only to allowed levels)
5. Import/export (where the module has it)
6. DB write (the operation persists to SQLite)
7. Regression (passes in the full suite)

---

## 4. Commands

```bash
npm install                 # one-time; also: npx playwright install chromium
cd server && cargo build    # one-time; builds the leos-server test binary

npm test            # api + db + e2e
npm run test:api    # Vitest — HTTP API
npm run test:db     # Vitest — SQLite persistence
npm run test:e2e    # Playwright — browser UI
npm run test:smoke  # Playwright — @smoke only
npm run test:report # open the Playwright HTML report
```

Reports land in `tests/reports/` (HTML + JSON; screenshots/video on failure).

---

## 5. Installer tests (Windows) — planned

Full install automation needs an elevated, sandboxed Windows runner. Planned
checks: the NSIS/MSI bundle installs; the app launches; the `leos-server` sidecar
answers `/health`; the data dir + `school.sqlite` are created; uninstall leaves
user data unless explicitly removed. Until automated, run
[`bug-reports/TEMPLATE.md`](bug-reports/TEMPLATE.md) for any manual install issue.

---

## 6. What this first pass delivers vs. the full brief

**Delivered (✅ runs green):** the harness, isolation, reporting, docs, and a full
vertical slice — login + Students CRUD across E2E/API/DB. This proves the pattern
end-to-end so every other module is a copy-and-extend.

**Next (⬜):** extend coverage to Attendance, Timetable, Exams, Fees, Events,
Backup, Import/Export, and the permission matrix; add the Diagnostics screen and
installer automation. Staff and Subjects slices exist — see
[`test-inventory.md`](test-inventory.md).
