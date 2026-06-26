// HCW-SMS local API server — offline-first core over SQLite.
// Mirrors the JSON shapes of the legacy PHP API so the React frontend only
// needs its base URL re-pointed (8080 -> 8787). Embeddable later in Tauri and
// extendable into the LAN server.
use std::collections::HashMap;
use std::io::Read;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::{params, Connection};
use serde_json::{json, Value};
use tiny_http::{Header, Method, Request, Response, Server};
use uuid::Uuid;

struct AppState {
    conn: Mutex<Connection>,
    sessions: Mutex<HashMap<String, i64>>,
}

/// Start the HCW-SMS API server (blocks, serving on :8787). Called by the
/// standalone binary and by the Tauri app (on a background thread).
pub fn run() {
    let conn = Connection::open("school.sqlite").expect("open sqlite");
    init_db(&conn);
    let state = Arc::new(AppState {
        conn: Mutex::new(conn),
        sessions: Mutex::new(HashMap::new()),
    });

    let addr = "0.0.0.0:8787";
    let server = Server::http(addr).expect("bind 8787");
    println!("hcwsms-server listening on http://localhost:8787 (SQLite: school.sqlite)");
    for req in server.incoming_requests() {
        let st = state.clone();
        thread::spawn(move || handle(st, req));
    }
}

fn handle(st: Arc<AppState>, mut req: Request) {
    let state: &AppState = &st;
    let method = req.method().clone();
    let raw_url = req.url().to_string();
    let path = raw_url.split('?').next().unwrap_or("/").to_string();

    if method == Method::Options {
        let _ = req.respond(cors(Response::empty(204)));
        return;
    }

    let token: Option<String> = req
        .headers()
        .iter()
        .find(|h| h.field.to_string().eq_ignore_ascii_case("authorization"))
        .map(|h| h.value.to_string().trim_start_matches("Bearer ").trim().to_string());

    let mut body = String::new();
    if method == Method::Post {
        let _ = req.as_reader().read_to_string(&mut body);
    }

    let (status, val) = dispatch(state, &method, &path, &raw_url, token.as_deref(), &body);
    let json_header = Header::from_bytes(&b"Content-Type"[..], &b"application/json"[..]).unwrap();
    let resp = Response::from_string(val.to_string())
        .with_status_code(status)
        .with_header(json_header);
    let _ = req.respond(cors(resp));
}

fn cors<R: Read>(mut r: Response<R>) -> Response<R> {
    let add = |r: &mut Response<R>, k: &[u8], v: &[u8]| {
        r.add_header(Header::from_bytes(k, v).unwrap());
    };
    add(&mut r, b"Access-Control-Allow-Origin", b"*");
    add(&mut r, b"Access-Control-Allow-Methods", b"GET, POST, PUT, PATCH, DELETE, OPTIONS");
    add(&mut r, b"Access-Control-Allow-Headers", b"Content-Type, Authorization");
    r
}

fn dispatch(
    state: &AppState,
    method: &Method,
    path: &str,
    url: &str,
    token: Option<&str>,
    body: &str,
) -> (u16, Value) {
    if method == &Method::Get && (path == "/" || path == "/health") {
        return (200, json!({"ok": true, "service": "hcwsms-server", "store": "sqlite"}));
    }
    if method == &Method::Post && path == "/auth/login" {
        return login(state, body);
    }
    if method == &Method::Get && path == "/auth/me" {
        return with_auth(state, token, |uid| me(state, uid));
    }
    if method == &Method::Get && path == "/students" {
        return with_auth(state, token, |_| students_list(state, url));
    }
    if method == &Method::Post && path == "/students" {
        return with_auth(state, token, |_| student_create(state, body));
    }
    if method == &Method::Get && path.starts_with("/students/") {
        if let Ok(id) = path["/students/".len()..].parse::<i64>() {
            return with_auth(state, token, |_| student_detail(state, id));
        }
    }
    if method == &Method::Post && path.starts_with("/students/") && path.ends_with("/update") {
        let id_str = &path["/students/".len()..path.len() - "/update".len()];
        if let Ok(id) = id_str.parse::<i64>() {
            return with_auth(state, token, |_| student_update(state, id, body));
        }
    }
    if method == &Method::Get && path == "/staff" {
        return with_auth(state, token, |_| staff_list(state, url));
    }
    if method == &Method::Post && path == "/staff" {
        return with_auth(state, token, |_| staff_create(state, body));
    }
    if method == &Method::Post && path.starts_with("/staff/") && path.ends_with("/update") {
        let id_str = &path["/staff/".len()..path.len() - "/update".len()];
        if let Ok(id) = id_str.parse::<i64>() {
            return with_auth(state, token, |_| staff_update(state, id, body));
        }
    }
    if method == &Method::Get && path == "/dashboard/summary" {
        return with_auth(state, token, |_| (200, json!({"summary": dashboard_summary(state)})));
    }
    if method == &Method::Get && path == "/dashboard/today" {
        return with_auth(state, token, |_| (200, json!({"items": dashboard_today(state)})));
    }
    if method == &Method::Get && path == "/courses" {
        return with_auth(state, token, |_| courses_list(state));
    }
    if method == &Method::Get && path == "/subjects" {
        return with_auth(state, token, |_| subjects_list(state, url));
    }
    if method == &Method::Get && path == "/classrooms" {
        return with_auth(state, token, |_| classrooms_list(state));
    }
    if method == &Method::Get && path == "/classes" {
        return with_auth(state, token, |_| classes_list(state));
    }
    if method == &Method::Post && path == "/classes" {
        return with_auth(state, token, |_| class_create(state, body));
    }
    if method == &Method::Post && path.starts_with("/classes/") && path.ends_with("/update") {
        let id_str = &path["/classes/".len()..path.len() - "/update".len()];
        if let Ok(id) = id_str.parse::<i64>() {
            return with_auth(state, token, |_| class_update(state, id, body));
        }
    }
    if method == &Method::Post && path.starts_with("/classes/") && path.ends_with("/delete") {
        let id_str = &path["/classes/".len()..path.len() - "/delete".len()];
        if let Ok(id) = id_str.parse::<i64>() {
            return with_auth(state, token, |_| class_delete(state, id));
        }
    }
    if method == &Method::Post && path == "/sections" {
        return with_auth(state, token, |_| section_create(state, body));
    }
    if method == &Method::Post && path.starts_with("/sections/") && path.ends_with("/update") {
        let id_str = &path["/sections/".len()..path.len() - "/update".len()];
        if let Ok(id) = id_str.parse::<i64>() {
            return with_auth(state, token, |_| section_update(state, id, body));
        }
    }
    if method == &Method::Post && path.starts_with("/sections/") && path.ends_with("/delete") {
        let id_str = &path["/sections/".len()..path.len() - "/delete".len()];
        if let Ok(id) = id_str.parse::<i64>() {
            return with_auth(state, token, |_| section_delete(state, id));
        }
    }
    if method == &Method::Get && path == "/timetable" {
        return with_auth(state, token, |_| timetable_list(state, url));
    }
    if method == &Method::Get && path == "/timetable/quota" {
        return with_auth(state, token, |_| timetable_quota(state, url));
    }
    if method == &Method::Get && path == "/timetable/teacher-load" {
        return with_auth(state, token, |_| timetable_teacher_load(state));
    }
    if method == &Method::Post && path == "/timetable" {
        return with_auth(state, token, |_| timetable_set(state, body));
    }
    if method == &Method::Post && path == "/timetable/clear" {
        return with_auth(state, token, |_| timetable_clear(state, body));
    }
    if method == &Method::Get && path == "/periods" {
        return with_auth(state, token, |_| periods_list(state));
    }
    if method == &Method::Post && path == "/periods" {
        return with_auth(state, token, |_| periods_save(state, body));
    }
    if method == &Method::Get && path == "/teacher-subjects" {
        return with_auth(state, token, |_| teacher_subjects_list(state));
    }
    if method == &Method::Post && path == "/teacher-subjects" {
        return with_auth(state, token, |_| teacher_subjects_assign(state, body));
    }
    if method == &Method::Post && path == "/teacher-subjects/remove" {
        return with_auth(state, token, |_| teacher_subjects_remove(state, body));
    }
    if method == &Method::Get && path == "/school" {
        return with_auth(state, token, |_| school_get(state));
    }
    if method == &Method::Post && path == "/school" {
        return with_auth(state, token, |_| school_save(state, body));
    }
    if method == &Method::Get && path == "/floorplan" {
        return with_auth(state, token, |_| floorplan_get(state));
    }
    if method == &Method::Post && path == "/floorplan" {
        return with_auth(state, token, |_| floorplan_save(state, body));
    }
    if method == &Method::Post && path == "/schooldb/save" {
        return with_auth(state, token, |_| schooldb_save(body));
    }
    if method == &Method::Post && path == "/schooldb/open" {
        return with_auth(state, token, |_| schooldb_open(state, body));
    }
    if method == &Method::Get && path == "/academic-years" {
        return with_auth(state, token, |_| academic_years_list(state));
    }
    if method == &Method::Get && path == "/academic-years/active" {
        return with_auth(state, token, |_| academic_year_active(state));
    }
    if method == &Method::Post && path == "/academic-years" {
        return with_auth(state, token, |_| academic_year_create(state, body));
    }
    if method == &Method::Post && path == "/academic-years/activate" {
        return with_auth(state, token, |_| academic_year_activate(state, body));
    }
    if method == &Method::Post && path == "/academic-years/close" {
        return with_auth(state, token, |_| academic_year_close(state, body));
    }
    if method == &Method::Post && path == "/terms" {
        return with_auth(state, token, |_| term_create(state, body));
    }
    if method == &Method::Post && path == "/terms/delete" {
        return with_auth(state, token, |_| term_delete(state, body));
    }
    if method == &Method::Post && path == "/terms/activate" {
        return with_auth(state, token, |_| term_activate(state, body));
    }
    (404, json!({"error": "not found"}))
}

