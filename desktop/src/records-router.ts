import Database from "./sqlite";
import { z } from "zod";
import type { ApiRequest, ApiResponse } from "./contracts";
import { AuthService, type AccountContext } from "./auth";

const id = z.number().int().positive();
const optionalText = z.string().max(10000).nullable().optional();
const letter = z.object({
  recipient: optionalText,
  subject: z.string().trim().min(1).max(300),
  body: z.string().min(1).max(100000),
  letter_date: optionalText,
});
const certificate = z.object({
  cert_type: z.string().trim().min(1).max(100),
  student_name: z.string().trim().min(1).max(200),
  student_id: id.nullable().optional(),
  title: optionalText,
  body: optionalText,
  issued_date: optionalText,
});
const document = z.object({
  student_id: id,
  doc_type: z.string().trim().min(1).max(100),
  file_name: z.string().trim().min(1).max(255),
  mime: z.string().trim().min(1).max(100),
  data: z.string().max(20_000_000),
});
const mark = z
  .object({
    student_id: id,
    term: z.string().trim().min(1).max(100),
    subject: z.string().trim().min(1).max(200),
    max_marks: z.number().positive().optional(),
    marks: z.number().min(0).optional(),
    grade: optionalText,
    remarks: optionalText,
  })
  .refine(
    (v) => v.marks == null || v.max_marks == null || v.marks <= v.max_marks,
    "Marks cannot exceed maximum marks.",
  );
const board = z.object({
  student_id: id.optional(),
  exam_year: optionalText,
  registration_no: optionalText,
  loc_status: optionalText,
  admit_card_status: optionalText,
  board_subjects: optionalText,
  notes: optionalText,
});
const communication = z.object({
  student_id: id,
  channel: z.string().trim().min(1).max(50),
  direction: z.string().trim().min(1).max(50),
  subject: z.string().trim().min(1).max(300),
  body: optionalText,
});
const boolBody = z.object({
  verified: z.boolean().optional(),
  acknowledged: z.boolean().optional(),
});
const LOCK_STAGES = [
  "Draft",
  "Parent Verified",
  "Principal Verified",
  "Submitted",
  "Locked",
] as const;

