# LEOS test suite
database path.
The tests exercise the Electron application's TypeScript services and built-in
SQLite implementation. No Rust toolchain, sidecar, or `better-sqlite3` module is
required.

## Setup and run

```bash
npm install
npm install --prefix frontend
npm install --prefix desktop
npx playwright install chromium
npm test
```

`tests/helpers/server.ts` exposes the real `ApiRouter` through an isolated local
HTTP adapter. Playwright injects an Electron-compatible bridge so the production
renderer transport is exercised in Chromium. All databases live in unique
temporary directories and are deleted after each run.

Add API specs under `tests/api`, persistence and compatibility specs under
`tests/db`, and renderer flows under `tests/e2e`. Use the fixtures in
`tests/fixtures/leos.ts` for the school gate, login, navigation, API access, and
database path.
