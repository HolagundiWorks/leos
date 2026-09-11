// Shared constants for the LEOS test harness.
//
// Credentials belong only to the isolated TypeScript test fixture.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(here, '..', '..');

// Seed credentials — DO NOT use these in production; tests assert against them.
export const ADMIN_USER = 'admin';
export const ADMIN_PASS = 'ChangeMe@3201';
export const MASTER_KEY = 'ChangeMe@3201';

// The starter portable school file the server writes on first run into its
// data dir. We open it by bare name (server resolves it relative to cwd).
export const DEFAULT_SCHOOL_FILE = 'school.leosdb';

// Dedicated, non-default ports so the suite never collides with a running dev
// server (which uses 8787 / Vite 5174).
export const API_SERVER_PORT = 8788; // isolated server for Vitest (API + DB)
export const E2E_SERVER_PORT = 8799; // isolated server for Playwright E2E
export const E2E_VITE_PORT = 5199; // isolated Vite dev server for E2E

export const E2E_BASE_URL = `http://localhost:${E2E_VITE_PORT}`;