fn with_auth<F: FnOnce(i64) -> (u16, Value)>(
    state: &AppState,
    token: Option<&str>,
    f: F,
) -> (u16, Value) {
    let uid = token.and_then(|t| state.sessions.lock().unwrap().get(t).copied());
    match uid {
        Some(id) => f(id),
        None => (401, json!({"error": "missing or invalid token"})),
    }
}

// ---- handlers ----

fn login(state: &AppState, body: &str) -> (u16, Value) {
    let v: Value = serde_json::from_str(body).unwrap_or(json!({}));
    let username = v["username"].as_str().unwrap_or("").trim().to_string();
    let password = v["password"].as_str().unwrap_or("").to_string();
    if username.is_empty() || password.is_empty() {
        return (422, json!({"error": "username and password required"}));
    }
    let found = {
        let conn = state.conn.lock().unwrap();
        conn.query_row(
            "SELECT id, username, password_hash, role, name FROM users WHERE username = ?1 COLLATE NOCASE",
            params![username],
            |r| {
                Ok((
                    r.get::<_, i64>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?,
                    r.get::<_, String>(3)?,
                    r.get::<_, String>(4)?,
                ))
            },
        )
        .ok()
    };
    match found {
        Some((id, uname, hash, role, name)) if bcrypt::verify(&password, &hash).unwrap_or(false) => {
            let token = Uuid::new_v4().to_string();
            state.sessions.lock().unwrap().insert(token.clone(), id);
            (200, json!({"token": token, "user": {"id": id, "username": uname, "profile": role, "name": name}}))
        }
        _ => (401, json!({"error": "invalid credentials"})),
    }
}

fn me(state: &AppState, uid: i64) -> (u16, Value) {
    let conn = state.conn.lock().unwrap();
    let r = conn.query_row(
        "SELECT id, username, role, name FROM users WHERE id = ?1",
        params![uid],
        |r| {
            Ok(json!({
                "id": r.get::<_, i64>(0)?,
                "username": r.get::<_, String>(1)?,
                "profile": r.get::<_, String>(2)?,
                "name": r.get::<_, String>(3)?
            }))
        },
    );
    match r {
        Ok(u) => (200, json!({"user": u})),
        Err(_) => (401, json!({"error": "invalid session"})),
    }
}

fn student_row(r: &rusqlite::Row) -> rusqlite::Result<Value> {
    Ok(json!({
        "id": r.get::<_, i64>(0)?,
        "first_name": r.get::<_, Option<String>>(1)?,
        "last_name": r.get::<_, Option<String>>(2)?,
        "email": r.get::<_, Option<String>>(3)?,
        "phone": r.get::<_, Option<String>>(4)?,
        "gender": r.get::<_, Option<String>>(5)?,
        "birthdate": r.get::<_, Option<String>>(6)?,
    }))
}

fn staff_row(r: &rusqlite::Row) -> rusqlite::Result<Value> {
    Ok(json!({
        "id": r.get::<_, i64>(0)?,
        "first_name": r.get::<_, Option<String>>(1)?,
        "last_name": r.get::<_, Option<String>>(2)?,
        "email": r.get::<_, Option<String>>(3)?,
        "phone": r.get::<_, Option<String>>(4)?,
        "profile": r.get::<_, Option<String>>(5)?,
        "title": r.get::<_, Option<String>>(6)?,
    }))
}

fn students_list(state: &AppState, url: &str) -> (u16, Value) {
    let q = q_param(url, "q");
    let conn = state.conn.lock().unwrap();
    let mut list: Vec<Value> = Vec::new();
    let base = "SELECT id, first_name, last_name, email, phone, gender, birthdate FROM students";
    let res: rusqlite::Result<()> = (|| {
        if let Some(qq) = &q {
            let like = format!("%{}%", qq);
            let sql = format!("{base} WHERE (first_name || ' ' || last_name) LIKE ?1 OR email LIKE ?1 ORDER BY first_name, last_name");
            let mut stmt = conn.prepare(&sql)?;
            let mut rows = stmt.query(params![like])?;
            while let Some(r) = rows.next()? {
                list.push(student_row(r)?);
            }
        } else {
            let sql = format!("{base} ORDER BY first_name, last_name");
            let mut stmt = conn.prepare(&sql)?;
            let mut rows = stmt.query([])?;
            while let Some(r) = rows.next()? {
                list.push(student_row(r)?);
            }
        }
        Ok(())
    })();
    match res {
        Ok(()) => {
            let total = list.len();
            (200, json!({"students": list, "total": total}))
        }
        Err(_) => (500, json!({"error": "query failed"})),
    }
}

fn student_create(state: &AppState, body: &str) -> (u16, Value) {
    let v: Value = serde_json::from_str(body).unwrap_or(json!({}));
    let first = match v["first_name"].as_str().filter(|s| !s.is_empty()) {
        Some(n) => n.to_string(),
        None => return (422, json!({"error": "first_name required"})),
    };
    let last = match v["last_name"].as_str().filter(|s| !s.is_empty()) {
        Some(n) => n.to_string(),
        None => return (422, json!({"error": "last_name required"})),
    };
    let conn = state.conn.lock().unwrap();
    match conn.execute(
        "INSERT INTO students(first_name, middle_name, last_name, email, phone, gender, birthdate, alt_id, enrolled, guardian_name, guardian_phone, guardian_relation, address)
         VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13)",
        params![
            first,
            v["middle_name"].as_str().filter(|s| !s.is_empty()),
            last,
            v["email"].as_str().filter(|s| !s.is_empty()),
            v["phone"].as_str().filter(|s| !s.is_empty()),
            v["gender"].as_str().filter(|s| !s.is_empty()),
            v["birthdate"].as_str().filter(|s| !s.is_empty()),
            v["alt_id"].as_str().filter(|s| !s.is_empty()),
            v["enrolled"].as_bool().unwrap_or(false) as i64,
            v["guardian_name"].as_str().filter(|s| !s.is_empty()),
            v["guardian_phone"].as_str().filter(|s| !s.is_empty()),
            v["guardian_relation"].as_str().filter(|s| !s.is_empty()),
            v["address"].as_str().filter(|s| !s.is_empty()),
        ],
    ) {
        Ok(_) => (201, json!({"ok": true, "id": conn.last_insert_rowid()})),
        Err(e) => (500, json!({"error": format!("{e}")})),
    }
}

fn student_update(state: &AppState, id: i64, body: &str) -> (u16, Value) {
    let v: Value = serde_json::from_str(body).unwrap_or(json!({}));
    let conn = state.conn.lock().unwrap();
    match conn.execute(
        "UPDATE students SET first_name=COALESCE(?1,first_name), middle_name=?2, last_name=COALESCE(?3,last_name),
         email=?4, phone=?5, gender=?6, birthdate=?7, alt_id=?8, enrolled=?9,
         guardian_name=?10, guardian_phone=?11, guardian_relation=?12, address=?13
         WHERE id=?14",
        params![
            v["first_name"].as_str().filter(|s| !s.is_empty()),
            v["middle_name"].as_str().map(str::to_string),
            v["last_name"].as_str().filter(|s| !s.is_empty()),
            v["email"].as_str().map(str::to_string),
            v["phone"].as_str().map(str::to_string),
            v["gender"].as_str().map(str::to_string),
            v["birthdate"].as_str().map(str::to_string),
            v["alt_id"].as_str().map(str::to_string),
            v["enrolled"].as_bool().map(|b| b as i64),
            v["guardian_name"].as_str().map(str::to_string),
            v["guardian_phone"].as_str().map(str::to_string),
            v["guardian_relation"].as_str().map(str::to_string),
            v["address"].as_str().map(str::to_string),
            id,
        ],
    ) {
        Ok(0) => (404, json!({"error": "student not found"})),
        Ok(_) => (200, json!({"ok": true})),
        Err(e) => (500, json!({"error": format!("{e}")})),
    }
}

fn student_detail(state: &AppState, id: i64) -> (u16, Value) {
    let conn = state.conn.lock().unwrap();
    let r = conn.query_row(
        "SELECT id, first_name, middle_name, last_name, email, phone, gender, birthdate, alt_id, enrolled,
                guardian_name, guardian_phone, guardian_relation, address
         FROM students WHERE id = ?1",
        params![id],
        |r| {
            Ok(json!({
                "id": r.get::<_, i64>(0)?,
                "first_name": r.get::<_, Option<String>>(1)?,
                "middle_name": r.get::<_, Option<String>>(2)?,
                "last_name": r.get::<_, Option<String>>(3)?,
                "email": r.get::<_, Option<String>>(4)?,
                "phone": r.get::<_, Option<String>>(5)?,
                "gender": r.get::<_, Option<String>>(6)?,
                "birthdate": r.get::<_, Option<String>>(7)?,
                "alt_id": r.get::<_, Option<String>>(8)?,
                "enrolled": r.get::<_, i64>(9)? == 1,
                "guardian_name": r.get::<_, Option<String>>(10)?,
                "guardian_phone": r.get::<_, Option<String>>(11)?,
                "guardian_relation": r.get::<_, Option<String>>(12)?,
                "address": r.get::<_, Option<String>>(13)?,
            }))
        },
    );
    match r {
        Ok(s) => (200, json!({"student": s})),
        Err(_) => (404, json!({"error": "student not found"})),
    }
}

fn staff_create(state: &AppState, body: &str) -> (u16, Value) {
    let v: Value = serde_json::from_str(body).unwrap_or(json!({}));
    let first = match v["first_name"].as_str().filter(|s| !s.is_empty()) {
        Some(n) => n.to_string(),
        None => return (422, json!({"error": "first_name required"})),
    };
    let last = match v["last_name"].as_str().filter(|s| !s.is_empty()) {
        Some(n) => n.to_string(),
        None => return (422, json!({"error": "last_name required"})),
    };
    let conn = state.conn.lock().unwrap();
    match conn.execute(
        "INSERT INTO staff(first_name, last_name, email, phone, profile, title, department, join_date, employee_id)
         VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9)",
        params![
            first, last,
            v["email"].as_str().filter(|s| !s.is_empty()),
            v["phone"].as_str().filter(|s| !s.is_empty()),
            v["profile"].as_str().unwrap_or("teacher"),
            v["title"].as_str().filter(|s| !s.is_empty()),
            v["department"].as_str().filter(|s| !s.is_empty()),
            v["join_date"].as_str().filter(|s| !s.is_empty()),
            v["employee_id"].as_str().filter(|s| !s.is_empty()),
        ],
    ) {
        Ok(_) => (201, json!({"ok": true, "id": conn.last_insert_rowid()})),
        Err(e) => (500, json!({"error": format!("{e}")})),
    }
}

