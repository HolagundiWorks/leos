import Database from "./sqlite";
import { z } from "zod";
import {
  apiResponseSchema,
  type ApiRequest,
  type ApiResponse,
} from "./contracts";
import { AuthService, type AccountContext } from "./auth";

const id = z.number().int().positive();
const vehicle = z.object({
  name: z.string().trim().min(1),
  driver_name: z.string().nullable().optional(),
  driver_phone: z.string().nullable().optional(),
  capacity: z.number().int().min(0).nullable().optional(),
  notes: z.string().nullable().optional(),
});
const route = z.object({
  name: z.string().trim().min(1),
  vehicle_id: id.nullable().optional(),
  fare: z.number().min(0).nullable().optional(),
  notes: z.string().nullable().optional(),
});
const stop = z.object({
  route_id: id,
  name: z.string().trim().min(1),
  pickup_time: z.string().nullable().optional(),
  sort_order: z.number().int().min(0).optional(),
});
const assignment = z.object({
  student_id: id,
  route_id: id,
  stop_id: id.nullable().optional(),
});
const issued = z.object({
  student_id: id,
  item_type: z.enum(["id", "books", "uniform"]),
  issued: z.boolean(),
});
const visitor = z.object({
  name: z.string().trim().min(1),
  phone: z.string().nullable().optional(),
  purpose: z.string().nullable().optional(),
  whom_to_meet: z.string().nullable().optional(),
});
const book = z.object({
  title: z.string().trim().min(1),
  author: z.string().nullable().optional(),
  isbn: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  total_copies: z.number().int().min(1).max(10000).optional(),
});
const loan = z.object({
  book_id: id,
  student_id: id,
  due_date: z.string().nullable().optional(),
});

