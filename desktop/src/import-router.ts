import { createHash, randomUUID } from "node:crypto";
import {
  existsSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Database from "./sqlite";
import { unzipSync } from "fflate";
import { z } from "zod";
import type { ApiRequest, ApiResponse } from "./contracts";
import { AuthService } from "./auth";

const STUDENT_COLUMNS = [
  "first_name",
  "middle_name",
  "last_name",
  "email",
  "phone",
  "gender",
  "birthdate",
  "alt_id",
  "enrolled",
  "guardian_name",
  "guardian_phone",
  "guardian_relation",
  "address",
] as const;
const STAFF_COLUMNS = [
  "first_name",
  "last_name",
  "email",
  "phone",
  "profile",
  "title",
  "department",
  "join_date",
  "employee_id",
] as const;
const TABLE_COLUMNS = {
  students: STUDENT_COLUMNS,
  staff: STAFF_COLUMNS,
  courses: ["name"],
  subjects: [
    "course_id",
    "name",
    "code",
    "type",
    "weekly_periods",
    "is_lab",
    "mandatory",
  ],
} as const;
type Row = Record<string, unknown>;

const fileBody = z.object({ path: z.string().trim().min(1) });
const csvBody = fileBody.extend({ target: z.enum(["students", "staff"]) });
const sqliteBody = fileBody.extend({
  tables: z
    .array(z.enum(["students", "staff", "courses", "subjects"]))
    .min(1)
    .max(4),
});
const operation = z.object({
  action: z.enum(["insert", "update"]),
  id: z.number().int().positive().optional(),
  data: z.record(z.unknown()),
});
const mergeBody = z.object({
  students: z.array(operation).max(5000).default([]),
  staff: z.array(operation).max(5000).default([]),
});

export class ImportRouter {
  public constructor(
    private readonly databasePath: () => string,
    private readonly auth: AuthService,
  ) {}

  public handle(request: ApiRequest, path: string): ApiResponse | null {
    if (!path.startsWith("/import/")) return null;
    if (request.source?.startsWith("lan"))
      throw new Error("Data import is available only on the host computer.");
    const userId = this.auth.requireLevel(request.token, 1);
    if (request.method === "GET" && path === "/import/jobs")
      return this.withDb(true, (db) =>
        this.ok({
          jobs: db
            .prepare(
              "SELECT id,source_type,source_path,status,rows_imported,rows_failed,error,started_at,completed_at,created_at FROM import_jobs ORDER BY id DESC LIMIT 50",
            )
            .all(),
        }),
      );
    if (request.method === "POST" && path === "/import/csv")
      return this.importCsv(csvBody.parse(request.body));
    if (request.method === "POST" && path === "/import/sqlite")
      return this.importSqlite(sqliteBody.parse(request.body));
    if (request.method === "POST" && path === "/import/merge/preview")
      return this.preview(fileBody.parse(request.body).path);
    if (request.method === "POST" && path === "/import/merge/apply")
      return this.applyMerge(mergeBody.parse(request.body), userId);
    return { status: 404, body: { error: "Import endpoint not found." } };
  }

  private importCsv(input: z.infer<typeof csvBody>): ApiResponse {
    const path = this.requireFile(input.path, ".csv");
    const job = this.startJob("csv", path);
    try {
      const rows = parseCsv(readFileSync(path, "utf8"));
      if (!rows.length) throw new Error("CSV file has no data rows.");
      let imported = 0,
        failed = 0;
      this.withDb(false, (db) =>
        db.transaction(() => {
          for (const source of rows) {
            try {
              const first = source.first_name || source.firstname;
              const last = source.last_name || source.lastname;
              if (!first || !last) {
                failed++;
                continue;
              }
              const email = source.email || null;
              if (
                email &&
                db
                  .prepare(
                    `SELECT 1 FROM ${input.target} WHERE lower(email)=lower(?)`,
                  )
                  .get(email)
              ) {
                failed++;
                continue;
              }
              if (input.target === "students")
                db.prepare(
                  "INSERT INTO students(first_name,last_name,email,phone,gender,birthdate) VALUES(?,?,?,?,?,?)",
                ).run(
                  first,
                  last,
                  email,
                  source.phone || null,
                  source.gender || null,
                  source.birthdate || source.dob || null,
                );
              else
                db.prepare(
                  "INSERT INTO staff(first_name,last_name,email,phone,profile) VALUES(?,?,?,?,?)",
                ).run(
                  first,
                  last,
                  email,
                  source.phone || null,
                  source.profile || source.role || null,
                );
              imported++;
            } catch {
              failed++;
            }
          }
        })(),
      );
      this.finishJob(job, imported, failed);
      return this.ok({
        ok: true,
        job_id: job,
        rows_imported: imported,
        rows_failed: failed,
      });
    } catch (error) {
      this.failJob(job, error);
      throw error;
    }
  }

  private importSqlite(input: z.infer<typeof sqliteBody>): ApiResponse {
    const staged = this.stage(input.path);
    const job = this.startJob("sqlite", input.path);
    try {
      const source = new Database(staged.path, {
        readonly: true,
        fileMustExist: true,
      });
      let imported = 0;
      try {
        this.withDb(false, (target) =>
          target.transaction(() => {
            for (const table of input.tables) {
              if (!this.hasTable(source, table)) continue;
              const columns = this.commonColumns(
                target,
                source,
                table,
                TABLE_COLUMNS[table],
              );
              if (!columns.length) continue;
              const read = source.prepare(
                `SELECT ${columns.join(",")} FROM ${table}`,
              );
              const insert = target.prepare(
                `INSERT OR IGNORE INTO ${table}(${columns.join(",")}) VALUES(${columns.map(() => "?").join(",")})`,
              );
              for (const row of read.iterate() as Iterable<Row>)
                imported += insert.run(
                  ...columns.map((column) => row[column] ?? null),
                ).changes;
            }
          })(),
        );
      } finally {
        source.close();
      }
      this.finishJob(job, imported, 0);
      return this.ok({ ok: true, job_id: job, rows_imported: imported });
    } catch (error) {
      this.failJob(job, error);
      throw error;
    } finally {
      staged.cleanup();
    }
  }

  private preview(inputPath: string): ApiResponse {
    const staged = this.stage(inputPath);
    try {
      const incoming = new Database(staged.path, {
        readonly: true,
        fileMustExist: true,
      });
      try {
        return this.withDb(true, (current) => {
          const students = this.classify(
            current,
            incoming,
            "students",
            STUDENT_COLUMNS,
          );
          const staff = this.classify(
            current,
            incoming,
            "staff",
            STAFF_COLUMNS,
          );
          return this.ok({
            students,
            staff,
            summary: { students: counts(students), staff: counts(staff) },
          });
        });
      } finally {
        incoming.close();
      }
    } finally {
      staged.cleanup();
    }
  }

  private applyMerge(
    body: z.infer<typeof mergeBody>,
    userId: number,
  ): ApiResponse {
    const job = this.startJob("merge", "reconcile");
    try {
      let inserted = 0,
        updated = 0;
      this.withDb(false, (db) =>
        db.transaction(() => {
          const apply = (
            table: "students" | "staff",
            ops: z.infer<typeof operation>[],
            allowed: readonly string[],
          ) => {
            const present = this.presentColumns(db, table, allowed);
            for (const op of ops) {
              const columns = present.filter((column) =>
                Object.hasOwn(op.data, column),
              );
              if (!columns.length) continue;
              const values = columns.map((column) =>
                normalize(op.data[column], column),
              );
              if (op.action === "insert") {
                const result = db
                  .prepare(
                    `INSERT INTO ${table}(${columns.join(",")}) VALUES(${columns.map(() => "?").join(",")})`,
                  )
                  .run(...values);
                inserted += result.changes;
                this.audit(
                  db,
                  userId,
                  "merge_insert",
                  table,
                  Number(result.lastInsertRowid),
                );
              } else {
                if (!op.id) throw new Error("Merge update requires an id.");
                const result = db
                  .prepare(
                    `UPDATE ${table} SET ${columns.map((column) => `${column}=?`).join(",")} WHERE id=?`,
                  )
                  .run(...values, op.id);
                updated += result.changes;
                if (result.changes)
                  this.audit(db, userId, "merge_update", table, op.id);
              }
            }
          };
          apply("students", body.students, STUDENT_COLUMNS);
          apply("staff", body.staff, STAFF_COLUMNS);
        })(),
      );
      this.finishJob(
        job,
        inserted + updated,
        0,
        `${inserted} inserted, ${updated} updated`,
      );
      return this.ok({ ok: true, job_id: job, inserted, updated });
    } catch (error) {
      this.failJob(job, error);
      throw error;
    }
  }

  private classify(
    current: Database.Database,
    incoming: Database.Database,
    table: "students" | "staff",
    wanted: readonly string[],
  ) {
    if (!this.hasTable(incoming, table)) return [];
    const columns = this.commonColumns(current, incoming, table, wanted);
    const existing = current
      .prepare(`SELECT id,${columns.join(",")} FROM ${table}`)
      .all() as Row[];
    const external = incoming
      .prepare(`SELECT id,${columns.join(",")} FROM ${table}`)
      .all() as Row[];
    const index = new Map<string, Row>();
    for (const row of existing)
      for (const key of naturalKeys(table, row))
        if (!index.has(key)) index.set(key, row);
    return external.map((row) => {
      const match =
        naturalKeys(table, row)
          .map((key) => index.get(key))
          .find(Boolean) ?? null;
      const clean = Object.fromEntries(
        columns.map((column) => [column, row[column] ?? null]),
      );
      if (!match)
        return { action: "new", incoming: clean, existing: null, diffs: [] };
      const diffs = columns.filter(
        (column) => norm(match[column]) !== norm(row[column]),
      );
      return {
        action: diffs.length ? "conflict" : "duplicate",
        incoming: clean,
        existing: match,
        diffs,
      };
    });
  }

  private stage(inputPath: string) {
    const path = this.requireFile(inputPath);
    if (!path.toLowerCase().endsWith(".leosdb"))
      return { path, cleanup: () => undefined };
    if (statSync(path).size > 1_073_741_824)
      throw new Error("School file is too large.");
    const files = unzipSync(new Uint8Array(readFileSync(path)), {
      filter: (entry) =>
        entry.name === "school.sqlite" || entry.name === "checksum.json",
    });
    const sqlite = files["school.sqlite"];
    if (!sqlite || sqlite.byteLength > 536_870_912)
      throw new Error("Archive does not contain a valid school.sqlite.");
    const checksums = files["checksum.json"]
      ? (JSON.parse(
          Buffer.from(files["checksum.json"]).toString("utf8"),
        ) as Record<string, string>)
      : {};
    const actual = createHash("sha256").update(sqlite).digest("hex");
    if (checksums["school.sqlite"] && checksums["school.sqlite"] !== actual)
      throw new Error("School file checksum validation failed.");
    const staged = join(tmpdir(), `leos-import-${randomUUID()}.sqlite`);
    writeFileSync(staged, sqlite, { flag: "wx" });
    return { path: staged, cleanup: () => rmSync(staged, { force: true }) };
  }

  private requireFile(input: string, extension?: string) {
    const path = input.trim();
    if (!existsSync(path) || !statSync(path).isFile())
      throw new Error("Import file does not exist.");
    if (extension && !path.toLowerCase().endsWith(extension))
      throw new Error(`Expected a ${extension} file.`);
    return path;
  }
  private hasTable(db: Database.Database, table: string) {
    return !!db
      .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?")
      .get(table);
  }
  private presentColumns(
    db: Database.Database,
    table: string,
    wanted: readonly string[],
  ) {
    const have = new Set(
      (
        db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
      ).map((row) => row.name),
    );
    return wanted.filter((column) => have.has(column));
  }
  private commonColumns(
    a: Database.Database,
    b: Database.Database,
    table: string,
    wanted: readonly string[],
  ) {
    const left = new Set(this.presentColumns(a, table, wanted));
    return this.presentColumns(b, table, wanted).filter((column) =>
      left.has(column),
    );
  }
  private startJob(type: string, path: string) {
    return this.withDb(false, (db) =>
      Number(
        db
          .prepare(
            "INSERT INTO import_jobs(source_type,source_path,status,started_at) VALUES(?,?,'running',datetime('now'))",
          )
          .run(type, path).lastInsertRowid,
      ),
    );
  }
  private finishJob(
    id: number,
    imported: number,
    failed: number,
    detail?: string,
  ) {
    this.withDb(false, (db) =>
      db
        .prepare(
          "UPDATE import_jobs SET status='completed',rows_imported=?,rows_failed=?,error=?,completed_at=datetime('now') WHERE id=?",
        )
        .run(imported, failed, detail ?? null, id),
    );
  }
  private failJob(id: number, error: unknown) {
    this.withDb(false, (db) =>
      db
        .prepare(
          "UPDATE import_jobs SET status='error',error=?,completed_at=datetime('now') WHERE id=?",
        )
        .run(error instanceof Error ? error.message : String(error), id),
    );
  }
  private audit(
    db: Database.Database,
    userId: number,
    action: string,
    resource: string,
    id: number,
  ) {
    db.prepare(
      "INSERT INTO audit_log(user_id,action,resource_type,resource_id,detail) VALUES(?,?,?,?,?)",
    ).run(userId, action, resource, id, "imported from school file");
  }
  private withDb<T>(
    readonly: boolean,
    operation: (db: Database.Database) => T,
  ): T {
    const db = new Database(this.databasePath(), {
      readonly,
      fileMustExist: true,
    });
    try {
      return operation(db);
    } finally {
      db.close();
    }
  }
  private ok(body: unknown): ApiResponse {
    return { status: 200, body };
  }
}

function norm(value: unknown) {
  return value == null ? "" : String(value).trim();
}
function normalize(value: unknown, column: string) {
  if (value === "" || value == null) return null;
  if (
    ["enrolled", "weekly_periods", "is_lab", "mandatory", "course_id"].includes(
      column,
    )
  )
    return typeof value === "boolean" ? Number(value) : Number(value);
  return typeof value === "object" ? null : value;
}
function naturalKeys(table: "students" | "staff", row: Row) {
  const lower = (key: string) => norm(row[key]).toLowerCase();
  const keys: string[] = [];
  if (table === "students") {
    if (lower("alt_id")) keys.push(`alt:${lower("alt_id")}`);
    if (lower("email")) keys.push(`email:${lower("email")}`);
    keys.push(
      `ndob:${lower("first_name")}|${lower("last_name")}|${norm(row.birthdate)}`,
    );
  } else {
    if (lower("employee_id")) keys.push(`emp:${lower("employee_id")}`);
    if (lower("email")) keys.push(`email:${lower("email")}`);
    keys.push(`name:${lower("first_name")}|${lower("last_name")}`);
  }
  return keys;
}
function counts(rows: { action: string }[]) {
  return {
    new: rows.filter((row) => row.action === "new").length,
    conflict: rows.filter((row) => row.action === "conflict").length,
    duplicate: rows.filter((row) => row.action === "duplicate").length,
    total: rows.length,
  };
}
function parseCsv(text: string): Record<string, string>[] {
  const records: string[][] = [];
  let row: string[] = [],
    field = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted && char === '"' && text[i + 1] === '"') {
      field += '"';
      i++;
    } else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((v) => v.trim())) records.push(row);
      row = [];
      field = "";
    } else field += char;
  }
  row.push(field);
  if (row.some((v) => v.trim())) records.push(row);
  if (!records.length) return [];
  const headers = records.shift()!.map((value) =>
    value
      .replace(/^\uFEFF/, "")
      .trim()
      .toLowerCase(),
  );
  return records.map((values) =>
    Object.fromEntries(
      headers.map((header, index) => [header, (values[index] ?? "").trim()]),
    ),
  );
}