fn staff_update(state: &AppState, id: i64, body: &str) -> (u16, Value) {
    let v: Value = serde_json::from_str(body).unwrap_or(json!({}));
    let conn = state.conn.lock().unwrap();
    match conn.execute(
        "UPDATE staff SET first_name=COALESCE(?1,first_name), last_name=COALESCE(?2,last_name),
         email=?3, phone=?4, profile=COALESCE(?5,profile), title=?6, department=?7, join_date=?8, employee_id=?9
         WHERE id=?10",
        params![
            v["first_name"].as_str().filter(|s| !s.is_empty()),
            v["last_name"].as_str().filter(|s| !s.is_empty()),
            v["email"].as_str().map(str::to_string),
            v["phone"].as_str().map(str::to_string),
            v["profile"].as_str().filter(|s| !s.is_empty()),
            v["title"].as_str().map(str::to_string),
            v["department"].as_str().map(str::to_string),
            v["join_date"].as_str().map(str::to_string),
            v["employee_id"].as_str().map(str::to_string),
            id,
        ],
    ) {
        Ok(0) => (404, json!({"error": "staff not found"})),
        Ok(_) => (200, json!({"ok": true})),
        Err(e) => (500, json!({"error": format!("{e}")})),
    }
}

fn staff_list(state: &AppState, url: &str) -> (u16, Value) {
    let q = q_param(url, "q");
    let conn = state.conn.lock().unwrap();
    let mut list: Vec<Value> = Vec::new();
    let base = "SELECT id, first_name, last_name, email, phone, profile, title FROM staff";
    let res: rusqlite::Result<()> = (|| {
        if let Some(qq) = &q {
            let like = format!("%{}%", qq);
            let sql = format!("{base} WHERE (first_name || ' ' || last_name) LIKE ?1 OR email LIKE ?1 ORDER BY first_name, last_name");
            let mut stmt = conn.prepare(&sql)?;
            let mut rows = stmt.query(params![like])?;
            while let Some(r) = rows.next()? {
                list.push(staff_row(r)?);
            }
        } else {
            let sql = format!("{base} ORDER BY first_name, last_name");
            let mut stmt = conn.prepare(&sql)?;
            let mut rows = stmt.query([])?;
            while let Some(r) = rows.next()? {
                list.push(staff_row(r)?);
            }
        }
        Ok(())
    })();
    match res {
        Ok(()) => {
            let total = list.len();
            (200, json!({"staff": list, "total": total}))
        }
        Err(_) => (500, json!({"error": "query failed"})),
    }
}

fn count(conn: &Connection, sql: &str) -> i64 {
    conn.query_row(sql, [], |r| r.get(0)).unwrap_or(0)
}

fn dashboard_summary(state: &AppState) -> Value {
    let conn = state.conn.lock().unwrap();
    json!({
        "students": count(&conn, "SELECT COUNT(*) FROM students"),
        "staff": count(&conn, "SELECT COUNT(*) FROM staff"),
        "schools": count(&conn, "SELECT COUNT(*) FROM schools"),
        "courses": count(&conn, "SELECT COUNT(*) FROM courses"),
    })
}

fn dashboard_today(state: &AppState) -> Vec<Value> {
    let conn = state.conn.lock().unwrap();
    let total = count(&conn, "SELECT COUNT(*) FROM students");
    let enrolled = count(&conn, "SELECT COUNT(*) FROM students WHERE enrolled = 1");
    let not_enrolled = (total - enrolled).max(0);
    let courses = count(&conn, "SELECT COUNT(*) FROM courses");
    let grades = count(&conn, "SELECT COUNT(*) FROM gradelevels");

    let mut items = Vec::new();
    if not_enrolled > 0 {
        items.push(json!({"key": "enroll", "count": not_enrolled, "label": "students not enrolled in a class", "severity": "warning", "module": "students"}));
    }
    if grades == 0 {
        items.push(json!({"key": "grades", "count": 0, "label": "Define grade levels for the school", "severity": "info", "module": "settings"}));
    }
    if courses == 0 {
        items.push(json!({"key": "courses", "count": 0, "label": "Set up your first course", "severity": "info", "module": "courses"}));
    }
    items
}

// ---- helpers ----

fn q_param(url: &str, key: &str) -> Option<String> {
    let qs = url.split('?').nth(1)?;
    for pair in qs.split('&') {
        let mut it = pair.splitn(2, '=');
        if it.next().unwrap_or("") == key {
            let decoded = percent_decode(it.next().unwrap_or(""));
            if decoded.is_empty() {
                return None;
            }
            return Some(decoded);
        }
    }
    None
}

fn percent_decode(s: &str) -> String {
    let s = s.replace('+', " ");
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(b) = u8::from_str_radix(&s[i + 1..i + 3], 16) {
                out.push(b);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

// ---- schema + seed ----

fn init_db(conn: &Connection) {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS schools(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, academic_year TEXT, type TEXT);
         CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, password_hash TEXT, role TEXT, name TEXT);
         CREATE TABLE IF NOT EXISTS students(id INTEGER PRIMARY KEY AUTOINCREMENT, first_name TEXT, middle_name TEXT, last_name TEXT, email TEXT, phone TEXT, gender TEXT, birthdate TEXT, alt_id TEXT, enrolled INTEGER DEFAULT 0);
         CREATE TABLE IF NOT EXISTS staff(id INTEGER PRIMARY KEY AUTOINCREMENT, first_name TEXT, last_name TEXT, email TEXT, phone TEXT, profile TEXT, title TEXT);
         CREATE TABLE IF NOT EXISTS courses(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT);
         CREATE TABLE IF NOT EXISTS subjects(id INTEGER PRIMARY KEY AUTOINCREMENT, course_id INTEGER, name TEXT, code TEXT, type TEXT, weekly_periods INTEGER DEFAULT 0, is_lab INTEGER DEFAULT 0, mandatory INTEGER DEFAULT 1);
         CREATE TABLE IF NOT EXISTS gradelevels(id INTEGER PRIMARY KEY AUTOINCREMENT, short_name TEXT, title TEXT);
         CREATE TABLE IF NOT EXISTS classrooms(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, code TEXT, capacity INTEGER, room_type TEXT, is_active INTEGER DEFAULT 1);
         CREATE TABLE IF NOT EXISTS floorplans(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, data TEXT);
         CREATE TABLE IF NOT EXISTS classes(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, grade_level TEXT, course_id INTEGER);
         CREATE TABLE IF NOT EXISTS sections(id INTEGER PRIMARY KEY AUTOINCREMENT, class_id INTEGER, name TEXT, teacher_id INTEGER, capacity INTEGER, room_id INTEGER);
         CREATE TABLE IF NOT EXISTS teacher_subjects(id INTEGER PRIMARY KEY AUTOINCREMENT, staff_id INTEGER NOT NULL, subject_id INTEGER NOT NULL, priority INTEGER DEFAULT 1, UNIQUE(staff_id, subject_id));
         CREATE TABLE IF NOT EXISTS periods(id INTEGER PRIMARY KEY AUTOINCREMENT, label TEXT NOT NULL, period_type TEXT DEFAULT 'period', start_time TEXT NOT NULL, end_time TEXT NOT NULL, sort_order INTEGER DEFAULT 0);
         CREATE TABLE IF NOT EXISTS timetable_entries(id INTEGER PRIMARY KEY AUTOINCREMENT, section_id INTEGER NOT NULL, period_id INTEGER NOT NULL, day_of_week INTEGER NOT NULL, subject_id INTEGER, staff_id INTEGER, room_id INTEGER, UNIQUE(section_id, period_id, day_of_week));
         CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT);
         CREATE TABLE IF NOT EXISTS academic_years(id INTEGER PRIMARY KEY AUTOINCREMENT, label TEXT NOT NULL, start_date TEXT, end_date TEXT, is_active INTEGER DEFAULT 0, is_closed INTEGER DEFAULT 0);
         CREATE TABLE IF NOT EXISTS terms(id INTEGER PRIMARY KEY AUTOINCREMENT, year_id INTEGER NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE, label TEXT NOT NULL, start_date TEXT, end_date TEXT, is_active INTEGER DEFAULT 0);",
    )
    .expect("create schema");

    // Migrations for older DBs.
    let _ = conn.execute("ALTER TABLE schools ADD COLUMN type TEXT", []);
    let _ = conn.execute("UPDATE schools SET type='school' WHERE type IS NULL OR type=''", []);
    let _ = conn.execute("ALTER TABLE students ADD COLUMN guardian_name TEXT", []);
    let _ = conn.execute("ALTER TABLE students ADD COLUMN guardian_phone TEXT", []);
    let _ = conn.execute("ALTER TABLE students ADD COLUMN guardian_relation TEXT", []);
    let _ = conn.execute("ALTER TABLE students ADD COLUMN address TEXT", []);
    let _ = conn.execute("ALTER TABLE staff ADD COLUMN department TEXT", []);
    let _ = conn.execute("ALTER TABLE staff ADD COLUMN join_date TEXT", []);
    let _ = conn.execute("ALTER TABLE staff ADD COLUMN employee_id TEXT", []);

    if count(conn, "SELECT COUNT(*) FROM users") == 0 {
        seed(conn);
    }
    if count(conn, "SELECT COUNT(*) FROM courses") == 0 {
        seed_academics(conn);
    }
    if count(conn, "SELECT COUNT(*) FROM classrooms") == 0 {
        seed_rooms(conn);
    }
    if count(conn, "SELECT COUNT(*) FROM classes") == 0 {
        seed_classes(conn);
    }
    if count(conn, "SELECT COUNT(*) FROM teacher_subjects") == 0
        && count(conn, "SELECT COUNT(*) FROM subjects") > 0
    {
        seed_teacher_subjects(conn);
    }
    if count(conn, "SELECT COUNT(*) FROM periods") == 0 {
        seed_periods(conn);
    }
    if count(conn, "SELECT COUNT(*) FROM academic_years") == 0 {
        seed_academic_year(conn);
    }
}

