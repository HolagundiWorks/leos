// Read-only SQLite access for DB tests. Tests assert that operations performed
// through the API actually persisted to the live school.sqlite file.
//
// We open the same file the test server is using (its LEOS_DATA_DIR). Open in
// read-only mode so a test can never corrupt server state mid-run.
import Database from 'better-sqlite3';

export function openDb(dbPath: string): Database.Database {
  return new Database(dbPath, { readonly: true, fileMustExist: true });
}

// Writable connection — used sparingly by tests that must seed a row the API
// can't create (e.g. a low-privilege user for the permission matrix). A short
// busy timeout avoids transient "database is locked" against the live server.
export function openDbWritable(dbPath: string): Database.Database {
  const db = new Database(dbPath, { fileMustExist: true });
  db.pragma('busy_timeout = 5000');
  return db;
}

/** SELECT COUNT(*) helper. */
export function count(db: Database.Database, sql: string, ...params: unknown[]): number {
  const row = db.prepare(sql).get(...params) as { n?: number } | Record<string, number>;
  const val = Object.values(row)[0];
  return Number(val ?? 0);
}

/** Names of every user table (excludes sqlite internal tables). */
export function tableNames(db: Database.Database): string[] {
  return db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all()
    .map((r) => (r as { name: string }).name);
}
