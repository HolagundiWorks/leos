const Database = require("../dist/sqlite.js").default;
const { hashSync } = require("bcryptjs");
const { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } = require("node:fs");
const { join, resolve } = require("node:path");
const { tmpdir } = require("node:os");
const { migrateSchema } = require("../dist/schema.js");
const { AuthService } = require("../dist/auth.js");
const { ApiRouter } = require("../dist/api-router.js");

const frontendRoot = resolve(__dirname, "../../frontend/src");
const sourceFiles = [];
const walk = (directory) => {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) walk(path);
    else if (/\.(ts|tsx)$/.test(entry)) sourceFiles.push(path);
  }
};
walk(frontendRoot);

const candidates = new Set();
for (const file of sourceFiles) {
  const source = readFileSync(file, "utf8");
  for (const match of source.matchAll(/([`'"])(\/[A-Za-z0-9][^`'"\s]*)\1/g)) {
    let route = match[2]
      .replace(/\$\{(?:suffix|qs|q)\}/g, "")
      .replace(/\$\{[^}]+\}/g, "1")
      .replace(/[),;]+$/, "");
    route = route.split("?")[0];
    if (/^\/[A-Za-z0-9][A-Za-z0-9/_-]*$/.test(route)) candidates.add(route);
  }
}
// Browser shell mount point, served by LanManager rather than ApiRouter.
candidates.delete("/app");

(async () => {
  const dir = mkdtempSync(join(tmpdir(), "leos-renderer-routes-"));
  const path = join(dir, "school.leosdb");
  try {
    const db = new Database(path);
    migrateSchema(db);
    db.prepare("INSERT INTO schools(name) VALUES(?)").run("Route Coverage Test");
    db.prepare("INSERT INTO meta(key,value) VALUES('master_key_hash',?)").run(hashSync("master-key", 4));
    db.prepare("INSERT INTO users(username,password_hash,role,name,level) VALUES(?,?,?,?,1)").run("admin", hashSync("password", 4), "admin", "Administrator");
    db.close();

    const auth = new AuthService(() => path);
    await auth.unlock("master-key");
    const { token } = await auth.login({ username: "admin", password: "password" });
    const router = new ApiRouter(() => path, auth);
    const missing = [];
    for (const route of [...candidates].sort()) {
      let covered = false;
      for (const method of ["GET", "POST"]) {
        const response = await router.handle({ method, path: route, token, body: {} });
        const error = response.body && response.body.error;
        if (!(response.status === 404 && typeof error === "string" && error.startsWith("TypeScript endpoint not migrated:"))) {
          covered = true;
          break;
        }
      }
      if (!covered) missing.push(route);
    }
    if (missing.length) throw new Error(`Unmigrated renderer routes: ${missing.join(", ")}`);
    console.log(JSON.stringify({ health: "ok", rendererRoutesCovered: candidates.size, missing: 0 }));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