fn seed(conn: &Connection) {
    conn.execute(
        "INSERT INTO schools(name, academic_year, type) VALUES(?1, ?2, ?3)",
        params!["School Of Architecture", "2026-27", "school"],
    )
    .unwrap();

    let hash = bcrypt::hash("admin123", bcrypt::DEFAULT_COST).unwrap();
    conn.execute(
        "INSERT INTO users(username, password_hash, role, name) VALUES(?1, ?2, ?3, ?4)",
        params!["admin", hash, "admin", "Abhi Ram"],
    )
    .unwrap();

    let students = [
        ("Aarav", "Sharma", "aarav.sharma@student.hcw.school", "+91 90000 10001", "Male", "2009-04-12"),
        ("Diya", "Patel", "diya.patel@student.hcw.school", "+91 90000 10002", "Female", "2010-07-23"),
        ("Vivaan", "Reddy", "vivaan.reddy@student.hcw.school", "+91 90000 10003", "Male", "2008-11-05"),
        ("Ananya", "Iyer", "ananya.iyer@student.hcw.school", "+91 90000 10004", "Female", "2009-02-17"),
        ("Aditya", "Nair", "aditya.nair@student.hcw.school", "+91 90000 10005", "Male", "2010-09-30"),
        ("Saanvi", "Rao", "saanvi.rao@student.hcw.school", "+91 90000 10006", "Female", "2011-01-08"),
        ("Arjun", "Mehta", "arjun.mehta@student.hcw.school", "+91 90000 10007", "Male", "2008-06-21"),
        ("Ishaan", "Gupta", "ishaan.gupta@student.hcw.school", "+91 90000 10008", "Male", "2009-12-14"),
        ("Kavya", "Menon", "kavya.menon@student.hcw.school", "+91 90000 10009", "Female", "2010-03-26"),
        ("Riya", "Kapoor", "riya.kapoor@student.hcw.school", "+91 90000 10010", "Female", "2009-08-19"),
        ("Kabir", "Singh", "kabir.singh@student.hcw.school", "+91 90000 10011", "Male", "2011-05-02"),
        ("Meera", "Joshi", "meera.joshi@student.hcw.school", "+91 90000 10012", "Female", "2008-10-11"),
    ];
    for (f, l, e, p, g, b) in students {
        conn.execute(
            "INSERT INTO students(first_name, last_name, email, phone, gender, birthdate, enrolled) VALUES(?1,?2,?3,?4,?5,?6,0)",
            params![f, l, e, p, g, b],
        )
        .unwrap();
    }

    let staff = [
        ("Abhi", "Ram", "abhiram@gmail.com", "", "admin"),
        ("Anika", "Rao", "anika.rao@hcw.school", "+91 90000 20001", "teacher"),
        ("David", "Lee", "david.lee@hcw.school", "+91 90000 20002", "teacher"),
        ("Priya", "Menon", "priya.menon@hcw.school", "+91 90000 20003", "admin"),
        ("Rahul", "Verma", "rahul.verma@hcw.school", "+91 90000 20004", "teacher"),
        ("Sneha", "Pillai", "sneha.pillai@hcw.school", "+91 90000 20005", "teacher"),
        ("Imran", "Khan", "imran.khan@hcw.school", "+91 90000 20006", "teacher"),
        ("Lakshmi", "Nair", "lakshmi.nair@hcw.school", "+91 90000 20007", "teacher"),
    ];
    for (f, l, e, p, prof) in staff {
        conn.execute(
            "INSERT INTO staff(first_name, last_name, email, phone, profile) VALUES(?1,?2,?3,?4,?5)",
            params![f, l, e, p, prof],
        )
        .unwrap();
    }
}

// ---- .schooldb portable file (ZIP: manifest + school.sqlite + media/docs) ----

fn schooldb_save(body: &str) -> (u16, Value) {
    let v: Value = serde_json::from_str(body).unwrap_or(json!({}));
    let out = v["path"]
        .as_str()
        .filter(|s| !s.is_empty())
        .unwrap_or("HCW-SMS.schooldb")
        .to_string();
    match write_schooldb(&out) {
        Ok(checksum) => (200, json!({"ok": true, "path": out, "checksum": checksum})),
        Err(e) => (500, json!({"error": format!("save failed: {e}")})),
    }
}

fn write_schooldb(out: &str) -> Result<String, Box<dyn std::error::Error>> {
    use std::io::Write;
    let sqlite_bytes = std::fs::read("school.sqlite")?;
    let checksum = sha256_hex(&sqlite_bytes);
    let created = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let manifest =
        json!({"app": "HCW-SMS", "schema": 1, "created": created, "files": ["school.sqlite"]})
            .to_string();
    let checksum_json = json!({"school.sqlite": checksum}).to_string();
    let file = std::fs::File::create(out)?;
    let mut zip = zip::ZipWriter::new(file);
    let opts: zip::write::SimpleFileOptions = zip::write::SimpleFileOptions::default();
    zip.start_file("manifest.json", opts)?;
    zip.write_all(manifest.as_bytes())?;
    zip.start_file("school.sqlite", opts)?;
    zip.write_all(&sqlite_bytes)?;
    zip.start_file("checksum.json", opts)?;
    zip.write_all(checksum_json.as_bytes())?;
    zip.add_directory("media/", opts)?;
    zip.add_directory("documents/", opts)?;
    zip.finish()?;
    Ok(checksum)
}

fn schooldb_open(state: &AppState, body: &str) -> (u16, Value) {
    let v: Value = serde_json::from_str(body).unwrap_or(json!({}));
    let path = match v["path"].as_str() {
        Some(p) if !p.is_empty() => p.to_string(),
        _ => return (422, json!({"error": "path required"})),
    };
    match read_schooldb(state, &path) {
        Ok(()) => (200, json!({"ok": true, "opened": path})),
        Err(e) => (500, json!({"error": format!("open failed: {e}")})),
    }
}

fn read_schooldb(state: &AppState, path: &str) -> Result<(), Box<dyn std::error::Error>> {
    let file = std::fs::File::open(path)?;
    let mut archive = zip::ZipArchive::new(file)?;
    let mut sqlite_bytes = Vec::new();
    archive.by_name("school.sqlite")?.read_to_end(&mut sqlite_bytes)?;
    // Swap the live connection: close it, replace the working DB, reopen.
    let mut g = state.conn.lock().unwrap();
    let old = std::mem::replace(&mut *g, Connection::open_in_memory()?);
    drop(old);
    std::fs::write("school.sqlite", &sqlite_bytes)?;
    *g = Connection::open("school.sqlite")?;
    Ok(())
}

fn sha256_hex(bytes: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    let mut h = Sha256::new();
    h.update(bytes);
    h.finalize().iter().map(|b| format!("{:02x}", b)).collect()
}

// ---- academics: courses + subjects ----

fn seed_academics(conn: &Connection) {
    conn.execute("INSERT INTO courses(name) VALUES(?1)", params!["CBSE — Class 8"])
        .unwrap();
    let course_id = conn.last_insert_rowid();
    let subjects = [
        ("English", "ENG", "Language", 5, 0),
        ("Kannada", "KAN", "Language", 4, 0),
        ("Hindi", "HIN", "Language", 4, 0),
        ("Mathematics", "MAT", "Core", 6, 0),
        ("Science", "SCI", "Core", 6, 0),
        ("Social Science", "SOC", "Core", 5, 0),
        ("Computer Science", "CMP", "Lab", 3, 1),
        ("Physical Education", "PED", "Sports", 2, 0),
    ];
    for (name, code, typ, wp, lab) in subjects {
        conn.execute(
            "INSERT INTO subjects(course_id, name, code, type, weekly_periods, is_lab) VALUES(?1,?2,?3,?4,?5,?6)",
            params![course_id, name, code, typ, wp, lab],
        )
        .unwrap();
    }
}

fn courses_list(state: &AppState) -> (u16, Value) {
    let conn = state.conn.lock().unwrap();
    let mut list = Vec::new();
    let res: rusqlite::Result<()> = (|| {
        let mut stmt = conn.prepare(
            "SELECT c.id, c.name, (SELECT COUNT(*) FROM subjects s WHERE s.course_id = c.id) \
             FROM courses c ORDER BY c.name",
        )?;
        let mut rows = stmt.query([])?;
        while let Some(r) = rows.next()? {
            list.push(json!({
                "id": r.get::<_, i64>(0)?,
                "name": r.get::<_, Option<String>>(1)?,
                "subjects": r.get::<_, i64>(2)?,
            }));
        }
        Ok(())
    })();
    match res {
        Ok(()) => (200, json!({"courses": list, "total": list.len()})),
        Err(_) => (500, json!({"error": "query failed"})),
    }
}

fn subject_row(r: &rusqlite::Row) -> rusqlite::Result<Value> {
    Ok(json!({
        "id": r.get::<_, i64>(0)?,
        "course_id": r.get::<_, Option<i64>>(1)?,
        "name": r.get::<_, Option<String>>(2)?,
        "code": r.get::<_, Option<String>>(3)?,
        "type": r.get::<_, Option<String>>(4)?,
        "weekly_periods": r.get::<_, i64>(5)?,
        "is_lab": r.get::<_, i64>(6)?,
    }))
}

