const Database = require("../dist/sqlite.js").default;
const { mkdirSync, rmSync } = require("node:fs");
const { join } = require("node:path");
const { migrateSchema } = require("../dist/schema.js");
const { OperationsRouter } = require("../dist/operations-router.js");

(async () => {
  const dir = join(__dirname, ".operations-test");
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
  db.prepare("INSERT INTO classes(name) VALUES('Grade 1')").run();
  db.prepare("INSERT INTO sections(class_id,name) VALUES(1,'A')").run();
  db.prepare(
    "INSERT INTO section_students(section_id,student_id) VALUES(1,1)",
  ).run();
  db.close();
  const router = new OperationsRouter(() => path, {
    accountContext: () => ({ id: 1, role: "admin", level: 1 }),
  });
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

  await call("POST", "/transport/vehicles", { name: "Bus 1", capacity: 40 });
  await call("POST", "/transport/routes", {
    name: "North",
    vehicle_id: 1,
    fare: 500,
  });
  await call("POST", "/transport/stops", {
    route_id: 1,
    name: "Main Road",
    pickup_time: "07:30",
  });
  await call("POST", "/transport/assignments", {
    student_id: 1,
    route_id: 1,
    stop_id: 1,
  });
  const routes = await call("GET", "/transport/routes");
  if (routes.routes[0].assigned !== 1 || routes.routes[0].stops.length !== 1)
    throw new Error("Transport aggregation mismatch");

  await call("POST", "/issued/mark", {
    student_id: 1,
    item_type: "books",
    issued: true,
  });
  const issued = await call("GET", "/issued?section_id=1");
  if (!issued.students[0].items.books)
    throw new Error("Issued-item marker mismatch");

  const visit = await call("POST", "/visitors", {
    name: "Parent One",
    purpose: "Meeting",
  });
  await call("POST", `/visitors/${visit.id}/checkout`);
  const visitors = await call("GET", "/visitors");
  if (!visitors.visitors[0].out_time)
    throw new Error("Visitor checkout mismatch");

  await call("POST", "/library/books", { title: "Algebra", total_copies: 1 });
  const loan = await call("POST", "/library/loans", {
    book_id: 1,
    student_id: 1,
    due_date: "2026-09-30",
  });
  let books = await call("GET", "/library/books");
  if (books.books[0].available_copies !== 0)
    throw new Error("Book issue inventory mismatch");
  await call("POST", `/library/loans/${loan.id}/return`);
  books = await call("GET", "/library/books");
  if (books.books[0].available_copies !== 1)
    throw new Error("Book return inventory mismatch");
  console.log(
    JSON.stringify({
      transport: "ok",
      issued: "ok",
      visitor: "ok",
      libraryInventory: "ok",
    }),
  );
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
