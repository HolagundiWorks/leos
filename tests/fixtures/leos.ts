// LEOS Playwright fixtures.
//
// Provides reusable entry points so specs don't re-implement the two pre-app
// gates (open school file -> unlock master key) and login every time:
//   * page         — raw page (from @playwright/test)
//   * gatedPage    — past the welcome/master-key gate, sitting on the login form
//   * authedPage   — logged in as admin, cockpit shell visible
//   * serverApi    — ApiClient pointed at the same isolated server the UI uses
//   * dbPath       — path to that server's live SQLite, for persistence asserts
import { test as base, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import { ApiClient } from '../helpers/api';
import { ADMIN_PASS, ADMIN_USER, DEFAULT_SCHOOL_FILE, MASTER_KEY } from '../helpers/env';
import { SERVER_INFO_FILE } from '../global/playwright-global';

interface ServerInfo {
  baseUrl: string;
  dbPath: string;
  dataDir: string;
}

function serverInfo(): ServerInfo {
  return JSON.parse(fs.readFileSync(SERVER_INFO_FILE, 'utf8')) as ServerInfo;
}

async function installTestDesktopBridge(page: Page) {
  const { baseUrl } = serverInfo();
  await page.addInitScript(({ apiBase }) => {
    const invoke = async (input: { method: string; path: string; token?: string | null; body?: unknown }) => {
      const response = await fetch(`${apiBase}${input.path}`, {
        method: input.method,
        headers: {
          'Content-Type': 'application/json',
          ...(input.token ? { Authorization: `Bearer ${input.token}` } : {}),
        },
        body: input.body === undefined ? undefined : JSON.stringify(input.body),
      });
      return { status: response.status, body: await response.json() };
    };
    (window as any).leosDesktop = {
      request: invoke,
      login: async (body: unknown) => {
        const response = await invoke({ method: 'POST', path: '/auth/login', body });
        if (response.status !== 200) throw new Error((response.body as any).error);
        return response.body;
      },
      me: async (token: string) => (await invoke({ method: 'GET', path: '/auth/me', token })).body.user,
      logout: async () => undefined,
      openSchoolArchive: async () => ({ opened: 'school.leosdb', checksum: 'test', school: { id: 1, name: 'LEOS Test School', databasePath: 'test' } }),
      inspectActiveSchool: async () => ({ id: 1, name: 'LEOS Test School', databasePath: 'test' }),
      getRuntimeStatus: async () => ({ ready: true, databasePath: 'test' }),
      chooseSchoolFile: async () => null,
      chooseImportFile: async () => null,
      chooseFolder: async () => null,
      chooseNewSchoolFile: async () => null,
      lanStatus: async () => ({ mode: 'offline', connected: false }),
      lanStop: async () => ({ mode: 'offline', connected: false }),
      lanDisconnect: async () => ({ mode: 'offline', connected: false }),
    };
  }, { apiBase: baseUrl });
}

/** Open the school file and unlock it with the master key. Lands on login. */
export async function passGate(page: Page) {
  await installTestDesktopBridge(page);
  await page.goto('/');
  await page.getByTestId('school-file-input').fill(DEFAULT_SCHOOL_FILE);
  await page.getByTestId('open-school-file-button').click();
  await page.getByTestId('master-key-input').fill(MASTER_KEY);
  await page.getByTestId('unlock-continue-button').click();
  await expect(page.getByTestId('login-form')).toBeVisible();
}

/** From the login form, sign in as admin and wait for the cockpit shell. */
export async function login(page: Page, username = ADMIN_USER, password = ADMIN_PASS) {
  await page.getByTestId('login-username-input').fill(username);
  await page.getByTestId('login-password-input').fill(password);
  await page.getByTestId('login-submit-button').click();
  await expect(page.getByTestId('cockpit-shell')).toBeVisible();
}

/** Navigate to a module via the ribbon: select its tab, then its action. */
export async function navigateTo(page: Page, tabId: string, moduleKey: string) {
  await page.getByTestId(`ribbon-tab-${tabId}`).click();
  await page.getByTestId(`nav-${moduleKey}`).click();
}

export const test = base.extend<{
  gatedPage: Page;
  authedPage: Page;
  serverApi: ApiClient;
  dbPath: string;
}>({
  gatedPage: async ({ page }, use) => {
    await passGate(page);
    await use(page);
  },
  authedPage: async ({ page }, use) => {
    await passGate(page);
    await login(page);
    await use(page);
  },
  serverApi: async ({}, use) => {
    const client = new ApiClient(serverInfo().baseUrl);
    await client.login();
    await use(client);
  },
  dbPath: async ({}, use) => {
    await use(serverInfo().dbPath);
  },
});

export { expect };