fn subjects_list(state: &AppState, url: &str) -> (u16, Value) {
    let q = q_param(url, "q");
    let conn = state.conn.lock().unwrap();
    let mut list = Vec::new();
    let base = "SELECT id, course_id, name, code, type, weekly_periods, is_lab FROM subjects";
    let res: rusqlite::Result<()> = (|| {
        if let Some(qq) = &q {
            let like = format!("%{}%", qq);
            let sql = format!("{base} WHERE name LIKE ?1 OR code LIKE ?1 ORDER BY name");
            let mut stmt = conn.prepare(&sql)?;
            let mut rows = stmt.query(params![like])?;
            while let Some(r) = rows.next()? {
                list.push(subject_row(r)?);
            }
        } else {
            let sql = format!("{base} ORDER BY name");
            let mut stmt = conn.prepare(&sql)?;
            let mut rows = stmt.query([])?;
            while let Some(r) = rows.next()? {
                list.push(subject_row(r)?);
            }
        }
        Ok(())
    })();
    match res {
        Ok(()) => (200, json!({"subjects": list, "total": list.len()})),
        Err(_) => (500, json!({"error": "query failed"})),
    }
}

// ---- classrooms & labs ----

fn seed_rooms(conn: &Connection) {
    let rooms = [
        ("Room 101", "R101", 40, "Classroom"),
        ("Room 102", "R102", 40, "Classroom"),
        ("Room 204", "R204", 35, "Classroom"),
        ("Computer Lab 1", "CL1", 30, "Computer Lab"),
        ("Science Lab", "SL1", 30, "Science Lab"),
        ("Library", "LIB", 60, "Library"),
        ("Auditorium", "AUD", 200, "Auditorium"),
    ];
    for (name, code, cap, typ) in rooms {
        conn.execute(
            "INSERT INTO classrooms(name, code, capacity, room_type) VALUES(?1,?2,?3,?4)",
            params![name, code, cap, typ],
        )
        .unwrap();
    }
}

fn classroom_row(r: &rusqlite::Row) -> rusqlite::Result<Value> {
    Ok(json!({
        "id": r.get::<_, i64>(0)?,
        "name": r.get::<_, Option<String>>(1)?,
        "code": r.get::<_, Option<String>>(2)?,
        "capacity": r.get::<_, Option<i64>>(3)?,
        "room_type": r.get::<_, Option<String>>(4)?,
    }))
}

fn classrooms_list(state: &AppState) -> (u16, Value) {
    let conn = state.conn.lock().unwrap();
    let mut list = Vec::new();
    let res: rusqlite::Result<()> = (|| {
        let mut stmt =
            conn.prepare("SELECT id, name, code, capacity, room_type FROM classrooms ORDER BY name")?;
        let mut rows = stmt.query([])?;
        while let Some(r) = rows.next()? {
            list.push(classroom_row(r)?);
        }
        Ok(())
    })();
    match res {
        Ok(()) => (200, json!({"classrooms": list, "total": list.len()})),
        Err(_) => (500, json!({"error": "query failed"})),
    }
}

// ---- classes & sections ----

fn seed_classes(conn: &Connection) {
    let classes = [
        ("Class 6", "6", None::<i64>),
        ("Class 7", "7", None::<i64>),
        ("Class 8", "8", Some(1)),
    ];
    for (name, grade, course) in classes {
        conn.execute(
            "INSERT INTO classes(name, grade_level, course_id) VALUES(?1,?2,?3)",
            params![name, grade, course],
        )
        .unwrap();
        let class_id = conn.last_insert_rowid();
        let secs = [("A", 40i64), ("B", 38i64)];
        let mut i: i64 = 0;
        for (sn, cap) in secs {
            let teacher_id = (class_id - 1) * 2 + i + 1; // cycle through seeded staff
            let room_id = i + 1; // Room 101 / Room 102
            conn.execute(
                "INSERT INTO sections(class_id, name, teacher_id, capacity, room_id) VALUES(?1,?2,?3,?4,?5)",
                params![class_id, sn, teacher_id, cap, room_id],
            )
            .unwrap();
            i += 1;
        }
    }
}

fn class_create(state: &AppState, body: &str) -> (u16, Value) {
    let v: Value = serde_json::from_str(body).unwrap_or(json!({}));
    let name = match v["name"].as_str().filter(|s| !s.is_empty()) {
        Some(n) => n.to_string(),
        None => return (422, json!({"error": "name required"})),
    };
    let grade = v["grade_level"].as_str().map(str::to_string);
    let conn = state.conn.lock().unwrap();
    match conn.execute(
        "INSERT INTO classes(name, grade_level) VALUES(?1, ?2)",
        params![name, grade],
    ) {
        Ok(_) => (201, json!({"ok": true, "id": conn.last_insert_rowid()})),
        Err(e) => (500, json!({"error": format!("{e}")})),
    }
}

fn class_update(state: &AppState, id: i64, body: &str) -> (u16, Value) {
    let v: Value = serde_json::from_str(body).unwrap_or(json!({}));
    let conn = state.conn.lock().unwrap();
    match conn.execute(
        "UPDATE classes SET name=COALESCE(?1, name), grade_level=?2 WHERE id=?3",
        params![
            v["name"].as_str().filter(|s| !s.is_empty()),
            v["grade_level"].as_str().map(str::to_string),
            id,
        ],
    ) {
        Ok(0) => (404, json!({"error": "class not found"})),
        Ok(_) => (200, json!({"ok": true})),
        Err(e) => (500, json!({"error": format!("{e}")})),
    }
}

fn class_delete(state: &AppState, id: i64) -> (u16, Value) {
    let conn = state.conn.lock().unwrap();
    // Cascade: delete sections + timetable entries for those sections first.
    let section_ids: Vec<i64> = {
        let mut stmt = conn.prepare("SELECT id FROM sections WHERE class_id=?1").unwrap();
        let mut rows = stmt.query(params![id]).unwrap();
        let mut ids = Vec::new();
        while let Some(r) = rows.next().unwrap() {
            ids.push(r.get::<_, i64>(0).unwrap());
        }
        ids
    };
    for sid in section_ids {
        conn.execute("DELETE FROM timetable_entries WHERE section_id=?1", params![sid]).ok();
        conn.execute("DELETE FROM sections WHERE id=?1", params![sid]).ok();
    }
    conn.execute("DELETE FROM classes WHERE id=?1", params![id]).ok();
    (200, json!({"ok": true}))
}

fn section_create(state: &AppState, body: &str) -> (u16, Value) {
    let v: Value = serde_json::from_str(body).unwrap_or(json!({}));
    let class_id = match v["class_id"].as_i64() {
        Some(i) => i,
        None => return (422, json!({"error": "class_id required"})),
    };
    let name = match v["name"].as_str().filter(|s| !s.is_empty()) {
        Some(n) => n.to_string(),
        None => return (422, json!({"error": "name required"})),
    };
    let teacher_id = v["teacher_id"].as_i64();
    let room_id = v["room_id"].as_i64();
    let capacity = v["capacity"].as_i64();
    let conn = state.conn.lock().unwrap();
    match conn.execute(
        "INSERT INTO sections(class_id, name, teacher_id, capacity, room_id) VALUES(?1,?2,?3,?4,?5)",
        params![class_id, name, teacher_id, capacity, room_id],
    ) {
        Ok(_) => (201, json!({"ok": true, "id": conn.last_insert_rowid()})),
        Err(e) => (500, json!({"error": format!("{e}")})),
    }
}

fn section_update(state: &AppState, id: i64, body: &str) -> (u16, Value) {
    let v: Value = serde_json::from_str(body).unwrap_or(json!({}));
    let conn = state.conn.lock().unwrap();
    match conn.execute(
        "UPDATE sections SET name=COALESCE(?1,name), teacher_id=?2, capacity=?3, room_id=?4 WHERE id=?5",
        params![
            v["name"].as_str().filter(|s| !s.is_empty()),
            v["teacher_id"].as_i64(),
            v["capacity"].as_i64(),
            v["room_id"].as_i64(),
            id,
        ],
    ) {
        Ok(0) => (404, json!({"error": "section not found"})),
        Ok(_) => (200, json!({"ok": true})),
        Err(e) => (500, json!({"error": format!("{e}")})),
    }
}

fn section_delete(state: &AppState, id: i64) -> (u16, Value) {
    let conn = state.conn.lock().unwrap();
    conn.execute("DELETE FROM timetable_entries WHERE section_id=?1", params![id]).ok();
    conn.execute("DELETE FROM sections WHERE id=?1", params![id]).ok();
    (200, json!({"ok": true}))
}

fn classes_list(state: &AppState) -> (u16, Value) {
    let conn = state.conn.lock().unwrap();
    let mut out = Vec::new();
    let res: rusqlite::Result<()> = (|| {
        let mut base: Vec<(i64, Option<String>, Option<String>)> = Vec::new();
        {
            let mut cstmt = conn.prepare("SELECT id, name, grade_level FROM classes ORDER BY id")?;
            let mut crows = cstmt.query([])?;
            while let Some(c) = crows.next()? {
                base.push((c.get(0)?, c.get(1)?, c.get(2)?));
            }
        }
        for (cid, cname, grade) in base {
            let mut sections = Vec::new();
            let mut sstmt = conn.prepare(
                "SELECT s.id, s.name, s.capacity, st.first_name, st.last_name, r.name
                 FROM sections s
                 LEFT JOIN staff st ON st.id = s.teacher_id
                 LEFT JOIN classrooms r ON r.id = s.room_id
                 WHERE s.class_id = ?1 ORDER BY s.name",
            )?;
            let mut srows = sstmt.query(params![cid])?;
            while let Some(s) = srows.next()? {
                let first: Option<String> = s.get(3)?;
                let last: Option<String> = s.get(4)?;
                let teacher =
                    first.map(|f| format!("{} {}", f, last.unwrap_or_default()).trim().to_string());
                sections.push(json!({
                    "id": s.get::<_, i64>(0)?,
                    "name": s.get::<_, Option<String>>(1)?,
                    "capacity": s.get::<_, Option<i64>>(2)?,
                    "teacher": teacher,
                    "room": s.get::<_, Option<String>>(5)?,
                }));
            }
            out.push(json!({
                "id": cid,
                "name": cname,
                "grade_level": grade,
                "sections": sections,
            }));
        }
        Ok(())
    })();
    match res {
        Ok(()) => (200, json!({"classes": out, "total": out.len()})),
        Err(_) => (500, json!({"error": "query failed"})),
    }
}

