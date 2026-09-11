import Database from "./sqlite";
import { z } from "zod";
import {
  apiResponseSchema,
  type ApiRequest,
  type ApiResponse,
} from "./contracts";
import { AuthService, type AccountContext } from "./auth";

const id = z.number().int().positive();
const money = z.number().finite().min(0);
const feeHead = z.object({
  name: z.string().trim().min(1),
  description: z.string().nullable().optional(),
  is_optional: z.boolean().optional(),
});
const feeStructure = z.object({
  fee_head_id: id,
  amount: money,
  academic_year_id: id.nullable().optional(),
  class_id: id.nullable().optional(),
  due_date: z.string().nullable().optional(),
});
const payment = z.object({
  student_id: id,
  fee_head_id: id,
  academic_year_id: id.nullable().optional(),
  amount_paid: z.number().positive(),
  payment_date: z.string().nullable().optional(),
  payment_mode: z
    .enum(["cash", "cheque", "upi", "neft", "card", "dd"])
    .optional(),
  reference: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});
const scholarship = z
  .object({
    student_id: id,
    name: z.string().trim().min(1),
    kind: z.enum(["amount", "percent"]).optional(),
    value: money,
    notes: z.string().nullable().optional(),
  })
  .refine((v) => v.kind !== "percent" || v.value <= 100, {
    message: "percentage cannot exceed 100",
  });
const salary = z.object({
  staff_id: id,
  basic: money,
  hra: money,
  da: money,
  ta: money,
  other_allowances: money,
  pf_deduction: money,
  pt_deduction: money,
  other_deductions: money,
  effective_from: z.string().nullable().optional(),
});
const generate = z.object({
  staff_ids: z.array(id).min(1).max(500),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  working_days: z.number().int().positive().max(31),
  paid_days: z.number().int().min(0).max(31).optional(),
});

