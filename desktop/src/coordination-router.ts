import Database from "./sqlite";
import { z } from "zod";
import {
  apiResponseSchema,
  type ApiRequest,
  type ApiResponse,
} from "./contracts";
import { AuthService, type AccountContext } from "./auth";

const id = z.number().int().positive();
const text = z.string().nullable().optional();
const announcement = z.object({
  title: z.string().trim().min(1),
  body: text,
  audience: z.string().optional(),
  is_draft: z.boolean().optional(),
});
const meeting = z.object({
  title: z.string().trim().min(1),
  meeting_type: z.string().optional(),
  date: z.string().min(1),
  start_time: text,
  end_time: text,
  venue: text,
  agenda: text,
});
const meetingUpdate = z.object({
  title: z.string().trim().min(1).optional(),
  date: z.string().optional(),
  start_time: text,
  end_time: text,
  venue: text,
  agenda: text,
  minutes: text,
  status: z.enum(["scheduled", "completed", "cancelled"]).optional(),
});
const task = z.object({
  title: z.string().trim().min(1),
  description: text,
  assigned_to: id.nullable().optional(),
  department_id: id.nullable().optional(),
  due_date: text,
  priority: z.string().optional(),
});
const reminder = z.object({
  title: z.string().trim().min(1),
  tag: z.string().optional(),
  due_date: text,
  notes: text,
});
const activity = z.object({
  title: z.string().trim().min(1),
  activity_type: z.string().optional(),
  date: text,
  end_date: text,
  venue: text,
  description: text,
});
const activityUpdate = activity.partial().extend({
  status: z.enum(["planned", "confirmed", "completed", "cancelled"]).optional(),
});
const activityStaff = z.object({
  activity_id: id,
  staff_id: id,
  role: z.string().optional(),
});
const activitySection = z.object({
  activity_id: id,
  section_id: id,
  student_count: z.number().int().min(0).nullable().optional(),
});
const expense = z.object({
  activity_id: id,
  head: z.string().trim().min(1),
  amount: z.number().min(0),
  notes: text,
});

