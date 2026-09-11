import { describe, it, expect, inject, beforeAll, afterAll } from 'vitest';
import type Database from '../../desktop/src/sqlite';
import { openDb, count, tableNames } from '../helpers/db';

// Asserts the migrated schema + demo seed are present in the live SQLite file
// the server created in its isolated data dir.
describe('DB · schema & seed', () => {
  let db: Database.Database;

  beforeAll(() => {
    db = openDb(inject('dbPath'));
  });
  afterAll(() => db?.close());

  it('has the core tables', () => {
    const names = tableNames(db);
    for (const t of ['users', 'students', 'schools']) {
      expect(names, `expected table "${t}"`).toContain(t);
    }
  });

  it('seeded the admin user', () => {
    expect(count(db, "SELECT COUNT(*) AS n FROM users WHERE username = 'admin'")).toBe(1);
  });

  it('stores admin password as a bcrypt hash, not plaintext', () => {
    const row = db
      .prepare("SELECT password_hash AS h FROM users WHERE username = 'admin'")
      .get() as { h: string };
    expect(row.h).toMatch(/^\$2[aby]\$/); // bcrypt prefix
  });

  it('seeded demo students', () => {
    expect(count(db, 'SELECT COUNT(*) AS n FROM students')).toBeGreaterThan(0);
  });
});
