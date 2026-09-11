const Database = require("../dist/sqlite.js").default;
const { mkdirSync, rmSync } = require("node:fs");
const { join } = require("node:path");
const { migrateSchema } = require("../dist/schema.js");
const { FinanceRouter } = require("../dist/finance-router.js");

(async () => {
  const dir = join(__dirname, ".finance-test");
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir);
  const path = join(dir, "school.sqlite");
  const db = new Database(path);
  migrateSchema(db);
  db.prepare(
    "INSERT INTO users(username,password_hash,role,name,level) VALUES('admin','x','admin','Admin',1)",
  ).run();
  db.prepare(
    "INSERT INTO students(first_name,last_name) VALUES('Ada','Student')",
  ).run();
  db.prepare(
    "INSERT INTO staff(first_name,last_name) VALUES('Tara','Teacher')",
  ).run();
  db.prepare("INSERT INTO classes(name) VALUES('Grade 1')").run();
  db.prepare("INSERT INTO sections(class_id,name) VALUES(1,'A')").run();
  db.prepare(
    "INSERT INTO section_students(section_id,student_id) VALUES(1,1)",
  ).run();
  db.close();
  const auth = { accountContext: () => ({ id: 1, role: "admin", level: 1 }) };
  const router = new FinanceRouter(() => path, auth);
  const call = async (method, route, body) => {
    const result = router.handle(
      {
        method,
        path: route,
        token: "00000000-0000-4000-8000-000000000000",
        body,
      },
      new URL(route, "http://leos.local"),
    );
    if (!result || result.status >= 400)
      throw new Error(`${method} ${route}: ${JSON.stringify(result)}`);
    return result.body;
  };
  await call("POST", "/fee-heads", { name: "Tuition" });
  await call("POST", "/fee-structures", {
    fee_head_id: 1,
    class_id: 1,
    amount: 1000,
    due_date: "2020-01-01",
  });
  await call("POST", "/fee-payments", {
    student_id: 1,
    fee_head_id: 1,
    amount_paid: 400,
    payment_mode: "cash",
  });
  const outstanding = await call("GET", "/fee-payments/outstanding");
  if (outstanding.outstanding[0].balance !== 600)
    throw new Error("Outstanding balance mismatch");
  const report = await call("GET", "/fees/report");
  if (report.collected !== 400 || report.outstanding_total !== 600)
    throw new Error("Finance report mismatch");
  await call("POST", "/payroll/structure", {
    staff_id: 1,
    basic: 10000,
    hra: 1000,
    da: 500,
    ta: 500,
    other_allowances: 0,
    pf_deduction: 1000,
    pt_deduction: 200,
    other_deductions: 0,
  });
  const generated = await call("POST", "/payroll/generate", {
    staff_ids: [1],
    month: "2026-09",
    working_days: 30,
    paid_days: 15,
  });
  if (generated.generated !== 1) throw new Error("Payroll not generated");
  const slips = await call("GET", "/payroll/payslips?month=2026-09");
  if (slips.payslips[0].gross !== 6000 || slips.payslips[0].net !== 4800)
    throw new Error("Payroll proration mismatch");
  console.log(
    JSON.stringify({
      outstanding: 600,
      collected: 400,
      gross: 6000,
      net: 4800,
    }),
  );
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
