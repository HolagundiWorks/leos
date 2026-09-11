const Database = require("../dist/sqlite.js").default;
const {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { join } = require("node:path");
const { hashSync } = require("bcryptjs");
const { unzipSync, zipSync } = require("fflate");
const { migrateSchema } = require("../dist/schema.js");
const { AuthService } = require("../dist/auth.js");
const { BackupRouter } = require("../dist/backup-router.js");

(async () => {
  const dir = join(__dirname, ".backup-test");
  const destination = join(dir, "archives");
  const databasePath = join(dir, "school.sqlite");
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(destination, { recursive: true });

  const database = new Database(databasePath);
  migrateSchema(database);
  database
    .prepare(
      "INSERT INTO schools(name,academic_year,type) VALUES('Original School','2026-27','school')",
    )
    .run();
  database
    .prepare("INSERT INTO meta(key,value) VALUES('master_key_hash',?)")
    .run(hashSync("master-key", 4));
  database
    .prepare(
      "INSERT INTO users(username,password_hash,role,name,level) VALUES('admin',?,'admin','Admin',1)",
    )
    .run(hashSync("password", 4));
  database.close();

  const auth = new AuthService(() => databasePath);
  await auth.unlock("master-key");
  const login = await auth.login({ username: "admin", password: "password" });
  const router = new BackupRouter(() => databasePath, auth);
  const call = async (method, path, body, source) => {
    const response = await router.handle(
      { method, path, body, source, token: login.token },
      path,
    );
    if (!response || response.status >= 400)
      throw new Error(`${method} ${path}: ${JSON.stringify(response)}`);
    return response.body;
  };

  await call("POST", "/backup/config", {
    schedule: "weekly",
    destinations: [destination],
    enabled: true,
  });
  const saved = await call("POST", "/backup/run", { destination });
  if (!existsSync(saved.path))
    throw new Error("Backup archive was not created");
  const list = await call("GET", "/backup/list");
  if (list.backups.length !== 1 || list.backups[0].status !== "ok")
    throw new Error("Backup history mismatch");

  let lanBlocked = false;
  try {
    await call("GET", "/backup/list", undefined, "lan");
  } catch (error) {
    lanBlocked = /host computer/.test(String(error));
  }
  if (!lanBlocked) throw new Error("LAN backup access was not blocked");

  const changed = new Database(databasePath);
  changed.prepare("UPDATE schools SET name='Changed School'").run();
  changed.close();
  let badKeyBlocked = false;
  try {
    await call("POST", "/backup/restore", {
      path: saved.path,
      master_key: "wrong-key",
    });
  } catch (error) {
    badKeyBlocked = /Invalid master key/.test(String(error));
  }
  if (!badKeyBlocked) throw new Error("Invalid master key was accepted");

  const tamperedPath = join(destination, "tampered.leosdb");
  const archive = unzipSync(new Uint8Array(readFileSync(saved.path)));
  archive["school.sqlite"][100] ^= 1;
  writeFileSync(tamperedPath, zipSync(archive));
  let checksumBlocked = false;
  try {
    await call("POST", "/backup/restore", {
      path: tamperedPath,
      master_key: "master-key",
    });
  } catch (error) {
    checksumBlocked = /checksum validation failed/.test(String(error));
  }
  if (!checksumBlocked) throw new Error("Tampered archive was accepted");

  const restored = await call("POST", "/backup/restore", {
    path: saved.path,
    master_key: "master-key",
  });
  const check = new Database(databasePath, { readonly: true });
  const schoolName = check
    .prepare("SELECT name FROM schools LIMIT 1")
    .pluck()
    .get();
  check.close();
  if (schoolName !== "Original School" || !restored.requires_relogin)
    throw new Error("Backup restore mismatch");
  console.log(
    JSON.stringify({
      archive: "created",
      history: "ok",
      lan: "blocked",
      masterKey: "verified",
      checksum: "verified",
      restore: "round-trip",
    }),
  );
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