// ---- timetable builder ----

fn timetable_list(state: &AppState, url: &str) -> (u16, Value) {
    let section_id = match q_param(url, "section_id").and_then(|s| s.parse::<i64>().ok()) {
        Some(id) => id,
        None => return (422, json!({"error": "section_id required"})),
    };
    let conn = state.conn.lock().unwrap();
    let mut entries: Vec<Value> = Vec::new();
    let res: rusqlite::Result<()> = (|| {
        let mut stmt = conn.prepare(
            "SELECT te.id, te.section_id, te.period_id, te.day_of_week,
                    te.subject_id, subj.name, subj.code, subj.type,
                    te.staff_id, st.first_name, st.last_name,
                    te.room_id, r.name
             FROM timetable_entries te
             LEFT JOIN subjects subj ON subj.id = te.subject_id
             LEFT JOIN staff st ON st.id = te.staff_id
             LEFT JOIN classrooms r ON r.id = te.room_id
             WHERE te.section_id = ?1
             ORDER BY te.day_of_week, te.period_id",
        )?;
        let mut rows = stmt.query(params![section_id])?;
        while let Some(r) = rows.next()? {
            let first: Option<String> = r.get(9)?;
            let last: Option<String> = r.get(10)?;
            let teacher =
                first.map(|f| format!("{} {}", f, last.unwrap_or_default()).trim().to_string());
            entries.push(json!({
                "id": r.get::<_, i64>(0)?,
                "section_id": r.get::<_, i64>(1)?,
                "period_id": r.get::<_, i64>(2)?,
                "day_of_week": r.get::<_, i64>(3)?,
                "subject_id": r.get::<_, Option<i64>>(4)?,
                "subject_name": r.get::<_, Option<String>>(5)?,
                "subject_code": r.get::<_, Option<String>>(6)?,
                "subject_type": r.get::<_, Option<String>>(7)?,
                "staff_id": r.get::<_, Option<i64>>(8)?,
                "teacher_name": teacher,
                "room_id": r.get::<_, Option<i64>>(11)?,
                "room_name": r.get::<_, Option<String>>(12)?,
            }));
        }
        Ok(())
    })();
    match res {
        Ok(()) => {
            let total = entries.len();
            (200, json!({"entries": entries, "total": total}))
        }
        Err(e) => (500, json!({"error": format!("{e}")})),
    }
}

fn timetable_set(state: &AppState, body: &str) -> (u16, Value) {
    let v: Value = serde_json::from_str(body).unwrap_or(json!({}));
    let section_id = match v["section_id"].as_i64() {
        Some(id) => id,
        None => return (422, json!({"error": "section_id required"})),
    };
    let period_id = match v["period_id"].as_i64() {
        Some(id) => id,
        None => return (422, json!({"error": "period_id required"})),
    };
    let day = match v["day_of_week"].as_i64() {
        Some(d) if (0..=6).contains(&d) => d,
        _ => return (422, json!({"error": "day_of_week 0–6 required"})),
    };
    let subject_id = v["subject_id"].as_i64();
    let staff_id = v["staff_id"].as_i64();
    let room_id = v["room_id"].as_i64();

    let conn = state.conn.lock().unwrap();

    // Teacher conflict: same teacher already in this period+day for a different section?
    if let Some(sid) = staff_id {
        let conflict: Option<i64> = conn.query_row(
            "SELECT te.section_id FROM timetable_entries te
             WHERE te.staff_id=?1 AND te.period_id=?2 AND te.day_of_week=?3 AND te.section_id!=?4",
            params![sid, period_id, day, section_id],
            |r| r.get(0),
        ).ok();
        if let Some(csec) = conflict {
            let sec_label: Option<String> = conn.query_row(
                "SELECT c.name || ' – Sec ' || s.name FROM sections s JOIN classes c ON c.id=s.class_id WHERE s.id=?1",
                params![csec],
                |r| r.get(0),
            ).ok();
            return (409, json!({
                "error": "teacher_conflict",
                "message": format!("Teacher already assigned in this slot ({})",
                    sec_label.unwrap_or_else(|| "another section".into()))
            }));
        }
    }

    // Room conflict
    if let Some(rid) = room_id {
        let conflict: Option<i64> = conn.query_row(
            "SELECT section_id FROM timetable_entries
             WHERE room_id=?1 AND period_id=?2 AND day_of_week=?3 AND section_id!=?4",
            params![rid, period_id, day, section_id],
            |r| r.get(0),
        ).ok();
        if conflict.is_some() {
            return (409, json!({
                "error": "room_conflict",
                "message": "Room already booked for this slot by another section"
            }));
        }
    }

    let res = conn.execute(
        "INSERT INTO timetable_entries(section_id, period_id, day_of_week, subject_id, staff_id, room_id)
         VALUES(?1,?2,?3,?4,?5,?6)
         ON CONFLICT(section_id, period_id, day_of_week) DO UPDATE SET
           subject_id=excluded.subject_id,
           staff_id=excluded.staff_id,
           room_id=excluded.room_id",
        params![section_id, period_id, day, subject_id, staff_id, room_id],
    );
    match res {
        Ok(_) => (200, json!({"ok": true})),
        Err(e) => (500, json!({"error": format!("{e}")})),
    }
}

fn timetable_clear(state: &AppState, body: &str) -> (u16, Value) {
    let v: Value = serde_json::from_str(body).unwrap_or(json!({}));
    let section_id = match v["section_id"].as_i64() {
        Some(id) => id,
        None => return (422, json!({"error": "section_id required"})),
    };
    let period_id = match v["period_id"].as_i64() {
        Some(id) => id,
        None => return (422, json!({"error": "period_id required"})),
    };
    let day = match v["day_of_week"].as_i64() {
        Some(d) => d,
        None => return (422, json!({"error": "day_of_week required"})),
    };
    let conn = state.conn.lock().unwrap();
    let _ = conn.execute(
        "DELETE FROM timetable_entries WHERE section_id=?1 AND period_id=?2 AND day_of_week=?3",
        params![section_id, period_id, day],
    );
    (200, json!({"ok": true}))
}

fn timetable_quota(state: &AppState, url: &str) -> (u16, Value) {
    let section_id = match q_param(url, "section_id").and_then(|s| s.parse::<i64>().ok()) {
        Some(id) => id,
        None => return (422, json!({"error": "section_id required"})),
    };
    let conn = state.conn.lock().unwrap();
    let mut subjects: Vec<Value> = Vec::new();
    let res: rusqlite::Result<()> = (|| {
        let mut stmt = conn.prepare(
            "SELECT s.id, s.name, s.code, COALESCE(s.weekly_periods, 0),
                    (SELECT COUNT(*) FROM timetable_entries te
                     WHERE te.subject_id = s.id AND te.section_id = ?1) AS scheduled
             FROM subjects s
             WHERE s.weekly_periods > 0
             ORDER BY s.name",
        )?;
        let mut rows = stmt.query(params![section_id])?;
        while let Some(r) = rows.next()? {
            let target: i64 = r.get(3)?;
            let scheduled: i64 = r.get(4)?;
            let status = if scheduled == target { "met" }
                else if scheduled < target { "under" }
                else { "over" };
            subjects.push(json!({
                "id": r.get::<_, i64>(0)?,
                "name": r.get::<_, Option<String>>(1)?,
                "code": r.get::<_, Option<String>>(2)?,
                "target": target,
                "scheduled": scheduled,
                "status": status,
            }));
        }
        Ok(())
    })();
    match res {
        Ok(()) => {
            let total = subjects.len();
            (200, json!({"subjects": subjects, "total": total}))
        }
        Err(e) => (500, json!({"error": format!("{e}")})),
    }
}

fn timetable_teacher_load(state: &AppState) -> (u16, Value) {
    let conn = state.conn.lock().unwrap();
    let mut teachers: Vec<Value> = Vec::new();
    let res: rusqlite::Result<()> = (|| {
        let mut tlist: Vec<(i64, Option<String>, Option<String>, i64)> = Vec::new();
        {
            let mut stmt = conn.prepare(
                "SELECT te.staff_id, st.first_name, st.last_name, COUNT(*) AS total
                 FROM timetable_entries te
                 JOIN staff st ON st.id = te.staff_id
                 WHERE te.staff_id IS NOT NULL
                 GROUP BY te.staff_id
                 ORDER BY total DESC, st.first_name",
            )?;
            let mut rows = stmt.query([])?;
            while let Some(r) = rows.next()? {
                tlist.push((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?));
            }
        }
        for (staff_id, first, last, total) in tlist {
            let name =
                first.map(|f| format!("{} {}", f, last.unwrap_or_default()).trim().to_string());
            let mut sections: Vec<Value> = Vec::new();
            let mut sstmt = conn.prepare(
                "SELECT c.name || ' – Sec ' || sec.name, COUNT(*) AS periods
                 FROM timetable_entries te
                 JOIN sections sec ON sec.id = te.section_id
                 JOIN classes c ON c.id = sec.class_id
                 WHERE te.staff_id = ?1
                 GROUP BY te.section_id
                 ORDER BY periods DESC",
            )?;
            let mut srows = sstmt.query(params![staff_id])?;
            while let Some(s) = srows.next()? {
                sections.push(json!({
                    "section": s.get::<_, Option<String>>(0)?,
                    "periods": s.get::<_, i64>(1)?,
                }));
            }
            teachers.push(json!({
                "staff_id": staff_id,
                "teacher_name": name,
                "total_periods": total,
                "sections": sections,
            }));
        }
        Ok(())
    })();
    match res {
        Ok(()) => {
            let total = teachers.len();
            (200, json!({"teachers": teachers, "total": total}))
        }
        Err(e) => (500, json!({"error": format!("{e}")})),
    }
}

// ---- academic year engine ----

