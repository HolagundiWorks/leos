import Database from "./sqlite";
import { z } from "zod";
import {
  apiResponseSchema,
  type ApiRequest,
  type ApiResponse,
} from "./contracts";
import { AuthService, type AccountContext } from "./auth";

const spaceBody = z.object({
  title: z.string().trim().min(1),
  description: z.string().nullable().optional(),
  subject_id: z.number().int().positive().nullable().optional(),
  section_id: z.number().int().positive(),
  is_published: z.boolean().optional(),
});
const moduleBody = z.object({
  space_id: z.number().int().positive(),
  title: z.string().trim().min(1),
  description: z.string().nullable().optional(),
  sort_order: z.number().int().min(0).optional(),
  is_published: z.boolean().optional(),
});
const lessonBody = z.object({
  module_id: z.number().int().positive(),
  title: z.string().trim().min(1),
  content: z.string().nullable().optional(),
  objectives: z.string().nullable().optional(),
  resources: z.string().nullable().optional(),
  sort_order: z.number().int().min(0).optional(),
  is_published: z.boolean().optional(),
});
const assignmentBody = z.object({
  space_id: z.number().int().positive(),
  module_id: z.number().int().positive().nullable().optional(),
  title: z.string().trim().min(1),
  instructions: z.string().nullable().optional(),
  due_date: z.string().nullable().optional(),
  max_points: z.number().positive().optional(),
  is_published: z.boolean().optional(),
});
const submissionBody = z.object({
  assignment_id: z.number().int().positive(),
  student_id: z.number().int().positive(),
  content: z.string().nullable().optional(),
  attachment: z.string().nullable().optional(),
});
const gradeBody = z.object({
  score: z.number().min(0),
  feedback: z.string().nullable().optional(),
});

