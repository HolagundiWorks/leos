import Database from "./sqlite";
import { z } from "zod";
import {
  apiResponseSchema,
  type ApiRequest,
  type ApiResponse,
} from "./contracts";
import { AuthService, type AccountContext } from "./auth";

const id = z.number().int().positive();
const department = z.object({
  name: z.string().trim().min(1),
  head_staff_id: id.nullable().optional(),
});
const leave = z
  .object({
    staff_id: id,
    leave_type: z.string().trim().min(1),
    from_date: z.string().min(1),
    to_date: z.string().min(1),
    reason: z.string().nullable().optional(),
  })
  .refine((v) => v.to_date >= v.from_date, {
    message: "to_date must be on or after from_date",
  });
const idBody = z.object({ id });

export class StaffOpsRouter {
  public constructor(
    private readonly databasePath: () => string,
    private readonly auth: AuthService,
  ) {}
  public handle(r: ApiRequest, u: URL): ApiResponse | null {
    const p = u.pathname;
    if (!/^\/(departments|leave)/.test(p)) return null;
    const a = this.auth.accountContext(r.token);
    if (a.level > 2) throw new Error("Insufficient privileges.");
    if (r.method === "GET" && p === "/departments") return this.departments();
    if (r.method === "POST" && p === "/departments")
      return this.createDepartment(r, a);
    if (r.method === "POST" && /^\/departments\/\d+\/delete$/.test(p))
      return this.deleteDepartment(Number(p.split("/")[2]), a);
    if (r.method === "GET" && p === "/leave") return this.leaveList(u);
    if (r.method === "POST" && p === "/leave") return this.createLeave(r, a);
    if (r.method === "POST" && p === "/leave/approve")
      return this.decideLeave(r, a, true);
    if (r.method === "POST" && p === "/leave/reject")
      return this.decideLeave(r, a, false);
    return this.response(404, {
      error: `Staff operations endpoint not found: ${r.method} ${p}`,
    });
  }
  private departments() {
    return this.read((d) => {
      const rows = d
        .prepare(
          `SELECT d.id,d.name,d.head_staff_id,TRIM(COALESCE(h.first_name,'')||' '||COALESCE(h.last_name,'')) head_name,COUNT(s.id) staff_count FROM departments d LEFT JOIN staff h ON h.id=d.head_staff_id LEFT JOIN staff s ON s.department_id=d.id GROUP BY d.id ORDER BY d.name`,
        )
        .all();
      return this.ok({ departments: rows, total: rows.length });
    });
  }
  private createDepartment(r: ApiRequest, a: AccountContext) {
    const b = department.parse(r.body);
    return this.write((d) => {
      const x = d
        .prepare("INSERT INTO departments(name,head_staff_id) VALUES(?,?)")
        .run(b.name, b.head_staff_id ?? null);
      this.audit(
        d,
        a,
        "department.create",
        "department",
        Number(x.lastInsertRowid),
      );
      return this.ok({ ok: true, id: Number(x.lastInsertRowid) });
    });
  }
  private deleteDepartment(recordId: number, a: AccountContext) {
    return this.write((d) => {
      d.transaction(() => {
        d.prepare(
          "UPDATE staff SET department_id=NULL WHERE department_id=?",
        ).run(recordId);
        d.prepare("DELETE FROM departments WHERE id=?").run(recordId);
      })();
      this.audit(d, a, "department.delete", "department", recordId);
      return this.ok({ ok: true });
    });
  }
  private leaveList(u: URL) {
    const status = u.searchParams.get("status"),
      staff = this.qid(u, "staff_id");
    return this.read((d) => {
      const rows = d
        .prepare(
          `SELECT lr.id,lr.staff_id,s.first_name,s.last_name,lr.leave_type,lr.from_date,lr.to_date,lr.reason,lr.status,lr.approved_by,lr.created_at FROM leave_requests lr JOIN staff s ON s.id=lr.staff_id WHERE (? IS NULL OR lr.status=?) AND (? IS NULL OR lr.staff_id=?) ORDER BY lr.created_at DESC`,
        )
        .all(status, status, staff, staff);
      return this.ok({ leave_requests: rows, total: rows.length });
    });
  }
  private createLeave(r: ApiRequest, a: AccountContext) {
    const b = leave.parse(r.body);
    return this.write((d) => {
      const x = d
        .prepare(
          "INSERT INTO leave_requests(staff_id,leave_type,from_date,to_date,reason) VALUES(?,?,?,?,?)",
        )
        .run(
          b.staff_id,
          b.leave_type,
          b.from_date,
          b.to_date,
          b.reason ?? null,
        );
      this.audit(
        d,
        a,
        "leave.create",
        "leave_request",
        Number(x.lastInsertRowid),
      );
      return this.ok({ ok: true, id: Number(x.lastInsertRowid) });
    });
  }
  private decideLeave(r: ApiRequest, a: AccountContext, approve: boolean) {
    const { id: recordId } = idBody.parse(r.body);
    return this.write((d) => {
      const tx = d.transaction(() => {
        const row = d
          .prepare("SELECT staff_id,from_date FROM leave_requests WHERE id=?")
          .get(recordId) as { staff_id: number; from_date: string } | undefined;
        if (!row) throw new Error("Leave request not found");
        d.prepare(
          `UPDATE leave_requests SET status=?,approved_by=?,approved_at=datetime('now') WHERE id=?`,
        ).run(approve ? "approved" : "rejected", a.id, recordId);
        if (approve) {
          const date = new Date(`${row.from_date}T00:00:00Z`);
          if (Number.isNaN(date.getTime()))
            throw new Error("Invalid leave date");
          const entries = d
            .prepare(
              "SELECT id FROM timetable_entries WHERE staff_id=? AND day_of_week=?",
            )
            .all(row.staff_id, date.getUTCDay()) as Array<{ id: number }>;
          for (const entry of entries)
            d.prepare(
              "INSERT OR IGNORE INTO substitutions(original_entry_id,original_staff_id,date,reason,status) VALUES(?,?,?,'Leave approved','pending')",
            ).run(entry.id, row.staff_id, row.from_date);
        }
      });
      tx();
      this.audit(
        d,
        a,
        approve ? "leave.approve" : "leave.reject",
        "leave_request",
        recordId,
      );
      return this.ok({ ok: true });
    });
  }
  private qid(u: URL, k: string) {
    const v = u.searchParams.get(k);
    return v && /^\d+$/.test(v) ? Number(v) : null;
  }
  private read<T>(f: (d: Database.Database) => T): T {
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
  private write<T>(f: (d: Database.Database) => T): T {
    const d = new Database(this.databasePath(), { fileMustExist: true });
    d.pragma("journal_mode=WAL");
    try {
      return f(d);
    } finally {
      d.close();
    }
  }
  private audit(
    d: Database.Database,
    a: AccountContext,
    action: string,
    type: string,
    recordId: number,
  ) {
    d.prepare(
      "INSERT INTO audit_log(user_id,action,resource_type,resource_id) VALUES(?,?,?,?)",
    ).run(a.id, action, type, recordId);
  }
  private ok(body: unknown) {
    return this.response(200, body);
  }
  private response(status: number, body: unknown): ApiResponse {
    return apiResponseSchema.parse({ status, body });
  }
}