fn year_with_terms(conn: &rusqlite::Connection, id: i64) -> rusqlite::Result<Value> {
    let year = conn.query_row(
        "SELECT id, label, start_date, end_date, is_active, is_closed FROM academic_years WHERE id=?1",
        params![id],
        |r| {
            Ok(json!({
                "id": r.get::<_, i64>(0)?,
                "label": r.get::<_, String>(1)?,
                "start_date": r.get::<_, Option<String>>(2)?,
                "end_date": r.get::<_, Option<String>>(3)?,
                "is_active": r.get::<_, i64>(4)? == 1,
                "is_closed": r.get::<_, i64>(5)? == 1,
            }))
        },
    )?;
    let mut terms: Vec<Value> = Vec::new();
    let mut stmt = conn.prepare(
        "SELECT id, year_id, label, start_date, end_date, is_active FROM terms WHERE year_id=?1 ORDER BY start_date, id",
    )?;
    let mut rows = stmt.query(params![id])?;
    while let Some(r) = rows.next()? {
        terms.push(json!({
            "id": r.get::<_, i64>(0)?,
            "year_id": r.get::<_, i64>(1)?,
            "label": r.get::<_, String>(2)?,
            "start_date": r.get::<_, Option<String>>(3)?,
            "end_date": r.get::<_, Option<String>>(4)?,
            "is_active": r.get::<_, i64>(5)? == 1,
        }));
    }
    let mut obj = year.as_object().unwrap().clone();
    obj.insert("terms".to_string(), Value::Array(terms));
    Ok(Value::Object(obj))
}

fn academic_years_list(state: &AppState) -> (u16, Value) {
    let conn = state.conn.lock().unwrap();
    let ids: Vec<i64> = {
        let mut stmt = conn.prepare("SELECT id FROM academic_years ORDER BY start_date DESC, id DESC").unwrap();
        let mut rows = stmt.query([]).unwrap();
        let mut v = Vec::new();
        while let Some(r) = rows.next().unwrap() {
            v.push(r.get::<_, i64>(0).unwrap());
        }
        v
    };
    let years: Vec<Value> = ids.iter().filter_map(|&id| year_with_terms(&conn, id).ok()).collect();
    let total = years.len();
    (200, json!({"years": years, "total": total}))
}

fn academic_year_active(state: &AppState) -> (u16, Value) {
    let conn = state.conn.lock().unwrap();
    let id: Option<i64> = conn
        .query_row("SELECT id FROM academic_years WHERE is_active=1 LIMIT 1", [], |r| r.get(0))
        .ok();
    match id {
        None => (200, json!({"year": null})),
        Some(id) => match year_with_terms(&conn, id) {
            Ok(y) => (200, json!({"year": y})),
            Err(e) => (500, json!({"error": format!("{e}")})),
        },
    }
}

fn academic_year_create(state: &AppState, body: &str) -> (u16, Value) {
    let v: Value = serde_json::from_str(body).unwrap_or(json!({}));
    let label = match v["label"].as_str().filter(|s| !s.is_empty()) {
        Some(l) => l.to_string(),
        None => return (422, json!({"error": "label required"})),
    };
    let start_date = v["start_date"].as_str().map(str::to_string);
    let end_date = v["end_date"].as_str().map(str::to_string);
    let conn = state.conn.lock().unwrap();
    match conn.execute(
        "INSERT INTO academic_years(label, start_date, end_date, is_active, is_closed) VALUES(?1,?2,?3,0,0)",
        params![label, start_date, end_date],
    ) {
        Ok(_) => {
            let id = conn.last_insert_rowid();
            (201, json!({"ok": true, "id": id}))
        }
        Err(e) => (500, json!({"error": format!("{e}")})),
    }
}

fn academic_year_activate(state: &AppState, body: &str) -> (u16, Value) {
    let v: Value = serde_json::from_str(body).unwrap_or(json!({}));
    let id = match v["id"].as_i64() {
        Some(i) => i,
        None => return (422, json!({"error": "id required"})),
    };
    let conn = state.conn.lock().unwrap();
    let closed: i64 = conn.query_row(
        "SELECT is_closed FROM academic_years WHERE id=?1", params![id], |r| r.get(0)
    ).unwrap_or(0);
    if closed == 1 {
        return (409, json!({"error": "Cannot activate a closed academic year"}));
    }
    conn.execute("UPDATE academic_years SET is_active=0", []).ok();
    conn.execute("UPDATE academic_years SET is_active=1 WHERE id=?1", params![id]).ok();
    (200, json!({"ok": true}))
}

fn academic_year_close(state: &AppState, body: &str) -> (u16, Value) {
    let v: Value = serde_json::from_str(body).unwrap_or(json!({}));
    let id = match v["id"].as_i64() {
        Some(i) => i,
        None => return (422, json!({"error": "id required"})),
    };
    let conn = state.conn.lock().unwrap();
    conn.execute(
        "UPDATE academic_years SET is_closed=1, is_active=0 WHERE id=?1",
        params![id],
    ).ok();
    (200, json!({"ok": true}))
}

fn term_create(state: &AppState, body: &str) -> (u16, Value) {
    let v: Value = serde_json::from_str(body).unwrap_or(json!({}));
    let year_id = match v["year_id"].as_i64() {
        Some(i) => i,
        None => return (422, json!({"error": "year_id required"})),
    };
    let label = match v["label"].as_str().filter(|s| !s.is_empty()) {
        Some(l) => l.to_string(),
        None => return (422, json!({"error": "label required"})),
    };
    let start_date = v["start_date"].as_str().map(str::to_string);
    let end_date = v["end_date"].as_str().map(str::to_string);
    let conn = state.conn.lock().unwrap();
    match conn.execute(
        "INSERT INTO terms(year_id, label, start_date, end_date, is_active) VALUES(?1,?2,?3,?4,0)",
        params![year_id, label, start_date, end_date],
    ) {
        Ok(_) => (201, json!({"ok": true, "id": conn.last_insert_rowid()})),
        Err(e) => (500, json!({"error": format!("{e}")})),
    }
}

fn term_delete(state: &AppState, body: &str) -> (u16, Value) {
    let v: Value = serde_json::from_str(body).unwrap_or(json!({}));
    let id = match v["id"].as_i64() {
        Some(i) => i,
        None => return (422, json!({"error": "id required"})),
    };
    let conn = state.conn.lock().unwrap();
    conn.execute("DELETE FROM terms WHERE id=?1", params![id]).ok();
    (200, json!({"ok": true}))
}

fn term_activate(state: &AppState, body: &str) -> (u16, Value) {
    let v: Value = serde_json::from_str(body).unwrap_or(json!({}));
    let id = match v["id"].as_i64() {
        Some(i) => i,
        None => return (422, json!({"error": "id required"})),
    };
    let conn = state.conn.lock().unwrap();
    // Deactivate all terms in the same year, then activate this one.
    let year_id: Option<i64> = conn.query_row(
        "SELECT year_id FROM terms WHERE id=?1", params![id], |r| r.get(0)
    ).ok();
    if let Some(yid) = year_id {
        conn.execute("UPDATE terms SET is_active=0 WHERE year_id=?1", params![yid]).ok();
        conn.execute("UPDATE terms SET is_active=1 WHERE id=?1", params![id]).ok();
    }
    (200, json!({"ok": true}))
}

fn seed_academic_year(conn: &rusqlite::Connection) {
    conn.execute(
        "INSERT INTO academic_years(label, start_date, end_date, is_active, is_closed) VALUES(?1,?2,?3,1,0)",
        params!["2025-26", "2025-04-01", "2026-03-31"],
    ).unwrap();
    let year_id = conn.last_insert_rowid();
    let terms: &[(&str, &str, &str)] = &[
        ("Term 1", "2025-04-01", "2025-09-30"),
        ("Term 2", "2025-10-01", "2025-12-31"),
        ("Term 3", "2026-01-01", "2026-03-31"),
    ];
    for (i, (label, start, end)) in terms.iter().enumerate() {
        let is_active = if i == 0 { 1 } else { 0 };
        conn.execute(
            "INSERT INTO terms(year_id, label, start_date, end_date, is_active) VALUES(?1,?2,?3,?4,?5)",
            params![year_id, label, start, end, is_active],
        ).unwrap();
    }
}

// ---- school timings / period slots ----

fn seed_periods(conn: &Connection) {
    // Typical CBSE 8-period day (India)
    let slots: &[(&str, &str, &str, &str)] = &[
        ("Assembly",    "break",  "08:00", "08:15"),
        ("Period 1",    "period", "08:15", "09:00"),
        ("Period 2",    "period", "09:00", "09:45"),
        ("Period 3",    "period", "09:45", "10:30"),
        ("Short Break", "break",  "10:30", "10:45"),
        ("Period 4",    "period", "10:45", "11:30"),
        ("Period 5",    "period", "11:30", "12:15"),
        ("Lunch Break", "break",  "12:15", "13:00"),
        ("Period 6",    "period", "13:00", "13:45"),
        ("Period 7",    "period", "13:45", "14:30"),
        ("Period 8",    "period", "14:30", "15:15"),
    ];
    for (i, (label, ptype, start, end)) in slots.iter().enumerate() {
        let _ = conn.execute(
            "INSERT INTO periods(label, period_type, start_time, end_time, sort_order) VALUES(?1,?2,?3,?4,?5)",
            params![label, ptype, start, end, i as i64],
        );
    }
}

fn periods_list(state: &AppState) -> (u16, Value) {
    let conn = state.conn.lock().unwrap();
    let mut list: Vec<Value> = Vec::new();
    let res: rusqlite::Result<()> = (|| {
        let mut stmt = conn.prepare(
            "SELECT id, label, period_type, start_time, end_time, sort_order \
             FROM periods ORDER BY sort_order",
        )?;
        let mut rows = stmt.query([])?;
        while let Some(r) = rows.next()? {
            list.push(json!({
                "id": r.get::<_, i64>(0)?,
                "label": r.get::<_, Option<String>>(1)?,
                "period_type": r.get::<_, Option<String>>(2)?,
                "start_time": r.get::<_, Option<String>>(3)?,
                "end_time": r.get::<_, Option<String>>(4)?,
                "sort_order": r.get::<_, i64>(5)?,
            }));
        }
        Ok(())
    })();
    match res {
        Ok(()) => {
            let total = list.len();
            (200, json!({"periods": list, "total": total}))
        }
        Err(_) => (500, json!({"error": "query failed"})),
    }
}