export class LmsRouter {
  public constructor(
    private readonly databasePath: () => string,
    private readonly auth: AuthService,
  ) {}
  public handle(request: ApiRequest, path: string): ApiResponse | null {
    if (!path.startsWith("/lms/")) return null;
    const account = this.auth.accountContext(request.token);
    if (request.method === "GET" && path === "/lms/spaces")
      return this.spaces(account);
    if (request.method === "POST" && path === "/lms/spaces")
      return this.createSpace(request, account);
    if (request.method === "GET" && /^\/lms\/spaces\/\d+$/.test(path))
      return this.space(account, Number(path.split("/")[3]));
    if (request.method === "POST" && /^\/lms\/spaces\/\d+\/delete$/.test(path))
      return this.remove(
        request,
        account,
        "lms_spaces",
        Number(path.split("/")[3]),
      );
    if (request.method === "POST" && path === "/lms/modules")
      return this.createModule(request, account);
    if (request.method === "POST" && /^\/lms\/modules\/\d+\/delete$/.test(path))
      return this.remove(
        request,
        account,
        "lms_modules",
        Number(path.split("/")[3]),
      );
    if (request.method === "POST" && path === "/lms/lessons")
      return this.createLesson(request, account);
    if (request.method === "POST" && /^\/lms\/lessons\/\d+\/delete$/.test(path))
      return this.remove(
        request,
        account,
        "lms_lessons",
        Number(path.split("/")[3]),
      );
    if (request.method === "POST" && path === "/lms/assignments")
      return this.createAssignment(request, account);
    if (
      request.method === "POST" &&
      /^\/lms\/assignments\/\d+\/delete$/.test(path)
    )
      return this.remove(
        request,
        account,
        "lms_assignments",
        Number(path.split("/")[3]),
      );
    if (
      request.method === "GET" &&
      /^\/lms\/assignments\/\d+\/submissions$/.test(path)
    )
      return this.submissions(account, Number(path.split("/")[3]));
    if (request.method === "POST" && path === "/lms/submissions")
      return this.submit(request, account);
    if (
      request.method === "POST" &&
      /^\/lms\/submissions\/\d+\/grade$/.test(path)
    )
      return this.grade(request, account, Number(path.split("/")[3]));
    return this.response(404, {
      error: `LMS endpoint not found: ${request.method} ${path}`,
    });
  }
  private spaces(a: AccountContext): ApiResponse {
    return this.read((d) => {
      let sql = `SELECT sp.id,sp.title,sp.description,sp.subject_id,s.name subject_name,sp.section_id,c.name class_name,sec.name section_name,sp.created_by,sp.is_published,sp.created_at,(SELECT COUNT(*) FROM lms_modules m WHERE m.space_id=sp.id) modules_count,(SELECT COUNT(*) FROM lms_assignments x WHERE x.space_id=sp.id) assignments_count FROM lms_spaces sp LEFT JOIN subjects s ON s.id=sp.subject_id JOIN sections sec ON sec.id=sp.section_id LEFT JOIN classes c ON c.id=sec.class_id`;
      let args: unknown[] = [];
      if (a.level > 1 && ["student", "parent"].includes(a.role)) {
        sql += ` WHERE sp.is_published=1 AND EXISTS(SELECT 1 FROM user_student_links usl JOIN section_students ss ON ss.student_id=usl.student_id WHERE usl.user_id=? AND ss.section_id=sp.section_id)`;
        args = [a.id];
      } else if (a.level > 1) {
        sql += ` WHERE sp.created_by=? OR EXISTS(SELECT 1 FROM user_staff_links usf JOIN sections sx ON sx.teacher_id=usf.staff_id WHERE usf.user_id=? AND sx.id=sp.section_id)`;
        args = [a.id, a.id];
      }
      sql += " ORDER BY sp.title";
      const spaces = (
        d.prepare(sql).all(...args) as Array<Record<string, unknown>>
      ).map((s) => ({ ...s, is_published: Number(s.is_published) === 1 }));
      return this.ok({ spaces, total: spaces.length });
    });
  }
  private space(a: AccountContext, id: number): ApiResponse {
    return this.read((d) => {
      if (!this.canRead(d, a, id))
        return this.response(403, { error: "Insufficient privileges." });
      const space = d
        .prepare(
          `SELECT sp.*,s.name subject_name,c.name class_name,sec.name section_name FROM lms_spaces sp LEFT JOIN subjects s ON s.id=sp.subject_id JOIN sections sec ON sec.id=sp.section_id LEFT JOIN classes c ON c.id=sec.class_id WHERE sp.id=?`,
        )
        .get(id) as Record<string, unknown> | undefined;
      if (!space)
        return this.response(404, { error: "learning space not found" });
      const learner = ["student", "parent"].includes(a.role);
      space.is_published = Number(space.is_published) === 1;
      space.modules = (
        d
          .prepare(
            `SELECT * FROM lms_modules WHERE space_id=? ${learner ? "AND is_published=1" : ""} ORDER BY sort_order,id`,
          )
          .all(id) as Array<Record<string, unknown>>
      ).map((m) => ({
        ...m,
        is_published: Number(m.is_published) === 1,
        lessons: (
          d
            .prepare(
              `SELECT * FROM lms_lessons WHERE module_id=? ${learner ? "AND is_published=1" : ""} ORDER BY sort_order,id`,
            )
            .all(m.id) as Array<Record<string, unknown>>
        ).map((l) => ({ ...l, is_published: Number(l.is_published) === 1 })),
      }));
      space.assignments = (
        d
          .prepare(
            `SELECT * FROM lms_assignments WHERE space_id=? ${learner ? "AND is_published=1" : ""} ORDER BY due_date,id`,
          )
          .all(id) as Array<Record<string, unknown>>
      ).map((x) => ({
        ...x,
        is_published: Number(x.is_published) === 1,
        my_submissions: learner
          ? d
              .prepare(
                `SELECT sub.*,s.first_name,s.last_name FROM lms_submissions sub JOIN user_student_links usl ON usl.student_id=sub.student_id JOIN students s ON s.id=sub.student_id WHERE sub.assignment_id=? AND usl.user_id=?`,
              )
              .all(x.id, a.id)
          : [],
      }));
      return this.ok({ space });
    });
  }
  private createSpace(r: ApiRequest, a: AccountContext): ApiResponse {
    this.requireTeacher(a);
    const b = spaceBody.parse(r.body);
    return this.write((d) => {
      const out = d
        .prepare(
          "INSERT INTO lms_spaces(title,description,subject_id,section_id,created_by,is_published) VALUES(?,?,?,?,?,?)",
        )
        .run(
          b.title,
          b.description ?? null,
          b.subject_id ?? null,
          b.section_id,
          a.id,
          Number(b.is_published ?? false),
        );
      const id = Number(out.lastInsertRowid);
      this.audit(d, a.id, "lms.space.create", "lms_space", id);
      return this.created({ ok: true, id });
    });
  }
  private createModule(r: ApiRequest, a: AccountContext): ApiResponse {
    this.requireTeacher(a);
    const b = moduleBody.parse(r.body);
    return this.write((d) => {
      this.requireManage(d, a, b.space_id);
      const out = d
        .prepare(
          "INSERT INTO lms_modules(space_id,title,description,sort_order,is_published) VALUES(?,?,?,?,?)",
        )
        .run(
          b.space_id,
          b.title,
          b.description ?? null,
          b.sort_order ?? 0,
          Number(b.is_published ?? false),
        );
      const id = Number(out.lastInsertRowid);
      this.audit(d, a.id, "lms.module.create", "lms_module", id);
      return this.created({ ok: true, id });
    });
  }
  private createLesson(r: ApiRequest, a: AccountContext): ApiResponse {
    this.requireTeacher(a);
    const b = lessonBody.parse(r.body);
    return this.write((d) => {
      const spaceId = Number(
        d
          .prepare("SELECT space_id FROM lms_modules WHERE id=?")
          .pluck()
          .get(b.module_id),
      );
      this.requireManage(d, a, spaceId);
      const out = d
        .prepare(
          "INSERT INTO lms_lessons(module_id,title,content,objectives,resources,sort_order,is_published) VALUES(?,?,?,?,?,?,?)",
        )
        .run(
          b.module_id,
          b.title,
          b.content ?? null,
          b.objectives ?? null,
          b.resources ?? null,
          b.sort_order ?? 0,
          Number(b.is_published ?? false),
        );
      const id = Number(out.lastInsertRowid);
      this.audit(d, a.id, "lms.lesson.create", "lms_lesson", id);
      return this.created({ ok: true, id });
    });
  }
  private createAssignment(r: ApiRequest, a: AccountContext): ApiResponse {
    this.requireTeacher(a);
    const b = assignmentBody.parse(r.body);
    return this.write((d) => {
      this.requireManage(d, a, b.space_id);
      const out = d
        .prepare(
          "INSERT INTO lms_assignments(space_id,module_id,title,instructions,due_date,max_points,is_published) VALUES(?,?,?,?,?,?,?)",
        )
        .run(
          b.space_id,
          b.module_id ?? null,
          b.title,
          b.instructions ?? null,
          b.due_date ?? null,
          b.max_points ?? 100,
          Number(b.is_published ?? false),
        );
      const id = Number(out.lastInsertRowid);
      this.audit(d, a.id, "lms.assignment.create", "lms_assignment", id);
      return this.created({ ok: true, id });
    });
  }
  private submit(r: ApiRequest, a: AccountContext): ApiResponse {
    if (a.role !== "student")
      return this.response(403, {
        error: "Only student accounts can submit assignments",
      });
    const b = submissionBody.parse(r.body);
    return this.write((d) => {
      const allowed = d
        .prepare(
          `SELECT 1 FROM user_student_links usl JOIN section_students ss ON ss.student_id=usl.student_id JOIN lms_assignments x ON x.id=? JOIN lms_spaces sp ON sp.id=x.space_id AND sp.section_id=ss.section_id WHERE usl.user_id=? AND usl.student_id=? AND x.is_published=1 AND sp.is_published=1`,
        )
        .get(b.assignment_id, a.id, b.student_id);
      if (!allowed)
        return this.response(403, {
          error: "Assignment is not available to this student",
        });
      const out = d
        .prepare(
          `INSERT INTO lms_submissions(assignment_id,student_id,content,attachment,status,submitted_at) VALUES(?,?,?,?,'submitted',datetime('now')) ON CONFLICT(assignment_id,student_id) DO UPDATE SET content=excluded.content,attachment=excluded.attachment,status='resubmitted',submitted_at=datetime('now'),score=NULL,feedback=NULL,graded_by=NULL,graded_at=NULL`,
        )
        .run(
          b.assignment_id,
          b.student_id,
          b.content ?? null,
          b.attachment ?? null,
        );
      this.audit(
        d,
        a.id,
        "lms.submission.save",
        "lms_assignment",
        b.assignment_id,
      );
      return this.ok({ ok: true, id: Number(out.lastInsertRowid) });
    });
  }
  private submissions(a: AccountContext, assignmentId: number): ApiResponse {
    return this.read((d) => {
      const spaceId = Number(
        d
          .prepare("SELECT space_id FROM lms_assignments WHERE id=?")
          .pluck()
          .get(assignmentId),
      );
      this.requireManage(d, a, spaceId);
      const submissions = d
        .prepare(
          `SELECT sub.*,s.first_name,s.last_name FROM lms_submissions sub JOIN students s ON s.id=sub.student_id WHERE sub.assignment_id=? ORDER BY sub.submitted_at DESC`,
        )
        .all(assignmentId);
      return this.ok({ submissions, total: submissions.length });
    });
  }
  private grade(r: ApiRequest, a: AccountContext, id: number): ApiResponse {
    this.requireTeacher(a);
    const b = gradeBody.parse(r.body);
    return this.write((d) => {
      const row = d
        .prepare(
          `SELECT x.space_id,x.max_points FROM lms_submissions sub JOIN lms_assignments x ON x.id=sub.assignment_id WHERE sub.id=?`,
        )
        .get(id) as { space_id: number; max_points: number } | undefined;
      if (!row) return this.response(404, { error: "submission not found" });
      this.requireManage(d, a, row.space_id);
      if (b.score > row.max_points)
        return this.response(422, {
          error: "score cannot exceed maximum points",
        });
      d.prepare(
        `UPDATE lms_submissions SET score=?,feedback=?,status='graded',graded_by=?,graded_at=datetime('now') WHERE id=?`,
      ).run(b.score, b.feedback ?? null, a.id, id);
      this.audit(d, a.id, "lms.submission.grade", "lms_submission", id);
      return this.ok({ ok: true });
    });
  }
  private remove(
    _r: ApiRequest,
    a: AccountContext,
    table: "lms_spaces" | "lms_modules" | "lms_lessons" | "lms_assignments",
    id: number,
  ): ApiResponse {
    this.requireTeacher(a);
    return this.write((d) => {
      let spaceId = id;
      if (table === "lms_modules")
        spaceId = Number(
          d
            .prepare("SELECT space_id FROM lms_modules WHERE id=?")
            .pluck()
            .get(id),
        );
      if (table === "lms_lessons")
        spaceId = Number(
          d
            .prepare(
              "SELECT m.space_id FROM lms_lessons l JOIN lms_modules m ON m.id=l.module_id WHERE l.id=?",
            )
            .pluck()
            .get(id),
        );
      if (table === "lms_assignments")
        spaceId = Number(
          d
            .prepare("SELECT space_id FROM lms_assignments WHERE id=?")
            .pluck()
            .get(id),
        );
      this.requireManage(d, a, spaceId);
      d.prepare(`DELETE FROM ${table} WHERE id=?`).run(id);
      this.audit(d, a.id, "lms.delete", table, id);
      return this.ok({ ok: true });
    });
  }
  private canRead(
    d: Database.Database,
    a: AccountContext,
    id: number,
  ): boolean {
    if (a.level <= 1) return true;
    if (["student", "parent"].includes(a.role))
      return !!d
        .prepare(
          `SELECT 1 FROM lms_spaces sp JOIN section_students ss ON ss.section_id=sp.section_id JOIN user_student_links usl ON usl.student_id=ss.student_id WHERE sp.id=? AND sp.is_published=1 AND usl.user_id=?`,
        )
        .get(id, a.id);
    return !!d
      .prepare(
        `SELECT 1 FROM lms_spaces sp WHERE sp.id=? AND (sp.created_by=? OR EXISTS(SELECT 1 FROM user_staff_links usf JOIN sections s ON s.teacher_id=usf.staff_id WHERE usf.user_id=? AND s.id=sp.section_id))`,
      )
      .get(id, a.id, a.id);
  }
  private requireManage(
    d: Database.Database,
    a: AccountContext,
    id: number,
  ): void {
    if (
      !Number.isFinite(id) ||
      !this.canRead(d, a, id) ||
      ["student", "parent"].includes(a.role)
    )
      throw new Error("Insufficient privileges.");
  }
  private requireTeacher(a: AccountContext): void {
    if (a.level > 3 || ["student", "parent"].includes(a.role))
      throw new Error("Insufficient privileges.");
  }
  private read<T>(fn: (d: Database.Database) => T): T {
    const d = new Database(this.databasePath(), {
      readonly: true,
      fileMustExist: true,
    });
    try {
      return fn(d);
    } finally {
      d.close();
    }
  }
  private write<T>(fn: (d: Database.Database) => T): T {
    const d = new Database(this.databasePath(), { fileMustExist: true });
    d.pragma("foreign_keys = ON");
    d.pragma("journal_mode = WAL");
    try {
      return fn(d);
    } finally {
      d.close();
    }
  }
  private audit(
    d: Database.Database,
    user: number,
    action: string,
    type: string,
    id: number,
  ): void {
    d.prepare(
      "INSERT INTO audit_log(user_id,action,resource_type,resource_id) VALUES(?,?,?,?)",
    ).run(user, action, type, id);
  }
  private ok(body: unknown): ApiResponse {
    return this.response(200, body);
  }
  private created(body: unknown): ApiResponse {
    return this.response(201, body);
  }
  private response(status: number, body: unknown): ApiResponse {
    return apiResponseSchema.parse({ status, body });
  }
}
