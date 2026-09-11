const Database = require("../dist/sqlite.js").default;
const { mkdirSync, rmSync } = require("node:fs");
const { join } = require("node:path");
const { migrateSchema } = require("../dist/schema.js");
const { CoordinationRouter } = require("../dist/coordination-router.js");
(async () => {
  const dir = join(__dirname, ".coordination-test");
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
  db.prepare("INSERT INTO classes(name) VALUES('Grade 1')").run();
  db.prepare("INSERT INTO sections(class_id,name) VALUES(1,'A')").run();
  db.close();
  const router = new CoordinationRouter(() => path, {
    accountContext: () => ({ id: 1, role: "admin", level: 1 }),
  });
  const call = (method, route, body) => {
    const r = router.handle(
      {
        method,
        path: route,
        token: "00000000-0000-4000-8000-000000000000",
        body,
      },
      new URL(route, "http://leos.local"),
    );
    if (!r || r.status >= 400)
      throw new Error(`${method} ${route}: ${JSON.stringify(r)}`);
    return r.body;
  };
  const ann = call("POST", "/announcements", {
    title: "Holiday",
    is_draft: true,
  });
  call("POST", `/announcements/${ann.id}/publish`, {});
  const announcements = call("GET", "/announcements");
  if (
    announcements.announcements[0].is_draft ||
    !announcements.announcements[0].published_at
  )
    throw new Error("Announcement publish mismatch");
  const meet = call("POST", "/meetings", {
    title: "Staff review",
    date: "2026-09-10",
  });
  call("POST", `/meetings/${meet.id}/update`, {
    minutes: "Approved",
    status: "completed",
  });
  const meetings = call("GET", "/meetings?status=completed");
  if (meetings.total !== 1 || meetings.meetings[0].minutes !== "Approved")
    throw new Error("Meeting lifecycle mismatch");
  const task = call("POST", "/tasks", {
    title: "Submit report",
    assigned_to: 1,
  });
  call("POST", `/tasks/${task.id}/complete`, {});
  const tasks = call("GET", "/tasks?status=completed");
  if (tasks.total !== 1 || !tasks.tasks[0].completed_at)
    throw new Error("Task completion mismatch");
  const rem = call("POST", "/reminders", {
    title: "Call parent",
    tag: "urgent",
  });
  call("POST", `/reminders/${rem.id}/done`, {});
  if (call("GET", "/reminders").total !== 0)
    throw new Error("Completed reminder remained active");
  const act = call("POST", "/activities", {
    title: "Science visit",
    activity_type: "field_visit",
    date: "2026-09-12",
  });
  call("POST", "/activity-staff", {
    activity_id: act.id,
    staff_id: 1,
    role: "in_charge",
  });
  call("POST", "/activity-sections", {
    activity_id: act.id,
    section_id: 1,
    student_count: 30,
  });
  call("POST", "/activity-expenses", {
    activity_id: act.id,
    head: "Bus",
    amount: 2500,
  });
  call("POST", "/activity-expenses", {
    activity_id: act.id,
    head: "Tickets",
    amount: 1500,
  });
  call("POST", `/activities/${act.id}/update`, { status: "confirmed" });
  const detail = call("GET", `/activities/${act.id}/detail`);
  if (
    detail.total_expense !== 4000 ||
    detail.staff.length !== 1 ||
    detail.sections.length !== 1 ||
    detail.activity.status !== "confirmed"
  )
    throw new Error("Activity detail mismatch");
  console.log(
    JSON.stringify({
      announcement: "published",
      meeting: "completed",
      task: "completed",
      reminder: "done",
      activityTotal: 4000,
    }),
  );
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
