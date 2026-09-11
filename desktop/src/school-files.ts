import { createHash, randomUUID } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import Database from "./sqlite";
import { compare, hash } from "bcryptjs";
import { strToU8, unzipSync, zipSync } from "fflate";
import {
  openSchoolInputSchema,
  openSchoolResultSchema,
  saveSchoolResultSchema,
  schoolSummarySchema,
  type OpenSchoolInput,
  type OpenSchoolResult,
  type SaveSchoolResult,
  createSchoolInputSchema,
  type CreateSchoolInput,
} from "./contracts";
import { migrateSchema } from "./schema";

const MAX_ARCHIVE_BYTES = 1_073_741_824;
const MAX_DATABASE_BYTES = 536_870_912;

interface ChecksumFile {
  "school.sqlite"?: string;
}

export class SchoolFileService {
  public constructor(private readonly activeDatabasePath: () => string) {}

  public migrateActiveDatabase(): void {
    const active = this.activeDatabasePath();
    if (!existsSync(active))
      throw new Error("No active school database exists.");
    const database = new Database(active, { fileMustExist: true });
    try {
      migrateSchema(database);
    } finally {
      database.close();
    }
  }

  public async openArchive(input: OpenSchoolInput): Promise<OpenSchoolResult> {
    const request = openSchoolInputSchema.parse(input);
    const archivePath = request.path;
    if (!existsSync(archivePath))
      throw new Error("School file does not exist.");
    if (statSync(archivePath).size > MAX_ARCHIVE_BYTES)
      throw new Error("School file is too large.");

    const files = unzipSync(new Uint8Array(readFileSync(archivePath)), {
      filter: (entry) =>
        (entry.name === "school.sqlite" &&
          entry.originalSize <= MAX_DATABASE_BYTES) ||
        entry.name === "checksum.json",
    });
    const sqlite = files["school.sqlite"];
    if (!sqlite) throw new Error("Archive does not contain school.sqlite.");
    if (sqlite.byteLength > MAX_DATABASE_BYTES)
      throw new Error("School database is too large.");

    const checksum = createHash("sha256").update(sqlite).digest("hex");
    const checksums = this.readChecksums(files["checksum.json"]);
    if (checksums["school.sqlite"] && checksums["school.sqlite"] !== checksum) {
      throw new Error("School file checksum validation failed.");
    }

    const active = this.activeDatabasePath();
    mkdirSync(dirname(active), { recursive: true });
    const candidate = join(
      dirname(active),
      `school.${randomUUID()}.candidate.sqlite`,
    );
    const previous = `${active}.previous`;
    writeFileSync(candidate, sqlite, { flag: "wx" });

    try {
      const school = await this.verifyCandidate(candidate, request.masterKey);
      const migrationDatabase = new Database(candidate, {
        fileMustExist: true,
      });
      try {
        migrateSchema(migrationDatabase);
      } finally {
        migrationDatabase.close();
      }
      rmSync(previous, { force: true });
      if (existsSync(active)) renameSync(active, previous);
      try {
        renameSync(candidate, active);
      } catch (error) {
        if (existsSync(previous)) copyFileSync(previous, active);
        throw error;
      }
      return openSchoolResultSchema.parse({
        opened: archivePath,
        checksum,
        school: { ...school, databasePath: active },
      });
    } finally {
      rmSync(candidate, { force: true });
    }
  }

  public async saveArchive(outputPath: string): Promise<SaveSchoolResult> {
    const active = this.activeDatabasePath();
    if (!existsSync(active))
      throw new Error("No active school database exists.");
    return this.writeArchive(active, outputPath);
  }

  private async writeArchive(
    sourceDatabase: string,
    outputPath: string,
  ): Promise<SaveSchoolResult> {
    mkdirSync(dirname(outputPath), { recursive: true });
    const snapshot = join(
      dirname(sourceDatabase),
      `school.${randomUUID()}.snapshot.sqlite`,
    );
    const archiveCandidate = `${outputPath}.${randomUUID()}.tmp`;
    const database = new Database(sourceDatabase, {
      readonly: true,
      fileMustExist: true,
    });
    try {
      await database.backup(snapshot);
      const sqlite = new Uint8Array(readFileSync(snapshot));
      const checksum = createHash("sha256").update(sqlite).digest("hex");
      const archive = zipSync({
        "manifest.json": strToU8(
          JSON.stringify({
            app: "LEOS",
            schema: 4,
            created: Math.floor(Date.now() / 1000),
            files: ["school.sqlite"],
          }),
        ),
        "school.sqlite": sqlite,
        "checksum.json": strToU8(JSON.stringify({ "school.sqlite": checksum })),
        "media/": new Uint8Array(),
        "documents/": new Uint8Array(),
      });
      writeFileSync(archiveCandidate, archive, { flag: "wx" });
      rmSync(outputPath, { force: true });
      renameSync(archiveCandidate, outputPath);
      return saveSchoolResultSchema.parse({ path: outputPath, checksum });
    } finally {
      database.close();
      rmSync(snapshot, { force: true });
      rmSync(archiveCandidate, { force: true });
    }
  }

