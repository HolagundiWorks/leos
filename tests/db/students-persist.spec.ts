import { describe, it, expect, inject, beforeAll, afterAll } from 'vitest';
import type Database from '../../desktop/src/sqlite';
import { authedApi } from '../helpers/api';
import { openDb, count } from '../helpers/db';

// Proves a write made through the API actually lands in the on-disk database —
// the real test of "read/write validation" the brief asks for.
describe('DB · write persistence', () => {
  let db: Database.Database;

  beforeAll(() => {
    db = openDb(inject('dbPath'));
  });
  afterAll(() => db?.close());

  it('a student created via the API is a real row in SQLite', async () => {
    const client = await authedApi(inject('baseUrl'));
    const last = `DbRow-${Date.now()}`;

    const before = count(db, 'SELECT COUNT(*) AS n FROM students');
    const res = await client.post<{ ok: boolean; id: number }>('/students', {
      first_name: 'Direct',
      last_name: last,
    });
    expect(res.body.ok).toBe(true);

    const after = count(db, 'SELECT COUNT(*) AS n FROM students');
    expect(after).toBe(before + 1);

    const row = db
      .prepare('SELECT first_name AS f, last_name AS l FROM students WHERE id = ?')
      .get(res.body.id) as { f: string; l: string } | undefined;
    expect(row).toBeDefined();
    expect(row!.f).toBe('Direct');
    expect(row!.l).toBe(last);
  });

  it('rejects a student with no name (required fields enforced)', async () => {
    const client = await authedApi(inject('baseUrl'));
    const before = count(db, 'SELECT COUNT(*) AS n FROM students');
    const res = await client.post('/students', { email: 'noname@example.test' });
    // Server should refuse; nothing should be written either way.
    expect(res.ok).toBe(false);
    expect(count(db, 'SELECT COUNT(*) AS n FROM students')).toBe(before);
  });
});