export class OperationsRouter {
  public constructor(
    private readonly databasePath: () => string,
    private readonly auth: AuthService,
  ) {}
  public handle(r: ApiRequest, u: URL): ApiResponse | null {
    const p = u.pathname;
    if (!/^\/(transport|issued|visitors|library)/.test(p)) return null;
    const a = this.auth.accountContext(r.token);
    this.authorize(a);
    if (r.method === "GET" && p === "/transport/vehicles")
      return this.listVehicles();
    if (r.method === "POST" && p === "/transport/vehicles")
      return this.createVehicle(r, a);
    if (r.method === "POST" && /^\/transport\/vehicles\/\d+\/delete$/.test(p))
      return this.deleteVehicle(Number(p.split("/")[3]), a);
    if (r.method === "GET" && p === "/transport/routes")
      return this.listRoutes();
    if (r.method === "POST" && p === "/transport/routes")
      return this.createRoute(r, a);
    if (r.method === "POST" && /^\/transport\/routes\/\d+\/delete$/.test(p))
      return this.deleteRoute(Number(p.split("/")[3]), a);
    if (r.method === "POST" && p === "/transport/stops")
      return this.createStop(r, a);
    if (r.method === "POST" && /^\/transport\/stops\/\d+\/delete$/.test(p))
      return this.deleteStop(Number(p.split("/")[3]), a);
    if (r.method === "GET" && p === "/transport/assignments")
      return this.listAssignments(u);
    if (r.method === "POST" && p === "/transport/assignments")
      return this.assign(r, a);
    if (
      r.method === "POST" &&
      /^\/transport\/assignments\/\d+\/delete$/.test(p)
    )
      return this.simpleDelete(
        "transport_assignments",
        Number(p.split("/")[3]),
        a,
      );
    if (r.method === "GET" && p === "/issued") return this.listIssued(u);
    if (r.method === "POST" && p === "/issued/mark")
      return this.markIssued(r, a);
    if (r.method === "GET" && p === "/visitors") return this.listVisitors(u);
    if (r.method === "POST" && p === "/visitors") return this.checkIn(r, a);
    if (r.method === "POST" && /^\/visitors\/\d+\/checkout$/.test(p))
      return this.checkout(Number(p.split("/")[2]), a);
    if (r.method === "POST" && /^\/visitors\/\d+\/delete$/.test(p))
      return this.simpleDelete("visitors", Number(p.split("/")[2]), a);
    if (r.method === "GET" && p === "/library/books") return this.listBooks(u);
    if (r.method === "POST" && p === "/library/books")
      return this.createBook(r, a);
    if (r.method === "POST" && /^\/library\/books\/\d+\/delete$/.test(p))
      return this.deleteBook(Number(p.split("/")[3]), a);
    if (r.method === "GET" && p === "/library/loans") return this.listLoans(u);
    if (r.method === "POST" && p === "/library/loans")
      return this.issueBook(r, a);
    if (r.method === "POST" && /^\/library\/loans\/\d+\/return$/.test(p))
      return this.returnBook(Number(p.split("/")[3]), a);
    return this.response(404, {
      error: `Operations endpoint not found: ${r.method} ${p}`,
    });
  }
  private listVehicles() {
    return this.read((d) => {
      const rows = d
        .prepare(
          "SELECT id,name,driver_name,driver_phone,capacity,notes FROM transport_vehicles ORDER BY name",
        )
        .all();
      return this.ok({ vehicles: rows, total: rows.length });
    });
  }
  private createVehicle(r: ApiRequest, a: AccountContext) {
    const b = vehicle.parse(r.body);
    return this.write((d) => {
      const x = d
        .prepare(
          "INSERT INTO transport_vehicles(name,driver_name,driver_phone,capacity,notes) VALUES(?,?,?,?,?)",
        )
        .run(
          b.name,
          b.driver_name ?? null,
          b.driver_phone ?? null,
          b.capacity ?? null,
          b.notes ?? null,
        );
      this.audit(
        d,
        a,
        "transport.vehicle.create",
        "transport_vehicle",
        Number(x.lastInsertRowid),
      );
      return this.ok({ ok: true, id: Number(x.lastInsertRowid) });
    });
  }
  private deleteVehicle(recordId: number, a: AccountContext) {
    return this.write((d) => {
      d.transaction(() => {
        d.prepare(
          "UPDATE transport_routes SET vehicle_id=NULL WHERE vehicle_id=?",
        ).run(recordId);
        d.prepare("DELETE FROM transport_vehicles WHERE id=?").run(recordId);
      })();
      this.audit(
        d,
        a,
        "transport.vehicle.delete",
        "transport_vehicle",
        recordId,
      );
      return this.ok({ ok: true });
    });
  }
  private listRoutes() {
    return this.read((d) => {
      const rows = (
        d
          .prepare(
            `SELECT r.id,r.name,r.vehicle_id,v.name vehicle_name,r.fare,r.notes,(SELECT COUNT(*) FROM transport_assignments a WHERE a.route_id=r.id) assigned FROM transport_routes r LEFT JOIN transport_vehicles v ON v.id=r.vehicle_id ORDER BY r.name`,
          )
          .all() as Array<Record<string, unknown>>
      ).map((x) => ({
        ...x,
        stops: d
          .prepare(
            "SELECT id,name,pickup_time,sort_order FROM transport_stops WHERE route_id=? ORDER BY sort_order,id",
          )
          .all(x.id),
      }));
      return this.ok({ routes: rows, total: rows.length });
    });
  }
  private createRoute(r: ApiRequest, a: AccountContext) {
    const b = route.parse(r.body);
    return this.write((d) => {
      const x = d
        .prepare(
          "INSERT INTO transport_routes(name,vehicle_id,fare,notes) VALUES(?,?,?,?)",
        )
        .run(b.name, b.vehicle_id ?? null, b.fare ?? null, b.notes ?? null);
      this.audit(
        d,
        a,
        "transport.route.create",
        "transport_route",
        Number(x.lastInsertRowid),
      );
      return this.ok({ ok: true, id: Number(x.lastInsertRowid) });
    });
  }
  private deleteRoute(recordId: number, a: AccountContext) {
    return this.write((d) => {
      d.transaction(() => {
        d.prepare("DELETE FROM transport_assignments WHERE route_id=?").run(
          recordId,
        );
        d.prepare("DELETE FROM transport_stops WHERE route_id=?").run(recordId);
        d.prepare("DELETE FROM transport_routes WHERE id=?").run(recordId);
      })();
      this.audit(d, a, "transport.route.delete", "transport_route", recordId);
      return this.ok({ ok: true });
    });
  }
  private createStop(r: ApiRequest, a: AccountContext) {
    const b = stop.parse(r.body);
    return this.write((d) => {
      const x = d
        .prepare(
          "INSERT INTO transport_stops(route_id,name,pickup_time,sort_order) VALUES(?,?,?,?)",
        )
        .run(b.route_id, b.name, b.pickup_time ?? null, b.sort_order ?? 0);
      this.audit(
        d,
        a,
        "transport.stop.create",
        "transport_stop",
        Number(x.lastInsertRowid),
      );
      return this.ok({ ok: true, id: Number(x.lastInsertRowid) });
    });
  }
  private deleteStop(recordId: number, a: AccountContext) {
    return this.write((d) => {
      d.transaction(() => {
        d.prepare(
          "UPDATE transport_assignments SET stop_id=NULL WHERE stop_id=?",
        ).run(recordId);
        d.prepare("DELETE FROM transport_stops WHERE id=?").run(recordId);
      })();
      this.audit(d, a, "transport.stop.delete", "transport_stop", recordId);
      return this.ok({ ok: true });
    });
  }
  private listAssignments(u: URL) {
    const routeId = this.qid(u, "route_id");
    if (!routeId) return this.response(422, { error: "route_id required" });
    return this.read((d) => {
      const rows = d
        .prepare(
          `SELECT a.id,a.student_id,s.first_name,s.last_name,a.stop_id,st.name stop_name FROM transport_assignments a JOIN students s ON s.id=a.student_id LEFT JOIN transport_stops st ON st.id=a.stop_id WHERE a.route_id=? ORDER BY s.first_name,s.last_name`,
        )
        .all(routeId);
      return this.ok({ assignments: rows, total: rows.length });
    });
  }
  private assign(r: ApiRequest, a: AccountContext) {
    const b = assignment.parse(r.body);
    return this.write((d) => {
      if (
        b.stop_id &&
        !d
          .prepare("SELECT 1 FROM transport_stops WHERE id=? AND route_id=?")
          .get(b.stop_id, b.route_id)
      )
        return this.response(422, {
          error: "Stop does not belong to the selected route",
        });
      d.prepare(
        "INSERT INTO transport_assignments(student_id,route_id,stop_id) VALUES(?,?,?) ON CONFLICT(student_id) DO UPDATE SET route_id=excluded.route_id,stop_id=excluded.stop_id",
      ).run(b.student_id, b.route_id, b.stop_id ?? null);
      this.audit(d, a, "transport.assignment.save", "student", b.student_id);
      return this.ok({ ok: true });
    });
  }
  private listIssued(u: URL) {
    const sectionId = this.qid(u, "section_id");
    if (!sectionId) return this.response(422, { error: "section_id required" });
    return this.read((d) => {
      const raw = d
        .prepare(
          `SELECT s.id student_id,s.first_name,s.last_name,ii.item_type,ii.issued,ii.issued_date FROM section_students ss JOIN students s ON s.id=ss.student_id LEFT JOIN issued_items ii ON ii.student_id=s.id WHERE ss.section_id=? ORDER BY s.first_name,s.last_name`,
        )
        .all(sectionId) as Array<{
        student_id: number;
        first_name: string | null;
        last_name: string | null;
        item_type: string | null;
        issued: number | null;
        issued_date: string | null;
      }>;
      const map = new Map<
        number,
        {
          student_id: number;
          first_name: string | null;
          last_name: string | null;
          items: Record<string, boolean>;
          dates: Record<string, string | null>;
        }
      >();
      for (const x of raw) {
        if (!map.has(x.student_id))
          map.set(x.student_id, {
            student_id: x.student_id,
            first_name: x.first_name,
            last_name: x.last_name,
            items: {},
            dates: {},
          });
        if (x.item_type) {
          map.get(x.student_id)!.items[x.item_type] = x.issued === 1;
          map.get(x.student_id)!.dates[x.item_type] = x.issued_date;
        }
      }
      return this.ok({ students: [...map.values()], section_id: sectionId });
    });
  }
  private markIssued(r: ApiRequest, a: AccountContext) {
    const b = issued.parse(r.body);
    return this.write((d) => {
      d.prepare(
        `INSERT INTO issued_items(student_id,item_type,issued,issued_date,marked_by) VALUES(?,?,?,CASE WHEN ?=1 THEN date('now') ELSE NULL END,?) ON CONFLICT(student_id,item_type) DO UPDATE SET issued=excluded.issued,issued_date=CASE WHEN excluded.issued=1 THEN date('now') ELSE NULL END,marked_by=excluded.marked_by`,
      ).run(
        b.student_id,
        b.item_type,
        Number(b.issued),
        Number(b.issued),
        a.id,
      );
      this.audit(d, a, "issued.mark", "student", b.student_id);
      return this.ok({ ok: true });
    });
  }
  private listVisitors(u: URL) {
    const date = u.searchParams.get("date");
    return this.read((d) => {
      const rows = d
        .prepare(
          "SELECT id,name,phone,purpose,whom_to_meet,date,in_time,out_time FROM visitors WHERE date=COALESCE(?,date('now')) ORDER BY (out_time IS NOT NULL),in_time DESC,id DESC",
        )
        .all(date);
      return this.ok({ visitors: rows, total: rows.length });
    });
  }
  private checkIn(r: ApiRequest, a: AccountContext) {
    const b = visitor.parse(r.body);
    return this.write((d) => {
      const x = d
        .prepare(
          "INSERT INTO visitors(name,phone,purpose,whom_to_meet,date,in_time,created_by) VALUES(?,?,?,?,date('now'),datetime('now'),?)",
        )
        .run(
          b.name,
          b.phone ?? null,
          b.purpose ?? null,
          b.whom_to_meet ?? null,
          a.id,
        );
      this.audit(d, a, "visitor.checkin", "visitor", Number(x.lastInsertRowid));
      return this.ok({ ok: true, id: Number(x.lastInsertRowid) });
    });
  }
  private checkout(recordId: number, a: AccountContext) {
    return this.write((d) => {
      d.prepare(
        "UPDATE visitors SET out_time=datetime('now') WHERE id=? AND out_time IS NULL",
      ).run(recordId);
      this.audit(d, a, "visitor.checkout", "visitor", recordId);
      return this.ok({ ok: true });
    });
  }
  private listBooks(u: URL) {
    const q = u.searchParams.get("q"),
      like = q ? `%${q}%` : null;
    return this.read((d) => {
      const rows = d
        .prepare(
          "SELECT id,title,author,isbn,category,total_copies,available_copies FROM library_books WHERE (? IS NULL OR title LIKE ? OR author LIKE ? OR category LIKE ?) ORDER BY title",
        )
        .all(like, like, like, like);
      return this.ok({ books: rows, total: rows.length });
    });
  }
  private createBook(r: ApiRequest, a: AccountContext) {
    const b = book.parse(r.body),
      copies = b.total_copies ?? 1;
    return this.write((d) => {
      const x = d
        .prepare(
          "INSERT INTO library_books(title,author,isbn,category,total_copies,available_copies) VALUES(?,?,?,?,?,?)",
        )
        .run(
          b.title,
          b.author ?? null,
          b.isbn ?? null,
          b.category ?? null,
          copies,
          copies,
        );
      this.audit(
        d,
        a,
        "library.book.create",
        "library_book",
        Number(x.lastInsertRowid),
      );
      return this.ok({ ok: true, id: Number(x.lastInsertRowid) });
    });
  }
  private deleteBook(recordId: number, a: AccountContext) {
    return this.write((d) => {
      d.transaction(() => {
        d.prepare("DELETE FROM library_loans WHERE book_id=?").run(recordId);
        d.prepare("DELETE FROM library_books WHERE id=?").run(recordId);
      })();
      this.audit(d, a, "library.book.delete", "library_book", recordId);
      return this.ok({ ok: true });
    });
  }
  private listLoans(u: URL) {
    const all = u.searchParams.get("status") === "all";
    return this.read((d) => {
      const rows = d
        .prepare(
          `SELECT l.id,l.book_id,b.title,l.student_id,s.first_name,s.last_name,l.issued_date,l.due_date,l.returned_date FROM library_loans l JOIN library_books b ON b.id=l.book_id JOIN students s ON s.id=l.student_id ${all ? "" : "WHERE l.returned_date IS NULL"} ORDER BY (l.returned_date IS NOT NULL),l.due_date`,
        )
        .all();
      return this.ok({ loans: rows, total: rows.length });
    });
  }
  private issueBook(r: ApiRequest, a: AccountContext) {
    const b = loan.parse(r.body);
    return this.write((d) => {
      const tx = d.transaction(() => {
        const changed = d
          .prepare(
            "UPDATE library_books SET available_copies=available_copies-1 WHERE id=? AND available_copies>0",
          )
          .run(b.book_id);
        if (!changed.changes) throw new Error("No copies available");
        const x = d
          .prepare(
            "INSERT INTO library_loans(book_id,student_id,issued_date,due_date,created_by) VALUES(?,?,date('now'),?,?)",
          )
          .run(b.book_id, b.student_id, b.due_date ?? null, a.id);
        return Number(x.lastInsertRowid);
      });
      const recordId = tx();
      this.audit(d, a, "library.loan.issue", "library_loan", recordId);
      return this.ok({ ok: true, id: recordId });
    });
  }
  private returnBook(recordId: number, a: AccountContext) {
    return this.write((d) => {
      const tx = d.transaction(() => {
        const changed = d
          .prepare(
            "UPDATE library_loans SET returned_date=date('now') WHERE id=? AND returned_date IS NULL",
          )
          .run(recordId);
        if (changed.changes)
          d.prepare(
            "UPDATE library_books SET available_copies=MIN(total_copies,available_copies+1) WHERE id=(SELECT book_id FROM library_loans WHERE id=?)",
          ).run(recordId);
      });
      tx();
      this.audit(d, a, "library.loan.return", "library_loan", recordId);
      return this.ok({ ok: true });
    });
  }
  private simpleDelete(
    table: "transport_assignments" | "visitors",
    recordId: number,
    a: AccountContext,
  ) {
    return this.write((d) => {
      d.prepare(`DELETE FROM ${table} WHERE id=?`).run(recordId);
      this.audit(d, a, "operations.delete", table, recordId);
      return this.ok({ ok: true });
    });
  }
  private authorize(a: AccountContext) {
    if (a.level > 3) throw new Error("Insufficient privileges.");
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
