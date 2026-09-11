// Playwright global setup — starts an isolated TypeScript API adapter for E2E and
// records its details so fixtures/tests (and teardown) can reach it.
//
// The browser-driven frontend talks to this server because the Vite dev server
// (started via playwright.config webServer) is launched with
// VITE_API_BASE pointed at E2E_SERVER_PORT.
import fs from 'node:fs';
import path from 'node:path';
import type { FullConfig } from '@playwright/test';
import { startTestServer } from '../helpers/server';
import { E2E_SERVER_PORT } from '../helpers/env';

export const SERVER_INFO_FILE = path.join(process.cwd(), 'tests', '.tmp', 'e2e-server.json');

export default async function globalSetup(_config: FullConfig) {
  const server = await startTestServer(E2E_SERVER_PORT);
  fs.mkdirSync(path.dirname(SERVER_INFO_FILE), { recursive: true });
  fs.writeFileSync(
    SERVER_INFO_FILE,
    JSON.stringify({ baseUrl: server.baseUrl, dbPath: server.dbPath, dataDir: server.dataDir }),
  );

  // Returned function runs as global teardown (Playwright convention).
  return async () => {
    await server.stop();
    try {
      fs.rmSync(SERVER_INFO_FILE, { force: true });
    } catch {
      /* ignore */
    }
  };
}
