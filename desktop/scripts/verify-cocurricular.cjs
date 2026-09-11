const Database = require("../dist/sqlite.js").default;
const { mkdirSync, rmSync } = require("node:fs");
const { join } = require("node:path");
const { migrateSchema } = require("../dist/schema.js");
const { CocurricularRouter } = require("../dist/cocurricular-router.js");
(async () => {
  const dir = join(__dirname, ".cocurricular-test");
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir);
  const path = join(dir, "school.sqlite");
  const db = new Database(path);
  migrateSchema(db);
  db.prepare(
    "INSERT INTO users(username,password_hash,role,name,level) VALUES('admin','x','admin','Admin',1)",
  ).run();
  db.prepare(
    "INSERT INTO students(first_name,last_name) VALUES('Anu','Student')",
  ).run();
  db.close();
  const router = new CocurricularRouter(() => path, {
    accountContext: () => ({ id: 1, role: "admin", level: 1 }),
  });
  const token = "00000000-0000-4000-8000-000000000000";
  const call = (method, route, body) => {
    const r = router.handle(
      { method, path: route, body, token },
      new URL(route, "http://leos.local"),
    );
    if (!r || r.status >= 400) throw new Error(JSON.stringify(r));
    return r.body;
  };
  const red = call("POST", "/clubs", { name: "Red House" });
  const blue = call("POST", "/clubs", { name: "Blue House" });
  const member = call("POST", "/club-members", {
    club_id: red.id,
    student_id: 1,
    student_name: "Anu Student",
    role: "captain",
  });
  const event = call("POST", "/sports/events", {
    name: "100m",
    sport: "Athletics",
    home_club_id: red.id,
    away_club_id: blue.id,
  });
  call("POST", "/sports/results", {
    event_id: event.id,
    participant: "Anu Student",
    club_id: red.id,
    position: 1,
    points: 10,
  });
  call("POST", "/sports/results", {
    event_id: event.id,
    participant: "Bea Student",
    club_id: blue.id,
    position: 2,
    points: 6,
  });
  const board = call("GET", "/sports/leaderboard");
  if (board.clubs[0].club !== "Red House" || board.clubs[0].points !== 10)
    throw new Error("Leaderboard mismatch");
  if (call("GET", `/club-members?club_id=${red.id}`).total !== 1)
    throw new Error("Roster mismatch");
  call("POST", `/club-members/${member.id}/delete`, {});
  call("POST", `/sports/events/${event.id}/delete`, {});
  if (call("GET", "/sports/events").total !== 0)
    throw new Error("Event delete mismatch");
  const check = new Database(path, { readonly: true });
  const audit = check.prepare("SELECT count(*) FROM audit_log").pluck().get();
  const results = check
    .prepare("SELECT count(*) FROM sports_results")
    .pluck()
    .get();
  check.close();
  if (audit !== 8 || results !== 0)
    throw new Error(`Audit/cascade mismatch ${audit}/${results}`);
  console.log(
    JSON.stringify({
      clubs: "rostered",
      events: "scheduled",
      leaderboard: "aggregated",
      cascade: "verified",
      audit: "complete",
    }),
  );
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
