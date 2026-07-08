# LEOS test suite

Automated tests for LEOS. Three layers, all offline, all isolated from your real
data. See [`../test-plan.md`](../test-plan.md) for the strategy and
[`../test-inventory.md`](../test-inventory.md) for the coverage backlog.

## One-time setup

```bash
npm install                      # from repo root (installs Playwright + Vitest)
npx playwright install chromium  # downloads the browser (needs internet ONCE)
cd server && cargo build         # builds the leos-server test binary
```

## Run

```bash
npm test            # api + db + e2e
npm run test:api    # HTTP API (Vitest)
npm run test:db     # SQLite persistence (Vitest)
npm run test:e2e    # browser UI (Playwright)
npm run test:smoke  # @smoke only
npm run test:report # open the Playwright HTML report
```

## How isolation works

The Rust server honors two test-only env vars (added in `server/src/lib.rs`):

- `LEOS_DATA_DIR` → a throwaway temp folder (fresh `school.sqlite` + seed).
- `LEOS_PORT` → a dedicated port (8788 for API/DB, 8799 for E2E).

`tests/helpers/server.ts` launches the prebuilt `leos-server` binary with these
set and waits for `/health`. Your real `%LOCALAPPDATA%\LEOS` data is never
touched. Each run starts from the clean demo seed.

The E2E layer additionally starts a Vite dev server (port 5199) via Playwright's
`webServer`, with `VITE_API_BASE` pointed at the isolated API server, so the real
React frontend runs in a headless browser against the test backend.

## Layout

```
tests/
├─ helpers/      server launcher, API client, SQLite reader, shared constants
├─ fixtures/     Playwright fixtures (gate, login, navigate, serverApi, dbPath)
├─ global/       Playwright + Vitest global setup (start/stop the server)
├─ e2e/          browser UI specs (smoke / auth / students / …)
├─ api/          HTTP API specs
├─ db/           SQLite persistence specs
└─ reports/      HTML + JSON output, screenshots, video (gitignored)
```

## Adding coverage for a new module

1. Add `data-testid`s to its screen (see the convention in `test-inventory.md`).
2. Add API specs in `tests/api/<module>.spec.ts` (drive the routes directly).
3. Add a DB spec if it writes data (assert the row persisted).
4. Add an E2E spec in `tests/e2e/<module>/` using the fixtures.
5. Flip the module's row to ✅ in `test-inventory.md`.

The Students module (`tests/{e2e,api,db}`) is the reference example to copy.

## Troubleshooting

- **"leos-server binary not found"** → run `cd server && cargo build`.
- **Port in use** → a previous run or the dev app is on 8788/8799/5199; stop it.
- **Playwright "browser not found"** → `npx playwright install chromium`.
- **Native file-picker flows** can't be tested in the browser by design — cover
  the underlying endpoints (`/school/open`, `/schooldb/save`) via the API layer.
