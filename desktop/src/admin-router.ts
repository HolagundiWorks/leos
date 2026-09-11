import { statSync } from "node:fs";
import Database from "./sqlite";
import { z } from "zod";
import type { ApiRequest, ApiResponse } from "./contracts";
import { AuthService } from "./auth";

const levelBody = z.object({ level: z.number().int().min(1).max(5) });
const roleBody = z.object({ permissions: z.record(z.unknown()) });

export class AdminRouter {
  public constructor(
    private readonly databasePath: () => string,
    private readonly auth: AuthService,
  ) {}
  public handle(request: ApiRequest, url: URL): ApiResponse | null {
    const path = url.pathname;
    if (
      !path.startsWith("/admin/") &&
      path !== "/audit-log" &&
      path !== "/roles" &&
      !/^\/roles\/\d+\/update$/.test(path)
    )
      return null;
    const userId = this.auth.requireLevel(request.token, 1);
    if (request.method === "GET" && path === "/admin/system-info")
      return this.read((db) =>
        this.ok({
          users: this.count(db, "users"),
          students: this.count(db, "students"),
          staff: this.count(db, "staff"),
          db_size_kb: Math.ceil(statSync(this.databasePath()).size / 1024),
          last_backup:
            db
              .prepare(
                "SELECT last_backup_at FROM backup_config ORDER BY id LIMIT 1",
              )
              .pluck()
              .get() ?? null,
          server_version: "typescript-electron-0.1.0",
        }),
      );
    if (request.method === "GET" && path === "/admin/modules")
      return this.read((db) =>
        this.ok({
          modules: db
            .prepare(
              "SELECT key,display_name,enabled,min_level FROM module_settings ORDER BY display_name",
            )
            .all(),
        }),
      );
    const moduleMatch = path.match(/^\/admin\/modules\/([a-z0-9-]+)\/toggle$/);
    if (request.method === "POST" && moduleMatch)
      return this.write((db) => {
        const result = db
          .prepare(
            "UPDATE module_settings SET enabled=CASE enabled WHEN 1 THEN 0 ELSE 1 END WHERE key=?",
          )
          .run(moduleMatch[1]);
        if (!result.changes)
          return { status: 404, body: { error: "Module not found." } };
        this.audit(
          db,
          userId,
          "toggle",
          "module_settings",
          null,
          moduleMatch[1]!,
        );
        return this.ok({
          ok: true,
          enabled: !!db
            .prepare("SELECT enabled FROM module_settings WHERE key=?")
            .pluck()
            .get(moduleMatch[1]),
        });
      });
    if (request.method === "GET" && path === "/admin/users/levels")
      return this.read((db) =>
        this.ok({
          users: db
            .prepare(
              "SELECT u.id,u.username,u.name,u.role AS profile,COALESCE(u.level,5) AS level,r.name AS role_name FROM users u LEFT JOIN roles r ON r.name=u.role ORDER BY level,u.name,u.username",
            )
            .all(),
        }),
      );
    const userMatch = path.match(/^\/admin\/users\/(\d+)\/level$/);
    if (request.method === "POST" && userMatch) {
      const body = levelBody.parse(request.body);
      const target = Number(userMatch[1]);
      return this.write((db) =>
        db.transaction(() => {
          const current = db
            .prepare("SELECT level FROM users WHERE id=?")
            .pluck()
            .get(target) as number | undefined;
          if (current == null)
            return { status: 404, body: { error: "User not found." } };
          if (current === 1 && body.level !== 1 && this.levelOneCount(db) <= 1)
            throw new Error("The final L1 administrator cannot be demoted.");
          db.prepare("UPDATE users SET level=? WHERE id=?").run(
            body.level,
            target,
          );
          this.audit(
            db,
            userId,
            "set_level",
            "users",
            target,
            `L${body.level}`,
          );
          return this.ok({ ok: true, level: body.level });
        })(),
      );
    }
    if (request.method === "GET" && path === "/audit-log") {
      const resource = url.searchParams.get("resource");
      const limit = Math.min(
        500,
        Math.max(1, Number(url.searchParams.get("limit") ?? 100)),
      );
      return this.read((db) =>
        this.ok({
          audit_log: db
            .prepare(
              "SELECT a.id,a.user_id,u.username,a.action,a.resource_type,a.resource_id,a.detail,a.ip,a.created_at FROM audit_log a LEFT JOIN users u ON u.id=a.user_id WHERE (? IS NULL OR a.resource_type=?) ORDER BY a.id DESC LIMIT ?",
            )
            .all(resource, resource, limit),
        }),
      );
    }
    if (request.method === "GET" && path === "/roles")
      return this.read((db) =>
        this.ok({
          roles: db
            .prepare("SELECT id,name,permissions FROM roles ORDER BY name")
            .all(),
        }),
      );
    const roleMatch = path.match(/^\/roles\/(\d+)\/update$/);
    if (request.method === "POST" && roleMatch) {
      const body = roleBody.parse(request.body);
      return this.write((db) => {
        const id = Number(roleMatch[1]);
        const result = db
          .prepare("UPDATE roles SET permissions=? WHERE id=?")
          .run(JSON.stringify(body.permissions), id);
        if (!result.changes)
          return { status: 404, body: { error: "Role not found." } };
        this.audit(db, userId, "update", "roles", id, null);
        return this.ok({ ok: true });
      });
    }
    return {
      status: 404,
      body: { error: "Administration endpoint not found." },
    };
  }
  private count(db: Database.Database, table: string) {
    return Number(db.prepare(`SELECT count(*) FROM ${table}`).pluck().get());
  }
  private levelOneCount(db: Database.Database) {
    return Number(
      db
        .prepare("SELECT count(*) FROM users WHERE COALESCE(level,5)=1")
        .pluck()
        .get(),
    );
  }
  private audit(
    db: Database.Database,
    userId: number,
    action: string,
    resource: string,
    resourceId: number | null,
    detail: string | null,
  ) {
    db.prepare(
      "INSERT INTO audit_log(user_id,action,resource_type,resource_id,detail) VALUES(?,?,?,?,?)",
    ).run(userId, action, resource, resourceId, detail);
  }
  private read<T>(fn: (db: Database.Database) => T): T {
    const db = new Database(this.databasePath(), {
      readonly: true,
      fileMustExist: true,
    });
    try {
      return fn(db);
    } finally {
      db.close();
    }
  }
  private write<T>(fn: (db: Database.Database) => T): T {
    const db = new Database(this.databasePath(), { fileMustExist: true });
    try {
      return fn(db);
    } finally {
      db.close();
    }
  }
  private ok(body: unknown): ApiResponse {
    return { status: 200, body };
  }
}