export class FinanceRouter {
  public constructor(
    private readonly databasePath: () => string,
    private readonly auth: AuthService,
  ) {}
  public handle(r: ApiRequest, url: URL): ApiResponse | null {
    const p = url.pathname;
    if (!this.matches(p)) return null;
    const a = this.auth.accountContext(r.token);
    this.authorize(a);
    if (r.method === "GET" && p === "/fee-heads")
      return this.read((d) =>
        this.ok({
          fee_heads: d
            .prepare(
              "SELECT id,name,description,is_optional FROM fee_heads ORDER BY name",
            )
            .all(),
        }),
      );
    if (r.method === "POST" && p === "/fee-heads") return this.createHead(r, a);
    if (r.method === "POST" && /^\/fee-heads\/\d+\/delete$/.test(p))
      return this.remove(a, "fee_heads", Number(p.split("/")[2]));
    if (r.method === "GET" && p === "/fee-structures")
      return this.structures(url);
    if (r.method === "POST" && p === "/fee-structures")
      return this.saveStructure(r, a);
    if (r.method === "GET" && p === "/fee-payments/outstanding")
      return this.outstanding(url, false);
    if (r.method === "GET" && p === "/fee-payments/overdue")
      return this.outstanding(url, true);
    if (r.method === "GET" && p === "/fee-payments") return this.payments(url);
    if (r.method === "POST" && p === "/fee-payments")
      return this.createPayment(r, a);
    if (r.method === "POST" && /^\/fee-payments\/\d+\/delete$/.test(p))
      return this.remove(a, "fee_payments", Number(p.split("/")[2]));
    if (r.method === "GET" && p === "/fees/report") return this.report();
    if (r.method === "GET" && p === "/scholarships") return this.scholarships();
    if (r.method === "POST" && p === "/scholarships")
      return this.createScholarship(r, a);
    if (r.method === "POST" && /^\/scholarships\/\d+\/delete$/.test(p))
      return this.remove(a, "scholarships", Number(p.split("/")[2]));
    if (r.method === "GET" && p === "/payroll/structure")
      return this.salaryStructure(url);
    if (r.method === "POST" && p === "/payroll/structure")
      return this.saveSalary(r, a);
    if (r.method === "GET" && p === "/payroll/payslips")
      return this.payslips(url);
    if (r.method === "POST" && p === "/payroll/generate")
      return this.generatePayroll(r, a);
    return this.response(404, {
      error: `Finance endpoint not found: ${r.method} ${p}`,
    });
  }
  private matches(p: string) {
    return /^\/(fee-heads|fee-structures|fee-payments|fees\/report|scholarships|payroll\/)/.test(
      p,
    );
  }
  private createHead(r: ApiRequest, a: AccountContext) {
    const b = feeHead.parse(r.body);
    return this.write((d) => {
      const x = d
        .prepare(
          "INSERT INTO fee_heads(name,description,is_optional) VALUES(?,?,?)",
        )
        .run(b.name, b.description ?? null, Number(b.is_optional ?? false));
      this.audit(
        d,
        a,
        "finance.fee-head.create",
        "fee_head",
        Number(x.lastInsertRowid),
      );
      return this.ok({ ok: true, id: Number(x.lastInsertRowid) });
    });
  }
  private structures(u: URL) {
    const y = this.qid(u, "year_id"),
      c = this.qid(u, "class_id");
    return this.read((d) => {
      const rows = d
        .prepare(
          `SELECT fs.id,fs.academic_year_id,fs.class_id,c.name class_name,fs.fee_head_id,fh.name fee_head_name,fs.amount,fs.due_date FROM fee_structures fs JOIN fee_heads fh ON fh.id=fs.fee_head_id LEFT JOIN classes c ON c.id=fs.class_id WHERE (? IS NULL OR fs.academic_year_id=?) AND (? IS NULL OR fs.class_id=?) ORDER BY fh.name,c.name`,
        )
        .all(y, y, c, c);
      return this.ok({ structures: rows, total: rows.length });
    });
  }
  private saveStructure(r: ApiRequest, a: AccountContext) {
    const b = feeStructure.parse(r.body);
    return this.write((d) => {
      d.prepare(
        `INSERT INTO fee_structures(academic_year_id,class_id,fee_head_id,amount,due_date) VALUES(?,?,?,?,?) ON CONFLICT(academic_year_id,class_id,fee_head_id) DO UPDATE SET amount=excluded.amount,due_date=excluded.due_date`,
      ).run(
        b.academic_year_id ?? null,
        b.class_id ?? null,
        b.fee_head_id,
        b.amount,
        b.due_date ?? null,
      );
      this.audit(d, a, "finance.fee-structure.save", "fee_head", b.fee_head_id);
      return this.ok({ ok: true });
    });
  }
  private payments(u: URL) {
    const s = this.qid(u, "student_id"),
      y = this.qid(u, "year_id");
    return this.read((d) => {
      const rows = d
        .prepare(
          `SELECT fp.id,fp.student_id,s.first_name,s.last_name,fp.fee_head_id,fh.name fee_head_name,fp.academic_year_id,fp.amount_paid,fp.payment_date,fp.payment_mode,fp.reference,fp.receipt_no,fp.notes FROM fee_payments fp JOIN students s ON s.id=fp.student_id JOIN fee_heads fh ON fh.id=fp.fee_head_id WHERE (? IS NULL OR fp.student_id=?) AND (? IS NULL OR fp.academic_year_id=?) ORDER BY fp.payment_date DESC,fp.id DESC`,
        )
        .all(s, s, y, y);
      return this.ok({ payments: rows, total: rows.length });
    });
  }
  private createPayment(r: ApiRequest, a: AccountContext) {
    const b = payment.parse(r.body);
    return this.write((d) => {
      const year =
        b.academic_year_id ??
        (d
          .prepare(
            "SELECT id FROM academic_years WHERE is_active=1 ORDER BY id DESC LIMIT 1",
          )
          .pluck()
          .get() as number | undefined) ??
        null;
      const receipt = `RCP-${Date.now()}-${b.student_id}`;
      const x = d
        .prepare(
          `INSERT INTO fee_payments(student_id,fee_head_id,academic_year_id,amount_paid,payment_date,payment_mode,reference,receipt_no,collected_by,notes) VALUES(?,?,?,?,COALESCE(?,date('now')),?,?,?,?,?)`,
        )
        .run(
          b.student_id,
          b.fee_head_id,
          year,
          b.amount_paid,
          b.payment_date ?? null,
          b.payment_mode ?? "cash",
          b.reference ?? null,
          receipt,
          a.id,
          b.notes ?? null,
        );
      this.audit(
        d,
        a,
        "finance.payment.collect",
        "fee_payment",
        Number(x.lastInsertRowid),
      );
      return this.ok({
        ok: true,
        id: Number(x.lastInsertRowid),
        receipt_no: receipt,
      });
    });
  }
  private outstanding(u: URL, overdue: boolean) {
    const y = this.qid(u, "year_id"),
      student = this.qid(u, "student_id");
    return this.read((d) => {
      const where = overdue
        ? "AND fs.due_date IS NOT NULL AND fs.due_date < date('now')"
        : "";
      const rows = d
        .prepare(
          `SELECT * FROM (SELECT s.id student_id,s.first_name,s.last_name,fs.fee_head_id,fh.name fee_head_name,fs.amount amount_due,fs.due_date,COALESCE((SELECT SUM(fp.amount_paid) FROM fee_payments fp WHERE fp.student_id=s.id AND fp.fee_head_id=fs.fee_head_id AND (? IS NULL OR fp.academic_year_id=?)),0) amount_paid,fs.amount-COALESCE((SELECT SUM(fp.amount_paid) FROM fee_payments fp WHERE fp.student_id=s.id AND fp.fee_head_id=fs.fee_head_id AND (? IS NULL OR fp.academic_year_id=?)),0) balance FROM students s JOIN (SELECT DISTINCT ss.student_id,se.class_id FROM section_students ss JOIN sections se ON se.id=ss.section_id) sc ON sc.student_id=s.id JOIN fee_structures fs ON (fs.class_id IS NULL OR fs.class_id=sc.class_id) AND (? IS NULL OR fs.academic_year_id=?) JOIN fee_heads fh ON fh.id=fs.fee_head_id WHERE (? IS NULL OR s.id=?) ${where}) WHERE balance>0 ORDER BY due_date,first_name`,
        )
        .all(y, y, y, y, y, y, student, student);
      return this.ok(
        overdue
          ? { overdue: rows, total: rows.length }
          : { outstanding: rows, total: rows.length },
      );
    });
  }
  private report() {
    return this.read((d) => {
      const totals = d
        .prepare(
          "SELECT COALESCE(SUM(amount_paid),0) collected,COUNT(*) payments_count FROM fee_payments",
        )
        .get() as { collected: number; payments_count: number };
      const by_head = d
        .prepare(
          "SELECT fh.name label,COALESCE(SUM(fp.amount_paid),0) amount FROM fee_payments fp JOIN fee_heads fh ON fh.id=fp.fee_head_id GROUP BY fh.id ORDER BY amount DESC",
        )
        .all();
      const by_mode = d
        .prepare(
          "SELECT COALESCE(NULLIF(payment_mode,''),'cash') label,COALESCE(SUM(amount_paid),0) amount FROM fee_payments GROUP BY 1 ORDER BY amount DESC",
        )
        .all();
      const out = this.outstandingRows(d);
      const recent = d
        .prepare(
          `SELECT fp.payment_date date,TRIM(COALESCE(s.first_name,'')||' '||COALESCE(s.last_name,'')) student,fh.name head,fp.amount_paid amount,fp.payment_mode mode,fp.receipt_no FROM fee_payments fp JOIN students s ON s.id=fp.student_id JOIN fee_heads fh ON fh.id=fp.fee_head_id ORDER BY fp.payment_date DESC,fp.id DESC LIMIT 10`,
        )
        .all();
      return this.ok({
        ...totals,
        by_head,
        by_mode,
        outstanding_total: out.reduce((n, x) => n + Number(x.balance), 0),
        outstanding_students: new Set(out.map((x) => x.student_id)).size,
        recent,
      });
    });
  }
  private outstandingRows(d: Database.Database) {
    return d
      .prepare(
        `SELECT * FROM (SELECT s.id student_id,fs.amount-COALESCE((SELECT SUM(fp.amount_paid) FROM fee_payments fp WHERE fp.student_id=s.id AND fp.fee_head_id=fs.fee_head_id),0) balance FROM students s JOIN (SELECT DISTINCT ss.student_id,se.class_id FROM section_students ss JOIN sections se ON se.id=ss.section_id) sc ON sc.student_id=s.id JOIN fee_structures fs ON fs.class_id IS NULL OR fs.class_id=sc.class_id) WHERE balance>0`,
      )
      .all() as Array<{ student_id: number; balance: number }>;
  }
  private scholarships() {
    return this.read((d) => {
      const rows = d
        .prepare(
          `SELECT sc.id,sc.student_id,s.first_name,s.last_name,sc.name,sc.kind,sc.value,sc.notes,sc.awarded_date FROM scholarships sc JOIN students s ON s.id=sc.student_id ORDER BY sc.awarded_date DESC,sc.id DESC`,
        )
        .all();
      return this.ok({ scholarships: rows, total: rows.length });
    });
  }
  private createScholarship(r: ApiRequest, a: AccountContext) {
    const b = scholarship.parse(r.body);
    return this.write((d) => {
      const x = d
        .prepare(
          `INSERT INTO scholarships(student_id,name,kind,value,notes,awarded_date,created_by) VALUES(?,?,?,?,?,date('now'),?)`,
        )
        .run(
          b.student_id,
          b.name,
          b.kind ?? "amount",
          b.value,
          b.notes ?? null,
          a.id,
        );
      this.audit(
        d,
        a,
        "finance.scholarship.create",
        "scholarship",
        Number(x.lastInsertRowid),
      );
      return this.ok({ ok: true, id: Number(x.lastInsertRowid) });
    });
  }
  private salaryStructure(u: URL) {
    const s = this.qid(u, "staff_id");
    if (!s) return this.response(422, { error: "staff_id required" });
    return this.read((d) =>
      this.ok({
        structure:
          d
            .prepare(
              "SELECT id,staff_id,basic,hra,da,ta,other_allowances,pf_deduction,pt_deduction,other_deductions,effective_from FROM salary_structures WHERE staff_id=?",
            )
            .get(s) ?? null,
      }),
    );
  }
  private saveSalary(r: ApiRequest, a: AccountContext) {
    const b = salary.parse(r.body);
    return this.write((d) => {
      d.prepare(
        `INSERT INTO salary_structures(staff_id,basic,hra,da,ta,other_allowances,pf_deduction,pt_deduction,other_deductions,effective_from,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,datetime('now')) ON CONFLICT(staff_id) DO UPDATE SET basic=excluded.basic,hra=excluded.hra,da=excluded.da,ta=excluded.ta,other_allowances=excluded.other_allowances,pf_deduction=excluded.pf_deduction,pt_deduction=excluded.pt_deduction,other_deductions=excluded.other_deductions,effective_from=excluded.effective_from,updated_at=datetime('now')`,
      ).run(
        b.staff_id,
        b.basic,
        b.hra,
        b.da,
        b.ta,
        b.other_allowances,
        b.pf_deduction,
        b.pt_deduction,
        b.other_deductions,
        b.effective_from ?? null,
      );
      this.audit(d, a, "payroll.structure.save", "staff", b.staff_id);
      return this.ok({ ok: true });
    });
  }
  private payslips(u: URL) {
    const s = this.qid(u, "staff_id"),
      m = u.searchParams.get("month");
    return this.read((d) => {
      const rows = d
        .prepare(
          `SELECT p.*,st.first_name,st.last_name FROM payslips p JOIN staff st ON st.id=p.staff_id WHERE (? IS NULL OR p.staff_id=?) AND (? IS NULL OR p.month=?) ORDER BY p.month DESC,st.first_name`,
        )
        .all(s, s, m, m);
      return this.ok({ payslips: rows, total: rows.length });
    });
  }
  private generatePayroll(r: ApiRequest, a: AccountContext) {
    const b = generate.parse(r.body);
    return this.write((d) => {
      const tx = d.transaction(() => {
        let count = 0;
        for (const sid of b.staff_ids) {
          const s = d
            .prepare(
              "SELECT basic,hra,da,ta,other_allowances,pf_deduction,pt_deduction,other_deductions FROM salary_structures WHERE staff_id=?",
            )
            .get(sid) as
            | {
                basic: number;
                hra: number;
                da: number;
                ta: number;
                other_allowances: number;
                pf_deduction: number;
                pt_deduction: number;
                other_deductions: number;
              }
            | undefined;
          if (!s) continue;
          const paid = b.paid_days ?? b.working_days,
            ratio = paid / b.working_days;
          const basic = s.basic * ratio,
            hra = s.hra * ratio,
            da = s.da * ratio,
            ta = s.ta * ratio,
            other = s.other_allowances * ratio,
            gross = basic + hra + da + ta + other,
            net = gross - s.pf_deduction - s.pt_deduction - s.other_deductions;
          d.prepare(
            `INSERT INTO payslips(staff_id,month,basic,hra,da,ta,other_allowances,pf_deduction,pt_deduction,other_deductions,gross,net,working_days,paid_days) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(staff_id,month) DO UPDATE SET basic=excluded.basic,hra=excluded.hra,da=excluded.da,ta=excluded.ta,other_allowances=excluded.other_allowances,pf_deduction=excluded.pf_deduction,pt_deduction=excluded.pt_deduction,other_deductions=excluded.other_deductions,gross=excluded.gross,net=excluded.net,working_days=excluded.working_days,paid_days=excluded.paid_days,generated_at=datetime('now')`,
          ).run(
            sid,
            b.month,
            basic,
            hra,
            da,
            ta,
            other,
            s.pf_deduction,
            s.pt_deduction,
            s.other_deductions,
            gross,
            net,
            b.working_days,
            paid,
          );
          count++;
        }
        return count;
      });
      const count = tx();
      this.audit(d, a, "payroll.generate", "payslip", 0);
      return this.ok({ ok: true, generated: count, month: b.month });
    });
  }
  private remove(
    a: AccountContext,
    table: "fee_heads" | "fee_payments" | "scholarships",
    recordId: number,
  ) {
    return this.write((d) => {
      if (table === "fee_heads")
        d.prepare("DELETE FROM fee_structures WHERE fee_head_id=?").run(
          recordId,
        );
      d.prepare(`DELETE FROM ${table} WHERE id=?`).run(recordId);
      this.audit(d, a, "finance.delete", table, recordId);
      return this.ok({ ok: true });
    });
  }
  private authorize(a: AccountContext) {
    if (a.level > 2) throw new Error("Insufficient privileges.");
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
    d.pragma("foreign_keys=ON");
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
