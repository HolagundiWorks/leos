import { describe, it, expect, inject, beforeAll, afterAll } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import Database from '../../desktop/src/sqlite';
import { authedApi, type ApiClient } from '../helpers/api';

// Merge a second school file (concurrent offline edits): we author an external
// .sqlite with one student that matches an existing one (different phone →
// conflict) and one brand-new student, then preview → reconcile → apply.
interface PreviewRow {
  action: 'new' | 'duplicate' | 'conflict';
  incoming: Record<string, unknown>;
  existing: { id: number } | null;
  diffs: string[];
}
interface Preview {
  students: PreviewRow[];
  staff: PreviewRow[];
  summary: { students: { new: number; conflict: number; duplicate: number } };
}

describe('API · merge / reconcile school files', () => {
  let client: ApiClient;
  let extPath: string;
  const newLast = `Newbie-${Date.now()}`;
  let matchName: { first: string; last: string; dob: string };

  beforeAll(async () => {
    client = await authedApi(inject('baseUrl'));

    // Pick an existing student with a birthdate to collide with.
    const list = await client.get<{ students: { first_name: string; last_name: string; birthdate: string }[] }>('/students');
    const target = list.body.students.find((s) => s.birthdate);
    if (!target) throw new Error('no seeded student with a birthdate');
    matchName = { first: target.first_name, last: target.last_name, dob: target.birthdate };

    // Author the external file.
    extPath = path.join(os.tmpdir(), `leos-merge-src-${Date.now()}.sqlite`);
    const db = new Database(extPath);
    db.exec(`CREATE TABLE students(id INTEGER PRIMARY KEY AUTOINCREMENT, first_name TEXT, middle_name TEXT,
      last_name TEXT, email TEXT, phone TEXT, gender TEXT, birthdate TEXT, alt_id TEXT, enrolled INTEGER,
      guardian_name TEXT, guardian_phone TEXT, guardian_relation TEXT, address TEXT);
      CREATE TABLE staff(id INTEGER PRIMARY KEY AUTOINCREMENT, first_name TEXT, last_name TEXT, email TEXT,
      phone TEXT, profile TEXT, title TEXT);`);
    // Conflict: same name + dob as an existing student, different phone.
    db.prepare('INSERT INTO students(first_name,last_name,birthdate,phone) VALUES(?,?,?,?)')
      .run(matchName.first, matchName.last, matchName.dob, '+91 99999 00000');
    // New: unique person.
    db.prepare('INSERT INTO students(first_name,last_name,birthdate,phone) VALUES(?,?,?,?)')
      .run('Zoe', newLast, '2012-12-12', '+91 88888 00000');
    db.close();
  });

  afterAll(() => {
    try { fs.rmSync(extPath, { force: true }); } catch { /* ignore */ }
  });

  let preview: Preview;

  it('preview classifies new vs conflict by name+DOB, writing nothing', async () => {
    const res = await client.post<Preview>('/import/merge/preview', { path: extPath });
    expect(res.status).toBe(200);
    preview = res.body;
    expect(preview.summary.students.new).toBeGreaterThanOrEqual(1);
    expect(preview.summary.students.conflict).toBeGreaterThanOrEqual(1);

    // The new student isn't in the DB yet (preview is read-only).
    const check = await client.get<{ students: unknown[] }>(`/students?q=${encodeURIComponent(newLast)}`);
    expect(check.body.students).toHaveLength(0);

    // The conflict row reports phone among its diffs.
    const conflict = preview.students.find((r) => r.action === 'conflict');
    expect(conflict?.diffs).toContain('phone');
  });

  it('apply imports new records and updates reconciled conflicts + audits', async () => {
    const ops = preview.students.map((r) =>
      r.action === 'new'
        ? { action: 'insert', data: r.incoming }
        : r.action === 'conflict'
          ? { action: 'update', id: r.existing!.id, data: r.incoming }
          : { action: 'skip' },
    );
    const res = await client.post<{ inserted: number; updated: number }>('/import/merge/apply', { students: ops });
    expect(res.status).toBe(200);
    expect(res.body.inserted).toBeGreaterThanOrEqual(1);
    expect(res.body.updated).toBeGreaterThanOrEqual(1);

    // New student now exists.
    const check = await client.get<{ students: { last_name: string }[] }>(`/students?q=${encodeURIComponent(newLast)}`);
    expect(check.body.students.some((s) => s.last_name === newLast)).toBe(true);

    // The conflict student's phone was updated to the incoming value.
    const conflict = preview.students.find((r) => r.action === 'conflict')!;
    const after = await client.get<{ student: { phone: string } }>(`/students/${conflict.existing!.id}`);
    expect(after.body.student.phone).toBe('+91 99999 00000');
  });
});