fn periods_save(state: &AppState, body: &str) -> (u16, Value) {
    let v: Value = serde_json::from_str(body).unwrap_or(json!({}));
    let arr = match v["periods"].as_array() {
        Some(a) => a.clone(),
        None => return (422, json!({"error": "periods array required"})),
    };
    let conn = state.conn.lock().unwrap();
    let res: rusqlite::Result<()> = (|| {
        conn.execute("DELETE FROM periods", [])?;
        for (i, p) in arr.iter().enumerate() {
            let label = p["label"].as_str().unwrap_or("Period").to_string();
            let ptype = p["period_type"].as_str().unwrap_or("period").to_string();
            let start = p["start_time"].as_str().unwrap_or("08:00").to_string();
            let end = p["end_time"].as_str().unwrap_or("08:45").to_string();
            conn.execute(
                "INSERT INTO periods(label, period_type, start_time, end_time, sort_order) \
                 VALUES(?1,?2,?3,?4,?5)",
                params![label, ptype, start, end, i as i64],
            )?;
        }
        Ok(())
    })();
    match res {
        Ok(()) => (200, json!({"ok": true})),
        Err(e) => (500, json!({"error": format!("{e}")})),
    }
}

// ---- teacher-subject mapper ----

fn teacher_subjects_list(state: &AppState) -> (u16, Value) {
    let conn = state.conn.lock().unwrap();
    let mut subjects: Vec<Value> = Vec::new();
    let res: rusqlite::Result<()> = (|| {
        let mut slist: Vec<(i64, Option<String>, Option<String>, Option<String>, i64)> = Vec::new();
        {
            let mut stmt = conn.prepare(
                "SELECT id, name, code, type, weekly_periods FROM subjects ORDER BY name",
            )?;
            let mut rows = stmt.query([])?;
            while let Some(r) = rows.next()? {
                slist.push((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?));
            }
        }
        for (sid, sname, code, stype, wp) in slist {
            let mut assignments: Vec<Value> = Vec::new();
            let mut astmt = conn.prepare(
                "SELECT ts.id, ts.staff_id, ts.priority, st.first_name, st.last_name
                 FROM teacher_subjects ts
                 JOIN staff st ON st.id = ts.staff_id
                 WHERE ts.subject_id = ?1
                 ORDER BY ts.priority",
            )?;
            let mut arows = astmt.query(params![sid])?;
            while let Some(a) = arows.next()? {
                let first: Option<String> = a.get(3)?;
                let last: Option<String> = a.get(4)?;
                let teacher =
                    first.map(|f| format!("{} {}", f, last.unwrap_or_default()).trim().to_string());
                assignments.push(json!({
                    "id": a.get::<_, i64>(0)?,
                    "staff_id": a.get::<_, i64>(1)?,
                    "priority": a.get::<_, i64>(2)?,
                    "teacher": teacher,
                }));
            }
            subjects.push(json!({
                "id": sid,
                "name": sname,
                "code": code,
                "type": stype,
                "weekly_periods": wp,
                "assignments": assignments,
            }));
        }
        Ok(())
    })();
    match res {
        Ok(()) => {
            let total = subjects.len();
            (200, json!({"subjects": subjects, "total": total}))
        }
        Err(_) => (500, json!({"error": "query failed"})),
    }
}

fn teacher_subjects_assign(state: &AppState, body: &str) -> (u16, Value) {
    let v: Value = serde_json::from_str(body).unwrap_or(json!({}));
    let staff_id = match v["staff_id"].as_i64() {
        Some(id) => id,
        None => return (422, json!({"error": "staff_id required"})),
    };
    let subject_id = match v["subject_id"].as_i64() {
        Some(id) => id,
        None => return (422, json!({"error": "subject_id required"})),
    };
    let priority = v["priority"].as_i64().unwrap_or(1).clamp(1, 3);
    let conn = state.conn.lock().unwrap();
    let existing_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM teacher_subjects WHERE subject_id=?1 AND staff_id!=?2",
            params![subject_id, staff_id],
            |r| r.get(0),
        )
        .unwrap_or(0);
    if existing_count >= 3 {
        return (422, json!({"error": "Maximum 3 teachers per subject"}));
    }
    let res = conn.execute(
        "INSERT INTO teacher_subjects(staff_id, subject_id, priority) VALUES(?1,?2,?3)
         ON CONFLICT(staff_id, subject_id) DO UPDATE SET priority=excluded.priority",
        params![staff_id, subject_id, priority],
    );
    match res {
        Ok(_) => (200, json!({"ok": true, "id": conn.last_insert_rowid()})),
        Err(e) => (500, json!({"error": format!("{e}")})),
    }
}

fn teacher_subjects_remove(state: &AppState, body: &str) -> (u16, Value) {
    let v: Value = serde_json::from_str(body).unwrap_or(json!({}));
    let id = match v["id"].as_i64() {
        Some(id) => id,
        None => return (422, json!({"error": "id required"})),
    };
    let conn = state.conn.lock().unwrap();
    let _ = conn.execute("DELETE FROM teacher_subjects WHERE id=?1", params![id]);
    (200, json!({"ok": true}))
}

fn seed_teacher_subjects(conn: &Connection) {
    // staff: Anika=2, David=3, Priya=4, Rahul=5, Sneha=6, Imran=7, Lakshmi=8
    let entries: &[(&str, i64, i64)] = &[
        ("English", 2, 1), ("English", 3, 2),
        ("Kannada", 4, 1),
        ("Hindi", 5, 1),
        ("Mathematics", 6, 1), ("Mathematics", 3, 2),
        ("Science", 7, 1), ("Science", 8, 2),
        ("Social Science", 4, 1),
        ("Computer Science", 7, 1), ("Computer Science", 2, 2),
        ("Physical Education", 8, 1),
    ];
    for (subj_name, staff_id, priority) in entries {
        let sid: Option<i64> = conn
            .query_row("SELECT id FROM subjects WHERE name=?1", params![subj_name], |r| r.get(0))
            .ok();
        if let Some(subject_id) = sid {
            let _ = conn.execute(
                "INSERT OR IGNORE INTO teacher_subjects(staff_id, subject_id, priority) VALUES(?1,?2,?3)",
                params![staff_id, subject_id, priority],
            );
        }
    }
}

fn school_get(state: &AppState) -> (u16, Value) {
    let conn = state.conn.lock().unwrap();
    let row = conn.query_row(
        "SELECT name, academic_year, type FROM schools ORDER BY id LIMIT 1",
        [],
        |r| {
            Ok((
                r.get::<_, Option<String>>(0)?,
                r.get::<_, Option<String>>(1)?,
                r.get::<_, Option<String>>(2)?,
            ))
        },
    );
    match row {
        Ok((name, ay, typ)) => (
            200,
            json!({"school": {"name": name, "academic_year": ay, "type": typ.unwrap_or_else(|| "school".into())}}),
        ),
        Err(_) => (200, json!({"school": Value::Null})),
    }
}

fn school_save(state: &AppState, body: &str) -> (u16, Value) {
    let v: Value = serde_json::from_str(body).unwrap_or(json!({}));
    let name = v["name"].as_str().unwrap_or("").to_string();
    let ay = v["academic_year"].as_str().unwrap_or("").to_string();
    let typ = v["type"].as_str().unwrap_or("school").to_string();
    let conn = state.conn.lock().unwrap();
    let existing: Option<i64> = conn
        .query_row("SELECT id FROM schools ORDER BY id LIMIT 1", [], |r| r.get(0))
        .ok();
    match existing {
        Some(id) => {
            let _ = conn.execute(
                "UPDATE schools SET name=?1, academic_year=?2, type=?3 WHERE id=?4",
                params![name, ay, typ, id],
            );
        }
        None => {
            let _ = conn.execute(
                "INSERT INTO schools(name, academic_year, type) VALUES(?1,?2,?3)",
                params![name, ay, typ],
            );
        }
    }
    (200, json!({"ok": true}))
}

// ---- floor plan (canvas layout persisted as JSON) ----

fn floorplan_get(state: &AppState) -> (u16, Value) {
    let conn = state.conn.lock().unwrap();
    let row = conn.query_row(
        "SELECT id, name, data FROM floorplans ORDER BY id LIMIT 1",
        [],
        |r| {
            Ok((
                r.get::<_, i64>(0)?,
                r.get::<_, Option<String>>(1)?,
                r.get::<_, Option<String>>(2)?,
            ))
        },
    );
    match row {
        Ok((id, name, data)) => {
            let parsed: Value = data
                .as_deref()
                .and_then(|s| serde_json::from_str(s).ok())
                .unwrap_or(Value::Null);
            (200, json!({"plan": {"id": id, "name": name, "data": parsed}}))
        }
        Err(_) => (200, json!({"plan": Value::Null})),
    }
}

fn floorplan_save(state: &AppState, body: &str) -> (u16, Value) {
    let v: Value = serde_json::from_str(body).unwrap_or(json!({}));
    let name = v["name"].as_str().unwrap_or("Floor Plan").to_string();
    let data = serde_json::to_string(&v["data"]).unwrap_or_else(|_| "null".to_string());
    let conn = state.conn.lock().unwrap();
    let existing: Option<i64> = conn
        .query_row("SELECT id FROM floorplans ORDER BY id LIMIT 1", [], |r| r.get(0))
        .ok();
    match existing {
        Some(id) => {
            let _ = conn.execute(
                "UPDATE floorplans SET name=?1, data=?2 WHERE id=?3",
                params![name, data, id],
            );
            (200, json!({"ok": true, "id": id}))
        }
        None => {
            let _ = conn.execute(
                "INSERT INTO floorplans(name, data) VALUES(?1,?2)",
                params![name, data],
            );
            (200, json!({"ok": true, "id": conn.last_insert_rowid()}))
        }
    }
}
