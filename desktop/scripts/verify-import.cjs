const Database = require("../dist/sqlite.js").default;
const { mkdirSync, rmSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
const { migrateSchema } = require("../dist/schema.js");
const { ImportRouter } = require("../dist/import-router.js");
const { SchoolFileService } = require("../dist/school-files.js");

(async () => {
  const dir = join(__dirname, ".import-test");
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const activePath = join(dir, "active.sqlite");
  const sourcePath = join(dir, "source.sqlite");
  const archivePath = join(dir, "source.leosdb");
  const csvPath = join(dir, "students.csv");

  const active = new Database(activePath);
  migrateSchema(active);
  active.prepare("INSERT INTO schools(name) VALUES('Active')").run();
  active
    .prepare(
      "INSERT INTO users(username,password_hash,role,name,level) VALUES('admin','x','admin','Admin',1)",
    )
    .run();
  active
    .prepare(
      "INSERT INTO students(first_name,last_name,email,phone) VALUES('Alice','Able','alice@example.test','111')",
    )
    .run();
  active.close();

  const source = new Database(sourcePath);
  migrateSchema(source);
  source.prepare("INSERT INTO schools(name) VALUES('Incoming')").run();
  source
    .prepare(
      "INSERT INTO students(first_name,last_name,email,phone) VALUES('Alice','Able','alice@example.test','999')",
    )
    .run();
  source
    .prepare(
      "INSERT INTO students(first_name,last_name,email,phone) VALUES('Bob','Baker','bob@example.test','222')",
    )
    .run();
  source
    .prepare(
      "INSERT INTO staff(first_name,last_name,email,profile) VALUES('Tara','Teacher','tara@example.test','teacher')",
    )
    .run();
  source.prepare("INSERT INTO courses(name) VALUES('Imported Course')").run();
  source.close();
  await new SchoolFileService(() => sourcePath).saveArchive(archivePath);

  writeFileSync(
    csvPath,
    'first_name,last_name,email,phone\n"Carol, Ann",Clark,carol@example.test,333\nAlice,Able,alice@example.test,444\n',
  );
  const router = new ImportRouter(() => activePath, { requireLevel: () => 1 });
  const token = "00000000-0000-4000-8000-000000000000";
  const call = (method, path, body, sourceType) => {
    const response = router.handle(
      { method, path, body, source: sourceType, token },
      path,
    );
    if (!response || response.status >= 400)
      throw new Error(`${method} ${path}: ${JSON.stringify(response)}`);
    return response.body;
  };

  const csv = call("POST", "/import/csv", {
    path: csvPath,
    target: "students",
  });
  if (csv.rows_imported !== 1 || csv.rows_failed !== 1)
    throw new Error("CSV result mismatch");
  const sqlite = call("POST", "/import/sqlite", {
    path: sourcePath,
    tables: ["courses"],
  });
  if (sqlite.rows_imported !== 1) throw new Error("SQLite import mismatch");

  const preview = call("POST", "/import/merge/preview", { path: archivePath });
  if (
    preview.summary.students.new !== 1 ||
    preview.summary.students.conflict !== 1 ||
    preview.summary.staff.new !== 1
  )
    throw new Error("Merge preview classification mismatch");
  const alice = preview.students.find((row) => row.action === "conflict");
  const bob = preview.students.find((row) => row.action === "new");
  const tara = preview.staff.find((row) => row.action === "new");
  const applied = call("POST", "/import/merge/apply", {
    students: [
      { action: "update", id: alice.existing.id, data: alice.incoming },
      { action: "insert", data: bob.incoming },
    ],
    staff: [{ action: "insert", data: tara.incoming }],
  });
  if (applied.inserted !== 2 || applied.updated !== 1)
    throw new Error("Merge apply mismatch");

  let lanBlocked = false;
  try {
    call("GET", "/import/jobs", undefined, "lan");
  } catch (error) {
    lanBlocked = /host computer/.test(String(error));
  }
  if (!lanBlocked) throw new Error("LAN import access was not blocked");
  const check = new Database(activePath, { readonly: true });
  const phone = check
    .prepare("SELECT phone FROM students WHERE email='alice@example.test'")
    .pluck()
    .get();
  const jobs = check
    .prepare("SELECT count(*) FROM import_jobs WHERE status='completed'")
    .pluck()
    .get();
  const audits = check
    .prepare("SELECT count(*) FROM audit_log WHERE action LIKE 'merge_%'")
    .pluck()
    .get();
  check.close();
  if (phone !== "999" || jobs !== 3 || audits !== 3)
    throw new Error("Imported data or audit history mismatch");
  console.log(
    JSON.stringify({
      csv: "quoted-and-deduplicated",
      sqlite: "allowlisted",
      archive: "checksum-verified",
      preview: "natural-key",
      apply: "audited",
      lan: "blocked",
    }),
  );
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