  public async createArchive(
    input: CreateSchoolInput,
  ): Promise<OpenSchoolResult> {
    const request = createSchoolInputSchema.parse(input);
    const active = this.activeDatabasePath();
    mkdirSync(dirname(active), { recursive: true });
    const candidate = join(
      dirname(active),
      `school.${randomUUID()}.new.sqlite`,
    );
    const database = new Database(candidate);
    try {
      migrateSchema(database);
      const adminHash = await hash(request.adminPassword, 12);
      const masterHash = await hash(request.masterKey, 12);
      const create = database.transaction(() => {
        database
          .prepare(
            "INSERT INTO schools(name, academic_year, type) VALUES(?, ?, ?)",
          )
          .run(
            request.schoolName,
            request.academicYear,
            request.institutionType,
          );
        database
          .prepare(
            "INSERT INTO users(username, password_hash, role, name, level) VALUES('admin', ?, 'admin', 'Administrator', 1)",
          )
          .run(adminHash);
        database
          .prepare("INSERT INTO meta(key, value) VALUES('master_key_hash', ?)")
          .run(masterHash);
        this.seedConfiguration(database);
      });
      create();
    } finally {
      database.close();
    }

    try {
      await this.writeArchive(candidate, request.path);
      return await this.openArchive({
        path: request.path,
        masterKey: request.masterKey,
      });
    } finally {
      rmSync(candidate, { force: true });
    }
  }

  private seedConfiguration(database: Database.Database): void {
    const modules: Array<[string, string, number]> = [
      ["students", "Students", 3],
      ["staff", "Staff", 2],
      ["courses", "Courses", 2],
      ["subjects", "Subjects", 2],
      ["classes", "Classes", 2],
      ["classrooms", "Classrooms", 2],
      ["teacher-subjects", "Teacher Map", 2],
      ["timetable", "Timetable", 3],
      ["timings", "Timings", 2],
      ["substitution", "Substitution", 2],
      ["attendance", "Attendance", 3],
      ["exams", "Exams", 2],
      ["fees", "Fees", 2],
      ["payroll", "Payroll", 2],
      ["staff-os", "HR & Leave", 2],
      ["events", "Events", 3],
      ["activities", "Activities", 2],
      ["backup", "Backup", 1],
      ["import", "DB Connector", 1],
      ["hardware", "Hardware", 2],
      ["security", "Security", 1],
      ["settings", "Settings", 2],
      ["academic-year", "Academic Year", 2],
      ["floorplan", "Floor Plan", 2],
      ["faculty-planner", "Faculty Planner", 4],
      ["lms", "Learning Management", 5],
      ["tech-admin", "Tech Admin", 1],
    ];
    const insertModule = database.prepare(
      "INSERT INTO module_settings(key, display_name, enabled, min_level) VALUES(?, ?, 1, ?)",
    );
    for (const module of modules) insertModule.run(...module);
    const roles: Array<[string, string]> = [
      ["principal", '{"all":true}'],
      [
        "timetable_coord",
        '{"timetable":true,"substitution":true,"timings":true}',
      ],
      ["exam_coord", '{"exams":true,"students":"read"}'],
      ["class_teacher", '{"attendance":true,"students":"read"}'],
      ["accountant", '{"fees":true,"payroll":true}'],
      ["front_office", '{"students":true,"staff":"read","events":true}'],
      ["read_only", '{"all":"read"}'],
    ];
    const insertRole = database.prepare(
      "INSERT INTO roles(name, permissions) VALUES(?, ?)",
    );
    for (const role of roles) insertRole.run(...role);
  }

  private readChecksums(data: Uint8Array | undefined): ChecksumFile {
    if (!data) return {};
    try {
      return JSON.parse(Buffer.from(data).toString("utf8")) as ChecksumFile;
    } catch {
      throw new Error("Invalid checksum.json in school file.");
    }
  }

  private async verifyCandidate(path: string, masterKey: string) {
    const database = new Database(path, {
      readonly: true,
      fileMustExist: true,
    });
    try {
      const integrity = database
        .prepare("PRAGMA integrity_check")
        .pluck()
        .get();
      if (integrity !== "ok")
        throw new Error("School database integrity check failed.");
      const hash = database
        .prepare("SELECT value FROM meta WHERE key = 'master_key_hash'")
        .pluck()
        .get() as string | undefined;
      if (hash && !(await compare(masterKey, hash)))
        throw new Error("Invalid master key.");
      const row = database
        .prepare(
          "SELECT id, name, academic_year, type FROM schools ORDER BY id LIMIT 1",
        )
        .get() as
        | {
            id: number;
            name: string | null;
            academic_year: string | null;
            type: string | null;
          }
        | undefined;
      if (!row) throw new Error("School database has no school record.");
      return schoolSummarySchema.parse({
        id: row.id,
        name: row.name ?? "School",
        academicYear: row.academic_year,
        institutionType: row.type,
        databasePath: path,
      });
    } finally {
      database.close();
    }
  }
}
