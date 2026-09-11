const Database = require("../dist/sqlite.js").default;
const { mkdirSync, rmSync } = require("node:fs");
const { join, basename } = require("node:path");
const { migrateSchema } = require("../dist/schema.js");
const { StaffOpsRouter } = require("../dist/staff-ops-router.js");

(async () => {
  const dir = join(__dirname, ".staff-ops-test");
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir);
  const path = join(dir, "school.sqlite");
  const db = new Database(path);
  migrateSchema(db);
  db.prepare(
    "INSERT INTO users(username,password_hash,role,name,level) VALUES('admin','x','admin','Admin',1)",
  ).run();
  db.prepare(
    "INSERT INTO staff(first_name,last_name) VALUES('Tara','Teacher')",
  ).run();
  db.close();
  const router = new StaffOpsRouter(() => path, {
    accountContext: () => ({ id: 1, role: "admin", level: 1 }),
  });
  const call = (method, route, body) => {
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
  const department = call("POST", "/departments", {
    name: "Science",
    head_staff_id: 1,
  });
  let check = new Database(path);
  check
    .prepare("UPDATE staff SET department_id=? WHERE id=1")
    .run(department.id);
  check.close();
  const departments = call("GET", "/departments");
  if (
    departments.departments[0].staff_count !== 1 ||
    departments.departments[0].head_name !== "Tara Teacher"
  )
    throw new Error("Department aggregation mismatch");
  const leave = call("POST", "/leave", {
    staff_id: 1,
    leave_type: "sick",
    from_date: "2026-09-10",
    to_date: "2026-09-11",
    reason: "Recovery",
  });
  call("POST", "/leave/approve", { id: leave.id });
  const approved = call("GET", "/leave?status=approved");
  if (approved.total !== 1 || approved.leave_requests[0].approved_by !== 1)
    throw new Error("Leave approval mismatch");
  call("POST", `/departments/${department.id}/delete`, {});
  check = new Database(path);
  const staff = check
    .prepare("SELECT department_id FROM staff WHERE id=1")
    .get();
  check.close();
  if (staff.department_id !== null)
    throw new Error("Department detach mismatch");
  console.log(
    JSON.stringify({
      departmentAggregation: "ok",
      leaveApproval: "ok",
      departmentDetach: "ok",
    }),
  );
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
