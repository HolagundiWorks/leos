import { describe, it, expect, inject, beforeAll, afterAll } from 'vitest';
import type Database from '../../desktop/src/sqlite';
import { openDb, tableNames } from '../helpers/db';

// The compliance / SIS expansion adds many tables + columns. Assert the migration
// created them in the live SQLite file (migrate_schema runs on open, idempotently).
describe('DB · compliance & SIS schema', () => {
  let db: Database.Database;

  beforeAll(() => {
    db = openDb(inject('dbPath'));
  });
  afterAll(() => db?.close());

  it('created the new compliance / SIS tables', () => {
    const names = tableNames(db);
    for (const t of [
      'student_documents', 'student_marks', 'board_registrations', 'student_communications',
      'compliance_certificates', 'exam_archives', 'practical_exams', 'practical_marks', 'audit_log',
    ]) {
      expect(names, `expected table "${t}"`).toContain(t);
    }
  });

  it('added the CBSE-core + lock columns to students', () => {
    const cols = (db.prepare('PRAGMA table_info(students)').all() as { name: string }[]).map((c) => c.name);
    for (const c of ['apaar_id', 'aadhaar', 'father_occupation', 'cwsn', 'lock_state', 'status']) {
      expect(cols, `expected students.${c}`).toContain(c);
    }
  });

  it('added the statutory identifier columns to schools', () => {
    const cols = (db.prepare('PRAGMA table_info(schools)').all() as { name: string }[]).map((c) => c.name);
    for (const c of ['affiliation_no', 'school_code', 'udise_code']) {
      expect(cols, `expected schools.${c}`).toContain(c);
    }
  });
});
