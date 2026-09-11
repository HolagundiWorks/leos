# LEOS test plan

The automated suite verifies the single TypeScript stack without starting a
Rust server or loading a native SQLite add-on.

## Test layers

| Layer | Tool | Scope |
| --- | --- | --- |
| Renderer E2E | Playwright + Chromium | React/Vite renderer with an injected Electron-compatible bridge |
| Application API | Vitest | Isolated HTTP adapter around the real Electron `ApiRouter` |
| Database | Vitest + `node:sqlite` | Persistence, schema, and legacy migration fixtures |
| Desktop gates | TypeScript verifiers | Router coverage, domain behavior, portal isolation, backup/import, and schema |

Every run creates a unique temporary SQLite database. It never opens the user's
school archive or `%LOCALAPPDATA%\LEOS` data.

## Commands

```bash
npm install
npm install --prefix frontend
npm install --prefix desktop
npx playwright install chromium

npm test
npm run test:api
npm run test:db
npm run test:e2e
npm run test:smoke
```

Node 24 or newer is required because the application and tests use built-in
`node:sqlite`.

## Release gates

Automated tests do not replace Windows installer validation. Before a signed
release, test installation, first launch, archive create/open/restore, upgrade,
uninstall data retention, and signature verification on a clean Windows VM.
