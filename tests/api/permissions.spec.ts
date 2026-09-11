import { describe, it, expect, inject, beforeAll, afterAll } from 'vitest';
import type Database from '../../desktop/src/sqlite';
import { api, authedApi, type ApiClient } from '../helpers/api';
import { openDbWritable } from '../helpers/db';
import { ADMIN_PASS, MASTER_KEY } from '../helpers/env';
import { AuthService } from '../../desktop/src/auth';
import { ApiRouter } from '../../desktop/src/api-router';

// L1–L5 permission matrix. The server must enforce access by level, not just by
// "is logged in" — see bug-reports/BUG-20260627-02-security.md (now fixed).
//
// The demo seed only ships the L1 admin and there's no user-creation endpoint,
// so we seed a low-privilege (parent → L5) user straight into the test DB,
// reusing the admin's bcrypt hash so the same password logs them in.
describe('API · permission matrix (L1–L5)', () => {
  const PARENT_USER = `permtest_parent_${Date.now()}`;
  const STAFF_USERS = [
    { username: `permtest_l2_${Date.now()}`, role: 'teacher', level: 2 },
    { username: `permtest_l3_${Date.now()}`, role: 'class_teacher', level: 3 },
    { username: `permtest_l4_${Date.now()}`, role: 'staff', level: 4 },
  ] as const;
  let admin: ApiClient;
  let parent: ApiClient;
  const staffClients = new Map<number, ApiClient>();
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
    for (const user of STAFF_USERS) {
      db.prepare(
        `INSERT INTO users (username, password_hash, role, level, name)
         SELECT ?, password_hash, ?, ?, ? FROM users WHERE username = 'admin'`,
      ).run(user.username, user.role, user.level, `Permission L${user.level}`);
    }

    admin = await authedApi(baseUrl);
    parent = api(baseUrl);
    const res = await parent.login(PARENT_USER, ADMIN_PASS);
    expect(res.ok, 'L5 test user should be able to log in').toBe(true);
    for (const user of STAFF_USERS) {
      const client = api(baseUrl);
      const login = await client.login(user.username, ADMIN_PASS);
      expect(login.ok, `L${user.level} test user should log in`).toBe(true);
      staffClients.set(user.level, client);
    }
  });

  afterAll(() => {
    db?.prepare("DELETE FROM meta WHERE key LIKE 'supabase_%'").run();
    db?.prepare(
      `DELETE FROM users WHERE username = ? OR username IN (${STAFF_USERS.map(() => '?').join(',')})`,
    ).run(PARENT_USER, ...STAFF_USERS.map((user) => user.username));
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

  it('an L5 parent cannot read the general student directory', async () => {
    const res = await parent.get('/students');
    expect(res.status).toBe(403);
  });

  it('enforces the staff read matrix at the API boundary', async () => {
    const matrix = [
      { route: '/staff', allowed: [1, 2] },
      { route: '/students', allowed: [1, 2, 3] },
      { route: '/faculty-plans', allowed: [1, 2, 3, 4] },
    ];
    const clients = new Map<number, ApiClient>([[1, admin], ...staffClients]);

    for (const entry of matrix) {
      for (const [level, client] of clients) {
        const response = await client.get(entry.route);
        expect(response.status, `L${level} GET ${entry.route}`).toBe(
          entry.allowed.includes(level) ? 200 : 403,
        );
      }
    }
  });

  it('fails closed for staff mutations before payload validation', async () => {
    const matrix = [
      { route: '/school', allowed: [1] },
      { route: '/students', allowed: [1, 2] },
      { route: '/letters', allowed: [1, 2, 3] },
      { route: '/attendance/mark', allowed: [1, 2, 3, 4] },
      { route: '/faculty-plans', allowed: [1, 2, 3, 4] },
    ];
    const clients = new Map<number, ApiClient>([[1, admin], ...staffClients]);

    for (const entry of matrix) {
      for (const [level, client] of clients) {
        const response = await client.post(entry.route, {});
        if (entry.allowed.includes(level)) {
          expect(response.status, `L${level} POST ${entry.route}`).not.toBe(403);
        } else {
          expect(response.status, `L${level} POST ${entry.route}`).toBe(403);
        }
      }
    }
  });

  it('unauthenticated requests are rejected (401) on admin routes', async () => {
    const res = await api(inject('baseUrl')).get('/admin/system-info');
    expect(res.status).toBe(401);
  });

  it('keeps Supabase configuration L1-only and never returns the stored key', async () => {
    const denied = await parent.get('/integrations/supabase');
    expect(denied.status).toBe(403);

    const saved = await admin.post('/integrations/supabase', {
      enabled: true,
      url: 'https://example-project.supabase.co',
      anonKey: 'test-anon-publishable-key-1234567890',
    });
    expect(saved.status).toBe(200);

    const config = await admin.get<{enabled:boolean;url:string;keyConfigured:boolean;anonKey?:string}>('/integrations/supabase');
    expect(config.body).toMatchObject({
      enabled: true,
      url: 'https://example-project.supabase.co',
      keyConfigured: true,
    });
    expect(config.body.anonKey).toBeUndefined();
  });

  it('enforces desktop, LAN web, and Android feature boundaries server-side', async () => {
    const auth = new AuthService(() => inject('dbPath'));
    await auth.unlock(MASTER_KEY);
    const { token } = await auth.login({ username: 'admin', password: ADMIN_PASS });
    const router = new ApiRouter(() => inject('dbPath'), auth);

    expect((await router.handle({ method: 'GET', path: '/admin/system-info', token, source: 'local' })).status).toBe(200);
    expect((await router.handle({ method: 'GET', path: '/admin/system-info', token, source: 'lan-web' })).status).toBe(403);
    expect((await router.handle({ method: 'POST', path: '/students', token, source: 'lan-web', body: {} })).status).not.toBe(403);
    expect((await router.handle({ method: 'POST', path: '/students', token, source: 'lan-android', body: {} })).status).toBe(403);
    expect((await router.handle({ method: 'POST', path: '/attendance/mark', token, source: 'lan-android', body: {} })).status).not.toBe(403);
  });
});
