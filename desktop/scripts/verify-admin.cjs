const Database = require("../dist/sqlite.js").default;
const { mkdirSync, rmSync } = require("node:fs");
const { join } = require("node:path");
const { migrateSchema } = require("../dist/schema.js");
const { AdminRouter } = require("../dist/admin-router.js");
(async () => {
  const dir = join(__dirname, ".admin-test");
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir);
  const path = join(dir, "school.sqlite");
  const db = new Database(path);
  migrateSchema(db);
  db.prepare("INSERT INTO schools(name) VALUES('Admin Test')").run();
  db.prepare(
    "INSERT INTO users(username,password_hash,role,name,level) VALUES('admin','x','admin','Admin',1)",
  ).run();
  db.prepare(
    "INSERT INTO users(username,password_hash,role,name,level) VALUES('teacher','x','teacher','Teacher',2)",
  ).run();
  db.prepare(
    "INSERT INTO roles(name,permissions) VALUES('teacher','{}')",
  ).run();
  db.prepare(
    "INSERT INTO module_settings(key,display_name,enabled,min_level) VALUES('students','Students',1,3)",
  ).run();
  db.close();
  const router = new AdminRouter(() => path, { requireLevel: () => 1 });
  const token = "00000000-0000-4000-8000-000000000000";
  const call = (method, route, body) => {
    const result = router.handle(
      { method, path: route, body, token },
      new URL(route, "http://leos.local"),
    );
    if (!result || result.status >= 400)
      throw new Error(JSON.stringify(result));
    return result.body;
  };
  if (call("GET", "/admin/system-info").users !== 2)
    throw new Error("System info mismatch");
  if (call("POST", "/admin/modules/students/toggle").enabled !== false)
    throw new Error("Module toggle mismatch");
  call("POST", "/admin/users/2/level", { level: 3 });
  let finalAdminProtected = false;
  try {
    call("POST", "/admin/users/1/level", { level: 2 });
  } catch (error) {
    finalAdminProtected = /final L1/.test(String(error));
  }
  if (!finalAdminProtected)
    throw new Error("Final administrator was not protected");
  call("POST", "/roles/1/update", { permissions: { attendance: true } });
  const audit = call("GET", "/audit-log?limit=20");
  if (audit.audit_log.length !== 3) throw new Error("Audit log mismatch");
  console.log(
    JSON.stringify({
      health: "ok",
      moduleToggle: "audited",
      hierarchy: "guarded",
      roles: "updated",
      audit: "filtered",
    }),
  );
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
