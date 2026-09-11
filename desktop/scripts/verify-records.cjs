const Database = require("../dist/sqlite.js").default;
const { mkdirSync, rmSync } = require("node:fs");
const { join } = require("node:path");
const { migrateSchema } = require("../dist/schema.js");
const { RecordsRouter } = require("../dist/records-router.js");
(async () => {
  const dir = join(__dirname, ".records-test");
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir);
  const path = join(dir, "school.sqlite");
  const db = new Database(path);
  migrateSchema(db);
  db.prepare(
    "INSERT INTO users(username,password_hash,role,name,level) VALUES('admin','x','admin','Admin',1)",
  ).run();
  db.prepare(
    "INSERT INTO students(first_name,last_name,lock_state) VALUES('Anu','Student','Draft')",
  ).run();
  db.close();
  const router = new RecordsRouter(() => path, {
    accountContext: () => ({ id: 1, role: "admin", level: 1 }),
  });
  const token = "00000000-0000-4000-8000-000000000000";
  const call = (method, route, body) => {
    const response = router.handle(
      { method, path: route, body, token },
      new URL(route, "http://leos.local"),
    );
    if (!response || response.status >= 400)
      throw new Error(`${method} ${route}: ${JSON.stringify(response)}`);
    return response.body;
  };
  const letter = call("POST", "/letters", {
    recipient: "Parent",
    subject: "Meeting",
    body: "Please attend.",
  });
  const cert = call("POST", "/certificates", {
    cert_type: "merit",
    student_name: "Anu Student",
    student_id: 1,
  });
  if (!letter.ref_no.startsWith("LTR-") || !cert.serial.startsWith("CERT-"))
    throw new Error("Document numbering mismatch");
  const doc = call("POST", "/student-documents", {
    student_id: 1,
    doc_type: "birth",
    file_name: "birth.pdf",
    mime: "application/pdf",
    data: "cGRm",
  });
  call("POST", `/student-documents/${doc.id}/verify`, { verified: true });
  if (
    call("GET", "/student-documents?student_id=1").documents[0].verified !== 1
  )
    throw new Error("Document verification mismatch");
  call("POST", "/student-marks", {
    student_id: 1,
    term: "T1",
    subject: "Math",
    max_marks: 100,
    marks: 40,
  });
  call("POST", "/student-marks", {
    student_id: 1,
    term: "T2",
    subject: "Math",
    max_marks: 100,
    marks: 80,
  });
  const analytics = call("GET", "/students/1/analytics");
  if (
    analytics.overall_pct !== 60 ||
    analytics.subjects[0].trend !== "improving"
  )
    throw new Error("Analytics mismatch");
  const registration = call("POST", "/board-registrations", {
    student_id: 1,
    exam_year: "2027",
    loc_status: "draft",
  });
  call("POST", `/board-registrations/${registration.id}/update`, {
    loc_status: "submitted",
  });
  const message = call("POST", "/student-communications", {
    student_id: 1,
    channel: "phone",
    direction: "outbound",
    subject: "Progress",
  });
  call("POST", `/student-communications/${message.id}/ack`, {
    acknowledged: true,
  });
  if (
    call("POST", "/students/1/advance-lock", {}).lock_state !==
    "Parent Verified"
  )
    throw new Error("Lock workflow mismatch");
  const history = call("GET", "/students/1/audit");
  if (!history.history.some((row) => row.action === "student.lock"))
    throw new Error("Student audit mismatch");
  console.log(
    JSON.stringify({
      letters: "numbered",
      certificates: "numbered",
      documents: "verified",
      marks: "analyzed",
      board: "updated",
      communications: "acknowledged",
      lock: "audited",
    }),
  );
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