export class RecordsRouter {
  public constructor(
    private readonly databasePath: () => string,
    private readonly auth: AuthService,
  ) {}
  public handle(r: ApiRequest, url: URL): ApiResponse | null {
    const p = url.pathname;
    if (
      !/^\/(letters|certificates|student-documents|student-marks|board-registrations|student-communications|students\/\d+\/(analytics|advance-lock|audit))/.test(
        p,
      )
    )
      return null;
    const account = this.auth.accountContext(r.token);
    if (r.method === "GET" && p === "/letters")
      return this.read((d) => this.list(d, "letters", "letters"));
    if (r.method === "POST" && p === "/letters") {
      this.writeAllowed(account);
      const b = letter.parse(r.body);
      return this.write((d) => {
        const ref = `LTR-${String(this.nextId(d, "letters")).padStart(4, "0")}`;
        const result = d
          .prepare(
            "INSERT INTO letters(ref_no,letter_date,recipient,subject,body) VALUES(?,?,?,?,?)",
          )
          .run(
            ref,
            b.letter_date ?? new Date().toISOString().slice(0, 10),
            b.recipient ?? null,
            b.subject,
            b.body,
          );
        this.audit(
          d,
          account.id,
          "create",
          "letters",
          Number(result.lastInsertRowid),
        );
        return this.created({
          ok: true,
          id: Number(result.lastInsertRowid),
          ref_no: ref,
        });
      });
    }
    if (r.method === "GET" && p === "/certificates")
      return this.read((d) => this.list(d, "certificates", "certificates"));
    if (r.method === "POST" && p === "/certificates") {
      this.writeAllowed(account);
      const b = certificate.parse(r.body);
      return this.write((d) => {
        const serial = `CERT-${String(this.nextId(d, "certificates")).padStart(4, "0")}`;
        const result = d
          .prepare(
            "INSERT INTO certificates(serial,cert_type,student_id,student_name,title,body,issued_date) VALUES(?,?,?,?,?,?,?)",
          )
          .run(
            serial,
            b.cert_type,
            b.student_id ?? null,
            b.student_name,
            b.title ?? null,
            b.body ?? null,
            b.issued_date ?? new Date().toISOString().slice(0, 10),
          );
        this.audit(
          d,
          account.id,
          "create",
          "certificates",
          Number(result.lastInsertRowid),
        );
        return this.created({
          ok: true,
          id: Number(result.lastInsertRowid),
          serial,
        });
      });
    }
    if (r.method === "GET" && p === "/student-documents")
      return this.read((d) => {
        const rows = d
          .prepare(
            "SELECT id,doc_type,file_name,mime,verified,uploaded_at FROM student_documents WHERE student_id=? ORDER BY id DESC",
          )
          .all(this.studentId(url));
        return this.ok({ documents: rows, total: rows.length });
      });
    const documentId = p.match(/^\/student-documents\/(\d+)$/);
    if (r.method === "GET" && documentId)
      return this.read((d) => {
        const row = d
          .prepare(
            "SELECT id,doc_type,file_name,mime,data,verified,uploaded_at FROM student_documents WHERE id=?",
          )
          .get(Number(documentId[1]));
        return row
          ? this.ok({ document: { ...row, verified: Number((row as any).verified) === 1 } })
          : this.notFound();
      });
    if (r.method === "POST" && p === "/student-documents") {
      this.writeAllowed(account);
      const b = document.parse(r.body);
      return this.insert(
        r,
        account,
        "student_documents",
        ["student_id", "doc_type", "file_name", "mime", "data"],
        [b.student_id, b.doc_type, b.file_name, b.mime, b.data],
      );
    }
    const docAction = p.match(/^\/student-documents\/(\d+)\/(verify|delete)$/);
    if (r.method === "POST" && docAction) {
      this.writeAllowed(account);
      return docAction[2] === "delete"
        ? this.remove(account, "student_documents", Number(docAction[1]))
        : this.setFlag(
            account,
            "student_documents",
            Number(docAction[1]),
            "verified",
            !!boolBody.parse(r.body).verified,
          );
    }
    if (r.method === "GET" && p === "/student-marks")
      return this.read((d) => {
        const rows = d
          .prepare(
            "SELECT id,term,subject,max_marks,marks,grade,remarks FROM student_marks WHERE student_id=? ORDER BY id DESC",
          )
          .all(this.studentId(url));
        return this.ok({ marks: rows, total: rows.length });
      });
    if (r.method === "POST" && p === "/student-marks") {
      this.writeAllowed(account);
      const b = mark.parse(r.body);
      return this.insert(
        r,
        account,
        "student_marks",
        [
          "student_id",
          "term",
          "subject",
          "max_marks",
          "marks",
          "grade",
          "remarks",
        ],
        [
          b.student_id,
          b.term,
          b.subject,
          b.max_marks ?? null,
          b.marks ?? null,
          b.grade ?? null,
          b.remarks ?? null,
        ],
      );
    }
    const markDelete = p.match(/^\/student-marks\/(\d+)\/delete$/);
    if (r.method === "POST" && markDelete) {
      this.writeAllowed(account);
      return this.remove(account, "student_marks", Number(markDelete[1]));
    }
    if (r.method === "GET" && p === "/board-registrations")
      return this.read((d) => {
        const rows = d
          .prepare(
            "SELECT id,exam_year,registration_no,loc_status,admit_card_status,board_subjects,notes FROM board_registrations WHERE student_id=? ORDER BY id DESC",
          )
          .all(this.studentId(url));
        return this.ok({ registrations: rows, total: rows.length });
      });
    if (r.method === "POST" && p === "/board-registrations") {
      this.writeAllowed(account);
      const b = board.extend({ student_id: id }).parse(r.body);
      return this.insert(
        r,
        account,
        "board_registrations",
        [
          "student_id",
          "exam_year",
          "registration_no",
          "loc_status",
          "admit_card_status",
          "board_subjects",
          "notes",
        ],
        [
          b.student_id,
          b.exam_year ?? null,
          b.registration_no ?? null,
          b.loc_status ?? null,
          b.admit_card_status ?? null,
          b.board_subjects ?? null,
          b.notes ?? null,
        ],
      );
    }
    const boardAction = p.match(
      /^\/board-registrations\/(\d+)\/(update|delete)$/,
    );
    if (r.method === "POST" && boardAction) {
      this.writeAllowed(account);
      if (boardAction[2] === "delete")
        return this.remove(
          account,
          "board_registrations",
          Number(boardAction[1]),
        );
      const b = board.parse(r.body);
      return this.update(
        account,
        "board_registrations",
        Number(boardAction[1]),
        [
          "exam_year",
          "registration_no",
          "loc_status",
          "admit_card_status",
          "board_subjects",
          "notes",
        ],
        [
          b.exam_year ?? null,
          b.registration_no ?? null,
          b.loc_status ?? null,
          b.admit_card_status ?? null,
          b.board_subjects ?? null,
          b.notes ?? null,
        ],
      );
    }
    if (r.method === "GET" && p === "/student-communications")
      return this.read((d) => {
        const rows = d
          .prepare(
            "SELECT id,channel,direction,subject,body,acknowledged,created_at FROM student_communications WHERE student_id=? ORDER BY id DESC",
          )
          .all(this.studentId(url));
        return this.ok({
          messages: rows.map((row: any) => ({
            ...row,
            acknowledged: Number(row.acknowledged) === 1,
          })),
          total: rows.length,
        });
      });
    if (r.method === "POST" && p === "/student-communications") {
      this.writeAllowed(account);
      const b = communication.parse(r.body);
      return this.insert(
        r,
        account,
        "student_communications",
        ["student_id", "channel", "direction", "subject", "body"],
        [b.student_id, b.channel, b.direction, b.subject, b.body ?? null],
      );
    }
    const commAction = p.match(
      /^\/student-communications\/(\d+)\/(ack|delete)$/,
    );
    if (r.method === "POST" && commAction) {
      this.writeAllowed(account);
      return commAction[2] === "delete"
        ? this.remove(account, "student_communications", Number(commAction[1]))
        : this.setFlag(
            account,
            "student_communications",
            Number(commAction[1]),
            "acknowledged",
            !!boolBody.parse(r.body).acknowledged,
          );
    }
    const analytics = p.match(/^\/students\/(\d+)\/analytics$/);
    if (r.method === "GET" && analytics)
      return this.analytics(Number(analytics[1]));
    const advance = p.match(/^\/students\/(\d+)\/advance-lock$/);
    if (r.method === "POST" && advance) {
      this.writeAllowed(account);
      const body = z
        .object({
          to: z.enum(LOCK_STAGES).optional(),
          reason: z.string().max(500).optional(),
        })
        .parse(r.body);
      return this.advanceLock(
        account,
        Number(advance[1]),
        body.to,
        body.reason,
      );
    }
    const history = p.match(/^\/students\/(\d+)\/audit$/);
    if (r.method === "GET" && history)
      return this.read((d) => {
        const rows = d
          .prepare(
            "SELECT a.id,u.username,a.action,a.detail,a.created_at FROM audit_log a LEFT JOIN users u ON u.id=a.user_id WHERE a.resource_type IN ('student','students') AND a.resource_id=? ORDER BY a.id DESC",
          )
          .all(Number(history[1]))
          .map((row: any) => ({ ...row, detail: this.json(row.detail) }));
        return this.ok({ history: rows, total: rows.length });
      });
    return { status: 404, body: { error: "Records endpoint not found." } };
  }
  private analytics(studentId: number) {
    return this.read((d) => {
      const student = d
        .prepare("SELECT first_name,last_name FROM students WHERE id=?")
        .get(studentId) as any;
      if (!student) return this.notFound();
      const rows = d
        .prepare(
          "SELECT subject,marks,max_marks,recorded_at FROM student_marks WHERE student_id=? AND marks IS NOT NULL AND max_marks>0 ORDER BY recorded_at",
        )
        .all(studentId) as any[];
      const groups = new Map<string, number[]>();
      for (const r of rows) {
        const values = groups.get(r.subject ?? "Other") ?? [];
        values.push((r.marks / r.max_marks) * 100);
        groups.set(r.subject ?? "Other", values);
      }
      const subjects = [...groups].map(([subject, v]) => {
        const avg = v.reduce((a, b) => a + b, 0) / v.length;
        const delta = v.length > 1 ? v[v.length - 1]! - v[0]! : 0;
        return {
          subject,
          avg_pct: Number(avg.toFixed(1)),
          count: v.length,
          trend: delta > 2 ? "improving" : delta < -2 ? "declining" : "steady",
          delta: Number(delta.toFixed(1)),
        };
      });
      const overall = subjects.length
        ? subjects.reduce((a, b) => a + b.avg_pct, 0) / subjects.length
        : null;
      return this.ok({
        name: `${student.first_name ?? ""} ${student.last_name ?? ""}`.trim(),
        overall_pct: overall == null ? null : Number(overall.toFixed(1)),
        subjects,
        strengths: subjects
          .filter((s) => s.avg_pct >= 75)
          .map((s) => s.subject),
        weaknesses: subjects
          .filter((s) => s.avg_pct < 50)
          .map((s) => s.subject),
        recommendations: subjects
          .filter((s) => s.avg_pct < 50)
          .map((s) => `Plan focused support for ${s.subject}.`),
        summary: subjects.length
          ? `Performance is based on ${rows.length} recorded assessment(s).`
          : "No scores recorded yet.",
      });
    });
  }
  private advanceLock(
    a: AccountContext,
    studentId: number,
    to?: (typeof LOCK_STAGES)[number],
    reason?: string,
  ) {
    return this.write((d) =>
      d.transaction(() => {
        const current = d
          .prepare("SELECT lock_state FROM students WHERE id=?")
          .pluck()
          .get(studentId) as string | undefined;
        if (current == null) return this.notFound();
        const index = LOCK_STAGES.indexOf(current as any);
        const next =
          to ?? LOCK_STAGES[Math.min(LOCK_STAGES.length - 1, index + 1)]!;
        if (LOCK_STAGES.indexOf(next) < Math.max(0, index))
          throw new Error("Record lock cannot move backwards.");
        d.prepare("UPDATE students SET lock_state=? WHERE id=?").run(
          next,
          studentId,
        );
        this.audit(
          d,
          a.id,
          "student.lock",
          "students",
          studentId,
          JSON.stringify({ old: current, new: next, reason: reason ?? null }),
        );
        return this.ok({ ok: true, lock_state: next });
      })(),
    );
  }
  private insert(
    _r: ApiRequest,
    a: AccountContext,
    table: string,
    cols: string[],
    values: unknown[],
  ) {
    return this.write((d) => {
      const result = d
        .prepare(
          `INSERT INTO ${table}(${cols.join(",")}) VALUES(${cols.map(() => "?").join(",")})`,
        )
        .run(...values);
      this.audit(d, a.id, "create", table, Number(result.lastInsertRowid));
      return this.created({ ok: true, id: Number(result.lastInsertRowid) });
    });
  }
  private update(
    a: AccountContext,
    table: string,
    id: number,
    cols: string[],
    values: unknown[],
  ) {
    return this.write((d) => {
      const result = d
        .prepare(
          `UPDATE ${table} SET ${cols.map((c) => `${c}=?`).join(",")} WHERE id=?`,
        )
        .run(...values, id);
      if (!result.changes) return this.notFound();
      this.audit(d, a.id, "update", table, id);
      return this.ok({ ok: true, id });
    });
  }
  private remove(a: AccountContext, table: string, id: number) {
    return this.write((d) => {
      const result = d.prepare(`DELETE FROM ${table} WHERE id=?`).run(id);
      if (!result.changes) return this.notFound();
      this.audit(d, a.id, "delete", table, id);
      return this.ok({ ok: true });
    });
  }
  private setFlag(
    a: AccountContext,
    table: string,
    id: number,
    column: string,
    value: boolean,
  ) {
    return this.write((d) => {
      const result = d
        .prepare(`UPDATE ${table} SET ${column}=? WHERE id=?`)
        .run(value ? 1 : 0, id);
      if (!result.changes) return this.notFound();
      this.audit(d, a.id, "update", table, id, `${column}=${value}`);
      return this.ok({ ok: true });
    });
  }
  private list(d: Database.Database, table: string, key: string) {
    const rows = d.prepare(`SELECT * FROM ${table} ORDER BY id DESC`).all();
    return this.ok({ [key]: rows, total: rows.length });
  }
  private studentId(url: URL) {
    return id.parse(Number(url.searchParams.get("student_id")));
  }
  private nextId(d: Database.Database, table: string) {
    return Number(
      d.prepare(`SELECT COALESCE(max(id),0)+1 FROM ${table}`).pluck().get(),
    );
  }
  private writeAllowed(a: AccountContext) {
    if (a.level > 3) throw new Error("Insufficient privileges.");
  }
  private audit(
    d: Database.Database,
    userId: number,
    action: string,
    resource: string,
    resourceId: number | null,
    detail: string | null = null,
  ) {
    d.prepare(
      "INSERT INTO audit_log(user_id,action,resource_type,resource_id,detail) VALUES(?,?,?,?,?)",
    ).run(userId, action, resource, resourceId, detail);
  }
  private json(value: unknown) {
    if (typeof value !== "string") return null;
    try {
      return JSON.parse(value);
    } catch {
      return { reason: value };
    }
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
    try {
      return fn(d);
    } finally {
      d.close();
    }
  }
  private ok(body: unknown): ApiResponse {
    return { status: 200, body };
  }
  private created(body: unknown): ApiResponse {
    return { status: 201, body };
  }
  private notFound(): ApiResponse {
    return { status: 404, body: { error: "Record not found." } };
  }
}
