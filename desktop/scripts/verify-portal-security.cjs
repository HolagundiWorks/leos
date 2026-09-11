const Database = require("../dist/sqlite.js").default;
const { hashSync } = require("bcryptjs");
const { mkdtempSync, rmSync } = require("node:fs");
const { join } = require("node:path");
const { tmpdir } = require("node:os");
const { migrateSchema } = require("../dist/schema.js");
const { AuthService } = require("../dist/auth.js");
const { ApiRouter } = require("../dist/api-router.js");

(async () => {
  const dir = mkdtempSync(join(tmpdir(), "leos-portal-security-"));
  const path = join(dir, "school.leosdb");
  try {
    const db = new Database(path);
    migrateSchema(db);
    db.prepare("INSERT INTO schools(name) VALUES(?)").run("Portal Security Test");
    db.prepare("INSERT INTO meta(key,value) VALUES('master_key_hash',?)").run(hashSync("master-key", 4));
    const studentId = Number(db.prepare("INSERT INTO students(first_name,last_name) VALUES('Test','Student')").run().lastInsertRowid);
    const userId = Number(db.prepare("INSERT INTO users(username,password_hash,role,name,level) VALUES(?,?,?,?,5)").run("student", hashSync("password", 4), "student", "Test Student").lastInsertRowid);
    db.prepare("INSERT INTO user_student_links(user_id,student_id,relationship) VALUES(?,?,'student')").run(userId, studentId);
    db.close();

    const auth = new AuthService(() => path);
    await auth.unlock("master-key");
    const { token } = await auth.login({ username: "student", password: "password" });
    const router = new ApiRouter(() => path, auth);
    const call = (route) => router.handle({ method: "GET", path: route, token });

    const profile = await call("/portal/profile");
    if (profile.status !== 200 || profile.body.students.length !== 1) throw new Error("Linked portal profile was not available");
    const lms = await call("/lms/spaces");
    if (lms.status !== 200) throw new Error(`LMS access failed: ${JSON.stringify(lms)}`);
    const students = await call("/students");
    if (students.status !== 403) throw new Error(`General student directory was exposed: ${JSON.stringify(students)}`);
    const school = await call("/school");
    if (school.status !== 403) throw new Error(`General school route was exposed: ${JSON.stringify(school)}`);

    console.log(JSON.stringify({ health: "ok", profile: "linked-only", lms: "allowed", generalRoutes: "denied" }));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
