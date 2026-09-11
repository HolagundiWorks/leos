import { describe, it, expect, inject, beforeAll, afterAll } from 'vitest';
import type Database from '../../desktop/src/sqlite';
import { authedApi } from '../helpers/api';
import { openDb, count } from '../helpers/db';

// Delete really removes the row from SQLite (not just hidden in the UI).
describe('DB · delete persistence', () => {
  let db: Database.Database;

  beforeAll(() => {
    db = openDb(inject('dbPath'));
  });
  afterAll(() => db?.close());

  it('deleting a subject removes its row', async () => {
    const client = await authedApi(inject('baseUrl'));
    const create = await client.post<{ id: number }>('/subjects', { name: `DelSub-${Date.now()}` });
    const id = create.body.id;
    expect(count(db, 'SELECT COUNT(*) AS n FROM subjects WHERE id = ?', id)).toBe(1);

    const del = await client.post(`/subjects/${id}/delete`, {});
    expect(del.status).toBe(200);
    expect(count(db, 'SELECT COUNT(*) AS n FROM subjects WHERE id = ?', id)).toBe(0);
  });

  it('deleting a course removes it and nulls its subjects’ course_id (no orphans)', async () => {
    const client = await authedApi(inject('baseUrl'));
    const course = await client.post<{ id: number }>('/courses', { name: `DelCourse-${Date.now()}` });
    const courseId = course.body.id;
    const subj = await client.post<{ id: number }>('/subjects', {
      name: `LinkedSub-${Date.now()}`,
      course_id: courseId,
    });
    const subjId = subj.body.id;
    expect(count(db, 'SELECT COUNT(*) AS n FROM subjects WHERE course_id = ?', courseId)).toBe(1);

    const del = await client.post(`/courses/${courseId}/delete`, {});
    expect(del.status).toBe(200);

    // Course gone, linked subject kept but detached (course_id NULL).
    expect(count(db, 'SELECT COUNT(*) AS n FROM courses WHERE id = ?', courseId)).toBe(0);
    expect(count(db, 'SELECT COUNT(*) AS n FROM subjects WHERE id = ?', subjId)).toBe(1);
    expect(count(db, 'SELECT COUNT(*) AS n FROM subjects WHERE id = ? AND course_id IS NULL', subjId)).toBe(1);
  });
});
