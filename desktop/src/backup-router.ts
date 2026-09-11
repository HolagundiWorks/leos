import { existsSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import Database from "./sqlite";
import { z } from "zod";
import type { ApiRequest, ApiResponse } from "./contracts";
import { AuthService } from "./auth";
import { SchoolFileService } from "./school-files";

const configBody = z.object({
  schedule: z.enum(["manual", "daily", "weekly", "monthly"]),
  destinations: z.array(z.string().trim().min(1)).max(8),
  enabled: z.boolean(),
});
const runBody = z.object({ destination: z.string().trim().min(1) });
const restoreBody = z.object({
  path: z.string().trim().min(1),
  master_key: z.string().min(1),
});

export class BackupRouter {
  private readonly files: SchoolFileService;

  public constructor(
    private readonly databasePath: () => string,
    private readonly auth: AuthService,
  ) {
    this.files = new SchoolFileService(databasePath);
  }

  public async handle(
    request: ApiRequest,
    path: string,
  ): Promise<ApiResponse | null> {
    if (!path.startsWith("/backup/")) return null;
    if (request.source?.startsWith("lan")) {
      throw new Error(
        "Backup and restore are available only on the host computer.",
      );
    }
    this.auth.requireLevel(request.token, 1);

    if (request.method === "GET" && path === "/backup/config") {
      return this.read((database) => {
        const row = database
          .prepare(
            "SELECT schedule,destinations,last_backup_at,enabled FROM backup_config ORDER BY id LIMIT 1",
          )
          .get();
        return this.ok({
          config: row ?? {
            schedule: "daily",
            destinations: "[]",
            last_backup_at: null,
            enabled: 1,
          },
        });
      });
    }

    if (request.method === "POST" && path === "/backup/config") {
      const body = configBody.parse(request.body);
      return this.write((database) => {
        database
          .prepare(
            `INSERT INTO backup_config(id,schedule,destinations,enabled)
             VALUES(1,?,?,?)
             ON CONFLICT(id) DO UPDATE SET schedule=excluded.schedule,
               destinations=excluded.destinations,enabled=excluded.enabled`,
          )
          .run(
            body.schedule,
            JSON.stringify(body.destinations),
            body.enabled ? 1 : 0,
          );
        return this.ok({ ok: true });
      });
    }

    if (request.method === "GET" && path === "/backup/list") {
      return this.read((database) =>
        this.ok({
          backups: database
            .prepare(
              "SELECT id,filename,path,size_bytes,status,created_at FROM backup_log ORDER BY id DESC LIMIT 100",
            )
            .all(),
        }),
      );
    }

    if (request.method === "POST" && path === "/backup/run") {
      const { destination } = runBody.parse(request.body);
      const directory = resolve(destination);
      if (!existsSync(directory) || !statSync(directory).isDirectory()) {
        throw new Error("Backup destination must be an existing directory.");
      }
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const filename = `LEOS-backup-${stamp}.leosdb`;
      const outputPath = join(directory, filename);
      try {
        const saved = await this.files.saveArchive(outputPath);
        const size = statSync(saved.path).size;
        this.write((database) => {
          database
            .prepare(
              "INSERT INTO backup_log(filename,path,size_bytes,status) VALUES(?,?,?,'ok')",
            )
            .run(filename, saved.path, size);
          database
            .prepare(
              `INSERT INTO backup_config(id,last_backup_at) VALUES(1,datetime('now'))
               ON CONFLICT(id) DO UPDATE SET last_backup_at=excluded.last_backup_at`,
            )
            .run();
          return this.ok({});
        });
        return this.ok({
          ok: true,
          filename,
          path: saved.path,
          size_bytes: size,
        });
      } catch (error) {
        this.write((database) => {
          database
            .prepare(
              "INSERT INTO backup_log(filename,path,status) VALUES(?,?,'failed')",
            )
            .run(filename, outputPath);
          return this.ok({});
        });
        throw error;
      }
    }

    if (request.method === "POST" && path === "/backup/restore") {
      const body = restoreBody.parse(request.body);
      const restored = await this.files.openArchive({
        path: resolve(body.path),
        masterKey: body.master_key,
      });
      this.auth.acceptVerifiedSchool();
      return this.ok({
        ok: true,
        restored_from: basename(restored.opened),
        requires_relogin: true,
      });
    }

    return { status: 404, body: { error: "Backup endpoint not found." } };
  }

  private read<T>(operation: (database: Database.Database) => T): T {
    const database = new Database(this.databasePath(), {
      readonly: true,
      fileMustExist: true,
    });
    try {
      return operation(database);
    } finally {
      database.close();
    }
  }

  private write<T>(operation: (database: Database.Database) => T): T {
    const database = new Database(this.databasePath(), { fileMustExist: true });
    try {
      return operation(database);
    } finally {
      database.close();
    }
  }

  private ok(body: unknown): ApiResponse {
    return { status: 200, body };
  }
}
