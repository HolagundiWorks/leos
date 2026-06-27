import { describe, it, expect, inject, beforeAll, afterAll } from 'vitest';
import type Database from 'better-sqlite3';
import { api, authedApi, type ApiClient } from '../helpers/api';
import { openDbWritable } from '../helpers/db';
import { ADMIN_PASS } from '../helpers/env';

// L1–L5 permission matrix. The server must enforce access by level, not just by
// "is logged in" — see bug-reports/BUG-20260627-02-security.md (now fixed).
//
// The demo seed only ships the L1 admin and there's no user-creation endpoint,
// so we seed a low-privilege (parent → L5) user straight into the test DB,
// reusing the admin's bcrypt hash so the same password logs them in.
describe('API · permission matrix (L1 vs L5)', () => {
  const PARENT_USER = `permtest_parent_${Date.now()}`;
  let admin: ApiClient;
  let parent: ApiClient;
  let db: Database.Database;

  const ADMIN_ROUTES_GET = ['/admin/system-info', '/admin/modules', '/admin/users/levels'];

  beforeAll(async () => {
    const baseUrl = inject('baseUrl');

    // Seed an L5 user that shares the admin's password hash.
    db = openDbWritable(inject('dbPath'));
    db.prepare(
      `INSERT INTO users (username, password_hash, role, name)
       SELECT ?, password_hash, 'parent', 'Perm Test Parent'
       FROM users WHERE username = 'admin'`,
    ).run(PARENT_USER);

    admin = await authedApi(baseUrl);
    parent = api(baseUrl);
    const res = await parent.login(PARENT_USER, ADMIN_PASS);
    expect(res.ok, 'L5 test user should be able to log in').toBe(true);
  });

  afterAll(() => {
    db?.prepare('DELETE FROM users WHERE username = ?').run(PARENT_USER);
    db?.close();
  });

  it('L1 admin can reach admin routes', async () => {
    for (const route of ADMIN_ROUTES_GET) {
      const res = await admin.get(route);
      expect(res.status, `admin GET ${route}`).toBe(200);
    }
  });

  it('L5 user is forbidden (403) on admin routes', async () => {
    for (const route of ADMIN_ROUTES_GET) {
      const res = await parent.get(route);
      expect(res.status, `parent GET ${route}`).toBe(403);
    }
  });

  it('L5 user cannot escalate their own level (403 on /admin/users/:id/level)', async () => {
    // Read id + stored level straight from the DB (decoupled from the endpoint).
    const me = db
      .prepare('SELECT id, level FROM users WHERE username = ?')
      .get(PARENT_USER) as { id: number; level: number };
    expect(me).toBeDefined();

    const res = await parent.post(`/admin/users/${me.id}/level`, { level: 1 });
    expect(res.status).toBe(403);

    // Confirm the stored level is unchanged (escalation was blocked).
    const after = db.prepare('SELECT level FROM users WHERE id = ?').get(me.id) as { level: number };
    expect(after.level).toBe(me.level);
  });

  it('an authenticated L5 user is still 401-free on general routes (only privileged routes are gated)', async () => {
    // We intentionally did NOT lock down general read routes in this pass; an
    // authenticated user of any level may read students. (Finer per-module
    // gating is tracked as follow-up in test-inventory.md.)
    const res = await parent.get('/students');
    expect(res.status).toBe(200);
  });

  it('unauthenticated requests are rejected (401) on admin routes', async () => {
    const res = await api(inject('baseUrl')).get('/admin/system-info');
    expect(res.status).toBe(401);
  });
});
