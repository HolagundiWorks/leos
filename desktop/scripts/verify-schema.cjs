const { DatabaseSync } = require("node:sqlite");
const { migrateSchema } = require("../dist/schema.js");

const sqlite = new DatabaseSync(":memory:");
const adapter = {
  exec(sql) {
    sqlite.exec(sql);
  },
  pragma(sql) {
    sqlite.exec(`PRAGMA ${sql}`);
  },
  transaction(operation) {
    return () => {
      sqlite.exec("BEGIN");
      try {
        const result = operation();
        sqlite.exec("COMMIT");
        return result;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    };
  },
};

migrateSchema(adapter);
const { count } = sqlite
  .prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table'")
  .get();
const { user_version: version } = sqlite.prepare("PRAGMA user_version").get();
if (count < 60) throw new Error(`Expected at least 60 tables, found ${count}`);
if (version !== 4)
  throw new Error(`Expected schema version 4, found ${version}`);
const planner = sqlite
  .prepare(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name='faculty_plans'",
  )
  .get();
if (!planner?.sql?.includes("period_type IN ('daily','weekly','monthly')")) {
  throw new Error(
    "Faculty planner schema is missing or does not enforce supported periods",
  );
}
for (const table of ["user_staff_links", "user_student_links"]) {
  if (
    !sqlite
      .prepare(
        "SELECT 1 found FROM sqlite_master WHERE type='table' AND name=?",
      )
      .get(table)
  )
    throw new Error(`Missing ${table}`);
}
for (const table of [
  "lms_spaces",
  "lms_modules",
  "lms_lessons",
  "lms_assignments",
  "lms_submissions",
]) {
  if (
    !sqlite
      .prepare(
        "SELECT 1 found FROM sqlite_master WHERE type='table' AND name=?",
      )
      .get(table)
  )
    throw new Error(`Missing ${table}`);
}
console.log(JSON.stringify({ tables: count, schemaVersion: version }));
sqlite.close();
