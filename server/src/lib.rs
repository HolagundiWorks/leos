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
    if method == &Method::Get && path.starts_with("/students/") {
        if let Ok(id) = path["/students/".len()..].parse::<i64>() {
            return with_auth(state, token, |_| student_detail(state, id));
        }
    }
    if method == &Method::Get && path == "/staff" {
        return with_auth(state, token, |_| staff_list(state, url));
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
    if method == &Method::Get && path == "/school" {
        return with_auth(state, token, |_| school_get(state));
    }
    if method == &Method::Get && path == "/floorplan" {
        return with_auth(state, token, |_| floorplan_get(state));
    }
    if method == &Method::Post && path == "/floorplan" {
        return with_auth(state, token, |_| floorplan_save(state, body));
    }
    if method == &Method::Post && path == "/schoolpkg/save" {
        return with_auth(state, token, |_| schoolpkg_save(body));
    }
    if method == &Method::Post && path == "/schoolpkg/open" {
        return with_auth(state, token, |_| schoolpkg_open(state, body));
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

fn student_detail(state: &AppState, id: i64) -> (u16, Value) {
    let conn = state.conn.lock().unwrap();
    let r = conn.query_row(
        "SELECT id, first_name, middle_name, last_name, email, phone, gender, birthdate, alt_id \
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
            }))
        },
    );
    match r {
        Ok(s) => (200, json!({"student": s})),
        Err(_) => (404, json!({"error": "student not found"})),
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
        "CREATE TABLE IF NOT EXISTS schools(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, academic_year TEXT);
         CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, password_hash TEXT, role TEXT, name TEXT);
         CREATE TABLE IF NOT EXISTS students(id INTEGER PRIMARY KEY AUTOINCREMENT, first_name TEXT, middle_name TEXT, last_name TEXT, email TEXT, phone TEXT, gender TEXT, birthdate TEXT, alt_id TEXT, enrolled INTEGER DEFAULT 0);
         CREATE TABLE IF NOT EXISTS staff(id INTEGER PRIMARY KEY AUTOINCREMENT, first_name TEXT, last_name TEXT, email TEXT, phone TEXT, profile TEXT, title TEXT);
         CREATE TABLE IF NOT EXISTS courses(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT);
         CREATE TABLE IF NOT EXISTS subjects(id INTEGER PRIMARY KEY AUTOINCREMENT, course_id INTEGER, name TEXT, code TEXT, type TEXT, weekly_periods INTEGER DEFAULT 0, is_lab INTEGER DEFAULT 0, mandatory INTEGER DEFAULT 1);
         CREATE TABLE IF NOT EXISTS gradelevels(id INTEGER PRIMARY KEY AUTOINCREMENT, short_name TEXT, title TEXT);
         CREATE TABLE IF NOT EXISTS classrooms(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, code TEXT, capacity INTEGER, room_type TEXT, is_active INTEGER DEFAULT 1);
         CREATE TABLE IF NOT EXISTS floorplans(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, data TEXT);
         CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT);",
    )
    .expect("create schema");

    if count(conn, "SELECT COUNT(*) FROM users") == 0 {
        seed(conn);
    }
    if count(conn, "SELECT COUNT(*) FROM courses") == 0 {
        seed_academics(conn);
    }
    if count(conn, "SELECT COUNT(*) FROM classrooms") == 0 {
        seed_rooms(conn);
    }
}

fn seed(conn: &Connection) {
    conn.execute(
        "INSERT INTO schools(name, academic_year) VALUES(?1, ?2)",
        params!["School Of Architecture", "2026-27"],
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

// ---- .schoolpkg portable file (ZIP: manifest + school.sqlite + media/docs) ----

fn schoolpkg_save(body: &str) -> (u16, Value) {
    let v: Value = serde_json::from_str(body).unwrap_or(json!({}));
    let out = v["path"]
        .as_str()
        .filter(|s| !s.is_empty())
        .unwrap_or("HCW-SMS.schoolpkg")
        .to_string();
    match write_schoolpkg(&out) {
        Ok(checksum) => (200, json!({"ok": true, "path": out, "checksum": checksum})),
        Err(e) => (500, json!({"error": format!("save failed: {e}")})),
    }
}

fn write_schoolpkg(out: &str) -> Result<String, Box<dyn std::error::Error>> {
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

fn schoolpkg_open(state: &AppState, body: &str) -> (u16, Value) {
    let v: Value = serde_json::from_str(body).unwrap_or(json!({}));
    let path = match v["path"].as_str() {
        Some(p) if !p.is_empty() => p.to_string(),
        _ => return (422, json!({"error": "path required"})),
    };
    match read_schoolpkg(state, &path) {
        Ok(()) => (200, json!({"ok": true, "opened": path})),
        Err(e) => (500, json!({"error": format!("open failed: {e}")})),
    }
}

fn read_schoolpkg(state: &AppState, path: &str) -> Result<(), Box<dyn std::error::Error>> {
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

fn school_get(state: &AppState) -> (u16, Value) {
    let conn = state.conn.lock().unwrap();
    let row = conn.query_row(
        "SELECT name, academic_year FROM schools ORDER BY id LIMIT 1",
        [],
        |r| Ok((r.get::<_, Option<String>>(0)?, r.get::<_, Option<String>>(1)?)),
    );
    match row {
        Ok((name, ay)) => (200, json!({"school": {"name": name, "academic_year": ay}})),
        Err(_) => (200, json!({"school": Value::Null})),
    }
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