export class CoordinationRouter {
  public constructor(
    private readonly databasePath: () => string,
    private readonly auth: AuthService,
  ) {}
  public handle(r: ApiRequest, u: URL): ApiResponse | null {
    const p = u.pathname;
    if (
      !/^\/(announcements|meetings|tasks|reminders|activities|activity-staff|activity-sections|activity-expenses)/.test(
        p,
      )
    )
      return null;
    const a = this.auth.accountContext(r.token);
    if (a.level > 3) throw new Error("Insufficient privileges.");
    if (r.method === "GET" && p === "/announcements")
      return this.announcements(u);
    if (r.method === "POST" && p === "/announcements")
      return this.createAnnouncement(r, a);
    if (r.method === "POST" && /^\/announcements\/\d+\/publish$/.test(p))
      return this.changeSimple(
        "announcements",
        Number(p.split("/")[2]),
        "is_draft=0,published_at=datetime('now')",
        a,
        "announcement.publish",
      );
    if (r.method === "POST" && /^\/announcements\/\d+\/delete$/.test(p))
      return this.remove("announcements", Number(p.split("/")[2]), a);
    if (r.method === "GET" && p === "/meetings") return this.meetings(u);
    if (r.method === "POST" && p === "/meetings")
      return this.createMeeting(r, a);
    if (r.method === "POST" && /^\/meetings\/\d+\/update$/.test(p))
      return this.updateMeeting(r, Number(p.split("/")[2]), a);
    if (r.method === "POST" && /^\/meetings\/\d+\/delete$/.test(p))
      return this.removeMeeting(Number(p.split("/")[2]), a);
    if (r.method === "GET" && p === "/tasks") return this.tasks(u);
    if (r.method === "POST" && p === "/tasks") return this.createTask(r, a);
    if (r.method === "POST" && /^\/tasks\/\d+\/complete$/.test(p))
      return this.changeSimple(
        "tasks",
        Number(p.split("/")[2]),
        "status='completed',completed_at=datetime('now')",
        a,
        "task.complete",
      );
    if (r.method === "POST" && /^\/tasks\/\d+\/delete$/.test(p))
      return this.remove("tasks", Number(p.split("/")[2]), a);
    if (r.method === "GET" && p === "/reminders") return this.reminders(u);
    if (r.method === "POST" && p === "/reminders")
      return this.createReminder(r, a);
    if (r.method === "POST" && /^\/reminders\/\d+\/done$/.test(p))
      return this.changeSimple(
        "reminders",
        Number(p.split("/")[2]),
        "done=1",
        a,
        "reminder.done",
      );
    if (r.method === "POST" && /^\/reminders\/\d+\/delete$/.test(p))
      return this.remove("reminders", Number(p.split("/")[2]), a);
    if (r.method === "GET" && p === "/activities") return this.activities(u);
    if (r.method === "GET" && /^\/activities\/\d+\/detail$/.test(p))
      return this.activityDetail(Number(p.split("/")[2]));
    if (r.method === "POST" && p === "/activities")
      return this.createActivity(r, a);
    if (r.method === "POST" && /^\/activities\/\d+\/update$/.test(p))
      return this.updateActivity(r, Number(p.split("/")[2]), a);
    if (r.method === "POST" && /^\/activities\/\d+\/delete$/.test(p))
      return this.removeActivity(Number(p.split("/")[2]), a);
    if (r.method === "POST" && p === "/activity-staff")
      return this.saveActivityStaff(r, a);
    if (r.method === "POST" && p === "/activity-staff/remove")
      return this.removeActivityLink(
        r,
        a,
        "activity_staff",
        "staff_id",
        activityStaff,
      );
    if (r.method === "POST" && p === "/activity-sections")
      return this.saveActivitySection(r, a);
    if (r.method === "POST" && p === "/activity-sections/remove")
      return this.removeActivityLink(
        r,
        a,
        "activity_sections",
        "section_id",
        activitySection,
      );
    if (r.method === "POST" && p === "/activity-expenses")
      return this.createExpense(r, a);
    if (r.method === "POST" && /^\/activity-expenses\/\d+\/delete$/.test(p))
      return this.remove("activity_expenses", Number(p.split("/")[2]), a);
    return this.response(404, {
      error: `Coordination endpoint not found: ${r.method} ${p}`,
    });
  }
  private announcements(u: URL) {
    const audience = u.searchParams.get("audience"),
      draft = u.searchParams.get("draft") === "1" ? 1 : 0;
    return this.read((d) => {
      const rows = (
        d
          .prepare(
            "SELECT id,title,body,audience,is_draft,published_at,created_by,created_at FROM announcements WHERE (? IS NULL OR audience=?) AND (?=0 OR is_draft=1) ORDER BY created_at DESC LIMIT 100",
          )
          .all(audience, audience, draft) as Array<Record<string, unknown>>
      ).map((x) => ({ ...x, is_draft: Number(x.is_draft) === 1 }));
      return this.ok({ announcements: rows, total: rows.length });
    });
  }
  private createAnnouncement(r: ApiRequest, a: AccountContext) {
    const b = announcement.parse(r.body),
      draft = Number(b.is_draft ?? true);
    return this.write((d) => {
      const x = d
        .prepare(
          "INSERT INTO announcements(title,body,audience,is_draft,published_at,created_by) VALUES(?,?,?,?,CASE WHEN ?=0 THEN datetime('now') ELSE NULL END,?)",
        )
        .run(
          b.title,
          b.body ?? null,
          b.audience ?? "internal",
          draft,
          draft,
          a.id,
        );
      this.audit(
        d,
        a,
        "announcement.create",
        "announcement",
        Number(x.lastInsertRowid),
      );
      return this.ok({ ok: true, id: Number(x.lastInsertRowid) });
    });
  }
  private meetings(u: URL) {
    const status = u.searchParams.get("status");
    return this.read((d) => {
      const rows = d
        .prepare(
          "SELECT id,title,meeting_type,date,start_time,end_time,venue,agenda,minutes,status,created_by,created_at FROM meetings WHERE (? IS NULL OR status=?) ORDER BY date DESC,start_time LIMIT 200",
        )
        .all(status, status);
      return this.ok({ meetings: rows, total: rows.length });
    });
  }
  private createMeeting(r: ApiRequest, a: AccountContext) {
    const b = meeting.parse(r.body);
    return this.write((d) => {
      const x = d
        .prepare(
          "INSERT INTO meetings(title,meeting_type,date,start_time,end_time,venue,agenda,created_by) VALUES(?,?,?,?,?,?,?,?)",
        )
        .run(
          b.title,
          b.meeting_type ?? "staff",
          b.date,
          b.start_time ?? null,
          b.end_time ?? null,
          b.venue ?? null,
          b.agenda ?? null,
          a.id,
        );
      this.audit(d, a, "meeting.create", "meeting", Number(x.lastInsertRowid));
      return this.ok({ ok: true, id: Number(x.lastInsertRowid) });
    });
  }
  private updateMeeting(r: ApiRequest, recordId: number, a: AccountContext) {
    const b = meetingUpdate.parse(r.body);
    return this.write((d) => {
      const current = d
        .prepare("SELECT * FROM meetings WHERE id=?")
        .get(recordId) as Record<string, unknown> | undefined;
      if (!current) throw new Error("Meeting not found");
      d.prepare(
        "UPDATE meetings SET title=?,date=?,start_time=?,end_time=?,venue=?,agenda=?,minutes=?,status=? WHERE id=?",
      ).run(
        b.title ?? current.title,
        b.date ?? current.date,
        b.start_time === undefined ? current.start_time : b.start_time,
        b.end_time === undefined ? current.end_time : b.end_time,
        b.venue === undefined ? current.venue : b.venue,
        b.agenda === undefined ? current.agenda : b.agenda,
        b.minutes === undefined ? current.minutes : b.minutes,
        b.status ?? current.status,
        recordId,
      );
      this.audit(d, a, "meeting.update", "meeting", recordId);
      return this.ok({ ok: true });
    });
  }
  private removeMeeting(recordId: number, a: AccountContext) {
    return this.write((d) => {
      d.transaction(() => {
        d.prepare("DELETE FROM meeting_attendees WHERE meeting_id=?").run(
          recordId,
        );
        d.prepare("DELETE FROM meetings WHERE id=?").run(recordId);
      })();
      this.audit(d, a, "meeting.delete", "meeting", recordId);
      return this.ok({ ok: true });
    });
  }
  private tasks(u: URL) {
    const status = u.searchParams.get("status"),
      assigned = this.qid(u, "assigned_to");
    return this.read((d) => {
      const rows = d
        .prepare(
          `SELECT t.id,t.title,t.description,t.assigned_to,TRIM(COALESCE(s.first_name,'')||' '||COALESCE(s.last_name,'')) assignee_name,t.department_id,d.name department_name,t.due_date,t.priority,t.status,t.created_by,t.completed_at,t.created_at FROM tasks t LEFT JOIN staff s ON s.id=t.assigned_to LEFT JOIN departments d ON d.id=t.department_id WHERE (? IS NULL OR t.status=?) AND (? IS NULL OR t.assigned_to=?) ORDER BY t.due_date,t.priority DESC,t.created_at DESC LIMIT 200`,
        )
        .all(status, status, assigned, assigned);
      return this.ok({ tasks: rows, total: rows.length });
    });
  }
  private createTask(r: ApiRequest, a: AccountContext) {
    const b = task.parse(r.body);
    return this.write((d) => {
      const x = d
        .prepare(
          "INSERT INTO tasks(title,description,assigned_to,department_id,due_date,priority,created_by) VALUES(?,?,?,?,?,?,?)",
        )
        .run(
          b.title,
          b.description ?? null,
          b.assigned_to ?? null,
          b.department_id ?? null,
          b.due_date ?? null,
          b.priority ?? "normal",
          a.id,
        );
      this.audit(d, a, "task.create", "task", Number(x.lastInsertRowid));
      return this.ok({ ok: true, id: Number(x.lastInsertRowid) });
    });
  }
  private reminders(u: URL) {
    const tag = u.searchParams.get("tag");
    return this.read((d) => {
      const rows = (
        d
          .prepare(
            `SELECT id,title,tag,due_date,notes,done,created_at FROM reminders WHERE done=0 AND (? IS NULL OR tag=?) ORDER BY (due_date IS NULL),due_date,CASE tag WHEN 'critical' THEN 0 WHEN 'urgent' THEN 1 ELSE 2 END,created_at DESC LIMIT 200`,
          )
          .all(tag, tag) as Array<Record<string, unknown>>
      ).map((x) => ({ ...x, done: Number(x.done) !== 0 }));
      return this.ok({ reminders: rows, total: rows.length });
    });
  }
  private createReminder(r: ApiRequest, a: AccountContext) {
    const b = reminder.parse(r.body);
    return this.write((d) => {
      const x = d
        .prepare(
          "INSERT INTO reminders(title,tag,due_date,notes,created_by) VALUES(?,?,?,?,?)",
        )
        .run(
          b.title,
          b.tag ?? "normal",
          b.due_date || null,
          b.notes ?? null,
          a.id,
        );
      this.audit(
        d,
        a,
        "reminder.create",
        "reminder",
        Number(x.lastInsertRowid),
      );
      return this.ok({ ok: true, id: Number(x.lastInsertRowid) });
    });
  }
  private activities(u: URL) {
    const type = u.searchParams.get("type"),
      status = u.searchParams.get("status");
    return this.read((d) => {
      const rows = d
        .prepare(
          "SELECT id,title,activity_type,date,end_date,venue,description,status,created_by,created_at FROM activities WHERE (? IS NULL OR activity_type=?) AND (? IS NULL OR status=?) ORDER BY date DESC,created_at DESC LIMIT 200",
        )
        .all(type, type, status, status);
      return this.ok({ activities: rows, total: rows.length });
    });
  }
  private createActivity(r: ApiRequest, a: AccountContext) {
    const b = activity.parse(r.body);
    return this.write((d) => {
      const x = d
        .prepare(
          "INSERT INTO activities(title,activity_type,date,end_date,venue,description,created_by) VALUES(?,?,?,?,?,?,?)",
        )
        .run(
          b.title,
          b.activity_type ?? "field_visit",
          b.date || null,
          b.end_date || null,
          b.venue ?? null,
          b.description ?? null,
          a.id,
        );
      this.audit(
        d,
        a,
        "activity.create",
        "activity",
        Number(x.lastInsertRowid),
      );
      return this.ok({ ok: true, id: Number(x.lastInsertRowid) });
    });
  }
  private updateActivity(r: ApiRequest, recordId: number, a: AccountContext) {
    const b = activityUpdate.parse(r.body);
    return this.write((d) => {
      const current = d
        .prepare("SELECT * FROM activities WHERE id=?")
        .get(recordId) as Record<string, unknown> | undefined;
      if (!current) throw new Error("Activity not found");
      d.prepare(
        "UPDATE activities SET title=?,activity_type=?,date=?,end_date=?,venue=?,description=?,status=? WHERE id=?",
      ).run(
        b.title ?? current.title,
        b.activity_type ?? current.activity_type,
        b.date === undefined ? current.date : b.date,
        b.end_date === undefined ? current.end_date : b.end_date,
        b.venue === undefined ? current.venue : b.venue,
        b.description === undefined ? current.description : b.description,
        b.status ?? current.status,
        recordId,
      );
      this.audit(d, a, "activity.update", "activity", recordId);
      return this.ok({ ok: true });
    });
  }
  private activityDetail(recordId: number) {
    return this.read((d) => {
      const act = d
        .prepare(
          "SELECT id,title,activity_type,date,end_date,venue,description,status FROM activities WHERE id=?",
        )
        .get(recordId);
      if (!act) return this.response(404, { error: "not found" });
      const staff = d
        .prepare(
          `SELECT x.staff_id,TRIM(COALESCE(s.first_name,'')||' '||COALESCE(s.last_name,'')) name,x.role FROM activity_staff x JOIN staff s ON s.id=x.staff_id WHERE x.activity_id=?`,
        )
        .all(recordId);
      const sections = d
        .prepare(
          `SELECT x.section_id,s.name section_name,c.name class_name,x.student_count FROM activity_sections x JOIN sections s ON s.id=x.section_id JOIN classes c ON c.id=s.class_id WHERE x.activity_id=?`,
        )
        .all(recordId);
      const expenses = d
        .prepare(
          "SELECT id,head,amount,notes FROM activity_expenses WHERE activity_id=? ORDER BY head",
        )
        .all(recordId) as Array<{ amount: number }>;
      return this.ok({
        activity: act,
        staff,
        sections,
        expenses,
        total_expense: expenses.reduce((n, x) => n + x.amount, 0),
      });
    });
  }
  private saveActivityStaff(r: ApiRequest, a: AccountContext) {
    const b = activityStaff.parse(r.body);
    return this.write((d) => {
      d.prepare(
        "INSERT INTO activity_staff(activity_id,staff_id,role) VALUES(?,?,?) ON CONFLICT(activity_id,staff_id) DO UPDATE SET role=excluded.role",
      ).run(b.activity_id, b.staff_id, b.role ?? "in_charge");
      this.audit(d, a, "activity.staff.save", "activity", b.activity_id);
      return this.ok({ ok: true });
    });
  }
  private saveActivitySection(r: ApiRequest, a: AccountContext) {
    const b = activitySection.parse(r.body);
    return this.write((d) => {
      d.prepare(
        "INSERT INTO activity_sections(activity_id,section_id,student_count) VALUES(?,?,?) ON CONFLICT(activity_id,section_id) DO UPDATE SET student_count=excluded.student_count",
      ).run(b.activity_id, b.section_id, b.student_count ?? null);
      this.audit(d, a, "activity.section.save", "activity", b.activity_id);
      return this.ok({ ok: true });
    });
  }
  private createExpense(r: ApiRequest, a: AccountContext) {
    const b = expense.parse(r.body);
    return this.write((d) => {
      const x = d
        .prepare(
          "INSERT INTO activity_expenses(activity_id,head,amount,notes) VALUES(?,?,?,?)",
        )
        .run(b.activity_id, b.head, b.amount, b.notes ?? null);
      this.audit(
        d,
        a,
        "activity.expense.create",
        "activity_expense",
        Number(x.lastInsertRowid),
      );
      return this.ok({ ok: true, id: Number(x.lastInsertRowid) });
    });
  }
  private removeActivityLink(
    r: ApiRequest,
    a: AccountContext,
    table: "activity_staff" | "activity_sections",
    column: "staff_id" | "section_id",
    schema: typeof activityStaff | typeof activitySection,
  ) {
    const b = schema.parse(r.body);
    const linked =
      column === "staff_id"
        ? (b as z.infer<typeof activityStaff>).staff_id
        : (b as z.infer<typeof activitySection>).section_id;
    return this.write((d) => {
      d.prepare(`DELETE FROM ${table} WHERE activity_id=? AND ${column}=?`).run(
        b.activity_id,
        linked,
      );
      this.audit(d, a, "activity.link.remove", "activity", b.activity_id);
      return this.ok({ ok: true });
    });
  }
  private removeActivity(recordId: number, a: AccountContext) {
    return this.write((d) => {
      d.transaction(() => {
        for (const table of [
          "activity_expenses",
          "activity_sections",
          "activity_staff",
        ])
          d.prepare(`DELETE FROM ${table} WHERE activity_id=?`).run(recordId);
        d.prepare("DELETE FROM activities WHERE id=?").run(recordId);
      })();
      this.audit(d, a, "activity.delete", "activity", recordId);
      return this.ok({ ok: true });
    });
  }
  private changeSimple(
    table: "announcements" | "tasks" | "reminders",
    recordId: number,
    set: string,
    a: AccountContext,
    action: string,
  ) {
    return this.write((d) => {
      d.prepare(`UPDATE ${table} SET ${set} WHERE id=?`).run(recordId);
      this.audit(d, a, action, table, recordId);
      return this.ok({ ok: true });
    });
  }
  private remove(
    table: "announcements" | "tasks" | "reminders" | "activity_expenses",
    recordId: number,
    a: AccountContext,
  ) {
    return this.write((d) => {
      d.prepare(`DELETE FROM ${table} WHERE id=?`).run(recordId);
      this.audit(d, a, "coordination.delete", table, recordId);
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
