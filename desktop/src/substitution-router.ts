import Database from "./sqlite";
import { z } from "zod";
import type { ApiRequest, ApiResponse } from "./contracts";
import { AuthService } from "./auth";
const id = z.number().int().positive();
const absent = z.object({
  staff_id: id,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  day_of_week: z.number().int().min(0).max(6),
  reason: z.string().max(500).optional(),
});
const assign = z.object({ substitution_id: id, substitute_staff_id: id });
const resolve = z.object({ substitution_id: id });
export class SubstitutionRouter {
  public constructor(
    private readonly databasePath: () => string,
    private readonly auth: AuthService,
  ) {}
  public handle(r: ApiRequest, url: URL): ApiResponse | null {
    const p = url.pathname;
    if (!p.startsWith("/substitutions")) return null;
    const a = this.auth.accountContext(r.token);
    if (a.level > 3) throw new Error("Insufficient privileges.");
    if (r.method === "GET" && p === "/substitutions") {
      const date = url.searchParams.get("date"),
        status = url.searchParams.get("status");
      return this.read((d) => {
        const rows = d
          .prepare(
            `SELECT s.*,te.period_id,te.day_of_week,te.section_id,su.name subject_name,su.code subject_code,trim(coalesce(o.first_name,'')||' '||coalesce(o.last_name,'')) original_teacher,trim(coalesce(x.first_name,'')||' '||coalesce(x.last_name,'')) substitute_teacher,se.name section_name,c.name class_name FROM substitutions s JOIN timetable_entries te ON te.id=s.original_entry_id LEFT JOIN subjects su ON su.id=te.subject_id JOIN staff o ON o.id=s.original_staff_id LEFT JOIN staff x ON x.id=s.substitute_staff_id JOIN sections se ON se.id=te.section_id JOIN classes c ON c.id=se.class_id WHERE (? IS NULL OR s.date=?) AND (? IS NULL OR s.status=?) ORDER BY s.date DESC,s.id DESC`,
          )
          .all(date, date, status, status);
        return this.ok({ substitutions: rows, total: rows.length });
      });
    }
    if (r.method === "POST" && p === "/substitutions/mark-absent") {
      const b = absent.parse(r.body);
      return this.write((d) =>
        d.transaction(() => {
          const entries = d
            .prepare(
              "SELECT id FROM timetable_entries WHERE staff_id=? AND day_of_week=?",
            )
            .all(b.staff_id, b.day_of_week) as { id: number }[];
          const insert = d.prepare(
            "INSERT OR IGNORE INTO substitutions(original_entry_id,original_staff_id,date,reason,status) VALUES(?,?,?,?,'pending')",
          );
          let created = 0;
          for (const e of entries)
            created += insert.run(
              e.id,
              b.staff_id,
              b.date,
              b.reason ?? null,
            ).changes;
          this.audit(
            d,
            a.id,
            "mark_absent",
            b.staff_id,
            `${b.date}: ${created} slot(s)`,
          );
          return this.ok({
            ok: true,
            created,
            date: b.date,
            staff_id: b.staff_id,
            message: created
              ? undefined
              : "No timetable slots found for this teacher on that day",
          });
        })(),
      );
    }
    if (r.method === "GET" && p === "/substitutions/suggestions") {
      const subId = id.parse(Number(url.searchParams.get("substitution_id")));
      return this.read((d) => {
        const rows = d
          .prepare(
            `SELECT DISTINCT st.id staff_id,trim(coalesce(st.first_name,'')||' '||coalesce(st.last_name,'')) name,st.profile FROM substitutions s JOIN timetable_entries te ON te.id=s.original_entry_id JOIN teacher_subjects ts ON ts.subject_id=te.subject_id JOIN staff st ON st.id=ts.staff_id WHERE s.id=? AND st.id<>s.original_staff_id AND st.id NOT IN(SELECT staff_id FROM timetable_entries WHERE period_id=te.period_id AND day_of_week=te.day_of_week AND staff_id IS NOT NULL) AND st.id NOT IN(SELECT original_staff_id FROM substitutions WHERE date=s.date AND status<>'resolved') ORDER BY ts.priority,st.first_name`,
          )
          .all(subId);
        return this.ok({ suggestions: rows, total: rows.length });
      });
    }
    if (r.method === "POST" && p === "/substitutions/assign") {
      const b = assign.parse(r.body);
      return this.write((d) =>
        d.transaction(() => {
          const sub = d
            .prepare(
              "SELECT s.id,s.original_staff_id,s.date,te.period_id,te.day_of_week,te.subject_id FROM substitutions s JOIN timetable_entries te ON te.id=s.original_entry_id WHERE s.id=? AND s.status='pending'",
            )
            .get(b.substitution_id) as any;
          if (!sub) return this.notFound();
          const mapped = d
            .prepare(
              "SELECT 1 FROM teacher_subjects WHERE staff_id=? AND subject_id=?",
            )
            .get(b.substitute_staff_id, sub.subject_id);
          if (!mapped)
            throw new Error("Selected teacher is not mapped to this subject.");
          const busy = d
            .prepare(
              "SELECT 1 FROM timetable_entries WHERE staff_id=? AND period_id=? AND day_of_week=?",
            )
            .get(b.substitute_staff_id, sub.period_id, sub.day_of_week);
          if (busy)
            throw new Error(
              "Selected teacher is already scheduled in this period.",
            );
          d.prepare(
            "UPDATE substitutions SET substitute_staff_id=?,status='assigned' WHERE id=?",
          ).run(b.substitute_staff_id, b.substitution_id);
          this.audit(
            d,
            a.id,
            "assign",
            b.substitution_id,
            String(b.substitute_staff_id),
          );
          return this.ok({ ok: true });
        })(),
      );
    }
    if (r.method === "POST" && p === "/substitutions/resolve") {
      const b = resolve.parse(r.body);
      return this.write((d) => {
        const x = d
          .prepare(
            "UPDATE substitutions SET status='resolved',resolved_at=datetime('now') WHERE id=? AND status<>'resolved'",
          )
          .run(b.substitution_id);
        if (!x.changes) return this.notFound();
        this.audit(d, a.id, "resolve", b.substitution_id, null);
        return this.ok({ ok: true });
      });
    }
    return { status: 404, body: { error: "Substitution endpoint not found." } };
  }
  private audit(
    d: Database.Database,
    u: number,
    action: string,
    id: number,
    detail: string | null,
  ) {
    d.prepare(
      "INSERT INTO audit_log(user_id,action,resource_type,resource_id,detail) VALUES(?,?,'substitutions',?,?)",
    ).run(u, action, id, detail);
  }
  private read<T>(f: (d: Database.Database) => T) {
    const d = new Database(this.databasePath(), {
      readonly: true,
      fileMustExist: true,
    });
    try {
      return f(d);
    } finally {
      d.close();
    }
  }
  private write<T>(f: (d: Database.Database) => T) {
    const d = new Database(this.databasePath(), { fileMustExist: true });
    try {
      return f(d);
    } finally {
      d.close();
    }
  }
  private ok(body: unknown): ApiResponse {
    return { status: 200, body };
  }
  private notFound(): ApiResponse {
    return {
      status: 404,
      body: { error: "Substitution not found or already resolved." },
    };
  }
}
