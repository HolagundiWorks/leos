import { z } from "zod";
import Database from "./sqlite";
import type { ApiRequest, ApiResponse } from "./contracts";
import { AuthService } from "./auth";

const configBody = z.object({
  enabled: z.boolean(),
  url: z.string().trim().url().refine((value) => {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && parsed.hostname.endsWith(".supabase.co");
  }, "Use an HTTPS Supabase project URL ending in .supabase.co."),
  anonKey: z.string().trim().min(20).max(4096),
});

export class SupabaseRouter {
  public constructor(
    private readonly databasePath: () => string,
    private readonly auth: AuthService,
    private readonly request: typeof fetch = fetch,
  ) {}

  public async handle(request: ApiRequest, path: string): Promise<ApiResponse | null> {
    if (!path.startsWith("/integrations/supabase")) return null;
    const actor = this.auth.requireLevel(request.token, 1);
    if (request.method === "GET" && path === "/integrations/supabase")
      return this.withDatabase(true, (db) => {
        const config = this.config(db);
        return this.ok({
          enabled: config.enabled,
          url: config.url,
          keyConfigured: !!config.anonKey,
        });
      });
    if (request.method === "POST" && path === "/integrations/supabase") {
      const body = configBody.parse(request.body);
      return this.withDatabase(false, (db) => {
        const write = db.prepare(
          "INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        );
        const tx = db.transaction(() => {
          write.run("supabase_enabled", body.enabled ? "1" : "0");
          write.run("supabase_url", body.url.replace(/\/$/, ""));
          write.run("supabase_anon_key", body.anonKey);
          db.prepare(
            "INSERT INTO audit_log(user_id,action,resource_type,detail) VALUES(?,?,?,?)",
          ).run(actor, "configure", "supabase", body.enabled ? "enabled" : "disabled");
        });
        tx();
        return this.ok({ ok: true });
      });
    }
    if (request.method === "POST" && path === "/integrations/supabase/test") {
      const config = this.withDatabase(true, (db) => this.config(db));
      if (!config.enabled || !config.url || !config.anonKey)
        throw new Error("Configure and enable Supabase first.");
      const response = await this.request(`${config.url}/rest/v1/`, {
        headers: {
          apikey: config.anonKey,
          Authorization: `Bearer ${config.anonKey}`,
        },
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok)
        throw new Error(`Supabase connection failed with HTTP ${response.status}.`);
      return this.ok({ ok: true, status: response.status, connectedAt: new Date().toISOString() });
    }
    return { status: 404, body: { error: "Supabase endpoint not found." } };
  }

  private config(db: Database.Database) {
    const rows = db.prepare(
      "SELECT key,value FROM meta WHERE key IN ('supabase_enabled','supabase_url','supabase_anon_key')",
    ).all() as Array<{ key: string; value: string }>;
    const values = Object.fromEntries(rows.map((row) => [row.key, row.value]));
    return {
      enabled: values.supabase_enabled === "1",
      url: values.supabase_url ?? "",
      anonKey: values.supabase_anon_key ?? "",
    };
  }

  private withDatabase<T>(readonly: boolean, operation: (db: Database.Database) => T): T {
    const db = new Database(this.databasePath(), { readonly, fileMustExist: true });
    try { return operation(db); } finally { db.close(); }
  }
  private ok(body: unknown): ApiResponse { return { status: 200, body }; }
}
