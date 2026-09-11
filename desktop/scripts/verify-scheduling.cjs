const Database = require("../dist/sqlite.js").default;
const { mkdirSync, rmSync } = require("node:fs");
const { join } = require("node:path");
const { migrateSchema } = require("../dist/schema.js");
const { SubstitutionRouter } = require("../dist/substitution-router.js");
const { StatutoryRouter } = require("../dist/statutory-router.js");
(async () => {
  const dir = join(__dirname, ".scheduling-test");
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir);
  const path = join(dir, "school.sqlite");
  const d = new Database(path);
  migrateSchema(d);
  d.prepare(
    "INSERT INTO schools(name,academic_year,affiliation_no) VALUES('Test School','2026-27','AFF-1')",
  ).run();
  d.prepare(
    "INSERT INTO users(username,password_hash,role,name,level) VALUES('admin','x','admin','Admin',1)",
  ).run();
  d.prepare(
    "INSERT INTO staff(first_name,last_name,profile) VALUES('Original','Teacher','teacher')",
  ).run();
  d.prepare(
    "INSERT INTO staff(first_name,last_name,profile) VALUES('Cover','Teacher','teacher')",
  ).run();
  d.prepare("INSERT INTO subjects(name,code) VALUES('Math','MTH')").run();
  d.prepare(
    "INSERT INTO teacher_subjects(staff_id,subject_id,priority) VALUES(1,1,1)",
  ).run();
  d.prepare(
    "INSERT INTO teacher_subjects(staff_id,subject_id,priority) VALUES(2,1,1)",
  ).run();
  d.prepare("INSERT INTO classes(name) VALUES('Grade 1')").run();
  d.prepare("INSERT INTO sections(class_id,name) VALUES(1,'A')").run();
  d.prepare(
    "INSERT INTO periods(label,start_time,end_time,sort_order) VALUES('P1','09:00','09:40',1)",
  ).run();
  d.prepare(
    "INSERT INTO timetable_entries(section_id,period_id,day_of_week,subject_id,staff_id) VALUES(1,1,0,1,1)",
  ).run();
  d.prepare(
    "INSERT INTO students(first_name,last_name,gender,category,enrolled,cwsn) VALUES('A','One','Female','EWS',1,'Yes')",
  ).run();
  d.prepare("INSERT INTO fee_heads(name) VALUES('Tuition')").run();
  d.prepare(
    "INSERT INTO fee_payments(student_id,fee_head_id,amount_paid) VALUES(1,1,500)",
  ).run();
  d.close();
  const auth = {
    accountContext: () => ({ id: 1, role: "admin", level: 1 }),
    requireLevel: () => 1,
  };
  const subs = new SubstitutionRouter(() => path, auth);
  const stat = new StatutoryRouter(() => path, auth);
  const token = "00000000-0000-4000-8000-000000000000";
  const call = (method, route, body) => {
    const x = subs.handle(
      { method, path: route, body, token },
      new URL(route, "http://leos.local"),
    );
    if (!x || x.status >= 400) throw new Error(JSON.stringify(x));
    return x.body;
  };
  if (
    call("POST", "/substitutions/mark-absent", {
      staff_id: 1,
      date: "2026-09-14",
      day_of_week: 0,
      reason: "Leave",
    }).created !== 1
  )
    throw new Error("Absent generation mismatch");
  const list = call("GET", "/substitutions?status=pending");
  const sub = list.substitutions[0];
  const suggestions = call(
    "GET",
    `/substitutions/suggestions?substitution_id=${sub.id}`,
  );
  if (suggestions.suggestions[0].staff_id !== 2)
    throw new Error("Suggestion mismatch");
  call("POST", "/substitutions/assign", {
    substitution_id: sub.id,
    substitute_staff_id: 2,
  });
  call("POST", "/substitutions/resolve", { substitution_id: sub.id });
  const report = stat.handle(
    { method: "GET", path: "/compliance/statutory-report", token },
    "/compliance/statutory-report",
  ).body;
  if (
    report.students.rte_ews !== 1 ||
    report.students.cwsn !== 1 ||
    report.finance.fees_collected !== 500
  )
    throw new Error("Statutory aggregate mismatch");
  console.log(
    JSON.stringify({
      absence: "expanded",
      suggestions: "availability-checked",
      assignment: "validated",
      resolution: "audited",
      statutory: "aggregated",
    }),
  );
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
