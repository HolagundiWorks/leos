import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { strToU8, zipSync } from 'fflate';
import Database from '../../desktop/src/sqlite';
import { migrateSchema, SCHEMA_VERSION } from '../../desktop/src/schema';
import { SchoolFileService } from '../../desktop/src/school-files';

describe('DB · legacy schema migration', () => {
  const paths: string[] = [];
  afterEach(() => {
    for (const item of paths.splice(0)) fs.rmSync(item, { recursive: true, force: true });
  });

  it('upgrades an early Rust-era database without changing existing records', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'leos-legacy-schema-'));
    paths.push(dir);
    const file = path.join(dir, 'school.sqlite');
    const db = new Database(file);
    try {
      db.exec(`
      CREATE TABLE schools(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT,academic_year TEXT);
      CREATE TABLE users(id INTEGER PRIMARY KEY AUTOINCREMENT,username TEXT UNIQUE,password_hash TEXT,role TEXT,name TEXT);
      CREATE TABLE students(id INTEGER PRIMARY KEY AUTOINCREMENT,first_name TEXT,middle_name TEXT,last_name TEXT,email TEXT,phone TEXT,gender TEXT,birthdate TEXT,alt_id TEXT,enrolled INTEGER DEFAULT 0);
      CREATE TABLE staff(id INTEGER PRIMARY KEY AUTOINCREMENT,first_name TEXT,last_name TEXT,email TEXT,phone TEXT,profile TEXT,title TEXT);
      INSERT INTO schools(name,academic_year) VALUES('Legacy Academy','2024-25');
      INSERT INTO users(username,password_hash,role,name) VALUES('admin','legacy-hash','admin','Legacy Admin');
      INSERT INTO students(first_name,last_name,email,enrolled) VALUES('Anu','Legacy','anu@legacy.test',1);
      INSERT INTO staff(first_name,last_name,profile) VALUES('Ravi','Teacher','teacher');
      PRAGMA user_version=1;
    `);

      migrateSchema(db);

      expect((db.pragma('user_version') as Array<{ user_version: number }>)[0]?.user_version).toBe(SCHEMA_VERSION);
      expect(db.prepare('SELECT name,academic_year FROM schools WHERE id=1').get()).toEqual({ name: 'Legacy Academy', academic_year: '2024-25' });
      expect(db.prepare('SELECT first_name,last_name,email,enrolled FROM students WHERE id=1').get()).toEqual({ first_name: 'Anu', last_name: 'Legacy', email: 'anu@legacy.test', enrolled: 1 });
      expect(db.prepare("SELECT name FROM pragma_table_info('students') WHERE name='apaar_id'").pluck().get()).toBe('apaar_id');
      expect(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='lms_spaces'").pluck().get()).toBe('lms_spaces');
    } finally {
      db.close();
    }
  });

  it('opens a schema-1 portable archive and migrates its database in place', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'leos-legacy-archive-'));
    paths.push(dir);
    const legacyDb = path.join(dir, 'legacy.sqlite');
    const archive = path.join(dir, 'legacy.leosdb');
    const active = path.join(dir, 'active.sqlite');
    const db = new Database(legacyDb);
    db.exec(`
      CREATE TABLE schools(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT,academic_year TEXT,type TEXT);
      CREATE TABLE meta(key TEXT PRIMARY KEY,value TEXT);
      CREATE TABLE students(id INTEGER PRIMARY KEY AUTOINCREMENT,first_name TEXT,middle_name TEXT,last_name TEXT,email TEXT,phone TEXT,gender TEXT,birthdate TEXT,alt_id TEXT,enrolled INTEGER DEFAULT 0);
      CREATE TABLE staff(id INTEGER PRIMARY KEY AUTOINCREMENT,first_name TEXT,last_name TEXT,email TEXT,phone TEXT,profile TEXT,title TEXT);
      CREATE TABLE users(id INTEGER PRIMARY KEY AUTOINCREMENT,username TEXT UNIQUE,password_hash TEXT,role TEXT,name TEXT);
      INSERT INTO schools(name,academic_year,type) VALUES('Archive School','2023-24','school');
      INSERT INTO students(first_name,last_name,enrolled) VALUES('Meera','Archive',1);
      PRAGMA user_version=1;
    `);
    db.close();
    const sqlite = new Uint8Array(fs.readFileSync(legacyDb));
    const checksum = createHash('sha256').update(sqlite).digest('hex');
    fs.writeFileSync(archive, zipSync({
      'manifest.json': strToU8(JSON.stringify({ app: 'LEOS', schema: 1, files: ['school.sqlite'] })),
      'school.sqlite': sqlite,
      'checksum.json': strToU8(JSON.stringify({ 'school.sqlite': checksum })),
    }));

    const opened = await new SchoolFileService(() => active).openArchive({ path: archive, masterKey: 'unused-legacy-key' });
    expect(opened.school.name).toBe('Archive School');
    const migrated = new Database(active, { readonly: true, fileMustExist: true });
    try {
      expect(migrated.prepare('SELECT first_name,last_name FROM students WHERE id=1').get()).toEqual({ first_name: 'Meera', last_name: 'Archive' });
      expect((migrated.pragma('user_version') as Array<{ user_version: number }>)[0]?.user_version).toBe(SCHEMA_VERSION);
    } finally { migrated.close(); }
  });
});
