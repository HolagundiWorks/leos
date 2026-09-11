// Isolated HTTP adapter around the TypeScript router used by Electron.
import { createServer, type Server } from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { hash } from 'bcryptjs';
import * as SQLiteModule from '../../desktop/src/sqlite';
import { migrateSchema } from '../../desktop/src/schema';
import { AuthService } from '../../desktop/src/auth';
import { ApiRouter } from '../../desktop/src/api-router';
import { ADMIN_PASS, ADMIN_USER, MASTER_KEY } from './env';

// Playwright and Vitest transpile global setup through different CJS/ESM
// interop paths, so unwrap either shape explicitly.
const Database = ((SQLiteModule as any).default?.default ?? (SQLiteModule as any).default) as typeof import('../../desktop/src/sqlite').default;

export interface TestServer { baseUrl: string; dataDir: string; dbPath: string; stop: () => Promise<void> }

async function seed(dbPath: string): Promise<void> {
  const db = new Database(dbPath);
  try {
    migrateSchema(db);
    const adminHash = await hash(ADMIN_PASS, 4);
    const masterHash = await hash(MASTER_KEY, 4);
    db.transaction(() => {
      db.prepare('INSERT INTO schools(name,academic_year,type) VALUES(?,?,?)').run('LEOS Test School', '2026-27', 'school');
      db.prepare('INSERT INTO users(username,password_hash,role,name,level) VALUES(?,?,?,?,1)').run(ADMIN_USER, adminHash, 'admin', 'Administrator');
      db.prepare("INSERT INTO meta(key,value) VALUES('master_key_hash',?)").run(masterHash);
      db.prepare("INSERT INTO students(first_name,last_name,email,enrolled,gender,category,birthdate) VALUES('Asha','Demo','asha@example.test',1,'Female','General','2015-04-10')").run();
      db.prepare("INSERT INTO staff(first_name,last_name,email,profile,title) VALUES('Dev','Teacher','teacher@example.test','teacher','Teacher')").run();
      db.prepare("INSERT INTO courses(name) VALUES('Primary')").run();
      db.prepare("INSERT INTO subjects(course_id,name,code,weekly_periods) VALUES(1,'Mathematics','MATH',5)").run();
      db.prepare("INSERT INTO classes(name,grade_level,course_id) VALUES('Grade 1','1',1)").run();
      db.prepare("INSERT INTO classrooms(name,code,capacity) VALUES('Room 1','R1',40)").run();
      db.prepare("INSERT INTO sections(class_id,name,teacher_id,capacity,room_id) VALUES(1,'A',1,40,1)").run();
      db.prepare("INSERT INTO section_students(section_id,student_id) VALUES(1,1)").run();
    })();
  } finally { db.close(); }
}

function readBody(request: import('node:http').IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    request.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > 10 * 1024 * 1024) { reject(new Error('Request body is too large')); request.destroy(); }
      else chunks.push(chunk);
    });
    request.on('end', () => {
      if (!chunks.length) return resolve(undefined);
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(new Error('Invalid JSON body')); }
    });
    request.on('error', reject);
  });
}

export async function startTestServer(port: number): Promise<TestServer> {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), `leos-test-${port}-`));
  const dbPath = path.join(dataDir, 'school.sqlite');
  await seed(dbPath);
  const auth = new AuthService(() => dbPath);
  auth.acceptVerifiedSchool();
  const router = new ApiRouter(() => dbPath, auth);
  const server: Server = createServer(async (request, response) => {
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    if (request.method === 'OPTIONS') { response.writeHead(204).end(); return; }
    try {
      const token = request.headers.authorization?.replace(/^Bearer\s+/i, '') ?? null;
      const result = await router.handle({
        method: (request.method ?? 'GET') as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
        path: request.url ?? '/', token, body: await readBody(request),
      });
      response.writeHead(result.status, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(result.body));
    } catch (error) {
      response.writeHead(500, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
    }
  });
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  return {
    baseUrl: `http://127.0.0.1:${port}`, dataDir, dbPath,
    stop: () => new Promise<void>((resolve) => server.close(() => { fs.rmSync(dataDir, { recursive: true, force: true }); resolve(); })),
  };
}
