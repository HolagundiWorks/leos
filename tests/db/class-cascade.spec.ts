import { describe, it, expect, inject, beforeAll, afterAll } from 'vitest';
import type Database from 'better-sqlite3';
import { authedApi } from '../helpers/api';
import { openDb, count } from '../helpers/db';

// Deleting a class must cascade to its sections (no orphaned section rows).
describe('DB · class delete cascade', () => {
  let db: Database.Database;

  beforeAll(() => {
    db = openDb(inject('dbPath'));
  });
  afterAll(() => db?.close());

  it('deleting a class removes the class and all its sections', async () => {
    const client = await authedApi(inject('baseUrl'));

    const cls = await client.post<{ id: number }>('/classes', { name: `Cascade-${Date.now()}` });
    const classId = cls.body.id;
    await client.post('/sections', { class_id: classId, name: 'A' });
    await client.post('/sections', { class_id: classId, name: 'B' });

    expect(count(db, 'SELECT COUNT(*) AS n FROM sections WHERE class_id = ?', classId)).toBe(2);

    const del = await client.post(`/classes/${classId}/delete`, {});
    expect(del.status).toBe(200);

    expect(count(db, 'SELECT COUNT(*) AS n FROM classes WHERE id = ?', classId)).toBe(0);
    expect(count(db, 'SELECT COUNT(*) AS n FROM sections WHERE class_id = ?', classId)).toBe(0);
  });
});
