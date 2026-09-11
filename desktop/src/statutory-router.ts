import Database from "./sqlite";
import type { ApiRequest, ApiResponse } from "./contracts";
import { AuthService } from "./auth";
export class StatutoryRouter {
  public constructor(
    private readonly databasePath: () => string,
    private readonly auth: AuthService,
  ) {}
  public handle(r: ApiRequest, path: string): ApiResponse | null {
    if (path !== "/compliance/statutory-report") return null;
    if (r.method !== "GET")
      return { status: 405, body: { error: "Method not allowed." } };
    this.auth.requireLevel(r.token, 2);
    const d = new Database(this.databasePath(), {
      readonly: true,
      fileMustExist: true,
    });
    try {
      const count = (sql: string, ...p: unknown[]) =>
        Number(
          d
            .prepare(sql)
            .pluck()
            .get(...p) ?? 0,
        );
      const school =
        d
          .prepare(
            "SELECT name,academic_year,affiliation_no,school_code,udise_code,address,principal_name FROM schools ORDER BY id LIMIT 1",
          )
          .get() ?? null;
      const genders = Object.fromEntries(
        ["Male", "Female", "Other"].map((v) => [
          v,
          count("SELECT count(*) FROM students WHERE gender=?", v),
        ]),
      );
      const categories = Object.fromEntries(
        ["General", "OBC", "SC", "ST", "EWS"].map((v) => [
          v,
          count("SELECT count(*) FROM students WHERE category=?", v),
        ]),
      );
      return {
        status: 200,
        body: {
          school,
          generated_at: String(
            d.prepare("SELECT datetime('now')").pluck().get(),
          ),
          students: {
            total: count("SELECT count(*) FROM students"),
            enrolled: count("SELECT count(*) FROM students WHERE enrolled=1"),
            by_gender: genders,
            by_category: categories,
            rte_ews: categories.EWS,
            cwsn: count("SELECT count(*) FROM students WHERE cwsn='Yes'"),
          },
          staff: {
            total: count("SELECT count(*) FROM staff"),
            teaching: count(
              "SELECT count(*) FROM staff WHERE profile IN ('teacher','class_teacher','exam_coord','timetable_coord')",
            ),
          },
          infrastructure: {
            classrooms: count("SELECT count(*) FROM classrooms"),
            classes: count("SELECT count(*) FROM classes"),
            sections: count("SELECT count(*) FROM sections"),
          },
          finance: {
            fees_collected: Number(
              d
                .prepare(
                  "SELECT COALESCE(sum(amount_paid),0) FROM fee_payments",
                )
                .pluck()
                .get() ?? 0,
            ),
          },
        },
      };
    } finally {
      d.close();
    }
  }
}
