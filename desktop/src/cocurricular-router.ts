import Database from "./sqlite";
import { z } from "zod";
import type { ApiRequest, ApiResponse } from "./contracts";
import { AuthService, type AccountContext } from "./auth";
const id = z.number().int().positive();
const text = z.string().max(10000).nullable().optional();
const event = z
  .object({
    name: z.string().trim().min(1).max(200),
    sport: text,
    event_date: text,
    event_time: text,
    venue: text,
    notes: text,
    home_club_id: id.nullable().optional(),
    away_club_id: id.nullable().optional(),
  })
  .refine(
    (v) =>
      !v.home_club_id || !v.away_club_id || v.home_club_id !== v.away_club_id,
    "Home and away clubs must differ.",
  );
const result = z.object({
  event_id: id,
  participant: z.string().trim().min(1).max(200),
  club_id: id.nullable().optional(),
  position: z.number().int().positive().nullable().optional(),
  points: z.number().int().min(0).max(10000).optional(),
  note: text,
});
const club = z.object({
  name: z.string().trim().min(1).max(200),
  description: text,
  logo: z.string().max(5_000_000).nullable().optional(),
  lead_staff: text,
  meeting_day: text,
});
const member = z.object({
  club_id: id,
  student_name: z.string().trim().min(1).max(200),
  student_id: id.nullable().optional(),
  role: text,
});
export class CocurricularRouter {
  public constructor(
    private readonly databasePath: () => string,
    private readonly auth: AuthService,
  ) {}
  public handle(r: ApiRequest, url: URL): ApiResponse | null {
    const p = url.pathname;
    if (!/^\/(sports|clubs|club-members)/.test(p)) return null;
    const a = this.auth.accountContext(r.token);
    if (r.method === "GET" && p === "/sports/events")
      return this.read((d) => {
        const rows = d
          .prepare(
            `SELECT e.*,hc.name home_club,ac.name away_club,(SELECT count(*) FROM sports_results r WHERE r.event_id=e.id) result_count FROM sports_events e LEFT JOIN clubs hc ON hc.id=e.home_club_id LEFT JOIN clubs ac ON ac.id=e.away_club_id ORDER BY e.event_date DESC,e.id DESC`,
          )
          .all();
        return this.ok({ events: rows, total: rows.length });
      });
    if (r.method === "POST" && p === "/sports/events") {
      this.allow(a);
      const b = event.parse(r.body);
      return this.insert(
        a,
        "sports_events",
        [
          "name",
          "sport",
          "event_date",
          "event_time",
          "venue",
          "notes",
          "home_club_id",
          "away_club_id",
        ],
        [
          b.name,
          b.sport ?? null,
          b.event_date ?? null,
          b.event_time ?? null,
          b.venue ?? null,
          b.notes ?? null,
          b.home_club_id ?? null,
          b.away_club_id ?? null,
        ],
      );
    }
    const eventDelete = p.match(/^\/sports\/events\/(\d+)\/delete$/);
    if (r.method === "POST" && eventDelete) {
      this.allow(a);
      return this.write((d) =>
        d.transaction(() => {
          const eventId = Number(eventDelete[1]);
          d.prepare("DELETE FROM sports_results WHERE event_id=?").run(eventId);
          return this.removeIn(d, a, "sports_events", eventId);
        })(),
      );
    }
    if (r.method === "GET" && p === "/sports/results") {
      const eventId = id.parse(Number(url.searchParams.get("event_id")));
      return this.read((d) => {
        const rows = d
          .prepare(
            "SELECT r.id,r.participant,r.house,r.position,r.points,r.note,r.club_id,c.name club FROM sports_results r LEFT JOIN clubs c ON c.id=r.club_id WHERE r.event_id=? ORDER BY COALESCE(r.position,9999),r.id",
          )
          .all(eventId);
        return this.ok({ results: rows, total: rows.length });
      });
    }
    if (r.method === "POST" && p === "/sports/results") {
      this.allow(a);
      const b = result.parse(r.body);
      return this.insert(
        a,
        "sports_results",
        ["event_id", "participant", "club_id", "position", "points", "note"],
        [
          b.event_id,
          b.participant,
          b.club_id ?? null,
          b.position ?? null,
          b.points ?? 0,
          b.note ?? null,
        ],
      );
    }
    const resultDelete = p.match(/^\/sports\/results\/(\d+)\/delete$/);
    if (r.method === "POST" && resultDelete) {
      this.allow(a);
      return this.remove(a, "sports_results", Number(resultDelete[1]));
    }
    if (r.method === "GET" && p === "/sports/leaderboard")
      return this.read((d) =>
        this.ok({
          clubs: d
            .prepare(
              "SELECT c.id club_id,c.name club,c.logo,COALESCE(sum(r.points),0) points,count(r.id) entries FROM clubs c LEFT JOIN sports_results r ON r.club_id=c.id GROUP BY c.id ORDER BY points DESC,c.name",
            )
            .all(),
          participants: d
            .prepare(
              "SELECT participant,sum(points) points,count(*) entries FROM sports_results GROUP BY lower(participant) ORDER BY points DESC,participant LIMIT 100",
            )
            .all(),
        }),
      );
    if (r.method === "GET" && p === "/clubs")
      return this.read((d) => {
        const rows = d
          .prepare(
            "SELECT c.*,(SELECT count(*) FROM club_members m WHERE m.club_id=c.id) member_count FROM clubs c ORDER BY c.name",
          )
          .all();
        return this.ok({ clubs: rows, total: rows.length });
      });
    if (r.method === "POST" && p === "/clubs") {
      this.allow(a);
      const b = club.parse(r.body);
      return this.insert(
        a,
        "clubs",
        ["name", "description", "logo", "lead_staff", "meeting_day"],
        [
          b.name,
          b.description ?? null,
          b.logo ?? null,
          b.lead_staff ?? null,
          b.meeting_day ?? null,
        ],
      );
    }
    const clubAction = p.match(/^\/clubs\/(\d+)\/(update|delete)$/);
    if (r.method === "POST" && clubAction) {
      this.allow(a);
      const clubId = Number(clubAction[1]);
      if (clubAction[2] === "delete")
        return this.write((d) =>
          d.transaction(() => {
            d.prepare(
              "UPDATE sports_events SET home_club_id=NULL WHERE home_club_id=?",
            ).run(clubId);
            d.prepare(
              "UPDATE sports_events SET away_club_id=NULL WHERE away_club_id=?",
            ).run(clubId);
            d.prepare(
              "UPDATE sports_results SET club_id=NULL WHERE club_id=?",
            ).run(clubId);
            d.prepare("DELETE FROM club_members WHERE club_id=?").run(clubId);
            return this.removeIn(d, a, "clubs", clubId);
          })(),
        );
      const b = club.parse(r.body);
      return this.update(
        a,
        "clubs",
        clubId,
        ["name", "description", "logo", "lead_staff", "meeting_day"],
        [
          b.name,
          b.description ?? null,
          b.logo ?? null,
          b.lead_staff ?? null,
          b.meeting_day ?? null,
        ],
      );
    }
    if (r.method === "GET" && p === "/club-members") {
      const clubId = id.parse(Number(url.searchParams.get("club_id")));
      return this.read((d) => {
        const rows = d
          .prepare(
            "SELECT id,student_id,student_name,role FROM club_members WHERE club_id=? ORDER BY student_name",
          )
          .all(clubId);
        return this.ok({ members: rows, total: rows.length });
      });
    }
    if (r.method === "POST" && p === "/club-members") {
      this.allow(a);
      const b = member.parse(r.body);
      return this.insert(
        a,
        "club_members",
        ["club_id", "student_id", "student_name", "role"],
        [b.club_id, b.student_id ?? null, b.student_name, b.role ?? null],
      );
    }
    const memberDelete = p.match(/^\/club-members\/(\d+)\/delete$/);
    if (r.method === "POST" && memberDelete) {
      this.allow(a);
      return this.remove(a, "club_members", Number(memberDelete[1]));
    }
    return {
      status: 404,
      body: { error: "Co-curricular endpoint not found." },
    };
  }
  private allow(a: AccountContext) {
    if (a.level > 3) throw new Error("Insufficient privileges.");
  }
  private insert(a: AccountContext, t: string, c: string[], v: unknown[]) {
    return this.write((d) => {
      const x = d
        .prepare(
          `INSERT INTO ${t}(${c.join(",")}) VALUES(${c.map(() => "?").join(",")})`,
        )
        .run(...v);
      this.audit(d, a.id, "create", t, Number(x.lastInsertRowid));
      return this.created({ ok: true, id: Number(x.lastInsertRowid) });
    });
  }
  private update(
    a: AccountContext,
    t: string,
    id: number,
    c: string[],
    v: unknown[],
  ) {
    return this.write((d) => {
      const x = d
        .prepare(
          `UPDATE ${t} SET ${c.map((k) => `${k}=?`).join(",")} WHERE id=?`,
        )
        .run(...v, id);
      if (!x.changes) return this.notFound();
      this.audit(d, a.id, "update", t, id);
      return this.ok({ ok: true });
    });
  }
  private remove(a: AccountContext, t: string, id: number) {
    return this.write((d) => this.removeIn(d, a, t, id));
  }
  private removeIn(
    d: Database.Database,
    a: AccountContext,
    t: string,
    id: number,
  ) {
    const x = d.prepare(`DELETE FROM ${t} WHERE id=?`).run(id);
    if (!x.changes) return this.notFound();
    this.audit(d, a.id, "delete", t, id);
    return this.ok({ ok: true });
  }
  private audit(
    d: Database.Database,
    u: number,
    a: string,
    t: string,
    id: number,
  ) {
    d.prepare(
      "INSERT INTO audit_log(user_id,action,resource_type,resource_id) VALUES(?,?,?,?)",
    ).run(u, a, t, id);
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
  private created(body: unknown): ApiResponse {
    return { status: 201, body };
  }
  private notFound(): ApiResponse {
    return { status: 404, body: { error: "Record not found." } };
  }
}
