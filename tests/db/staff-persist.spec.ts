import { describe, it, expect, inject, beforeAll, afterAll } from 'vitest';
import type Database from '../../desktop/src/sqlite';
import { authedApi } from '../helpers/api';
import { openDb, count } from '../helpers/db';

// A staff member created via the API must land as a real row in SQLite.
describe('DB · staff write persistence', () => {
  let db: Database.Database;

  beforeAll(() => {
    db = openDb(inject('dbPath'));
  });
  afterAll(() => db?.close());

  it('a staff member created via the API is a real row in SQLite', async () => {
    const client = await authedApi(inject('baseUrl'));
    const last = `StaffDbRow-${Date.now()}`;

    const before = count(db, 'SELECT COUNT(*) AS n FROM staff');
    const res = await client.post<{ ok: boolean; id: number }>('/staff', {
      first_name: 'Direct',
      last_name: last,
      profile: 'accountant',
    });
    expect(res.body.ok).toBe(true);

    expect(count(db, 'SELECT COUNT(*) AS n FROM staff')).toBe(before + 1);

    const row = db
      .prepare('SELECT last_name AS l, profile AS p FROM staff WHERE id = ?')
      .get(res.body.id) as { l: string; p: string } | undefined;
    expect(row).toBeDefined();
    expect(row!.l).toBe(last);
    expect(row!.p).toBe('accountant');
  });
});
