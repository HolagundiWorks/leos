// LEOS local API server — offline-first core over SQLite.
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

/// Start the LEOS API server (blocks, serving on :8787). Called by the
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
    println!("leos-server listening on http://localhost:8787 (SQLite: school.sqlite)");
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
        return (200, json!({"ok": true, "service": "leos-server", "store": "sqlite"}));
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
    if method == &Method::Get && path == "/students/by-card" {
        return with_auth(state, token, |_| student_by_card(state, url));
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
    if method == &Method::Get && path == "/dashboard/meetings-today" {
        return with_auth(state, token, |_| dashboard_meetings_today(state));
    }
    if method == &Method::Get && path == "/dashboard/stats" {
        return with_auth(state, token, |_| dashboard_stats(state));
    }
    if method == &Method::Get && path == "/dashboard/agenda" {
        return with_auth(state, token, |_| dashboard_agenda(state));
    }
    if method == &Method::Get && path == "/dashboard/focus" {
        return with_auth(state, token, |_| dashboard_focus(state));
    }
    if method == &Method::Get && path == "/courses" {
        return with_auth(state, token, |_| courses_list(state));
    }
    if method == &Method::Post && path == "/courses" {
        return with_auth(state, token, |_| course_create(state, body));
    }
    if method == &Method::Post && path.starts_with("/courses/") && path.ends_with("/update") {
        let id_str = &path["/courses/".len()..path.len() - "/update".len()];
        if let Ok(id) = id_str.parse::<i64>() {
            return with_auth(state, token, |_| course_update(state, id, body));
        }
    }
    if method == &Method::Post && path.starts_with("/courses/") && path.ends_with("/delete") {
        let id_str = &path["/courses/".len()..path.len() - "/delete".len()];
        if let Ok(id) = id_str.parse::<i64>() {
            return with_auth(state, token, |_| course_delete(state, id));
        }
    }
    if method == &Method::Get && path == "/subjects" {
        return with_auth(state, token, |_| subjects_list(state, url));
    }
    if method == &Method::Post && path == "/subjects" {
        return with_auth(state, token, |_| subject_create(state, body));
    }
    if method == &Method::Post && path.starts_with("/subjects/") && path.ends_with("/update") {
        let id_str = &path["/subjects/".len()..path.len() - "/update".len()];
        if let Ok(id) = id_str.parse::<i64>() {
            return with_auth(state, token, |_| subject_update(state, id, body));
        }
    }
    if method == &Method::Post && path.starts_with("/subjects/") && path.ends_with("/delete") {
        let id_str = &path["/subjects/".len()..path.len() - "/delete".len()];
        if let Ok(id) = id_str.parse::<i64>() {
            return with_auth(state, token, |_| subject_delete(state, id));
        }
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
    if method == &Method::Get && path == "/timetable/all" {
        return with_auth(state, token, |_| timetable_all(state));
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
    // Substitution engine
    if method == &Method::Get && path == "/substitutions" {
        return with_auth(state, token, |_| substitutions_list(state, url));
    }
    if method == &Method::Post && path == "/substitutions/mark-absent" {
        return with_auth(state, token, |_| substitution_mark_absent(state, body));
    }
    if method == &Method::Get && path == "/substitutions/suggestions" {
        return with_auth(state, token, |_| substitution_suggestions(state, url));
    }
    if method == &Method::Post && path == "/substitutions/assign" {
        return with_auth(state, token, |_| substitution_assign(state, body));
    }
    if method == &Method::Post && path == "/substitutions/resolve" {
        return with_auth(state, token, |_| substitution_resolve(state, body));
    }
    // Tech Admin Panel
    if method == &Method::Get && path == "/admin/system-info" {
        return with_auth(state, token, |_| admin_system_info(state));
    }
    if method == &Method::Get && path == "/admin/modules" {
        return with_auth(state, token, |_| admin_modules_list(state));
    }
    if method == &Method::Post && path.starts_with("/admin/modules/") && path.ends_with("/toggle") {
        let key = &path["/admin/modules/".len()..path.len() - "/toggle".len()];
        let key_owned = key.to_string();
        return with_auth(state, token, |_| admin_module_toggle(state, &key_owned));
    }
    if method == &Method::Get && path == "/admin/users/levels" {
        return with_auth(state, token, |_| admin_users_levels(state));
    }
    if method == &Method::Post && path.starts_with("/admin/users/") && path.ends_with("/level") {
        let id_str = &path["/admin/users/".len()..path.len() - "/level".len()];
        if let Ok(id) = id_str.parse::<i64>() {
            return with_auth(state, token, |_| admin_user_set_level(state, id, body));
        }
    }
    // Design Connect (P14)
    if method == &Method::Get && path == "/design/connection" {
        return with_auth(state, token, |_| design_connection_get(state));
    }
    if method == &Method::Post && path == "/design/connection" {
        return with_auth(state, token, |_| design_connection_save(state, body));
    }
    if method == &Method::Post && path == "/design/connection/disconnect" {
        return with_auth(state, token, |_| design_connection_delete(state));
    }
    if method == &Method::Get && path == "/design/templates" {
        return with_auth(state, token, |_| design_templates_list(state));
    }
    if method == &Method::Post && path == "/design/templates" {
        return with_auth(state, token, |_| design_template_save(state, body));
    }
    if method == &Method::Post && path.starts_with("/design/templates/") && path.ends_with("/field-map") {
        let id_str = &path["/design/templates/".len()..path.len() - "/field-map".len()];
        if let Ok(id) = id_str.parse::<i64>() {
            return with_auth(state, token, |_| design_template_field_map(state, id, body));
        }
    }
    if method == &Method::Get && path == "/design/jobs" {
        return with_auth(state, token, |_| design_jobs_list(state));
    }
    if method == &Method::Post && path == "/design/jobs" {
        return with_auth(state, token, |uid| design_job_create(state, uid, body));
    }
    if method == &Method::Post && path.starts_with("/design/jobs/") && path.ends_with("/approve") {
        let id_str = &path["/design/jobs/".len()..path.len() - "/approve".len()];
        if let Ok(id) = id_str.parse::<i64>() {
            return with_auth(state, token, |uid| design_job_approve(state, uid, id));
        }
    }
    // External DB Connector (P12)
    if method == &Method::Get && path == "/import/jobs" {
        return with_auth(state, token, |_| import_jobs_list(state));
    }
    if method == &Method::Post && path == "/import/csv" {
        return with_auth(state, token, |_| import_csv(state, body));
    }
    if method == &Method::Post && path == "/import/sqlite" {
        return with_auth(state, token, |_| import_sqlite(state, body));
    }
    // Security & Audit (P11)
    if method == &Method::Get && path == "/audit-log" {
        return with_auth(state, token, |_| audit_log_list(state, url));
    }
    if method == &Method::Get && path == "/roles" {
        return with_auth(state, token, |_| roles_list(state));
    }
    if method == &Method::Post && path.starts_with("/roles/") && path.ends_with("/update") {
        let id_str = &path["/roles/".len()..path.len() - "/update".len()];
        if let Ok(id) = id_str.parse::<i64>() {
            return with_auth(state, token, |_| role_update(state, id, body));
        }
    }
    // Backup & Recovery OS (P10)
    if method == &Method::Get && path == "/backup/config" {
        return with_auth(state, token, |_| backup_config_get(state));
    }
    if method == &Method::Post && path == "/backup/config" {
        return with_auth(state, token, |_| backup_config_save(state, body));
    }
    if method == &Method::Post && path == "/backup/run" {
        return with_auth(state, token, |_| backup_run(state, body));
    }
    if method == &Method::Get && path == "/backup/list" {
        return with_auth(state, token, |_| backup_list(state));
    }
    if method == &Method::Post && path == "/backup/restore" {
        return with_auth(state, token, |_| backup_restore(state, body));
    }
    // Activity Scheduler OS (P8)
    if method == &Method::Get && path == "/activities" {
        return with_auth(state, token, |_| activities_list(state, url));
    }
    if method == &Method::Post && path == "/activities" {
        return with_auth(state, token, |u| activity_create(state, body, u));
    }
    if method == &Method::Post && path.starts_with("/activities/") && path.ends_with("/update") {
        let id_str = &path["/activities/".len()..path.len() - "/update".len()];
        if let Ok(id) = id_str.parse::<i64>() {
            return with_auth(state, token, |_| activity_update(state, id, body));
        }
    }
    if method == &Method::Post && path.starts_with("/activities/") && path.ends_with("/delete") {
        let id_str = &path["/activities/".len()..path.len() - "/delete".len()];
        if let Ok(id) = id_str.parse::<i64>() {
            return with_auth(state, token, |_| activity_delete(state, id));
        }
    }
    if method == &Method::Get && path.starts_with("/activities/") && path.ends_with("/detail") {
        let id_str = &path["/activities/".len()..path.len() - "/detail".len()];
        if let Ok(id) = id_str.parse::<i64>() {
            return with_auth(state, token, |_| activity_detail(state, id));
        }
    }
    if method == &Method::Post && path == "/activity-staff" {
        return with_auth(state, token, |_| activity_staff_save(state, body));
    }
    if method == &Method::Post && path == "/activity-staff/remove" {
        return with_auth(state, token, |_| activity_staff_remove(state, body));
    }
    if method == &Method::Post && path == "/activity-sections" {
        return with_auth(state, token, |_| activity_sections_save(state, body));
    }
    if method == &Method::Post && path == "/activity-sections/remove" {
        return with_auth(state, token, |_| activity_sections_remove(state, body));
    }
    if method == &Method::Get && path == "/activity-expenses" {
        return with_auth(state, token, |_| activity_expenses_list(state, url));
    }
    if method == &Method::Post && path == "/activity-expenses" {
        return with_auth(state, token, |_| activity_expense_add(state, body));
    }
    if method == &Method::Post && path.starts_with("/activity-expenses/") && path.ends_with("/delete") {
        let id_str = &path["/activity-expenses/".len()..path.len() - "/delete".len()];
        if let Ok(id) = id_str.parse::<i64>() {
            return with_auth(state, token, |_| activity_expense_delete(state, id));
        }
    }
    // Event Management OS (P7)
    if method == &Method::Get && path == "/announcements" {
        return with_auth(state, token, |_| announcements_list(state, url));
    }
    if method == &Method::Post && path == "/announcements" {
        return with_auth(state, token, |u| announcement_create(state, body, u));
    }
    if method == &Method::Post && path.starts_with("/announcements/") && path.ends_with("/publish") {
        let id_str = &path["/announcements/".len()..path.len() - "/publish".len()];
        if let Ok(id) = id_str.parse::<i64>() {
            return with_auth(state, token, |_| announcement_publish(state, id));
        }
    }
    if method == &Method::Post && path.starts_with("/announcements/") && path.ends_with("/delete") {
        let id_str = &path["/announcements/".len()..path.len() - "/delete".len()];
        if let Ok(id) = id_str.parse::<i64>() {
            return with_auth(state, token, |_| announcement_delete(state, id));
        }
    }
    if method == &Method::Get && path == "/meetings" {
        return with_auth(state, token, |_| meetings_list(state, url));
    }
    if method == &Method::Post && path == "/meetings" {
        return with_auth(state, token, |u| meeting_create(state, body, u));
    }
    if method == &Method::Post && path.starts_with("/meetings/") && path.ends_with("/update") {
        let id_str = &path["/meetings/".len()..path.len() - "/update".len()];
        if let Ok(id) = id_str.parse::<i64>() {
            return with_auth(state, token, |_| meeting_update(state, id, body));
        }
    }
    if method == &Method::Post && path.starts_with("/meetings/") && path.ends_with("/delete") {
        let id_str = &path["/meetings/".len()..path.len() - "/delete".len()];
        if let Ok(id) = id_str.parse::<i64>() {
            return with_auth(state, token, |_| meeting_delete(state, id));
        }
    }
    if method == &Method::Get && path == "/tasks" {
        return with_auth(state, token, |_| tasks_list(state, url));
    }
    if method == &Method::Post && path == "/tasks" {
        return with_auth(state, token, |u| task_create(state, body, u));
    }
    if method == &Method::Post && path.starts_with("/tasks/") && path.ends_with("/update") {
        let id_str = &path["/tasks/".len()..path.len() - "/update".len()];
        if let Ok(id) = id_str.parse::<i64>() {
            return with_auth(state, token, |_| task_update(state, id, body));
        }
    }
    if method == &Method::Post && path.starts_with("/tasks/") && path.ends_with("/complete") {
        let id_str = &path["/tasks/".len()..path.len() - "/complete".len()];
        if let Ok(id) = id_str.parse::<i64>() {
            return with_auth(state, token, |_| task_complete(state, id));
        }
    }
    if method == &Method::Post && path.starts_with("/tasks/") && path.ends_with("/delete") {
        let id_str = &path["/tasks/".len()..path.len() - "/delete".len()];
        if let Ok(id) = id_str.parse::<i64>() {
            return with_auth(state, token, |_| task_delete(state, id));
        }
    }
    // Reminders
    if method == &Method::Get && path == "/reminders" {
        return with_auth(state, token, |_| reminders_list(state, url));
    }
    if method == &Method::Post && path == "/reminders" {
        return with_auth(state, token, |u| reminder_create(state, body, u));
    }
    if method == &Method::Post && path.starts_with("/reminders/") && path.ends_with("/done") {
        let id_str = &path["/reminders/".len()..path.len() - "/done".len()];
        if let Ok(id) = id_str.parse::<i64>() {
            return with_auth(state, token, |_| reminder_done(state, id));
        }
    }
    if method == &Method::Post && path.starts_with("/reminders/") && path.ends_with("/delete") {
        let id_str = &path["/reminders/".len()..path.len() - "/delete".len()];
        if let Ok(id) = id_str.parse::<i64>() {
            return with_auth(state, token, |_| reminder_delete(state, id));
        }
    }
    // Transport OS
    if method == &Method::Get && path == "/transport/vehicles" {
        return with_auth(state, token, |_| transport_vehicles_list(state));
    }
    if method == &Method::Post && path == "/transport/vehicles" {
        return with_auth(state, token, |_| transport_vehicle_create(state, body));
    }
    if method == &Method::Post && path.starts_with("/transport/vehicles/") && path.ends_with("/delete") {
        let id_str = &path["/transport/vehicles/".len()..path.len() - "/delete".len()];
        if let Ok(id) = id_str.parse::<i64>() {
            return with_auth(state, token, |_| transport_vehicle_delete(state, id));
        }
    }
    if method == &Method::Get && path == "/transport/routes" {
        return with_auth(state, token, |_| transport_routes_list(state));
    }
    if method == &Method::Post && path == "/transport/routes" {
        return with_auth(state, token, |_| transport_route_create(state, body));
    }
    if method == &Method::Post && path.starts_with("/transport/routes/") && path.ends_with("/delete") {
        let id_str = &path["/transport/routes/".len()..path.len() - "/delete".len()];
        if let Ok(id) = id_str.parse::<i64>() {
            return with_auth(state, token, |_| transport_route_delete(state, id));
        }
    }
    if method == &Method::Post && path == "/transport/stops" {
        return with_auth(state, token, |_| transport_stop_create(state, body));
    }
    if method == &Method::Post && path.starts_with("/transport/stops/") && path.ends_with("/delete") {
        let id_str = &path["/transport/stops/".len()..path.len() - "/delete".len()];
        if let Ok(id) = id_str.parse::<i64>() {
            return with_auth(state, token, |_| transport_stop_delete(state, id));
        }
    }
    if method == &Method::Get && path == "/transport/assignments" {
        return with_auth(state, token, |_| transport_assignments_list(state, url));
    }
    if method == &Method::Post && path == "/transport/assignments" {
        return with_auth(state, token, |_| transport_assign(state, body));
    }
    if method == &Method::Post && path.starts_with("/transport/assignments/") && path.ends_with("/delete") {
        let id_str = &path["/transport/assignments/".len()..path.len() - "/delete".len()];
        if let Ok(id) = id_str.parse::<i64>() {
            return with_auth(state, token, |_| transport_unassign(state, id));
        }
    }
    // Issued items (ID / books / uniform markers — no accounting)
    if method == &Method::Get && path == "/issued" {
        return with_auth(state, token, |_| issued_list(state, url));
    }
    if method == &Method::Post && path == "/issued/mark" {
        return with_auth(state, token, |u| issued_mark(state, body, u));
    }
    // Visitor log
    if method == &Method::Get && path == "/visitors" {
        return with_auth(state, token, |_| visitors_list(state, url));
    }
    if method == &Method::Post && path == "/visitors" {
        return with_auth(state, token, |u| visitor_checkin(state, body, u));
    }
    if method == &Method::Post && path.starts_with("/visitors/") && path.ends_with("/checkout") {
        let id_str = &path["/visitors/".len()..path.len() - "/checkout".len()];
        if let Ok(id) = id_str.parse::<i64>() {
            return with_auth(state, token, |_| visitor_checkout(state, id));
        }
    }
    if method == &Method::Post && path.starts_with("/visitors/") && path.ends_with("/delete") {
        let id_str = &path["/visitors/".len()..path.len() - "/delete".len()];
        if let Ok(id) = id_str.parse::<i64>() {
            return with_auth(state, token, |_| visitor_delete(state, id));
        }
    }
    // Library OS
    if method == &Method::Get && path == "/library/books" {
        return with_auth(state, token, |_| library_books_list(state, url));
    }
    if method == &Method::Post && path == "/library/books" {
        return with_auth(state, token, |_| library_book_create(state, body));
    }
    if method == &Method::Post && path.starts_with("/library/books/") && path.ends_with("/delete") {
        let id_str = &path["/library/books/".len()..path.len() - "/delete".len()];
        if let Ok(id) = id_str.parse::<i64>() {
            return with_auth(state, token, |_| library_book_delete(state, id));
        }
    }
    if method == &Method::Get && path == "/library/loans" {
        return with_auth(state, token, |_| library_loans_list(state, url));
    }
    if method == &Method::Post && path == "/library/loans" {
        return with_auth(state, token, |u| library_loan_issue(state, body, u));
    }
    if method == &Method::Post && path.starts_with("/library/loans/") && path.ends_with("/return") {
        let id_str = &path["/library/loans/".len()..path.len() - "/return".len()];
        if let Ok(id) = id_str.parse::<i64>() {
            return with_auth(state, token, |_| library_loan_return(state, id));
        }
    }
    // Fee OS (P6)
    if method == &Method::Get && path == "/fee-heads" {
        return with_auth(state, token, |_| fee_heads_list(state));
    }
    if method == &Method::Post && path == "/fee-heads" {
        return with_auth(state, token, |_| fee_head_create(state, body));
    }
    if method == &Method::Post && path.starts_with("/fee-heads/") && path.ends_with("/delete") {
        let id_str = &path["/fee-heads/".len()..path.len() - "/delete".len()];
        if let Ok(id) = id_str.parse::<i64>() {
            return with_auth(state, token, |_| fee_head_delete(state, id));
        }
    }
    if method == &Method::Get && path == "/fee-structures" {
        return with_auth(state, token, |_| fee_structures_list(state, url));
    }
    if method == &Method::Post && path == "/fee-structures" {
        return with_auth(state, token, |_| fee_structure_save(state, body));
    }
    if method == &Method::Get && path == "/fee-payments" {
        return with_auth(state, token, |_| fee_payments_list(state, url));
    }
    if method == &Method::Post && path == "/fee-payments" {
        return with_auth(state, token, |_| fee_payment_create(state, body));
    }
    if method == &Method::Get && path == "/fee-payments/outstanding" {
        return with_auth(state, token, |_| fee_outstanding(state, url));
    }
    if method == &Method::Get && path == "/fee-payments/overdue" {
        return with_auth(state, token, |_| fee_overdue(state, url));
    }
    // Exam OS (P5)
    if method == &Method::Get && path == "/exams" {
        return with_auth(state, token, |_| exams_list(state, url));
    }
    if method == &Method::Post && path == "/exams" {
        return with_auth(state, token, |_| exam_create(state, body));
    }
    if method == &Method::Post && path.starts_with("/exams/") && path.ends_with("/update") {
        let id_str = &path["/exams/".len()..path.len() - "/update".len()];
        if let Ok(id) = id_str.parse::<i64>() {
            return with_auth(state, token, |_| exam_update(state, id, body));
        }
    }
    if method == &Method::Post && path.starts_with("/exams/") && path.ends_with("/delete") {
        let id_str = &path["/exams/".len()..path.len() - "/delete".len()];
        if let Ok(id) = id_str.parse::<i64>() {
            return with_auth(state, token, |_| exam_delete(state, id));
        }
    }
    if method == &Method::Get && path == "/exam-schedules" {
        return with_auth(state, token, |_| exam_schedules_list(state, url));
    }
    if method == &Method::Post && path == "/exam-schedules" {
        return with_auth(state, token, |_| exam_schedule_save(state, body));
    }
    if method == &Method::Get && path == "/exam-marks" {
        return with_auth(state, token, |_| exam_marks_list(state, url));
    }
    if method == &Method::Post && path == "/exam-marks" {
        return with_auth(state, token, |_| exam_marks_save(state, body));
    }
    if method == &Method::Get && path == "/exam-marks/report" {
        return with_auth(state, token, |_| exam_marks_report(state, url));
    }
    // Staff OS (P4) — Departments
    if method == &Method::Get && path == "/departments" {
        return with_auth(state, token, |_| departments_list(state));
    }
    if method == &Method::Post && path == "/departments" {
        return with_auth(state, token, |_| department_create(state, body));
    }
    if method == &Method::Post && path.starts_with("/departments/") && path.ends_with("/update") {
        let id_str = &path["/departments/".len()..path.len() - "/update".len()];
        if let Ok(id) = id_str.parse::<i64>() {
            return with_auth(state, token, |_| department_update(state, id, body));
        }
    }
    if method == &Method::Post && path.starts_with("/departments/") && path.ends_with("/delete") {
        let id_str = &path["/departments/".len()..path.len() - "/delete".len()];
        if let Ok(id) = id_str.parse::<i64>() {
            return with_auth(state, token, |_| department_delete(state, id));
        }
    }
    // Staff OS — Payroll (P4.3)
    if method == &Method::Get && path == "/payroll/structure" {
        return with_auth(state, token, |_| payroll_structure_get(state, url));
    }
    if method == &Method::Post && path == "/payroll/structure" {
        return with_auth(state, token, |_| payroll_structure_save(state, body));
    }
    if method == &Method::Get && path == "/payroll/payslips" {
        return with_auth(state, token, |_| payslips_list(state, url));
    }
    if method == &Method::Post && path == "/payroll/generate" {
        return with_auth(state, token, |_| payroll_generate(state, body));
    }
    // Staff OS — Leave management
    if method == &Method::Get && path == "/leave" {
        return with_auth(state, token, |_| leave_list(state, url));
    }
    if method == &Method::Post && path == "/leave" {
        return with_auth(state, token, |uid| leave_create(state, uid, body));
    }
    if method == &Method::Post && path == "/leave/approve" {
        return with_auth(state, token, |uid| leave_approve(state, uid, body));
    }
    if method == &Method::Post && path == "/leave/reject" {
        return with_auth(state, token, |uid| leave_reject(state, uid, body));
    }
    // Attendance OS (P3)
    if method == &Method::Get && path == "/section-students" {
        return with_auth(state, token, |_| section_students_list(state, url));
    }
    if method == &Method::Post && path == "/section-students" {
        return with_auth(state, token, |_| section_students_enroll(state, body));
    }
    if method == &Method::Post && path == "/section-students/remove" {
        return with_auth(state, token, |_| section_students_remove(state, body));
    }
    if method == &Method::Get && path == "/attendance" {
        return with_auth(state, token, |_| attendance_get(state, url));
    }
    if method == &Method::Post && path == "/attendance/mark" {
        return with_auth(state, token, |uid| attendance_mark(state, uid, body));
    }
    if method == &Method::Get && path == "/attendance/summary" {
        return with_auth(state, token, |_| attendance_summary(state, url));
    }
    if method == &Method::Get && path == "/attendance/alerts" {
        return with_auth(state, token, |_| attendance_alerts(state));
    }
    if method == &Method::Post && path == "/leosdb/save" {
        return with_auth(state, token, |_| leosdb_save(body));
    }
    if method == &Method::Post && path == "/leosdb/open" {
        return with_auth(state, token, |_| leosdb_open(state, body));
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
         guardian_name=?10, guardian_phone=?11, guardian_relation=?12, address=?13, card_uid=COALESCE(?15,card_uid)
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
            v["card_uid"].as_str().filter(|s| !s.is_empty()),
        ],
    ) {
        Ok(0) => (404, json!({"error": "student not found"})),
        Ok(_) => (200, json!({"ok": true})),
        Err(e) => (500, json!({"error": format!("{e}")})),
    }
}

fn student_by_card(state: &AppState, url: &str) -> (u16, Value) {
    let uid = match q_param(url, "uid") { Some(u) if !u.is_empty() => u, _ => return (422, json!({"error": "uid required"})) };
    let conn = state.conn.lock().unwrap();
    let result = conn.query_row(
        "SELECT id, first_name, last_name, card_uid FROM students WHERE card_uid=?1",
        params![uid],
        |r| Ok(json!({ "id": r.get::<_, i64>(0)?, "first_name": r.get::<_, String>(1)?, "last_name": r.get::<_, String>(2)?, "card_uid": r.get::<_, Option<String>>(3)? })),
    );
    match result {
        Ok(s) => (200, json!({"student": s})),
        Err(_) => (200, json!({"student": null})),
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

    let mut items = Vec::new();

    // ── Core setup prompts ──────────────────────────────────────────────────────
    if not_enrolled > 0 {
        items.push(json!({"key": "enroll", "count": not_enrolled, "label": "students not enrolled in a class", "severity": "warning", "module": "students"}));
    }
    if courses == 0 {
        items.push(json!({"key": "courses", "count": 0, "label": "Set up your first course", "severity": "info", "module": "courses"}));
    }

    // ── Pending leave requests ──────────────────────────────────────────────────
    let pending_leave = conn.query_row(
        "SELECT COUNT(*) FROM leave_requests WHERE status='pending'", [], |r| r.get::<_, i64>(0)
    ).unwrap_or(0);
    if pending_leave > 0 {
        items.push(json!({"key": "leave", "count": pending_leave, "label": "leave requests pending approval", "severity": "warning", "module": "staff-os"}));
    }

    // ── Pending substitutions ──────────────────────────────────────────────────
    let pending_sub = conn.query_row(
        "SELECT COUNT(*) FROM substitutions WHERE status='pending'", [], |r| r.get::<_, i64>(0)
    ).unwrap_or(0);
    if pending_sub > 0 {
        items.push(json!({"key": "substitution", "count": pending_sub, "label": "substitution slots unresolved", "severity": "danger", "module": "substitution"}));
    }

    // ── Overdue fees ──────────────────────────────────────────────────────────
    let overdue_fee = conn.query_row(
        "SELECT COUNT(DISTINCT s.id) FROM students s
         JOIN (SELECT DISTINCT ss.student_id, se.class_id FROM section_students ss JOIN sections se ON se.id=ss.section_id) sc ON sc.student_id=s.id
         JOIN fee_structures fs ON (fs.class_id IS NULL OR fs.class_id=sc.class_id)
         WHERE fs.due_date IS NOT NULL AND fs.due_date < date('now')
           AND fs.amount > COALESCE((SELECT SUM(fp.amount_paid) FROM fee_payments fp WHERE fp.student_id=s.id AND fp.fee_head_id=fs.fee_head_id), 0)",
        [], |r| r.get::<_, i64>(0)
    ).unwrap_or(0);
    if overdue_fee > 0 {
        items.push(json!({"key": "fees", "count": overdue_fee, "label": "students with overdue fees", "severity": "danger", "module": "fees"}));
    }

    // ── Upcoming exams (within 7 days) ─────────────────────────────────────────
    let upcoming_exams = conn.query_row(
        "SELECT COUNT(*) FROM exams WHERE start_date BETWEEN date('now') AND date('now', '+7 days')",
        [], |r| r.get::<_, i64>(0)
    ).unwrap_or(0);
    if upcoming_exams > 0 {
        items.push(json!({"key": "exams", "count": upcoming_exams, "label": "exams starting in the next 7 days", "severity": "warning", "module": "exams"}));
    }

    // ── Overdue tasks ─────────────────────────────────────────────────────────
    let overdue_tasks = conn.query_row(
        "SELECT COUNT(*) FROM tasks WHERE status NOT IN ('completed','cancelled') AND due_date < date('now')",
        [], |r| r.get::<_, i64>(0)
    ).unwrap_or(0);
    if overdue_tasks > 0 {
        items.push(json!({"key": "tasks", "count": overdue_tasks, "label": "overdue tasks", "severity": "warning", "module": "events"}));
    }

    // ── Today's meetings ──────────────────────────────────────────────────────
    let meetings_today = conn.query_row(
        "SELECT COUNT(*) FROM meetings WHERE date = date('now') AND status != 'cancelled'",
        [], |r| r.get::<_, i64>(0)
    ).unwrap_or(0);
    if meetings_today > 0 {
        items.push(json!({"key": "meetings", "count": meetings_today, "label": "meetings scheduled today", "severity": "info", "module": "events"}));
    }

    // ── Activities this week ──────────────────────────────────────────────────
    let acts_week = conn.query_row(
        "SELECT COUNT(*) FROM activities WHERE date BETWEEN date('now') AND date('now', '+7 days') AND status IN ('planned','confirmed')",
        [], |r| r.get::<_, i64>(0)
    ).unwrap_or(0);
    if acts_week > 0 {
        items.push(json!({"key": "activities", "count": acts_week, "label": "activities this week", "severity": "info", "module": "activities"}));
    }

    items
}

fn dashboard_meetings_today(state: &AppState) -> (u16, Value) {
    let conn = state.conn.lock().unwrap();
    let mut stmt = match conn.prepare(
        "SELECT id, title, meeting_type, date, start_time, end_time, venue, status
         FROM meetings WHERE date=date('now') AND status != 'cancelled'
         ORDER BY start_time"
    ) {
        Ok(s) => s,
        Err(e) => return (500, json!({"error": format!("{e}")})),
    };
    let rows: Vec<Value> = match stmt.query_map([], |r| {
        Ok(json!({
            "id": r.get::<_, i64>(0)?,
            "title": r.get::<_, String>(1)?,
            "meeting_type": r.get::<_, Option<String>>(2)?,
            "date": r.get::<_, String>(3)?,
            "start_time": r.get::<_, Option<String>>(4)?,
            "end_time": r.get::<_, Option<String>>(5)?,
            "venue": r.get::<_, Option<String>>(6)?,
            "status": r.get::<_, Option<String>>(7)?,
        }))
    }) {
        Ok(mapped) => mapped.filter_map(|r| r.ok()).collect(),
        Err(e) => return (500, json!({"error": format!("{e}")})),
    };
    (200, json!({"meetings": rows}))
}

/// Upcoming meetings grouped by type (department/staff/parent) plus upcoming
/// events (activities). Powers the categorised dashboard cards.
fn dashboard_agenda(state: &AppState) -> (u16, Value) {
    let conn = state.conn.lock().unwrap();

    // Upcoming meetings of a given type (today onward, not cancelled).
    let meetings_of = |mtype: &str| -> Vec<Value> {
        let mut stmt = match conn.prepare(
            "SELECT id, title, meeting_type, date, start_time, venue, status
             FROM meetings
             WHERE meeting_type=?1 AND date >= date('now') AND status != 'cancelled'
             ORDER BY date, start_time LIMIT 5",
        ) {
            Ok(s) => s,
            Err(_) => return vec![],
        };
        let rows = stmt.query_map(params![mtype], |r| {
            Ok(json!({
                "id": r.get::<_, i64>(0)?,
                "title": r.get::<_, String>(1)?,
                "meeting_type": r.get::<_, Option<String>>(2)?,
                "date": r.get::<_, String>(3)?,
                "start_time": r.get::<_, Option<String>>(4)?,
                "venue": r.get::<_, Option<String>>(5)?,
                "status": r.get::<_, Option<String>>(6)?,
            }))
        });
        match rows {
            Ok(m) => m.filter_map(|r| r.ok()).collect(),
            Err(_) => vec![],
        }
    };

    // Upcoming events = activities scheduled today onward.
    let events: Vec<Value> = {
        let mut stmt = conn.prepare(
            "SELECT id, title, activity_type, date, venue, status
             FROM activities
             WHERE date >= date('now') AND status IN ('planned','confirmed')
             ORDER BY date LIMIT 6",
        );
        match stmt {
            Ok(ref mut s) => {
                let m = s.query_map([], |r| {
                    Ok(json!({
                        "id": r.get::<_, i64>(0)?,
                        "title": r.get::<_, String>(1)?,
                        "activity_type": r.get::<_, Option<String>>(2)?,
                        "date": r.get::<_, Option<String>>(3)?,
                        "venue": r.get::<_, Option<String>>(4)?,
                        "status": r.get::<_, Option<String>>(5)?,
                    }))
                });
                match m {
                    Ok(it) => it.filter_map(|r| r.ok()).collect(),
                    Err(_) => vec![],
                }
            }
            Err(_) => vec![],
        }
    };

    (200, json!({
        "department": meetings_of("department"),
        "staff": meetings_of("staff"),
        "parent": meetings_of("parent"),
        "events": events,
    }))
}

/// Tag-driven focus cards: everything tagged 'critical', and everything with a
/// due date — drawn from both reminders and tasks (shared tag set).
fn dashboard_focus(state: &AppState) -> (u16, Value) {
    let conn = state.conn.lock().unwrap();

    let run = |sql: &str| -> Vec<Value> {
        let mut stmt = match conn.prepare(sql) { Ok(s) => s, Err(_) => return vec![] };
        let m = stmt.query_map([], |r| {
            Ok(json!({
                "kind": r.get::<_, String>(0)?,
                "id": r.get::<_, i64>(1)?,
                "title": r.get::<_, String>(2)?,
                "tag": r.get::<_, Option<String>>(3)?,
                "due_date": r.get::<_, Option<String>>(4)?,
            }))
        });
        match m { Ok(it) => it.filter_map(|r| r.ok()).collect(), Err(_) => vec![] }
    };

    // Critical: reminders tagged critical + tasks at priority critical.
    // Wrap the UNION in a subquery so the outer ORDER BY can use an expression
    // (SQLite forbids expression ORDER BY directly on a compound SELECT).
    let critical = run(
        "SELECT * FROM (
            SELECT 'reminder' AS kind, id, title, tag, due_date FROM reminders
                WHERE done=0 AND tag='critical'
            UNION ALL
            SELECT 'task' AS kind, id, title, priority AS tag, due_date FROM tasks
                WHERE status NOT IN ('completed','cancelled') AND priority='critical'
         ) ORDER BY (due_date IS NULL), due_date LIMIT 10",
    );

    // Due: anything with a due date still open, soonest first (overdue included).
    let due = run(
        "SELECT * FROM (
            SELECT 'reminder' AS kind, id, title, tag, due_date FROM reminders
                WHERE done=0 AND due_date IS NOT NULL
            UNION ALL
            SELECT 'task' AS kind, id, title, priority AS tag, due_date FROM tasks
                WHERE status NOT IN ('completed','cancelled') AND due_date IS NOT NULL
         ) ORDER BY due_date LIMIT 10",
    );

    (200, json!({ "critical": critical, "due": due }))
}

fn dashboard_stats(state: &AppState) -> (u16, Value) {
    let conn = state.conn.lock().unwrap();
    let students = count(&conn, "SELECT COUNT(*) FROM students");
    let staff = count(&conn, "SELECT COUNT(*) FROM staff");
    let sections = count(&conn, "SELECT COUNT(*) FROM sections");
    let pending_fees = conn.query_row(
        "SELECT COUNT(DISTINCT s.id) FROM students s
         JOIN (SELECT DISTINCT ss.student_id, se.class_id FROM section_students ss JOIN sections se ON se.id=ss.section_id) sc ON sc.student_id=s.id
         JOIN fee_structures fs ON (fs.class_id IS NULL OR fs.class_id=sc.class_id)
         WHERE fs.amount > COALESCE((SELECT SUM(fp.amount_paid) FROM fee_payments fp WHERE fp.student_id=s.id AND fp.fee_head_id=fs.fee_head_id), 0)",
        [], |r| r.get::<_, i64>(0)
    ).unwrap_or(0);
    (200, json!({ "students": students, "staff": staff, "sections": sections, "pending_fees": pending_fees }))
}

// ---- helpers ----

/// Tomohiko Sakamoto DOW: returns 0=Mon..6=Sun from "YYYY-MM-DD"
fn date_to_dow(date: &str) -> Option<i64> {
    let parts: Vec<i64> = date.split('-').filter_map(|s| s.parse().ok()).collect();
    if parts.len() < 3 { return None; }
    let (y, m, d) = (parts[0], parts[1], parts[2]);
    let t = [0i64, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4];
    let yy = if m < 3 { y - 1 } else { y };
    let sunday_based = (yy + yy/4 - yy/100 + yy/400 + t[(m-1) as usize] + d) % 7;
    Some((sunday_based + 6) % 7) // convert: 0=Mon
}

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
         CREATE TABLE IF NOT EXISTS terms(id INTEGER PRIMARY KEY AUTOINCREMENT, year_id INTEGER NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE, label TEXT NOT NULL, start_date TEXT, end_date TEXT, is_active INTEGER DEFAULT 0);
         CREATE TABLE IF NOT EXISTS substitutions(id INTEGER PRIMARY KEY AUTOINCREMENT, original_entry_id INTEGER NOT NULL, original_staff_id INTEGER NOT NULL, substitute_staff_id INTEGER, date TEXT NOT NULL, reason TEXT, status TEXT DEFAULT 'pending', created_at TEXT DEFAULT (datetime('now')), resolved_at TEXT, UNIQUE(original_entry_id, date));
         CREATE TABLE IF NOT EXISTS departments(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, head_staff_id INTEGER);
         CREATE TABLE IF NOT EXISTS leave_requests(id INTEGER PRIMARY KEY AUTOINCREMENT, staff_id INTEGER NOT NULL, leave_type TEXT DEFAULT 'sick', from_date TEXT NOT NULL, to_date TEXT NOT NULL, reason TEXT, status TEXT DEFAULT 'pending', approved_by INTEGER, approved_at TEXT, created_at TEXT DEFAULT (datetime('now')));
         CREATE TABLE IF NOT EXISTS exams(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, exam_type TEXT DEFAULT 'unit', academic_year_id INTEGER, term_id INTEGER, start_date TEXT, end_date TEXT, created_at TEXT DEFAULT (datetime('now')));
         CREATE TABLE IF NOT EXISTS exam_schedules(id INTEGER PRIMARY KEY AUTOINCREMENT, exam_id INTEGER NOT NULL, subject_id INTEGER, section_id INTEGER, date TEXT, start_time TEXT, end_time TEXT, room_id INTEGER, invigilator_id INTEGER, UNIQUE(exam_id, subject_id, section_id));
         CREATE TABLE IF NOT EXISTS exam_marks(id INTEGER PRIMARY KEY AUTOINCREMENT, exam_id INTEGER NOT NULL, student_id INTEGER NOT NULL, subject_id INTEGER NOT NULL, marks_obtained REAL, max_marks REAL DEFAULT 100, grade TEXT, remarks TEXT, UNIQUE(exam_id, student_id, subject_id));
         CREATE TABLE IF NOT EXISTS salary_structures(id INTEGER PRIMARY KEY AUTOINCREMENT, staff_id INTEGER NOT NULL UNIQUE, basic REAL DEFAULT 0, hra REAL DEFAULT 0, da REAL DEFAULT 0, ta REAL DEFAULT 0, other_allowances REAL DEFAULT 0, pf_deduction REAL DEFAULT 0, pt_deduction REAL DEFAULT 0, other_deductions REAL DEFAULT 0, effective_from TEXT, updated_at TEXT DEFAULT (datetime('now')));
         CREATE TABLE IF NOT EXISTS payslips(id INTEGER PRIMARY KEY AUTOINCREMENT, staff_id INTEGER NOT NULL, month TEXT NOT NULL, basic REAL, hra REAL, da REAL, ta REAL, other_allowances REAL, pf_deduction REAL, pt_deduction REAL, other_deductions REAL, gross REAL, net REAL, working_days INTEGER, paid_days INTEGER, generated_at TEXT DEFAULT (datetime('now')), UNIQUE(staff_id, month));
         CREATE TABLE IF NOT EXISTS module_settings(key TEXT PRIMARY KEY, display_name TEXT NOT NULL, enabled INTEGER DEFAULT 1, min_level INTEGER DEFAULT 5);
         CREATE TABLE IF NOT EXISTS design_connections(id INTEGER PRIMARY KEY AUTOINCREMENT, provider TEXT NOT NULL DEFAULT 'canva', account_email TEXT, access_token_enc TEXT, refresh_token_enc TEXT, token_expiry TEXT, scopes TEXT, last_sync TEXT, connected_at TEXT DEFAULT (datetime('now')));
         CREATE TABLE IF NOT EXISTS design_templates(id INTEGER PRIMARY KEY AUTOINCREMENT, connection_id INTEGER, template_id TEXT NOT NULL, template_name TEXT, thumbnail_url TEXT, category TEXT DEFAULT 'id_card', field_map TEXT DEFAULT '{}', last_fetched TEXT);
         CREATE TABLE IF NOT EXISTS design_jobs(id INTEGER PRIMARY KEY AUTOINCREMENT, template_id INTEGER, job_type TEXT DEFAULT 'batch', entity_type TEXT DEFAULT 'students', entity_ids TEXT DEFAULT '[]', status TEXT DEFAULT 'pending', output_path TEXT, approved_by INTEGER, approved_at TEXT, created_by INTEGER, created_at TEXT DEFAULT (datetime('now')));
         CREATE TABLE IF NOT EXISTS app_secrets(id INTEGER PRIMARY KEY AUTOINCREMENT, key_name TEXT NOT NULL UNIQUE, key_value TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now')));
         CREATE TABLE IF NOT EXISTS import_jobs(id INTEGER PRIMARY KEY AUTOINCREMENT, source_type TEXT NOT NULL, source_path TEXT, status TEXT DEFAULT 'pending', rows_imported INTEGER DEFAULT 0, rows_failed INTEGER DEFAULT 0, error TEXT, started_at TEXT, completed_at TEXT, created_at TEXT DEFAULT (datetime('now')));
         CREATE TABLE IF NOT EXISTS audit_log(id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, action TEXT NOT NULL, resource_type TEXT, resource_id INTEGER, detail TEXT, ip TEXT, created_at TEXT DEFAULT (datetime('now')));
         CREATE TABLE IF NOT EXISTS roles(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, permissions TEXT DEFAULT '{}');
         CREATE TABLE IF NOT EXISTS backup_config(id INTEGER PRIMARY KEY, schedule TEXT DEFAULT 'daily', destinations TEXT DEFAULT '[]', last_backup_at TEXT, enabled INTEGER DEFAULT 1);
         CREATE TABLE IF NOT EXISTS backup_log(id INTEGER PRIMARY KEY AUTOINCREMENT, filename TEXT NOT NULL, path TEXT, size_bytes INTEGER, status TEXT DEFAULT 'ok', created_at TEXT DEFAULT (datetime('now')));
         CREATE TABLE IF NOT EXISTS activities(id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, activity_type TEXT DEFAULT 'field_visit', date TEXT, end_date TEXT, venue TEXT, description TEXT, status TEXT DEFAULT 'planned', created_by INTEGER, created_at TEXT DEFAULT (datetime('now')));
         CREATE TABLE IF NOT EXISTS activity_staff(id INTEGER PRIMARY KEY AUTOINCREMENT, activity_id INTEGER NOT NULL, staff_id INTEGER NOT NULL, role TEXT DEFAULT 'in_charge', UNIQUE(activity_id, staff_id));
         CREATE TABLE IF NOT EXISTS activity_sections(id INTEGER PRIMARY KEY AUTOINCREMENT, activity_id INTEGER NOT NULL, section_id INTEGER NOT NULL, student_count INTEGER, UNIQUE(activity_id, section_id));
         CREATE TABLE IF NOT EXISTS activity_expenses(id INTEGER PRIMARY KEY AUTOINCREMENT, activity_id INTEGER NOT NULL, head TEXT NOT NULL, amount REAL NOT NULL, notes TEXT);
         CREATE TABLE IF NOT EXISTS announcements(id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, body TEXT, audience TEXT DEFAULT 'internal', is_draft INTEGER DEFAULT 0, published_at TEXT, created_by INTEGER, created_at TEXT DEFAULT (datetime('now')));
         CREATE TABLE IF NOT EXISTS meetings(id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, meeting_type TEXT DEFAULT 'staff', date TEXT NOT NULL, start_time TEXT, end_time TEXT, venue TEXT, agenda TEXT, minutes TEXT, status TEXT DEFAULT 'scheduled', created_by INTEGER, created_at TEXT DEFAULT (datetime('now')));
         CREATE TABLE IF NOT EXISTS meeting_attendees(id INTEGER PRIMARY KEY AUTOINCREMENT, meeting_id INTEGER NOT NULL, staff_id INTEGER, UNIQUE(meeting_id, staff_id));
         CREATE TABLE IF NOT EXISTS tasks(id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, description TEXT, assigned_to INTEGER, department_id INTEGER, due_date TEXT, priority TEXT DEFAULT 'normal', status TEXT DEFAULT 'pending', created_by INTEGER, completed_at TEXT, created_at TEXT DEFAULT (datetime('now')));
         CREATE TABLE IF NOT EXISTS reminders(id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, tag TEXT DEFAULT 'normal', due_date TEXT, notes TEXT, done INTEGER DEFAULT 0, created_by INTEGER, created_at TEXT DEFAULT (datetime('now')));
         CREATE TABLE IF NOT EXISTS transport_vehicles(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, driver_name TEXT, driver_phone TEXT, capacity INTEGER, notes TEXT, created_at TEXT DEFAULT (datetime('now')));
         CREATE TABLE IF NOT EXISTS transport_routes(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, vehicle_id INTEGER, fare REAL, notes TEXT, created_at TEXT DEFAULT (datetime('now')));
         CREATE TABLE IF NOT EXISTS transport_stops(id INTEGER PRIMARY KEY AUTOINCREMENT, route_id INTEGER NOT NULL, name TEXT NOT NULL, pickup_time TEXT, sort_order INTEGER DEFAULT 0);
         CREATE TABLE IF NOT EXISTS transport_assignments(id INTEGER PRIMARY KEY AUTOINCREMENT, student_id INTEGER NOT NULL, route_id INTEGER NOT NULL, stop_id INTEGER, created_at TEXT DEFAULT (datetime('now')), UNIQUE(student_id));
         CREATE TABLE IF NOT EXISTS issued_items(id INTEGER PRIMARY KEY AUTOINCREMENT, student_id INTEGER NOT NULL, item_type TEXT NOT NULL, issued INTEGER DEFAULT 0, issued_date TEXT, marked_by INTEGER, UNIQUE(student_id, item_type));
         CREATE TABLE IF NOT EXISTS visitors(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, phone TEXT, purpose TEXT, whom_to_meet TEXT, date TEXT NOT NULL, in_time TEXT, out_time TEXT, created_by INTEGER, created_at TEXT DEFAULT (datetime('now')));
         CREATE TABLE IF NOT EXISTS library_books(id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, author TEXT, isbn TEXT, category TEXT, total_copies INTEGER DEFAULT 1, available_copies INTEGER DEFAULT 1, created_at TEXT DEFAULT (datetime('now')));
         CREATE TABLE IF NOT EXISTS library_loans(id INTEGER PRIMARY KEY AUTOINCREMENT, book_id INTEGER NOT NULL, student_id INTEGER NOT NULL, issued_date TEXT DEFAULT (date('now')), due_date TEXT, returned_date TEXT, created_by INTEGER, created_at TEXT DEFAULT (datetime('now')));
         CREATE TABLE IF NOT EXISTS fee_heads(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, description TEXT, is_optional INTEGER DEFAULT 0);
         CREATE TABLE IF NOT EXISTS fee_structures(id INTEGER PRIMARY KEY AUTOINCREMENT, academic_year_id INTEGER, class_id INTEGER, fee_head_id INTEGER NOT NULL, amount REAL NOT NULL, due_date TEXT, UNIQUE(academic_year_id, class_id, fee_head_id));
         CREATE TABLE IF NOT EXISTS fee_payments(id INTEGER PRIMARY KEY AUTOINCREMENT, student_id INTEGER NOT NULL, fee_head_id INTEGER NOT NULL, academic_year_id INTEGER, amount_paid REAL NOT NULL, payment_date TEXT DEFAULT (date('now')), payment_mode TEXT DEFAULT 'cash', reference TEXT, receipt_no TEXT, collected_by INTEGER, notes TEXT, created_at TEXT DEFAULT (datetime('now')));
         CREATE TABLE IF NOT EXISTS section_students(id INTEGER PRIMARY KEY AUTOINCREMENT, section_id INTEGER NOT NULL, student_id INTEGER NOT NULL, enrolled_date TEXT, UNIQUE(section_id, student_id));
         CREATE TABLE IF NOT EXISTS student_attendance(id INTEGER PRIMARY KEY AUTOINCREMENT, student_id INTEGER NOT NULL, section_id INTEGER NOT NULL, date TEXT NOT NULL, period_id INTEGER NOT NULL, status TEXT DEFAULT 'present', marked_by INTEGER, note TEXT, marked_at TEXT DEFAULT (datetime('now')), UNIQUE(student_id, date, period_id));",
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
    let _ = conn.execute("ALTER TABLE staff ADD COLUMN department_id INTEGER", []);
    let _ = conn.execute("ALTER TABLE students ADD COLUMN card_uid TEXT", []);
    let _ = conn.execute("ALTER TABLE users ADD COLUMN role_id INTEGER", []);
    let _ = conn.execute("ALTER TABLE users ADD COLUMN level INTEGER DEFAULT 3", []);

    // Seed module settings (idempotent)
    let modules_seed = [
        ("students","Students",1,3), ("staff","Staff",1,2), ("courses","Courses",1,2),
        ("subjects","Subjects",1,2), ("classes","Classes",1,2), ("classrooms","Classrooms",1,2),
        ("teacher-subjects","Teacher Map",1,2), ("timetable","Timetable",1,3),
        ("timings","Timings",1,2), ("substitution","Substitution",1,2),
        ("attendance","Attendance",1,3), ("exams","Exams",1,2), ("fees","Fees",1,2),
        ("payroll","Payroll",1,2), ("staff-os","HR & Leave",1,2),
        ("events","Events",1,3), ("activities","Activities",1,2),
        ("backup","Backup",1,1), ("import","DB Connector",1,1), ("hardware","Hardware",1,2),
        ("design","Design Connect",1,2), ("security","Security",1,1),
        ("settings","Settings",1,2), ("academic-year","Academic Year",1,2),
        ("floorplan","Floor Plan",1,2), ("tech-admin","Tech Admin",1,1),
    ];
    for (key, name, enabled, min_level) in modules_seed {
        let _ = conn.execute(
            "INSERT OR IGNORE INTO module_settings(key, display_name, enabled, min_level) VALUES(?1,?2,?3,?4)",
            params![key, name, enabled, min_level],
        );
    }

    // Seed default roles (idempotent)
    let default_roles = [
        ("principal",        r#"{"all": true}"#),
        ("timetable_coord",  r#"{"timetable": true, "substitution": true, "timings": true}"#),
        ("exam_coord",       r#"{"exams": true, "students": "read"}"#),
        ("class_teacher",    r#"{"attendance": true, "students": "read"}"#),
        ("accountant",       r#"{"fees": true, "payroll": true}"#),
        ("front_office",     r#"{"students": true, "staff": "read", "events": true}"#),
        ("read_only",        r#"{"all": "read"}"#),
    ];
    for (name, perms) in default_roles {
        let _ = conn.execute(
            "INSERT OR IGNORE INTO roles(name, permissions) VALUES(?1, ?2)",
            params![name, perms],
        );
    }

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

// ---- Substitution engine ----

/// GET /substitutions?date=YYYY-MM-DD&status=pending
/// List substitution records. If no date supplied, returns all active (non-resolved).
fn substitutions_list(state: &AppState, url: &str) -> (u16, Value) {
    let date_filter = q_param(url, "date");
    let status_filter = q_param(url, "status");
    let conn = state.conn.lock().unwrap();
    let mut rows: Vec<Value> = Vec::new();
    let res: rusqlite::Result<()> = (|| {
        let mut stmt = conn.prepare(
            "SELECT sub.id, sub.original_entry_id, sub.original_staff_id,
                    sub.substitute_staff_id, sub.date, sub.reason, sub.status,
                    sub.created_at, sub.resolved_at,
                    te.period_id, te.day_of_week, te.section_id,
                    subj.name, subj.code,
                    orig.first_name, orig.last_name,
                    subs_st.first_name, subs_st.last_name,
                    sec.name, c.name
             FROM substitutions sub
             JOIN timetable_entries te ON te.id = sub.original_entry_id
             LEFT JOIN subjects subj ON subj.id = te.subject_id
             JOIN staff orig ON orig.id = sub.original_staff_id
             LEFT JOIN staff subs_st ON subs_st.id = sub.substitute_staff_id
             JOIN sections sec ON sec.id = te.section_id
             JOIN classes c ON c.id = sec.class_id
             WHERE (?1 IS NULL OR sub.date = ?1)
               AND (?2 IS NULL OR sub.status = ?2)
             ORDER BY sub.date DESC, sub.id DESC",
        )?;
        let mut r = stmt.query(params![
            date_filter.as_deref(),
            status_filter.as_deref()
        ])?;
        while let Some(row) = r.next()? {
            let orig_first: Option<String> = row.get(14)?;
            let orig_last: Option<String> = row.get(15)?;
            let sub_first: Option<String> = row.get(16)?;
            let sub_last: Option<String> = row.get(17)?;
            rows.push(json!({
                "id": row.get::<_, i64>(0)?,
                "original_entry_id": row.get::<_, i64>(1)?,
                "original_staff_id": row.get::<_, i64>(2)?,
                "substitute_staff_id": row.get::<_, Option<i64>>(3)?,
                "date": row.get::<_, String>(4)?,
                "reason": row.get::<_, Option<String>>(5)?,
                "status": row.get::<_, String>(6)?,
                "created_at": row.get::<_, String>(7)?,
                "resolved_at": row.get::<_, Option<String>>(8)?,
                "period_id": row.get::<_, i64>(9)?,
                "day_of_week": row.get::<_, i64>(10)?,
                "section_id": row.get::<_, i64>(11)?,
                "subject_name": row.get::<_, Option<String>>(12)?,
                "subject_code": row.get::<_, Option<String>>(13)?,
                "original_teacher": orig_first.map(|f| format!("{} {}", f, orig_last.unwrap_or_default()).trim().to_string()),
                "substitute_teacher": sub_first.map(|f| format!("{} {}", f, sub_last.unwrap_or_default()).trim().to_string()),
                "section_name": row.get::<_, Option<String>>(18)?,
                "class_name": row.get::<_, Option<String>>(19)?,
            }));
        }
        Ok(())
    })();
    match res {
        Ok(()) => (200, json!({"substitutions": rows, "total": rows.len()})),
        Err(e) => (500, json!({"error": format!("{e}")})),
    }
}

/// POST /substitutions/mark-absent
/// Body: { staff_id, date, day_of_week (0=Mon…4=Fri), reason? }
/// Creates substitution records for every timetable slot the teacher has on that day_of_week.
fn substitution_mark_absent(state: &AppState, body: &str) -> (u16, Value) {
    let v: Value = serde_json::from_str(body).unwrap_or(json!({}));
    let staff_id = match v["staff_id"].as_i64() {
        Some(id) => id,
        None => return (422, json!({"error": "staff_id required"})),
    };
    let date = match v["date"].as_str() {
        Some(d) if !d.is_empty() => d.to_string(),
        _ => return (422, json!({"error": "date required (YYYY-MM-DD)"})),
    };
    let dow: i64 = match v["day_of_week"].as_i64() {
        Some(d) if (0..=6).contains(&d) => d,
        _ => return (422, json!({"error": "day_of_week required (0=Mon…6=Sun)"})),
    };
    let reason = v["reason"].as_str().map(|s| s.to_string());

    let conn = state.conn.lock().unwrap();
    // Find all timetable entries for this teacher on this day
    let entries: Vec<i64> = {
        let mut stmt = match conn.prepare(
            "SELECT id FROM timetable_entries WHERE staff_id=?1 AND day_of_week=?2"
        ) {
            Ok(s) => s,
            Err(e) => return (500, json!({"error": format!("{e}")})),
        };
        let collected: Vec<i64> = match stmt.query_map(params![staff_id, dow], |r| r.get::<_, i64>(0)) {
            Ok(rows) => rows.filter_map(|r| r.ok()).collect(),
            Err(e) => return (500, json!({"error": format!("{e}")})),
        }; collected
    };

    if entries.is_empty() {
        return (200, json!({"ok": true, "created": 0, "message": "No timetable slots found for this teacher on that day"}));
    }

    let mut created = 0i64;
    for entry_id in &entries {
        let r = conn.execute(
            "INSERT OR IGNORE INTO substitutions(original_entry_id, original_staff_id, date, reason, status)
             VALUES(?1, ?2, ?3, ?4, 'pending')",
            params![entry_id, staff_id, &date, reason.as_deref()],
        );
        if r.is_ok() { created += 1; }
    }
    (200, json!({"ok": true, "created": created, "date": date, "staff_id": staff_id}))
}

/// GET /substitutions/suggestions?substitution_id=N
/// Returns teachers who can cover: mapped to the same subject, not already assigned in that slot+date.
fn substitution_suggestions(state: &AppState, url: &str) -> (u16, Value) {
    let sub_id = match q_param(url, "substitution_id").and_then(|s| s.parse::<i64>().ok()) {
        Some(id) => id,
        None => return (422, json!({"error": "substitution_id required"})),
    };
    let conn = state.conn.lock().unwrap();
    let mut suggestions: Vec<Value> = Vec::new();
    let res: rusqlite::Result<()> = (|| {
        // Get the substitution + entry details
        let (_entry_id, period_id, day, subject_id): (i64, i64, i64, Option<i64>) = conn.query_row(
            "SELECT sub.original_entry_id, te.period_id, te.day_of_week, te.subject_id
             FROM substitutions sub JOIN timetable_entries te ON te.id=sub.original_entry_id
             WHERE sub.id=?1",
            params![sub_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
        )?;

        // Teachers who teach this subject and are NOT already busy in this period+day
        let mut stmt = conn.prepare(
            "SELECT DISTINCT st.id, st.first_name, st.last_name, st.profile
             FROM teacher_subjects ts
             JOIN staff st ON st.id = ts.staff_id
             WHERE ts.subject_id = ?1
               AND st.id NOT IN (
                   SELECT staff_id FROM timetable_entries
                   WHERE period_id=?2 AND day_of_week=?3 AND staff_id IS NOT NULL
               )
               AND st.id NOT IN (
                   SELECT original_staff_id FROM substitutions
                   WHERE date=(SELECT date FROM substitutions WHERE id=?4)
               )
             ORDER BY ts.priority, st.first_name",
        )?;
        let mut rows = stmt.query(params![subject_id.unwrap_or(-1), period_id, day, sub_id])?;
        while let Some(r) = rows.next()? {
            let first: Option<String> = r.get(1)?;
            let last: Option<String> = r.get(2)?;
            let name = format!("{} {}", first.unwrap_or_default(), last.unwrap_or_default()).trim().to_string();
            suggestions.push(json!({
                "staff_id": r.get::<_, i64>(0)?,
                "name": name,
                "profile": r.get::<_, Option<String>>(3)?,
            }));
        }
        Ok(())
    })();
    match res {
        Ok(()) => (200, json!({"suggestions": suggestions, "total": suggestions.len()})),
        Err(e) => (500, json!({"error": format!("{e}")})),
    }
}

/// POST /substitutions/assign
/// Body: { substitution_id, substitute_staff_id }
fn substitution_assign(state: &AppState, body: &str) -> (u16, Value) {
    let v: Value = serde_json::from_str(body).unwrap_or(json!({}));
    let sub_id = match v["substitution_id"].as_i64() {
        Some(id) => id,
        None => return (422, json!({"error": "substitution_id required"})),
    };
    let sub_staff = match v["substitute_staff_id"].as_i64() {
        Some(id) => id,
        None => return (422, json!({"error": "substitute_staff_id required"})),
    };
    let conn = state.conn.lock().unwrap();
    match conn.execute(
        "UPDATE substitutions SET substitute_staff_id=?1, status='assigned' WHERE id=?2",
        params![sub_staff, sub_id],
    ) {
        Ok(n) if n > 0 => (200, json!({"ok": true})),
        Ok(_) => (404, json!({"error": "substitution not found"})),
        Err(e) => (500, json!({"error": format!("{e}")})),
    }
}

/// POST /substitutions/resolve
/// Body: { substitution_id }
/// Marks a substitution as resolved (teacher returned).
fn substitution_resolve(state: &AppState, body: &str) -> (u16, Value) {
    let v: Value = serde_json::from_str(body).unwrap_or(json!({}));
    let sub_id = match v["substitution_id"].as_i64() {
        Some(id) => id,
        None => return (422, json!({"error": "substitution_id required"})),
    };
    let conn = state.conn.lock().unwrap();
    match conn.execute(
        "UPDATE substitutions SET status='resolved', resolved_at=datetime('now') WHERE id=?1",
        params![sub_id],
    ) {
        Ok(n) if n > 0 => (200, json!({"ok": true})),
        Ok(_) => (404, json!({"error": "substitution not found"})),
        Err(e) => (500, json!({"error": format!("{e}")})),
    }
}

// ---- Tech Admin Panel ----

fn admin_system_info(state: &AppState) -> (u16, Value) {
    let conn = state.conn.lock().unwrap();
    let user_count: i64 = count(&conn, "SELECT COUNT(*) FROM users");
    let student_count: i64 = count(&conn, "SELECT COUNT(*) FROM students");
    let staff_count: i64 = count(&conn, "SELECT COUNT(*) FROM staff");
    let backup_last: Option<String> = conn.query_row(
        "SELECT completed_at FROM backup_log ORDER BY id DESC LIMIT 1", [], |r| r.get(0)
    ).ok();
    let db_page_count: i64 = conn.query_row("PRAGMA page_count", [], |r| r.get(0)).unwrap_or(0);
    let db_page_size: i64 = conn.query_row("PRAGMA page_size", [], |r| r.get(0)).unwrap_or(4096);
    let db_size_kb = (db_page_count * db_page_size) / 1024;
    (200, json!({
        "users": user_count,
        "students": student_count,
        "staff": staff_count,
        "db_size_kb": db_size_kb,
        "last_backup": backup_last,
        "server_version": env!("CARGO_PKG_VERSION"),
    }))
}

fn admin_modules_list(state: &AppState) -> (u16, Value) {
    let conn = state.conn.lock().unwrap();
    let mut stmt = match conn.prepare("SELECT key, display_name, enabled, min_level FROM module_settings ORDER BY display_name") {
        Ok(s) => s,
        Err(e) => return (500, json!({"error": format!("{e}")})),
    };
    let rows: Vec<Value> = match stmt.query_map([], |r| {
        Ok(json!({ "key": r.get::<_, String>(0)?, "display_name": r.get::<_, String>(1)?, "enabled": r.get::<_, i64>(2)? != 0, "min_level": r.get::<_, i64>(3)? }))
    }) {
        Ok(mapped) => mapped.filter_map(|r| r.ok()).collect(),
        Err(e) => return (500, json!({"error": format!("{e}")})),
    };
    (200, json!({"modules": rows, "total": rows.len()}))
}

fn admin_module_toggle(state: &AppState, key: &str) -> (u16, Value) {
    let conn = state.conn.lock().unwrap();
    match conn.execute("UPDATE module_settings SET enabled = CASE WHEN enabled=1 THEN 0 ELSE 1 END WHERE key=?1", params![key]) {
        Ok(0) => (404, json!({"error": "module not found"})),
        Ok(_) => {
            let enabled: i64 = conn.query_row("SELECT enabled FROM module_settings WHERE key=?1", params![key], |r| r.get(0)).unwrap_or(1);
            (200, json!({"ok": true, "enabled": enabled != 0}))
        }
        Err(e) => (500, json!({"error": format!("{e}")})),
    }
}

fn admin_users_levels(state: &AppState) -> (u16, Value) {
    let conn = state.conn.lock().unwrap();
    let mut stmt = match conn.prepare(
        "SELECT u.id, u.username, u.name, u.profile, u.level, r.name as role_name FROM users u LEFT JOIN roles r ON r.id=u.role_id ORDER BY u.level, u.name"
    ) {
        Ok(s) => s,
        Err(e) => return (500, json!({"error": format!("{e}")})),
    };
    let rows: Vec<Value> = match stmt.query_map([], |r| {
        Ok(json!({ "id": r.get::<_, i64>(0)?, "username": r.get::<_, String>(1)?, "name": r.get::<_, Option<String>>(2)?, "profile": r.get::<_, Option<String>>(3)?, "level": r.get::<_, Option<i64>>(4)?.unwrap_or(3), "role_name": r.get::<_, Option<String>>(5)? }))
    }) {
        Ok(mapped) => mapped.filter_map(|r| r.ok()).collect(),
        Err(e) => return (500, json!({"error": format!("{e}")})),
    };
    (200, json!({"users": rows, "total": rows.len()}))
}

fn admin_user_set_level(state: &AppState, user_id: i64, body: &str) -> (u16, Value) {
    let v: Value = serde_json::from_str(body).unwrap_or(json!({}));
    let level = match v["level"].as_i64() { Some(l) if (1..=5).contains(&l) => l, _ => return (422, json!({"error": "level must be 1-5"})) };
    let conn = state.conn.lock().unwrap();
    match conn.execute("UPDATE users SET level=?1 WHERE id=?2", params![level, user_id]) {
        Ok(0) => (404, json!({"error": "user not found"})),
        Ok(_) => (200, json!({"ok": true, "level": level})),
        Err(e) => (500, json!({"error": format!("{e}")})),
    }
}

// ---- Design Connect (P14) ----
// Tokens are XOR-encrypted with a per-installation local secret stored in app_secrets.
// The secret never leaves the local DB; access tokens are NEVER stored in plain text.

fn design_local_secret(conn: &Connection) -> Vec<u8> {
    let existing: Result<String, _> = conn.query_row(
        "SELECT key_value FROM app_secrets WHERE key_name='design_enc_key'", [], |r| r.get(0)
    );
    match existing {
        Ok(hex) => hex::decode_hex(&hex),
        Err(_) => {
            // Generate a new 32-byte random key and persist it
            let key: Vec<u8> = (0..32).map(|_| rand_byte() as u8).collect();
            let hex = hex::encode_hex(&key);
            let _ = conn.execute("INSERT OR IGNORE INTO app_secrets(key_name, key_value) VALUES('design_enc_key', ?1)", params![hex]);
            key
        }
    }
}

mod hex {
    pub fn encode_hex(bytes: &[u8]) -> String {
        bytes.iter().map(|b| format!("{:02x}", b)).collect()
    }
    pub fn decode_hex(s: &str) -> Vec<u8> {
        (0..s.len()).step_by(2).filter_map(|i| u8::from_str_radix(&s[i..i+2], 16).ok()).collect()
    }
}

fn rand_byte() -> u32 {
    use std::time::{SystemTime, UNIX_EPOCH};
    let ns = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().subsec_nanos();
    (ns ^ (ns >> 4) ^ (ns >> 8)) & 0xFF
}

fn xor_encrypt(data: &str, key: &[u8]) -> String {
    let bytes: Vec<u8> = data.bytes().enumerate().map(|(i, b)| b ^ key[i % key.len()]).collect();
    hex::encode_hex(&bytes)
}

#[allow(dead_code)]
fn xor_decrypt(hex: &str, key: &[u8]) -> String {
    let bytes = hex::decode_hex(hex);
    let plain: Vec<u8> = bytes.into_iter().enumerate().map(|(i, b)| b ^ key[i % key.len()]).collect();
    String::from_utf8_lossy(&plain).into_owned()
}

fn design_connection_get(state: &AppState) -> (u16, Value) {
    let conn = state.conn.lock().unwrap();
    let result = conn.query_row(
        "SELECT id, provider, account_email, token_expiry, scopes, last_sync, connected_at FROM design_connections ORDER BY id DESC LIMIT 1",
        [], |r| Ok(json!({
            "id": r.get::<_, i64>(0)?,
            "provider": r.get::<_, String>(1)?,
            "account_email": r.get::<_, Option<String>>(2)?,
            "token_expiry": r.get::<_, Option<String>>(3)?,
            "scopes": r.get::<_, Option<String>>(4)?,
            "last_sync": r.get::<_, Option<String>>(5)?,
            "connected_at": r.get::<_, Option<String>>(6)?,
            "connected": true,
        }))
    );
    match result {
        Ok(c) => (200, json!({"connection": c})),
        Err(_) => (200, json!({"connection": null})),
    }
}

fn design_connection_save(state: &AppState, body: &str) -> (u16, Value) {
    let v: Value = serde_json::from_str(body).unwrap_or(json!({}));
    let access_token = match v["access_token"].as_str() { Some(t) if !t.is_empty() => t, _ => return (422, json!({"error": "access_token required"})) };
    let refresh_token = v["refresh_token"].as_str().unwrap_or("").to_string();
    let email = v["account_email"].as_str().unwrap_or("").to_string();
    let expiry = v["token_expiry"].as_str().map(str::to_string);
    let scopes = v["scopes"].as_str().unwrap_or("").to_string();
    let conn = state.conn.lock().unwrap();
    let key = design_local_secret(&conn);
    let enc_access = xor_encrypt(access_token, &key);
    let enc_refresh = xor_encrypt(&refresh_token, &key);
    // Upsert: only one connection record at a time
    let _ = conn.execute("DELETE FROM design_connections", []);
    match conn.execute(
        "INSERT INTO design_connections(provider, account_email, access_token_enc, refresh_token_enc, token_expiry, scopes) VALUES('canva',?1,?2,?3,?4,?5)",
        params![email, enc_access, enc_refresh, expiry, scopes],
    ) {
        Ok(_) => (201, json!({"ok": true})),
        Err(e) => (500, json!({"error": format!("{e}")})),
    }
}

fn design_connection_delete(state: &AppState) -> (u16, Value) {
    let conn = state.conn.lock().unwrap();
    let _ = conn.execute("DELETE FROM design_connections", []);
    (200, json!({"ok": true}))
}

fn design_templates_list(state: &AppState) -> (u16, Value) {
    let conn = state.conn.lock().unwrap();
    let mut stmt = match conn.prepare(
        "SELECT id, template_id, template_name, thumbnail_url, category, field_map, last_fetched FROM design_templates ORDER BY template_name"
    ) {
        Ok(s) => s,
        Err(e) => return (500, json!({"error": format!("{e}")})),
    };
    let rows: Vec<Value> = match stmt.query_map([], |r| {
        Ok(json!({ "id": r.get::<_, i64>(0)?, "template_id": r.get::<_, String>(1)?, "template_name": r.get::<_, Option<String>>(2)?, "thumbnail_url": r.get::<_, Option<String>>(3)?, "category": r.get::<_, Option<String>>(4)?, "field_map": r.get::<_, Option<String>>(5)?, "last_fetched": r.get::<_, Option<String>>(6)? }))
    }) {
        Ok(mapped) => mapped.filter_map(|r| r.ok()).collect(),
        Err(e) => return (500, json!({"error": format!("{e}")})),
    };
    let total = rows.len();
    (200, json!({"templates": rows, "total": total}))
}

fn design_template_save(state: &AppState, body: &str) -> (u16, Value) {
    let v: Value = serde_json::from_str(body).unwrap_or(json!({}));
    let template_id = match v["template_id"].as_str() { Some(t) if !t.is_empty() => t, _ => return (422, json!({"error": "template_id required"})) };
    let conn = state.conn.lock().unwrap();
    match conn.execute(
        "INSERT OR REPLACE INTO design_templates(template_id, template_name, thumbnail_url, category, last_fetched) VALUES(?1,?2,?3,?4,datetime('now'))",
        params![template_id, v["template_name"].as_str(), v["thumbnail_url"].as_str(), v["category"].as_str().unwrap_or("id_card")],
    ) {
        Ok(_) => (201, json!({"ok": true, "id": conn.last_insert_rowid()})),
        Err(e) => (500, json!({"error": format!("{e}")})),
    }
}

fn design_template_field_map(state: &AppState, id: i64, body: &str) -> (u16, Value) {
    let conn = state.conn.lock().unwrap();
    match conn.execute("UPDATE design_templates SET field_map=?1 WHERE id=?2", params![body, id]) {
        Ok(0) => (404, json!({"error": "template not found"})),
        Ok(_) => (200, json!({"ok": true})),
        Err(e) => (500, json!({"error": format!("{e}")})),
    }
}

fn design_jobs_list(state: &AppState) -> (u16, Value) {
    let conn = state.conn.lock().unwrap();
    let mut stmt = match conn.prepare(
        "SELECT dj.id, dj.job_type, dj.entity_type, dj.entity_ids, dj.status, dj.output_path, dj.approved_at, u.username, dj.created_at
         FROM design_jobs dj LEFT JOIN users u ON u.id=dj.approved_by ORDER BY dj.created_at DESC LIMIT 50"
    ) {
        Ok(s) => s,
        Err(e) => return (500, json!({"error": format!("{e}")})),
    };
    let rows: Vec<Value> = match stmt.query_map([], |r| {
        Ok(json!({ "id": r.get::<_, i64>(0)?, "job_type": r.get::<_, Option<String>>(1)?, "entity_type": r.get::<_, Option<String>>(2)?, "entity_ids": r.get::<_, Option<String>>(3)?, "status": r.get::<_, Option<String>>(4)?, "output_path": r.get::<_, Option<String>>(5)?, "approved_at": r.get::<_, Option<String>>(6)?, "approved_by_name": r.get::<_, Option<String>>(7)?, "created_at": r.get::<_, String>(8)? }))
    }) {
        Ok(mapped) => mapped.filter_map(|r| r.ok()).collect(),
        Err(e) => return (500, json!({"error": format!("{e}")})),
    };
    let total = rows.len();
    (200, json!({"jobs": rows, "total": total}))
}

fn design_job_create(state: &AppState, user_id: i64, body: &str) -> (u16, Value) {
    let v: Value = serde_json::from_str(body).unwrap_or(json!({}));
    let entity_ids = v["entity_ids"].to_string();
    let conn = state.conn.lock().unwrap();
    match conn.execute(
        "INSERT INTO design_jobs(job_type, entity_type, entity_ids, status, created_by) VALUES(?1,?2,?3,'pending',?4)",
        params![v["job_type"].as_str().unwrap_or("batch"), v["entity_type"].as_str().unwrap_or("students"), entity_ids, user_id],
    ) {
        Ok(_) => (201, json!({"ok": true, "id": conn.last_insert_rowid()})),
        Err(e) => (500, json!({"error": format!("{e}")})),
    }
}

fn design_job_approve(state: &AppState, user_id: i64, job_id: i64) -> (u16, Value) {
    let conn = state.conn.lock().unwrap();
    match conn.execute(
        "UPDATE design_jobs SET status='approved', approved_by=?1, approved_at=datetime('now') WHERE id=?2",
        params![user_id, job_id],
    ) {
        Ok(0) => (404, json!({"error": "job not found"})),
        Ok(_) => (200, json!({"ok": true})),
        Err(e) => (500, json!({"error": format!("{e}")})),
    }
}

// ---- External DB Connector (P12) ----

fn import_jobs_list(state: &AppState) -> (u16, Value) {
    let conn = state.conn.lock().unwrap();
    let mut stmt = match conn.prepare(
        "SELECT id, source_type, source_path, status, rows_imported, rows_failed, error, started_at, completed_at, created_at
         FROM import_jobs ORDER BY created_at DESC LIMIT 50"
    ) {
        Ok(s) => s,
        Err(e) => return (500, json!({"error": format!("{e}")})),
    };
    let rows: Vec<Value> = match stmt.query_map([], |r| {
        Ok(json!({
            "id": r.get::<_, i64>(0)?,
            "source_type": r.get::<_, String>(1)?,
            "source_path": r.get::<_, Option<String>>(2)?,
            "status": r.get::<_, Option<String>>(3)?,
            "rows_imported": r.get::<_, i64>(4)?,
            "rows_failed": r.get::<_, i64>(5)?,
            "error": r.get::<_, Option<String>>(6)?,
            "started_at": r.get::<_, Option<String>>(7)?,
            "completed_at": r.get::<_, Option<String>>(8)?,
            "created_at": r.get::<_, String>(9)?,
        }))
    }) {
        Ok(mapped) => mapped.filter_map(|r| r.ok()).collect(),
        Err(e) => return (500, json!({"error": format!("{e}")})),
    };
    let total = rows.len();
    (200, json!({"jobs": rows, "total": total}))
}

fn import_csv(state: &AppState, body: &str) -> (u16, Value) {
    let v: Value = serde_json::from_str(body).unwrap_or(json!({}));
    let path = match v["path"].as_str() { Some(p) if !p.is_empty() => p.to_string(), _ => return (422, json!({"error": "path required"})) };
    let target = v["target"].as_str().unwrap_or("students").to_string();
    let job_id = {
        let conn = state.conn.lock().unwrap();
        match conn.execute(
            "INSERT INTO import_jobs(source_type, source_path, status, started_at) VALUES('csv', ?1, 'running', datetime('now'))",
            params![path],
        ) {
            Ok(_) => conn.last_insert_rowid(),
            Err(e) => return (500, json!({"error": format!("{e}")})),
        }
    };
    match do_import_csv(state, &path, &target, job_id) {
        Ok((imported, failed)) => {
            let conn = state.conn.lock().unwrap();
            let _ = conn.execute(
                "UPDATE import_jobs SET status='completed', rows_imported=?1, rows_failed=?2, completed_at=datetime('now') WHERE id=?3",
                params![imported, failed, job_id],
            );
            (200, json!({"ok": true, "job_id": job_id, "rows_imported": imported, "rows_failed": failed}))
        }
        Err(e) => {
            let conn = state.conn.lock().unwrap();
            let _ = conn.execute(
                "UPDATE import_jobs SET status='error', error=?1, completed_at=datetime('now') WHERE id=?2",
                params![e.to_string(), job_id],
            );
            (500, json!({"error": e.to_string()}))
        }
    }
}

fn do_import_csv(state: &AppState, path: &str, target: &str, _job_id: i64) -> Result<(i64, i64), Box<dyn std::error::Error>> {
    use std::io::BufRead;
    let file = std::fs::File::open(path)?;
    let reader = std::io::BufReader::new(file);
    let mut lines = reader.lines();
    // First line = headers
    let header_line = lines.next().ok_or("empty file")??;
    let headers: Vec<String> = header_line.split(',').map(|h| h.trim().trim_matches('"').to_lowercase()).collect();
    let mut imported = 0i64;
    let mut failed = 0i64;
    let conn = state.conn.lock().unwrap();
    for line in lines {
        let line = match line { Ok(l) => l, Err(_) => { failed += 1; continue; } };
        if line.trim().is_empty() { continue; }
        let fields: Vec<String> = line.split(',').map(|f| f.trim().trim_matches('"').to_string()).collect();
        let get = |col: &str| -> Option<String> {
            headers.iter().position(|h| h == col).and_then(|i| fields.get(i)).filter(|v| !v.is_empty()).cloned()
        };
        let result = match target {
            "students" => conn.execute(
                "INSERT OR IGNORE INTO students(first_name, last_name, email, phone, gender, birthdate) VALUES(?1,?2,?3,?4,?5,?6)",
                params![get("first_name").or_else(|| get("firstname")), get("last_name").or_else(|| get("lastname")), get("email"), get("phone"), get("gender"), get("birthdate").or_else(|| get("dob"))],
            ),
            "staff" => conn.execute(
                "INSERT OR IGNORE INTO staff(first_name, last_name, email, phone, profile) VALUES(?1,?2,?3,?4,?5)",
                params![get("first_name").or_else(|| get("firstname")), get("last_name").or_else(|| get("lastname")), get("email"), get("phone"), get("profile").or_else(|| get("role"))],
            ),
            _ => return Err(format!("unknown target: {target}").into()),
        };
        match result { Ok(_) => imported += 1, Err(_) => failed += 1 }
    }
    Ok((imported, failed))
}

fn import_sqlite(state: &AppState, body: &str) -> (u16, Value) {
    let v: Value = serde_json::from_str(body).unwrap_or(json!({}));
    let path = match v["path"].as_str() { Some(p) if !p.is_empty() => p.to_string(), _ => return (422, json!({"error": "path required"})) };
    let target_tables = match v["tables"].as_array() {
        Some(t) => t.iter().filter_map(|v| v.as_str()).map(|s| s.to_string()).collect::<Vec<_>>(),
        None => vec!["students".to_string(), "staff".to_string()],
    };
    let job_id = {
        let conn = state.conn.lock().unwrap();
        match conn.execute(
            "INSERT INTO import_jobs(source_type, source_path, status, started_at) VALUES('sqlite', ?1, 'running', datetime('now'))",
            params![path],
        ) {
            Ok(_) => conn.last_insert_rowid(),
            Err(e) => return (500, json!({"error": format!("{e}")})),
        }
    };
    // Attach external DB and copy rows
    let total_imported: i64;
    {
        let conn = state.conn.lock().unwrap();
        let attach = format!("ATTACH DATABASE '{}' AS ext", path.replace('\'', "''"));
        if let Err(e) = conn.execute_batch(&attach) {
            let _ = conn.execute("UPDATE import_jobs SET status='error', error=?1, completed_at=datetime('now') WHERE id=?2", params![e.to_string(), job_id]);
            return (500, json!({"error": format!("{e}")}));
        }
        let mut count_imported = 0i64;
        for table in &target_tables {
            let insert_sql = match table.as_str() {
                "students" => "INSERT OR IGNORE INTO students SELECT * FROM ext.students",
                "staff" => "INSERT OR IGNORE INTO staff SELECT * FROM ext.staff",
                "courses" => "INSERT OR IGNORE INTO courses SELECT * FROM ext.courses",
                "subjects" => "INSERT OR IGNORE INTO subjects SELECT * FROM ext.subjects",
                _ => continue,
            };
            if let Ok(n) = conn.execute(insert_sql, []) { count_imported += n as i64; }
        }
        let _ = conn.execute_batch("DETACH DATABASE ext");
        let _ = conn.execute(
            "UPDATE import_jobs SET status='completed', rows_imported=?1, completed_at=datetime('now') WHERE id=?2",
            params![count_imported, job_id],
        );
        total_imported = count_imported;
    }
    (200, json!({"ok": true, "job_id": job_id, "rows_imported": total_imported}))
}

// ---- Security & Audit (P11) ----

fn audit_log_list(state: &AppState, url: &str) -> (u16, Value) {
    let resource = q_param(url, "resource");
    let user_id: Option<i64> = q_param(url, "user_id").and_then(|v| v.parse().ok());
    let limit: i64 = q_param(url, "limit").and_then(|v| v.parse().ok()).unwrap_or(100);
    let conn = state.conn.lock().unwrap();
    let mut stmt = match conn.prepare(
        "SELECT al.id, al.user_id, u.username, al.action, al.resource_type, al.resource_id, al.detail, al.ip, al.created_at
         FROM audit_log al
         LEFT JOIN users u ON u.id = al.user_id
         WHERE (?1 IS NULL OR al.resource_type=?1) AND (?2 IS NULL OR al.user_id=?2)
         ORDER BY al.created_at DESC LIMIT ?3",
    ) {
        Ok(s) => s,
        Err(e) => return (500, json!({"error": format!("{e}")})),
    };
    let rows: Vec<Value> = match stmt.query_map(params![resource, user_id, limit], |r| {
        Ok(json!({
            "id": r.get::<_, i64>(0)?,
            "user_id": r.get::<_, Option<i64>>(1)?,
            "username": r.get::<_, Option<String>>(2)?,
            "action": r.get::<_, String>(3)?,
            "resource_type": r.get::<_, Option<String>>(4)?,
            "resource_id": r.get::<_, Option<i64>>(5)?,
            "detail": r.get::<_, Option<String>>(6)?,
            "ip": r.get::<_, Option<String>>(7)?,
            "created_at": r.get::<_, String>(8)?,
        }))
    }) {
        Ok(mapped) => mapped.filter_map(|r| r.ok()).collect(),
        Err(e) => return (500, json!({"error": format!("{e}")})),
    };
    let total = rows.len();
    (200, json!({"audit_log": rows, "total": total}))
}

#[allow(dead_code)]
fn audit_write(conn: &Connection, user_id: i64, action: &str, resource_type: &str, resource_id: Option<i64>, detail: Option<&str>) {
    let _ = conn.execute(
        "INSERT INTO audit_log(user_id, action, resource_type, resource_id, detail) VALUES(?1,?2,?3,?4,?5)",
        params![user_id, action, resource_type, resource_id, detail],
    );
}

fn roles_list(state: &AppState) -> (u16, Value) {
    let conn = state.conn.lock().unwrap();
    let mut stmt = match conn.prepare("SELECT id, name, permissions FROM roles ORDER BY name") {
        Ok(s) => s,
        Err(e) => return (500, json!({"error": format!("{e}")})),
    };
    let rows: Vec<Value> = match stmt.query_map([], |r| {
        Ok(json!({ "id": r.get::<_, i64>(0)?, "name": r.get::<_, String>(1)?, "permissions": r.get::<_, Option<String>>(2)? }))
    }) {
        Ok(mapped) => mapped.filter_map(|r| r.ok()).collect(),
        Err(e) => return (500, json!({"error": format!("{e}")})),
    };
    (200, json!({"roles": rows, "total": rows.len()}))
}

fn role_update(state: &AppState, id: i64, body: &str) -> (u16, Value) {
    let v: Value = serde_json::from_str(body).unwrap_or(json!({}));
    let perms = v["permissions"].to_string();
    let conn = state.conn.lock().unwrap();
    let _ = conn.execute("UPDATE roles SET permissions=?1 WHERE id=?2", params![perms, id]);
    (200, json!({"ok": true}))
}

// ---- Backup & Recovery OS (P10) ----

fn backup_config_get(state: &AppState) -> (u16, Value) {
    let conn = state.conn.lock().unwrap();
    // Ensure default row exists (singleton config, id=1)
    let _ = conn.execute(
        "INSERT OR IGNORE INTO backup_config(id, schedule, destinations, enabled) VALUES(1,'daily','[]',1)", []
    );
    match conn.query_row(
        "SELECT schedule, destinations, last_backup_at, enabled FROM backup_config WHERE id=1",
        [], |r| Ok(json!({
            "schedule": r.get::<_, Option<String>>(0)?,
            "destinations": r.get::<_, Option<String>>(1)?,
            "last_backup_at": r.get::<_, Option<String>>(2)?,
            "enabled": r.get::<_, i64>(3)? == 1,
        })),
    ) {
        Ok(v) => (200, json!({"config": v})),
        Err(e) => (500, json!({"error": format!("{e}")})),
    }
}

fn backup_config_save(state: &AppState, body: &str) -> (u16, Value) {
    let v: Value = serde_json::from_str(body).unwrap_or(json!({}));
    let schedule = v["schedule"].as_str().unwrap_or("daily").to_string();
    let dests = v["destinations"].to_string();
    let enabled = v["enabled"].as_bool().unwrap_or(true) as i64;
    let conn = state.conn.lock().unwrap();
    let _ = conn.execute(
        "INSERT OR REPLACE INTO backup_config(id, schedule, destinations, enabled) VALUES(1,?1,?2,?3)",
        params![schedule, dests, enabled],
    );
    (200, json!({"ok": true}))
}

fn backup_run(state: &AppState, body: &str) -> (u16, Value) {
    let v: Value = serde_json::from_str(body).unwrap_or(json!({}));
    let dest_dir = v["destination"].as_str().unwrap_or(".").to_string();
    let ts = chrono_or_ts();
    let filename = format!("LEOS-backup-{ts}.leosdb");
    let out_path = format!("{}/{}", dest_dir.trim_end_matches('/'), filename);
    match write_leosdb(&out_path) {
        Ok(final_path) => {
            let size = std::fs::metadata(&final_path).map(|m| m.len() as i64).unwrap_or(0);
            let conn = state.conn.lock().unwrap();
            let _ = conn.execute(
                "INSERT INTO backup_log(filename, path, size_bytes, status) VALUES(?1,?2,?3,'ok')",
                params![filename, final_path, size],
            );
            let _ = conn.execute("UPDATE backup_config SET last_backup_at=datetime('now') WHERE id=1", []);
            (200, json!({"ok": true, "filename": filename, "path": final_path, "size_bytes": size}))
        }
        Err(e) => {
            let conn = state.conn.lock().unwrap();
            let _ = conn.execute(
                "INSERT INTO backup_log(filename, path, status) VALUES(?1,?2,'error')",
                params![filename, out_path],
            );
            (500, json!({"error": format!("{e}")}))
        }
    }
}

fn backup_list(state: &AppState) -> (u16, Value) {
    let conn = state.conn.lock().unwrap();
    let mut stmt = match conn.prepare(
        "SELECT id, filename, path, size_bytes, status, created_at FROM backup_log ORDER BY created_at DESC LIMIT 50"
    ) {
        Ok(s) => s,
        Err(e) => return (500, json!({"error": format!("{e}")})),
    };
    let rows: Vec<Value> = match stmt.query_map([], |r| {
        Ok(json!({
            "id": r.get::<_, i64>(0)?,
            "filename": r.get::<_, String>(1)?,
            "path": r.get::<_, Option<String>>(2)?,
            "size_bytes": r.get::<_, Option<i64>>(3)?,
            "status": r.get::<_, Option<String>>(4)?,
            "created_at": r.get::<_, String>(5)?,
        }))
    }) {
        Ok(mapped) => mapped.filter_map(|r| r.ok()).collect(),
        Err(e) => return (500, json!({"error": format!("{e}")})),
    };
    let total = rows.len();
    (200, json!({"backups": rows, "total": total}))
}

fn backup_restore(state: &AppState, body: &str) -> (u16, Value) {
    let v: Value = serde_json::from_str(body).unwrap_or(json!({}));
    let path = match v["path"].as_str() { Some(p) if !p.is_empty() => p.to_string(), _ => return (422, json!({"error": "path required"})) };
    match restore_leosdb(state, &path) {
        Ok(()) => (200, json!({"ok": true, "restored_from": path})),
        Err(e) => (500, json!({"error": format!("{e}")})),
    }
}

fn restore_leosdb(state: &AppState, path: &str) -> Result<(), Box<dyn std::error::Error>> {
    use std::io::Read as _;
    let file = std::fs::File::open(path)?;
    let mut zip = zip::ZipArchive::new(file)?;
    // Extract school.sqlite
    let sqlite_bytes: Vec<u8> = {
        let mut entry = zip.by_name("school.sqlite")?;
        let mut buf = Vec::new();
        entry.read_to_end(&mut buf)?;
        buf
    };
    // Write to a restore staging file, then replace live DB
    // NOTE: This closes the current connection briefly; SQLite WAL is not affected
    // because we write to "school.sqlite.restore" then rename atomically.
    std::fs::write("school.sqlite.restore", &sqlite_bytes)?;
    // Flush WAL on current DB first by issuing a checkpoint through the locked conn
    {
        let conn = state.conn.lock().unwrap();
        let _ = conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);");
    }
    // Now atomically replace
    std::fs::rename("school.sqlite.restore", "school.sqlite")?;
    // Re-init tables that may be new in this version (idempotent)
    {
        let conn = state.conn.lock().unwrap();
        init_db(&conn);
    }
    Ok(())
}

// ---- Activity Scheduler OS (P8) ----

fn activities_list(state: &AppState, url: &str) -> (u16, Value) {
    let atype = q_param(url, "type");
    let status = q_param(url, "status");
    let conn = state.conn.lock().unwrap();
    let mut stmt = match conn.prepare(
        "SELECT id, title, activity_type, date, end_date, venue, description, status, created_by, created_at
         FROM activities WHERE (?1 IS NULL OR activity_type=?1) AND (?2 IS NULL OR status=?2)
         ORDER BY date DESC, created_at DESC LIMIT 200",
    ) {
        Ok(s) => s,
        Err(e) => return (500, json!({"error": format!("{e}")})),
    };
    let rows: Vec<Value> = match stmt.query_map(params![atype, status], |r| {
        Ok(json!({
            "id": r.get::<_, i64>(0)?,
            "title": r.get::<_, String>(1)?,
            "activity_type": r.get::<_, Option<String>>(2)?,
            "date": r.get::<_, Option<String>>(3)?,
            "end_date": r.get::<_, Option<String>>(4)?,
            "venue": r.get::<_, Option<String>>(5)?,
            "description": r.get::<_, Option<String>>(6)?,
            "status": r.get::<_, Option<String>>(7)?,
            "created_by": r.get::<_, Option<i64>>(8)?,
            "created_at": r.get::<_, String>(9)?,
        }))
    }) {
        Ok(mapped) => mapped.filter_map(|r| r.ok()).collect(),
        Err(e) => return (500, json!({"error": format!("{e}")})),
    };
    let total = rows.len();
    (200, json!({"activities": rows, "total": total}))
}

fn activity_create(state: &AppState, body: &str, uid: i64) -> (u16, Value) {
    let v: Value = serde_json::from_str(body).unwrap_or(json!({}));
    let title = match v["title"].as_str() { Some(t) if !t.is_empty() => t.to_string(), _ => return (422, json!({"error": "title required"})) };
    let atype = v["activity_type"].as_str().unwrap_or("field_visit").to_string();
    let date = v["date"].as_str().map(|s| s.to_string());
    let end_date = v["end_date"].as_str().map(|s| s.to_string());
    let venue = v["venue"].as_str().map(|s| s.to_string());
    let desc = v["description"].as_str().map(|s| s.to_string());
    let conn = state.conn.lock().unwrap();
    match conn.execute(
        "INSERT INTO activities(title, activity_type, date, end_date, venue, description, created_by) VALUES(?1,?2,?3,?4,?5,?6,?7)",
        params![title, atype, date, end_date, venue, desc, uid],
    ) {
        Ok(_) => (200, json!({"ok": true, "id": conn.last_insert_rowid()})),
        Err(e) => (500, json!({"error": format!("{e}")})),
    }
}

fn activity_update(state: &AppState, id: i64, body: &str) -> (u16, Value) {
    let v: Value = serde_json::from_str(body).unwrap_or(json!({}));
    let conn = state.conn.lock().unwrap();
    let _ = conn.execute(
        "UPDATE activities SET title=COALESCE(?1,title), activity_type=COALESCE(?2,activity_type),
         date=?3, end_date=?4, venue=?5, description=?6, status=COALESCE(?7,status) WHERE id=?8",
        params![
            v["title"].as_str().filter(|s| !s.is_empty()),
            v["activity_type"].as_str().filter(|s| !s.is_empty()),
            v["date"].as_str().map(|s| s.to_string()),
            v["end_date"].as_str().map(|s| s.to_string()),
            v["venue"].as_str().map(|s| s.to_string()),
            v["description"].as_str().map(|s| s.to_string()),
            v["status"].as_str().filter(|s| !s.is_empty()),
            id
        ],
    );
    (200, json!({"ok": true}))
}

fn activity_delete(state: &AppState, id: i64) -> (u16, Value) {
    let conn = state.conn.lock().unwrap();
    let _ = conn.execute("DELETE FROM activity_expenses WHERE activity_id=?1", params![id]);
    let _ = conn.execute("DELETE FROM activity_sections WHERE activity_id=?1", params![id]);
    let _ = conn.execute("DELETE FROM activity_staff WHERE activity_id=?1", params![id]);
    let _ = conn.execute("DELETE FROM activities WHERE id=?1", params![id]);
    (200, json!({"ok": true}))
}

fn activity_detail(state: &AppState, id: i64) -> (u16, Value) {
    let conn = state.conn.lock().unwrap();
    let act: Value = match conn.query_row(
        "SELECT id, title, activity_type, date, end_date, venue, description, status FROM activities WHERE id=?1",
        params![id],
        |r| Ok(json!({
            "id": r.get::<_, i64>(0)?,
            "title": r.get::<_, String>(1)?,
            "activity_type": r.get::<_, Option<String>>(2)?,
            "date": r.get::<_, Option<String>>(3)?,
            "end_date": r.get::<_, Option<String>>(4)?,
            "venue": r.get::<_, Option<String>>(5)?,
            "description": r.get::<_, Option<String>>(6)?,
            "status": r.get::<_, Option<String>>(7)?,
        })),
    ) {
        Ok(v) => v,
        Err(_) => return (404, json!({"error": "not found"})),
    };

    // Staff
    let mut st_stmt = match conn.prepare(
        "SELECT ac.staff_id, st.first_name, st.last_name, ac.role FROM activity_staff ac JOIN staff st ON st.id=ac.staff_id WHERE ac.activity_id=?1"
    ) { Ok(s) => s, Err(e) => return (500, json!({"error": format!("{e}")})) };
    let staff_rows: Vec<Value> = match st_stmt.query_map(params![id], |r| {
        let fn_: Option<String> = r.get(1)?;
        let ln: Option<String> = r.get(2)?;
        Ok(json!({ "staff_id": r.get::<_, i64>(0)?, "name": format!("{} {}", fn_.unwrap_or_default(), ln.unwrap_or_default()).trim().to_string(), "role": r.get::<_, Option<String>>(3)? }))
    }) { Ok(m) => m.filter_map(|r| r.ok()).collect(), Err(e) => return (500, json!({"error": format!("{e}")})) };

    // Sections
    let mut sec_stmt = match conn.prepare(
        "SELECT ac.section_id, s.name, c.name, ac.student_count FROM activity_sections ac JOIN sections s ON s.id=ac.section_id JOIN classes c ON c.id=s.class_id WHERE ac.activity_id=?1"
    ) { Ok(s) => s, Err(e) => return (500, json!({"error": format!("{e}")})) };
    let sec_rows: Vec<Value> = match sec_stmt.query_map(params![id], |r| {
        Ok(json!({ "section_id": r.get::<_, i64>(0)?, "section_name": r.get::<_, Option<String>>(1)?, "class_name": r.get::<_, Option<String>>(2)?, "student_count": r.get::<_, Option<i64>>(3)? }))
    }) { Ok(m) => m.filter_map(|r| r.ok()).collect(), Err(e) => return (500, json!({"error": format!("{e}")})) };

    // Expenses
    let mut exp_stmt = match conn.prepare(
        "SELECT id, head, amount, notes FROM activity_expenses WHERE activity_id=?1 ORDER BY head"
    ) { Ok(s) => s, Err(e) => return (500, json!({"error": format!("{e}")})) };
    let exp_rows: Vec<Value> = match exp_stmt.query_map(params![id], |r| {
        Ok(json!({ "id": r.get::<_, i64>(0)?, "head": r.get::<_, String>(1)?, "amount": r.get::<_, f64>(2)?, "notes": r.get::<_, Option<String>>(3)? }))
    }) { Ok(m) => m.filter_map(|r| r.ok()).collect(), Err(e) => return (500, json!({"error": format!("{e}")})) };

    let total_expense: f64 = exp_rows.iter().filter_map(|e| e["amount"].as_f64()).sum();
    (200, json!({"activity": act, "staff": staff_rows, "sections": sec_rows, "expenses": exp_rows, "total_expense": total_expense}))
}

fn activity_staff_save(state: &AppState, body: &str) -> (u16, Value) {
    let v: Value = serde_json::from_str(body).unwrap_or(json!({}));
    let act_id = match v["activity_id"].as_i64() { Some(x) => x, None => return (422, json!({"error": "activity_id required"})) };
    let staff_id = match v["staff_id"].as_i64() { Some(x) => x, None => return (422, json!({"error": "staff_id required"})) };
    let role = v["role"].as_str().unwrap_or("in_charge").to_string();
    let conn = state.conn.lock().unwrap();
    match conn.execute(
        "INSERT OR REPLACE INTO activity_staff(activity_id, staff_id, role) VALUES(?1,?2,?3)",
        params![act_id, staff_id, role],
    ) {
        Ok(_) => (200, json!({"ok": true})),
        Err(e) => (500, json!({"error": format!("{e}")})),
    }
}

fn activity_staff_remove(state: &AppState, body: &str) -> (u16, Value) {
    let v: Value = serde_json::from_str(body).unwrap_or(json!({}));
    let act_id = match v["activity_id"].as_i64() { Some(x) => x, None => return (422, json!({"error": "activity_id required"})) };
    let staff_id = match v["staff_id"].as_i64() { Some(x) => x, None => return (422, json!({"error": "staff_id required"})) };
    let conn = state.conn.lock().unwrap();
    let _ = conn.execute("DELETE FROM activity_staff WHERE activity_id=?1 AND staff_id=?2", params![act_id, staff_id]);
    (200, json!({"ok": true}))
}

fn activity_sections_save(state: &AppState, body: &str) -> (u16, Value) {
    let v: Value = serde_json::from_str(body).unwrap_or(json!({}));
    let act_id = match v["activity_id"].as_i64() { Some(x) => x, None => return (422, json!({"error": "activity_id required"})) };
    let section_id = match v["section_id"].as_i64() { Some(x) => x, None => return (422, json!({"error": "section_id required"})) };
    let count = v["student_count"].as_i64();
    let conn = state.conn.lock().unwrap();
    match conn.execute(
        "INSERT OR REPLACE INTO activity_sections(activity_id, section_id, student_count) VALUES(?1,?2,?3)",
        params![act_id, section_id, count],
    ) {
        Ok(_) => (200, json!({"ok": true})),
        Err(e) => (500, json!({"error": format!("{e}")})),
    }
}

fn activity_sections_remove(state: &AppState, body: &str) -> (u16, Value) {
    let v: Value = serde_json::from_str(body).unwrap_or(json!({}));
    let act_id = match v["activity_id"].as_i64() { Some(x) => x, None => return (422, json!({"error": "activity_id required"})) };
    let section_id = match v["section_id"].as_i64() { Some(x) => x, None => return (422, json!({"error": "section_id required"})) };
    let conn = state.conn.lock().unwrap();
    let _ = conn.execute("DELETE FROM activity_sections WHERE activity_id=?1 AND section_id=?2", params![act_id, section_id]);
    (200, json!({"ok": true}))
}

fn activity_expenses_list(state: &AppState, url: &str) -> (u16, Value) {
    let act_id: i64 = match q_param(url, "activity_id").and_then(|v| v.parse().ok()) {
        Some(id) => id,
        None => return (422, json!({"error": "activity_id required"})),
    };
    let conn = state.conn.lock().unwrap();
    let mut stmt = match conn.prepare("SELECT id, head, amount, notes FROM activity_expenses WHERE activity_id=?1 ORDER BY head") {
        Ok(s) => s,
        Err(e) => return (500, json!({"error": format!("{e}")})),
    };
    let rows: Vec<Value> = match stmt.query_map(params![act_id], |r| {
        Ok(json!({ "id": r.get::<_, i64>(0)?, "head": r.get::<_, String>(1)?, "amount": r.get::<_, f64>(2)?, "notes": r.get::<_, Option<String>>(3)? }))
    }) {
        Ok(mapped) => mapped.filter_map(|r| r.ok()).collect(),
        Err(e) => return (500, json!({"error": format!("{e}")})),
    };
    let total: f64 = rows.iter().filter_map(|e| e["amount"].as_f64()).sum();
    (200, json!({"expenses": rows, "total_expense": total}))
}

fn activity_expense_add(state: &AppState, body: &str) -> (u16, Value) {
    let v: Value = serde_json::from_str(body).unwrap_or(json!({}));
    let act_id = match v["activity_id"].as_i64() { Some(x) => x, None => return (422, json!({"error": "activity_id required"})) };
    let head = match v["head"].as_str() { Some(h) if !h.is_empty() => h.to_string(), _ => return (422, json!({"error": "head required"})) };
    let amount = v["amount"].as_f64().unwrap_or(0.0);
    let notes = v["notes"].as_str().map(|s| s.to_string());
    let conn = state.conn.lock().unwrap();
    match conn.execute(
        "INSERT INTO activity_expenses(activity_id, head, amount, notes) VALUES(?1,?2,?3,?4)",
        params![act_id, head, amount, notes],
    ) {
        Ok(_) => (200, json!({"ok": true, "id": conn.last_insert_rowid()})),
        Err(e) => (500, json!({"error": format!("{e}")})),
    }
}

fn activity_expense_delete(state: &AppState, id: i64) -> (u16, Value) {
    let conn = state.conn.lock().unwrap();
    let _ = conn.execute("DELETE FROM activity_expenses WHERE id=?1", params![id]);
    (200, json!({"ok": true}))
}

// ---- Event Management OS (P7) ----

fn announcements_list(state: &AppState, url: &str) -> (u16, Value) {
    let audience = q_param(url, "audience");
    let draft_only = q_param(url, "draft").map(|v| v == "1").unwrap_or(false);
    let conn = state.conn.lock().unwrap();
    let mut stmt = match conn.prepare(
        "SELECT id, title, body, audience, is_draft, published_at, created_by, created_at FROM announcements
         WHERE (?1 IS NULL OR audience=?1) AND (?2=0 OR is_draft=1)
         ORDER BY created_at DESC LIMIT 100",
    ) {
        Ok(s) => s,
        Err(e) => return (500, json!({"error": format!("{e}")})),
    };
    let rows: Vec<Value> = match stmt.query_map(params![audience, draft_only as i64], |r| {
        Ok(json!({
            "id": r.get::<_, i64>(0)?,
            "title": r.get::<_, String>(1)?,
            "body": r.get::<_, Option<String>>(2)?,
            "audience": r.get::<_, Option<String>>(3)?,
            "is_draft": r.get::<_, i64>(4)? == 1,
            "published_at": r.get::<_, Option<String>>(5)?,
            "created_by": r.get::<_, Option<i64>>(6)?,
            "created_at": r.get::<_, String>(7)?,
        }))
    }) {
        Ok(mapped) => mapped.filter_map(|r| r.ok()).collect(),
        Err(e) => return (500, json!({"error": format!("{e}")})),
    };
    let total = rows.len();
    (200, json!({"announcements": rows, "total": total}))
}

fn announcement_create(state: &AppState, body: &str, uid: i64) -> (u16, Value) {
    let v: Value = serde_json::from_str(body).unwrap_or(json!({}));
    let title = match v["title"].as_str() { Some(t) if !t.is_empty() => t.to_string(), _ => return (422, json!({"error": "title required"})) };
    let body_text = v["body"].as_str().map(|s| s.to_string());
    let audience = v["audience"].as_str().unwrap_or("internal").to_string();
    let is_draft = v["is_draft"].as_bool().unwrap_or(true) as i64;
    let conn = state.conn.lock().unwrap();
    match conn.execute(
        "INSERT INTO announcements(title, body, audience, is_draft, published_at, created_by) VALUES(?1,?2,?3,?4,CASE WHEN ?5=0 THEN datetime('now') ELSE NULL END,?6)",
        params![title, body_text, audience, is_draft, is_draft, uid],
    ) {
        Ok(_) => (200, json!({"ok": true, "id": conn.last_insert_rowid()})),
        Err(e) => (500, json!({"error": format!("{e}")})),
    }
}

fn announcement_publish(state: &AppState, id: i64) -> (u16, Value) {
    let conn = state.conn.lock().unwrap();
    let _ = conn.execute("UPDATE announcements SET is_draft=0, published_at=datetime('now') WHERE id=?1", params![id]);
    (200, json!({"ok": true}))
}

fn announcement_delete(state: &AppState, id: i64) -> (u16, Value) {
    let conn = state.conn.lock().unwrap();
    let _ = conn.execute("DELETE FROM announcements WHERE id=?1", params![id]);
    (200, json!({"ok": true}))
}

fn meetings_list(state: &AppState, url: &str) -> (u16, Value) {
    let status = q_param(url, "status");
    let conn = state.conn.lock().unwrap();
    let mut stmt = match conn.prepare(
        "SELECT id, title, meeting_type, date, start_time, end_time, venue, agenda, minutes, status, created_by, created_at
         FROM meetings WHERE (?1 IS NULL OR status=?1) ORDER BY date DESC, start_time LIMIT 200",
    ) {
        Ok(s) => s,
        Err(e) => return (500, json!({"error": format!("{e}")})),
    };
    let rows: Vec<Value> = match stmt.query_map(params![status], |r| {
        Ok(json!({
            "id": r.get::<_, i64>(0)?,
            "title": r.get::<_, String>(1)?,
            "meeting_type": r.get::<_, Option<String>>(2)?,
            "date": r.get::<_, String>(3)?,
            "start_time": r.get::<_, Option<String>>(4)?,
            "end_time": r.get::<_, Option<String>>(5)?,
            "venue": r.get::<_, Option<String>>(6)?,
            "agenda": r.get::<_, Option<String>>(7)?,
            "minutes": r.get::<_, Option<String>>(8)?,
            "status": r.get::<_, Option<String>>(9)?,
            "created_by": r.get::<_, Option<i64>>(10)?,
            "created_at": r.get::<_, String>(11)?,
        }))
    }) {
        Ok(mapped) => mapped.filter_map(|r| r.ok()).collect(),
        Err(e) => return (500, json!({"error": format!("{e}")})),
    };
    let total = rows.len();
    (200, json!({"meetings": rows, "total": total}))
}

fn meeting_create(state: &AppState, body: &str, uid: i64) -> (u16, Value) {
    let v: Value = serde_json::from_str(body).unwrap_or(json!({}));
    let title = match v["title"].as_str() { Some(t) if !t.is_empty() => t.to_string(), _ => return (422, json!({"error": "title required"})) };
    let date = match v["date"].as_str() { Some(d) if !d.is_empty() => d.to_string(), _ => return (422, json!({"error": "date required"})) };
    let mtype = v["meeting_type"].as_str().unwrap_or("staff").to_string();
    let start = v["start_time"].as_str().map(|s| s.to_string());
    let end = v["end_time"].as_str().map(|s| s.to_string());
    let venue = v["venue"].as_str().map(|s| s.to_string());
    let agenda = v["agenda"].as_str().map(|s| s.to_string());
    let conn = state.conn.lock().unwrap();
    match conn.execute(
        "INSERT INTO meetings(title, meeting_type, date, start_time, end_time, venue, agenda, created_by) VALUES(?1,?2,?3,?4,?5,?6,?7,?8)",
        params![title, mtype, date, start, end, venue, agenda, uid],
    ) {
        Ok(_) => (200, json!({"ok": true, "id": conn.last_insert_rowid()})),
        Err(e) => (500, json!({"error": format!("{e}")})),
    }
}

fn meeting_update(state: &AppState, id: i64, body: &str) -> (u16, Value) {
    let v: Value = serde_json::from_str(body).unwrap_or(json!({}));
    let conn = state.conn.lock().unwrap();
    let _ = conn.execute(
        "UPDATE meetings SET title=COALESCE(?1,title), date=COALESCE(?2,date), start_time=?3, end_time=?4,
         venue=?5, agenda=?6, minutes=?7, status=COALESCE(?8,status) WHERE id=?9",
        params![
            v["title"].as_str().filter(|s| !s.is_empty()),
            v["date"].as_str().filter(|s| !s.is_empty()),
            v["start_time"].as_str().map(|s| s.to_string()),
            v["end_time"].as_str().map(|s| s.to_string()),
            v["venue"].as_str().map(|s| s.to_string()),
            v["agenda"].as_str().map(|s| s.to_string()),
            v["minutes"].as_str().map(|s| s.to_string()),
            v["status"].as_str().filter(|s| !s.is_empty()),
            id
        ],
    );
    (200, json!({"ok": true}))
}

fn meeting_delete(state: &AppState, id: i64) -> (u16, Value) {
    let conn = state.conn.lock().unwrap();
    let _ = conn.execute("DELETE FROM meeting_attendees WHERE meeting_id=?1", params![id]);
    let _ = conn.execute("DELETE FROM meetings WHERE id=?1", params![id]);
    (200, json!({"ok": true}))
}

fn tasks_list(state: &AppState, url: &str) -> (u16, Value) {
    let status = q_param(url, "status");
    let assigned_to: Option<i64> = q_param(url, "assigned_to").and_then(|v| v.parse().ok());
    let conn = state.conn.lock().unwrap();
    let mut stmt = match conn.prepare(
        "SELECT t.id, t.title, t.description, t.assigned_to,
                st.first_name, st.last_name,
                t.department_id, d.name as dept_name,
                t.due_date, t.priority, t.status, t.created_by, t.completed_at, t.created_at
         FROM tasks t
         LEFT JOIN staff st ON st.id = t.assigned_to
         LEFT JOIN departments d ON d.id = t.department_id
         WHERE (?1 IS NULL OR t.status=?1) AND (?2 IS NULL OR t.assigned_to=?2)
         ORDER BY t.due_date, t.priority DESC, t.created_at DESC LIMIT 200",
    ) {
        Ok(s) => s,
        Err(e) => return (500, json!({"error": format!("{e}")})),
    };
    let rows: Vec<Value> = match stmt.query_map(params![status, assigned_to], |r| {
        let fn_: Option<String> = r.get(4)?;
        let ln: Option<String> = r.get(5)?;
        let assignee = match (fn_.as_deref(), ln.as_deref()) {
            (Some(f), Some(l)) => Some(format!("{f} {l}")),
            (Some(f), None) => Some(f.to_string()),
            (None, Some(l)) => Some(l.to_string()),
            _ => None,
        };
        Ok(json!({
            "id": r.get::<_, i64>(0)?,
            "title": r.get::<_, String>(1)?,
            "description": r.get::<_, Option<String>>(2)?,
            "assigned_to": r.get::<_, Option<i64>>(3)?,
            "assignee_name": assignee,
            "department_id": r.get::<_, Option<i64>>(6)?,
            "department_name": r.get::<_, Option<String>>(7)?,
            "due_date": r.get::<_, Option<String>>(8)?,
            "priority": r.get::<_, Option<String>>(9)?,
            "status": r.get::<_, Option<String>>(10)?,
            "created_by": r.get::<_, Option<i64>>(11)?,
            "completed_at": r.get::<_, Option<String>>(12)?,
            "created_at": r.get::<_, String>(13)?,
        }))
    }) {
        Ok(mapped) => mapped.filter_map(|r| r.ok()).collect(),
        Err(e) => return (500, json!({"error": format!("{e}")})),
    };
    let total = rows.len();
    (200, json!({"tasks": rows, "total": total}))
}

fn task_create(state: &AppState, body: &str, uid: i64) -> (u16, Value) {
    let v: Value = serde_json::from_str(body).unwrap_or(json!({}));
    let title = match v["title"].as_str() { Some(t) if !t.is_empty() => t.to_string(), _ => return (422, json!({"error": "title required"})) };
    let desc = v["description"].as_str().map(|s| s.to_string());
    let assigned_to = v["assigned_to"].as_i64();
    let dept_id = v["department_id"].as_i64();
    let due = v["due_date"].as_str().map(|s| s.to_string());
    let priority = v["priority"].as_str().unwrap_or("normal").to_string();
    let conn = state.conn.lock().unwrap();
    match conn.execute(
        "INSERT INTO tasks(title, description, assigned_to, department_id, due_date, priority, created_by) VALUES(?1,?2,?3,?4,?5,?6,?7)",
        params![title, desc, assigned_to, dept_id, due, priority, uid],
    ) {
        Ok(_) => (200, json!({"ok": true, "id": conn.last_insert_rowid()})),
        Err(e) => (500, json!({"error": format!("{e}")})),
    }
}

fn task_update(state: &AppState, id: i64, body: &str) -> (u16, Value) {
    let v: Value = serde_json::from_str(body).unwrap_or(json!({}));
    let conn = state.conn.lock().unwrap();
    let _ = conn.execute(
        "UPDATE tasks SET title=COALESCE(?1,title), description=?2, due_date=?3, priority=COALESCE(?4,priority), status=COALESCE(?5,status) WHERE id=?6",
        params![
            v["title"].as_str().filter(|s| !s.is_empty()),
            v["description"].as_str().map(|s| s.to_string()),
            v["due_date"].as_str().map(|s| s.to_string()),
            v["priority"].as_str().filter(|s| !s.is_empty()),
            v["status"].as_str().filter(|s| !s.is_empty()),
            id
        ],
    );
    (200, json!({"ok": true}))
}

fn task_complete(state: &AppState, id: i64) -> (u16, Value) {
    let conn = state.conn.lock().unwrap();
    let _ = conn.execute("UPDATE tasks SET status='completed', completed_at=datetime('now') WHERE id=?1", params![id]);
    (200, json!({"ok": true}))
}

fn task_delete(state: &AppState, id: i64) -> (u16, Value) {
    let conn = state.conn.lock().unwrap();
    let _ = conn.execute("DELETE FROM tasks WHERE id=?1", params![id]);
    (200, json!({"ok": true}))
}

// ---- Reminders ----

fn reminders_list(state: &AppState, url: &str) -> (u16, Value) {
    let tag = q_param(url, "tag");
    let conn = state.conn.lock().unwrap();
    let mut stmt = match conn.prepare(
        "SELECT id, title, tag, due_date, notes, done, created_at
         FROM reminders
         WHERE done=0 AND (?1 IS NULL OR tag=?1)
         ORDER BY (due_date IS NULL), due_date,
                  CASE tag WHEN 'critical' THEN 0 WHEN 'urgent' THEN 1 ELSE 2 END,
                  created_at DESC LIMIT 200",
    ) {
        Ok(s) => s,
        Err(e) => return (500, json!({"error": format!("{e}")})),
    };
    let rows: Vec<Value> = match stmt.query_map(params![tag], |r| {
        Ok(json!({
            "id": r.get::<_, i64>(0)?,
            "title": r.get::<_, String>(1)?,
            "tag": r.get::<_, Option<String>>(2)?,
            "due_date": r.get::<_, Option<String>>(3)?,
            "notes": r.get::<_, Option<String>>(4)?,
            "done": r.get::<_, i64>(5)? != 0,
            "created_at": r.get::<_, String>(6)?,
        }))
    }) {
        Ok(mapped) => mapped.filter_map(|r| r.ok()).collect(),
        Err(e) => return (500, json!({"error": format!("{e}")})),
    };
    let total = rows.len();
    (200, json!({"reminders": rows, "total": total}))
}

fn reminder_create(state: &AppState, body: &str, uid: i64) -> (u16, Value) {
    let v: Value = serde_json::from_str(body).unwrap_or(json!({}));
    let title = match v["title"].as_str() { Some(t) if !t.is_empty() => t.to_string(), _ => return (422, json!({"error": "title required"})) };
    let tag = v["tag"].as_str().unwrap_or("normal").to_string();
    let due = v["due_date"].as_str().filter(|s| !s.is_empty()).map(|s| s.to_string());
    let notes = v["notes"].as_str().map(|s| s.to_string());
    let conn = state.conn.lock().unwrap();
    match conn.execute(
        "INSERT INTO reminders(title, tag, due_date, notes, created_by) VALUES(?1,?2,?3,?4,?5)",
        params![title, tag, due, notes, uid],
    ) {
        Ok(_) => (200, json!({"ok": true, "id": conn.last_insert_rowid()})),
        Err(e) => (500, json!({"error": format!("{e}")})),
    }
}

fn reminder_done(state: &AppState, id: i64) -> (u16, Value) {
    let conn = state.conn.lock().unwrap();
    let _ = conn.execute("UPDATE reminders SET done=1 WHERE id=?1", params![id]);
    (200, json!({"ok": true}))
}

fn reminder_delete(state: &AppState, id: i64) -> (u16, Value) {
    let conn = state.conn.lock().unwrap();
    let _ = conn.execute("DELETE FROM reminders WHERE id=?1", params![id]);
    (200, json!({"ok": true}))
}

// ---- Transport OS ----

fn transport_vehicles_list(state: &AppState) -> (u16, Value) {
    let conn = state.conn.lock().unwrap();
    let mut stmt = match conn.prepare(
        "SELECT id, name, driver_name, driver_phone, capacity, notes FROM transport_vehicles ORDER BY name",
    ) { Ok(s) => s, Err(e) => return (500, json!({"error": format!("{e}")})) };
    let rows: Vec<Value> = match stmt.query_map([], |r| {
        Ok(json!({
            "id": r.get::<_, i64>(0)?,
            "name": r.get::<_, String>(1)?,
            "driver_name": r.get::<_, Option<String>>(2)?,
            "driver_phone": r.get::<_, Option<String>>(3)?,
            "capacity": r.get::<_, Option<i64>>(4)?,
            "notes": r.get::<_, Option<String>>(5)?,
        }))
    }) { Ok(m) => m.filter_map(|r| r.ok()).collect(), Err(e) => return (500, json!({"error": format!("{e}")})) };
    (200, json!({"vehicles": rows, "total": rows.len()}))
}

fn transport_vehicle_create(state: &AppState, body: &str) -> (u16, Value) {
    let v: Value = serde_json::from_str(body).unwrap_or(json!({}));
    let name = match v["name"].as_str() { Some(t) if !t.is_empty() => t.to_string(), _ => return (422, json!({"error": "name required"})) };
    let conn = state.conn.lock().unwrap();
    match conn.execute(
        "INSERT INTO transport_vehicles(name, driver_name, driver_phone, capacity, notes) VALUES(?1,?2,?3,?4,?5)",
        params![
            name,
            v["driver_name"].as_str().map(|s| s.to_string()),
            v["driver_phone"].as_str().map(|s| s.to_string()),
            v["capacity"].as_i64(),
            v["notes"].as_str().map(|s| s.to_string()),
        ],
    ) {
        Ok(_) => (200, json!({"ok": true, "id": conn.last_insert_rowid()})),
        Err(e) => (500, json!({"error": format!("{e}")})),
    }
}

fn transport_vehicle_delete(state: &AppState, id: i64) -> (u16, Value) {
    let conn = state.conn.lock().unwrap();
    // Detach from any routes, then delete the vehicle.
    let _ = conn.execute("UPDATE transport_routes SET vehicle_id=NULL WHERE vehicle_id=?1", params![id]);
    let _ = conn.execute("DELETE FROM transport_vehicles WHERE id=?1", params![id]);
    (200, json!({"ok": true}))
}

fn transport_routes_list(state: &AppState) -> (u16, Value) {
    let conn = state.conn.lock().unwrap();
    let mut stmt = match conn.prepare(
        "SELECT r.id, r.name, r.vehicle_id, v.name, r.fare, r.notes,
                (SELECT COUNT(*) FROM transport_assignments a WHERE a.route_id=r.id) AS assigned
         FROM transport_routes r
         LEFT JOIN transport_vehicles v ON v.id = r.vehicle_id
         ORDER BY r.name",
    ) { Ok(s) => s, Err(e) => return (500, json!({"error": format!("{e}")})) };
    let mut rows: Vec<Value> = match stmt.query_map([], |r| {
        Ok(json!({
            "id": r.get::<_, i64>(0)?,
            "name": r.get::<_, String>(1)?,
            "vehicle_id": r.get::<_, Option<i64>>(2)?,
            "vehicle_name": r.get::<_, Option<String>>(3)?,
            "fare": r.get::<_, Option<f64>>(4)?,
            "notes": r.get::<_, Option<String>>(5)?,
            "assigned": r.get::<_, i64>(6)?,
        }))
    }) { Ok(m) => m.filter_map(|r| r.ok()).collect(), Err(e) => return (500, json!({"error": format!("{e}")})) };

    // Attach stops to each route.
    for route in rows.iter_mut() {
        let rid = route["id"].as_i64().unwrap_or(0);
        let mut sstmt = match conn.prepare(
            "SELECT id, name, pickup_time, sort_order FROM transport_stops WHERE route_id=?1 ORDER BY sort_order, id",
        ) { Ok(s) => s, Err(_) => continue };
        let stops: Vec<Value> = sstmt.query_map(params![rid], |r| {
            Ok(json!({
                "id": r.get::<_, i64>(0)?,
                "name": r.get::<_, String>(1)?,
                "pickup_time": r.get::<_, Option<String>>(2)?,
                "sort_order": r.get::<_, Option<i64>>(3)?,
            }))
        }).map(|m| m.filter_map(|r| r.ok()).collect()).unwrap_or_default();
        route["stops"] = json!(stops);
    }
    let total = rows.len();
    (200, json!({"routes": rows, "total": total}))
}

fn transport_route_create(state: &AppState, body: &str) -> (u16, Value) {
    let v: Value = serde_json::from_str(body).unwrap_or(json!({}));
    let name = match v["name"].as_str() { Some(t) if !t.is_empty() => t.to_string(), _ => return (422, json!({"error": "name required"})) };
    let conn = state.conn.lock().unwrap();
    match conn.execute(
        "INSERT INTO transport_routes(name, vehicle_id, fare, notes) VALUES(?1,?2,?3,?4)",
        params![name, v["vehicle_id"].as_i64(), v["fare"].as_f64(), v["notes"].as_str().map(|s| s.to_string())],
    ) {
        Ok(_) => (200, json!({"ok": true, "id": conn.last_insert_rowid()})),
        Err(e) => (500, json!({"error": format!("{e}")})),
    }
}

fn transport_route_delete(state: &AppState, id: i64) -> (u16, Value) {
    let conn = state.conn.lock().unwrap();
    let _ = conn.execute("DELETE FROM transport_assignments WHERE route_id=?1", params![id]);
    let _ = conn.execute("DELETE FROM transport_stops WHERE route_id=?1", params![id]);
    let _ = conn.execute("DELETE FROM transport_routes WHERE id=?1", params![id]);
    (200, json!({"ok": true}))
}

fn transport_stop_create(state: &AppState, body: &str) -> (u16, Value) {
    let v: Value = serde_json::from_str(body).unwrap_or(json!({}));
    let route_id = match v["route_id"].as_i64() { Some(x) => x, None => return (422, json!({"error": "route_id required"})) };
    let name = match v["name"].as_str() { Some(t) if !t.is_empty() => t.to_string(), _ => return (422, json!({"error": "name required"})) };
    let conn = state.conn.lock().unwrap();
    match conn.execute(
        "INSERT INTO transport_stops(route_id, name, pickup_time, sort_order) VALUES(?1,?2,?3,?4)",
        params![route_id, name, v["pickup_time"].as_str().map(|s| s.to_string()), v["sort_order"].as_i64().unwrap_or(0)],
    ) {
        Ok(_) => (200, json!({"ok": true, "id": conn.last_insert_rowid()})),
        Err(e) => (500, json!({"error": format!("{e}")})),
    }
}

fn transport_stop_delete(state: &AppState, id: i64) -> (u16, Value) {
    let conn = state.conn.lock().unwrap();
    let _ = conn.execute("UPDATE transport_assignments SET stop_id=NULL WHERE stop_id=?1", params![id]);
    let _ = conn.execute("DELETE FROM transport_stops WHERE id=?1", params![id]);
    (200, json!({"ok": true}))
}

fn transport_assignments_list(state: &AppState, url: &str) -> (u16, Value) {
    let route_id: i64 = match q_param(url, "route_id").and_then(|v| v.parse().ok()) {
        Some(id) => id,
        None => return (422, json!({"error": "route_id required"})),
    };
    let conn = state.conn.lock().unwrap();
    let mut stmt = match conn.prepare(
        "SELECT a.id, a.student_id, s.first_name, s.last_name, a.stop_id, st.name
         FROM transport_assignments a
         JOIN students s ON s.id = a.student_id
         LEFT JOIN transport_stops st ON st.id = a.stop_id
         WHERE a.route_id=?1
         ORDER BY s.first_name, s.last_name",
    ) { Ok(s) => s, Err(e) => return (500, json!({"error": format!("{e}")})) };
    let rows: Vec<Value> = match stmt.query_map(params![route_id], |r| {
        Ok(json!({
            "id": r.get::<_, i64>(0)?,
            "student_id": r.get::<_, i64>(1)?,
            "first_name": r.get::<_, Option<String>>(2)?,
            "last_name": r.get::<_, Option<String>>(3)?,
            "stop_id": r.get::<_, Option<i64>>(4)?,
            "stop_name": r.get::<_, Option<String>>(5)?,
        }))
    }) { Ok(m) => m.filter_map(|r| r.ok()).collect(), Err(e) => return (500, json!({"error": format!("{e}")})) };
    (200, json!({"assignments": rows, "total": rows.len()}))
}

fn transport_assign(state: &AppState, body: &str) -> (u16, Value) {
    let v: Value = serde_json::from_str(body).unwrap_or(json!({}));
    let student_id = match v["student_id"].as_i64() { Some(x) => x, None => return (422, json!({"error": "student_id required"})) };
    let route_id = match v["route_id"].as_i64() { Some(x) => x, None => return (422, json!({"error": "route_id required"})) };
    let stop_id = v["stop_id"].as_i64();
    let conn = state.conn.lock().unwrap();
    // One route per student: upsert on student_id.
    match conn.execute(
        "INSERT INTO transport_assignments(student_id, route_id, stop_id) VALUES(?1,?2,?3)
         ON CONFLICT(student_id) DO UPDATE SET route_id=excluded.route_id, stop_id=excluded.stop_id",
        params![student_id, route_id, stop_id],
    ) {
        Ok(_) => (200, json!({"ok": true})),
        Err(e) => (500, json!({"error": format!("{e}")})),
    }
}

fn transport_unassign(state: &AppState, id: i64) -> (u16, Value) {
    let conn = state.conn.lock().unwrap();
    let _ = conn.execute("DELETE FROM transport_assignments WHERE id=?1", params![id]);
    (200, json!({"ok": true}))
}

// ---- Issued items (ID / books / uniform markers) ----

/// Roster of a section with each student's issuance markers folded into a map
/// (e.g. {"id": true, "books": false, "uniform": true}).
fn issued_list(state: &AppState, url: &str) -> (u16, Value) {
    let section_id: i64 = match q_param(url, "section_id").and_then(|v| v.parse().ok()) {
        Some(id) => id,
        None => return (422, json!({"error": "section_id required"})),
    };
    let conn = state.conn.lock().unwrap();
    let mut stmt = match conn.prepare(
        "SELECT s.id, s.first_name, s.last_name, ii.item_type, ii.issued, ii.issued_date
         FROM section_students ss
         JOIN students s ON s.id = ss.student_id
         LEFT JOIN issued_items ii ON ii.student_id = s.id
         WHERE ss.section_id = ?1
         ORDER BY s.first_name, s.last_name",
    ) { Ok(s) => s, Err(e) => return (500, json!({"error": format!("{e}")})) };

    // (student_id) -> aggregated row. Preserve first-seen order.
    let mut order: Vec<i64> = Vec::new();
    let mut map: std::collections::HashMap<i64, Value> = std::collections::HashMap::new();

    let raw = stmt.query_map(params![section_id], |r| {
        Ok((
            r.get::<_, i64>(0)?,
            r.get::<_, Option<String>>(1)?,
            r.get::<_, Option<String>>(2)?,
            r.get::<_, Option<String>>(3)?,
            r.get::<_, Option<i64>>(4)?,
            r.get::<_, Option<String>>(5)?,
        ))
    });
    let rows = match raw { Ok(m) => m, Err(e) => return (500, json!({"error": format!("{e}")})) };
    for row in rows.flatten() {
        let (sid, fn_, ln, item_type, issued, issued_date) = row;
        let entry = map.entry(sid).or_insert_with(|| {
            order.push(sid);
            json!({ "student_id": sid, "first_name": fn_, "last_name": ln, "items": {}, "dates": {} })
        });
        if let Some(it) = item_type {
            entry["items"][&it] = json!(issued.unwrap_or(0) != 0);
            entry["dates"][&it] = json!(issued_date);
        }
    }
    let students: Vec<Value> = order.into_iter().filter_map(|id| map.remove(&id)).collect();
    (200, json!({"students": students, "section_id": section_id}))
}

fn issued_mark(state: &AppState, body: &str, uid: i64) -> (u16, Value) {
    let v: Value = serde_json::from_str(body).unwrap_or(json!({}));
    let student_id = match v["student_id"].as_i64() { Some(x) => x, None => return (422, json!({"error": "student_id required"})) };
    let item_type = match v["item_type"].as_str() { Some(t) if !t.is_empty() => t.to_string(), _ => return (422, json!({"error": "item_type required"})) };
    let issued = v["issued"].as_bool().unwrap_or(false);
    let issued_i = if issued { 1 } else { 0 };
    let conn = state.conn.lock().unwrap();
    let r = conn.execute(
        "INSERT INTO issued_items(student_id, item_type, issued, issued_date, marked_by)
         VALUES(?1,?2,?3, CASE WHEN ?3=1 THEN date('now') ELSE NULL END, ?4)
         ON CONFLICT(student_id, item_type) DO UPDATE SET
           issued=excluded.issued,
           issued_date=CASE WHEN excluded.issued=1 THEN date('now') ELSE NULL END,
           marked_by=excluded.marked_by",
        params![student_id, item_type, issued_i, uid],
    );
    match r {
        Ok(_) => (200, json!({"ok": true})),
        Err(e) => (500, json!({"error": format!("{e}")})),
    }
}

// ---- Visitor log ----

fn visitors_list(state: &AppState, url: &str) -> (u16, Value) {
    // Default to today; ?date=YYYY-MM-DD to view another day.
    let date = q_param(url, "date");
    let conn = state.conn.lock().unwrap();
    let mut stmt = match conn.prepare(
        "SELECT id, name, phone, purpose, whom_to_meet, date, in_time, out_time
         FROM visitors
         WHERE date = COALESCE(?1, date('now'))
         ORDER BY (out_time IS NOT NULL), in_time DESC, id DESC",
    ) { Ok(s) => s, Err(e) => return (500, json!({"error": format!("{e}")})) };
    let rows: Vec<Value> = match stmt.query_map(params![date], |r| {
        Ok(json!({
            "id": r.get::<_, i64>(0)?,
            "name": r.get::<_, String>(1)?,
            "phone": r.get::<_, Option<String>>(2)?,
            "purpose": r.get::<_, Option<String>>(3)?,
            "whom_to_meet": r.get::<_, Option<String>>(4)?,
            "date": r.get::<_, String>(5)?,
            "in_time": r.get::<_, Option<String>>(6)?,
            "out_time": r.get::<_, Option<String>>(7)?,
        }))
    }) { Ok(m) => m.filter_map(|r| r.ok()).collect(), Err(e) => return (500, json!({"error": format!("{e}")})) };
    (200, json!({"visitors": rows, "total": rows.len()}))
}

fn visitor_checkin(state: &AppState, body: &str, uid: i64) -> (u16, Value) {
    let v: Value = serde_json::from_str(body).unwrap_or(json!({}));
    let name = match v["name"].as_str() { Some(t) if !t.is_empty() => t.to_string(), _ => return (422, json!({"error": "name required"})) };
    let conn = state.conn.lock().unwrap();
    match conn.execute(
        "INSERT INTO visitors(name, phone, purpose, whom_to_meet, date, in_time, created_by)
         VALUES(?1,?2,?3,?4, date('now'), datetime('now'), ?5)",
        params![
            name,
            v["phone"].as_str().map(|s| s.to_string()),
            v["purpose"].as_str().map(|s| s.to_string()),
            v["whom_to_meet"].as_str().map(|s| s.to_string()),
            uid,
        ],
    ) {
        Ok(_) => (200, json!({"ok": true, "id": conn.last_insert_rowid()})),
        Err(e) => (500, json!({"error": format!("{e}")})),
    }
}

fn visitor_checkout(state: &AppState, id: i64) -> (u16, Value) {
    let conn = state.conn.lock().unwrap();
    let _ = conn.execute("UPDATE visitors SET out_time=datetime('now') WHERE id=?1 AND out_time IS NULL", params![id]);
    (200, json!({"ok": true}))
}

fn visitor_delete(state: &AppState, id: i64) -> (u16, Value) {
    let conn = state.conn.lock().unwrap();
    let _ = conn.execute("DELETE FROM visitors WHERE id=?1", params![id]);
    (200, json!({"ok": true}))
}

// ---- Library OS ----

fn library_books_list(state: &AppState, url: &str) -> (u16, Value) {
    let q = q_param(url, "q");
    let like = q.as_ref().map(|s| format!("%{s}%"));
    let conn = state.conn.lock().unwrap();
    let mut stmt = match conn.prepare(
        "SELECT id, title, author, isbn, category, total_copies, available_copies
         FROM library_books
         WHERE (?1 IS NULL OR title LIKE ?1 OR author LIKE ?1 OR category LIKE ?1)
         ORDER BY title",
    ) { Ok(s) => s, Err(e) => return (500, json!({"error": format!("{e}")})) };
    let rows: Vec<Value> = match stmt.query_map(params![like], |r| {
        Ok(json!({
            "id": r.get::<_, i64>(0)?,
            "title": r.get::<_, String>(1)?,
            "author": r.get::<_, Option<String>>(2)?,
            "isbn": r.get::<_, Option<String>>(3)?,
            "category": r.get::<_, Option<String>>(4)?,
            "total_copies": r.get::<_, i64>(5)?,
            "available_copies": r.get::<_, i64>(6)?,
        }))
    }) { Ok(m) => m.filter_map(|r| r.ok()).collect(), Err(e) => return (500, json!({"error": format!("{e}")})) };
    (200, json!({"books": rows, "total": rows.len()}))
}

fn library_book_create(state: &AppState, body: &str) -> (u16, Value) {
    let v: Value = serde_json::from_str(body).unwrap_or(json!({}));
    let title = match v["title"].as_str() { Some(t) if !t.is_empty() => t.to_string(), _ => return (422, json!({"error": "title required"})) };
    let copies = v["total_copies"].as_i64().unwrap_or(1).max(1);
    let conn = state.conn.lock().unwrap();
    match conn.execute(
        "INSERT INTO library_books(title, author, isbn, category, total_copies, available_copies) VALUES(?1,?2,?3,?4,?5,?5)",
        params![
            title,
            v["author"].as_str().map(|s| s.to_string()),
            v["isbn"].as_str().map(|s| s.to_string()),
            v["category"].as_str().map(|s| s.to_string()),
            copies,
        ],
    ) {
        Ok(_) => (200, json!({"ok": true, "id": conn.last_insert_rowid()})),
        Err(e) => (500, json!({"error": format!("{e}")})),
    }
}

fn library_book_delete(state: &AppState, id: i64) -> (u16, Value) {
    let conn = state.conn.lock().unwrap();
    let _ = conn.execute("DELETE FROM library_loans WHERE book_id=?1", params![id]);
    let _ = conn.execute("DELETE FROM library_books WHERE id=?1", params![id]);
    (200, json!({"ok": true}))
}

fn library_loans_list(state: &AppState, url: &str) -> (u16, Value) {
    // status=active (default) shows only un-returned loans; status=all shows history.
    let all = q_param(url, "status").as_deref() == Some("all");
    let conn = state.conn.lock().unwrap();
    let sql = if all {
        "SELECT l.id, l.book_id, b.title, l.student_id, s.first_name, s.last_name,
                l.issued_date, l.due_date, l.returned_date
         FROM library_loans l
         JOIN library_books b ON b.id = l.book_id
         JOIN students s ON s.id = l.student_id
         ORDER BY (l.returned_date IS NOT NULL), l.due_date"
    } else {
        "SELECT l.id, l.book_id, b.title, l.student_id, s.first_name, s.last_name,
                l.issued_date, l.due_date, l.returned_date
         FROM library_loans l
         JOIN library_books b ON b.id = l.book_id
         JOIN students s ON s.id = l.student_id
         WHERE l.returned_date IS NULL
         ORDER BY l.due_date"
    };
    let mut stmt = match conn.prepare(sql) { Ok(s) => s, Err(e) => return (500, json!({"error": format!("{e}")})) };
    let rows: Vec<Value> = match stmt.query_map([], |r| {
        Ok(json!({
            "id": r.get::<_, i64>(0)?,
            "book_id": r.get::<_, i64>(1)?,
            "title": r.get::<_, String>(2)?,
            "student_id": r.get::<_, i64>(3)?,
            "first_name": r.get::<_, Option<String>>(4)?,
            "last_name": r.get::<_, Option<String>>(5)?,
            "issued_date": r.get::<_, Option<String>>(6)?,
            "due_date": r.get::<_, Option<String>>(7)?,
            "returned_date": r.get::<_, Option<String>>(8)?,
        }))
    }) { Ok(m) => m.filter_map(|r| r.ok()).collect(), Err(e) => return (500, json!({"error": format!("{e}")})) };
    (200, json!({"loans": rows, "total": rows.len()}))
}

fn library_loan_issue(state: &AppState, body: &str, uid: i64) -> (u16, Value) {
    let v: Value = serde_json::from_str(body).unwrap_or(json!({}));
    let book_id = match v["book_id"].as_i64() { Some(x) => x, None => return (422, json!({"error": "book_id required"})) };
    let student_id = match v["student_id"].as_i64() { Some(x) => x, None => return (422, json!({"error": "student_id required"})) };
    let due = v["due_date"].as_str().filter(|s| !s.is_empty()).map(|s| s.to_string());
    let conn = state.conn.lock().unwrap();
    let avail: i64 = conn.query_row("SELECT available_copies FROM library_books WHERE id=?1", params![book_id], |r| r.get(0)).unwrap_or(0);
    if avail <= 0 {
        return (422, json!({"error": "no copies available"}));
    }
    let _ = conn.execute(
        "INSERT INTO library_loans(book_id, student_id, issued_date, due_date, created_by) VALUES(?1,?2,date('now'),?3,?4)",
        params![book_id, student_id, due, uid],
    );
    let _ = conn.execute("UPDATE library_books SET available_copies=available_copies-1 WHERE id=?1 AND available_copies>0", params![book_id]);
    (200, json!({"ok": true, "id": conn.last_insert_rowid()}))
}

fn library_loan_return(state: &AppState, id: i64) -> (u16, Value) {
    let conn = state.conn.lock().unwrap();
    let affected = conn.execute(
        "UPDATE library_loans SET returned_date=date('now') WHERE id=?1 AND returned_date IS NULL",
        params![id],
    ).unwrap_or(0);
    if affected > 0 {
        // Return a copy to the shelf (capped at total).
        let _ = conn.execute(
            "UPDATE library_books SET available_copies=MIN(total_copies, available_copies+1)
             WHERE id=(SELECT book_id FROM library_loans WHERE id=?1)",
            params![id],
        );
    }
    (200, json!({"ok": true}))
}

// ---- Fee OS (P6) ----

fn fee_heads_list(state: &AppState) -> (u16, Value) {
    let conn = state.conn.lock().unwrap();
    let mut stmt = match conn.prepare("SELECT id, name, description, is_optional FROM fee_heads ORDER BY name") {
        Ok(s) => s,
        Err(e) => return (500, json!({"error": format!("{e}")})),
    };
    let rows: Vec<Value> = match stmt.query_map([], |r| {
        Ok(json!({ "id": r.get::<_, i64>(0)?, "name": r.get::<_, String>(1)?, "description": r.get::<_, Option<String>>(2)?, "is_optional": r.get::<_, i64>(3)? }))
    }) {
        Ok(mapped) => mapped.filter_map(|r| r.ok()).collect(),
        Err(e) => return (500, json!({"error": format!("{e}")})),
    };
    (200, json!({"fee_heads": rows, "total": rows.len()}))
}

fn fee_head_create(state: &AppState, body: &str) -> (u16, Value) {
    let v: Value = serde_json::from_str(body).unwrap_or(json!({}));
    let name = match v["name"].as_str() { Some(n) if !n.is_empty() => n.to_string(), _ => return (422, json!({"error": "name required"})) };
    let desc = v["description"].as_str().map(|s| s.to_string());
    let optional = v["is_optional"].as_bool().unwrap_or(false) as i64;
    let conn = state.conn.lock().unwrap();
    match conn.execute("INSERT INTO fee_heads(name, description, is_optional) VALUES(?1,?2,?3)", params![name, desc, optional]) {
        Ok(_) => (200, json!({"ok": true, "id": conn.last_insert_rowid()})),
        Err(e) => (500, json!({"error": format!("{e}")})),
    }
}

fn fee_head_delete(state: &AppState, id: i64) -> (u16, Value) {
    let conn = state.conn.lock().unwrap();
    let _ = conn.execute("DELETE FROM fee_structures WHERE fee_head_id=?1", params![id]);
    let _ = conn.execute("DELETE FROM fee_heads WHERE id=?1", params![id]);
    (200, json!({"ok": true}))
}

fn fee_structures_list(state: &AppState, url: &str) -> (u16, Value) {
    let year_id: Option<i64> = q_param(url, "year_id").and_then(|v| v.parse().ok());
    let class_id: Option<i64> = q_param(url, "class_id").and_then(|v| v.parse().ok());
    let conn = state.conn.lock().unwrap();
    let mut stmt = match conn.prepare(
        "SELECT fs.id, fs.academic_year_id, fs.class_id, c.name, fs.fee_head_id, fh.name, fs.amount, fs.due_date
         FROM fee_structures fs
         JOIN fee_heads fh ON fh.id = fs.fee_head_id
         LEFT JOIN classes c ON c.id = fs.class_id
         WHERE (?1 IS NULL OR fs.academic_year_id=?1) AND (?2 IS NULL OR fs.class_id=?2)
         ORDER BY fh.name, c.name",
    ) {
        Ok(s) => s,
        Err(e) => return (500, json!({"error": format!("{e}")})),
    };
    let rows: Vec<Value> = match stmt.query_map(params![year_id, class_id], |r| {
        Ok(json!({
            "id": r.get::<_, i64>(0)?,
            "academic_year_id": r.get::<_, Option<i64>>(1)?,
            "class_id": r.get::<_, Option<i64>>(2)?,
            "class_name": r.get::<_, Option<String>>(3)?,
            "fee_head_id": r.get::<_, i64>(4)?,
            "fee_head_name": r.get::<_, String>(5)?,
            "amount": r.get::<_, f64>(6)?,
            "due_date": r.get::<_, Option<String>>(7)?,
        }))
    }) {
        Ok(mapped) => mapped.filter_map(|r| r.ok()).collect(),
        Err(e) => return (500, json!({"error": format!("{e}")})),
    };
    let total = rows.len();
    (200, json!({"structures": rows, "total": total}))
}

fn fee_structure_save(state: &AppState, body: &str) -> (u16, Value) {
    let v: Value = serde_json::from_str(body).unwrap_or(json!({}));
    let fh_id = match v["fee_head_id"].as_i64() { Some(x) => x, None => return (422, json!({"error": "fee_head_id required"})) };
    let amount = v["amount"].as_f64().unwrap_or(0.0);
    let year_id = v["academic_year_id"].as_i64();
    let class_id = v["class_id"].as_i64();
    let due = v["due_date"].as_str().map(|s| s.to_string());
    let conn = state.conn.lock().unwrap();
    match conn.execute(
        "INSERT INTO fee_structures(academic_year_id, class_id, fee_head_id, amount, due_date) VALUES(?1,?2,?3,?4,?5)
         ON CONFLICT(academic_year_id, class_id, fee_head_id) DO UPDATE SET amount=excluded.amount, due_date=excluded.due_date",
        params![year_id, class_id, fh_id, amount, due],
    ) {
        Ok(_) => (200, json!({"ok": true})),
        Err(e) => (500, json!({"error": format!("{e}")})),
    }
}

fn fee_payments_list(state: &AppState, url: &str) -> (u16, Value) {
    let student_id: Option<i64> = q_param(url, "student_id").and_then(|v| v.parse().ok());
    let year_id: Option<i64> = q_param(url, "year_id").and_then(|v| v.parse().ok());
    let conn = state.conn.lock().unwrap();
    let mut stmt = match conn.prepare(
        "SELECT fp.id, fp.student_id, s.first_name, s.last_name,
                fp.fee_head_id, fh.name, fp.academic_year_id,
                fp.amount_paid, fp.payment_date, fp.payment_mode,
                fp.reference, fp.receipt_no, fp.notes
         FROM fee_payments fp
         JOIN students s ON s.id = fp.student_id
         JOIN fee_heads fh ON fh.id = fp.fee_head_id
         WHERE (?1 IS NULL OR fp.student_id=?1) AND (?2 IS NULL OR fp.academic_year_id=?2)
         ORDER BY fp.payment_date DESC, fp.id DESC",
    ) {
        Ok(s) => s,
        Err(e) => return (500, json!({"error": format!("{e}")})),
    };
    let rows: Vec<Value> = match stmt.query_map(params![student_id, year_id], |r| {
        Ok(json!({
            "id": r.get::<_, i64>(0)?,
            "student_id": r.get::<_, i64>(1)?,
            "first_name": r.get::<_, Option<String>>(2)?,
            "last_name": r.get::<_, Option<String>>(3)?,
            "fee_head_id": r.get::<_, i64>(4)?,
            "fee_head_name": r.get::<_, String>(5)?,
            "academic_year_id": r.get::<_, Option<i64>>(6)?,
            "amount_paid": r.get::<_, f64>(7)?,
            "payment_date": r.get::<_, Option<String>>(8)?,
            "payment_mode": r.get::<_, Option<String>>(9)?,
            "reference": r.get::<_, Option<String>>(10)?,
            "receipt_no": r.get::<_, Option<String>>(11)?,
            "notes": r.get::<_, Option<String>>(12)?,
        }))
    }) {
        Ok(mapped) => mapped.filter_map(|r| r.ok()).collect(),
        Err(e) => return (500, json!({"error": format!("{e}")})),
    };
    let total = rows.len();
    (200, json!({"payments": rows, "total": total}))
}

fn fee_payment_create(state: &AppState, body: &str) -> (u16, Value) {
    let v: Value = serde_json::from_str(body).unwrap_or(json!({}));
    let student_id = match v["student_id"].as_i64() { Some(x) => x, None => return (422, json!({"error": "student_id required"})) };
    let fh_id = match v["fee_head_id"].as_i64() { Some(x) => x, None => return (422, json!({"error": "fee_head_id required"})) };
    let amount = v["amount_paid"].as_f64().unwrap_or(0.0);
    let year_id = v["academic_year_id"].as_i64();
    let date = v["payment_date"].as_str().map(|s| s.to_string());
    let mode = v["payment_mode"].as_str().unwrap_or("cash").to_string();
    let reference = v["reference"].as_str().map(|s| s.to_string());
    let notes = v["notes"].as_str().map(|s| s.to_string());
    let conn = state.conn.lock().unwrap();
    let receipt_no = format!("RCP-{}-{}", chrono_or_ts(), student_id);
    match conn.execute(
        "INSERT INTO fee_payments(student_id, fee_head_id, academic_year_id, amount_paid, payment_date, payment_mode, reference, receipt_no, notes)
         VALUES(?1,?2,?3,?4,COALESCE(?5, date('now')),?6,?7,?8,?9)",
        params![student_id, fh_id, year_id, amount, date, mode, reference, receipt_no, notes],
    ) {
        Ok(_) => (200, json!({"ok": true, "id": conn.last_insert_rowid(), "receipt_no": receipt_no})),
        Err(e) => (500, json!({"error": format!("{e}")})),
    }
}

fn chrono_or_ts() -> String {
    let secs = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs();
    format!("{secs}")
}

fn fee_outstanding(state: &AppState, url: &str) -> (u16, Value) {
    let student_id: Option<i64> = q_param(url, "student_id").and_then(|v| v.parse().ok());
    let year_id: Option<i64> = q_param(url, "year_id").and_then(|v| v.parse().ok());
    let conn = state.conn.lock().unwrap();
    // For each student+fee_head combo in structures, compute balance = amount - sum(paid)
    let mut stmt = match conn.prepare(
        "SELECT s.id, s.first_name, s.last_name,
                fs.fee_head_id, fh.name, fs.amount, fs.due_date,
                COALESCE((SELECT SUM(fp.amount_paid) FROM fee_payments fp
                          WHERE fp.student_id=s.id AND fp.fee_head_id=fs.fee_head_id
                            AND (?1 IS NULL OR fp.academic_year_id=?1)), 0) as paid
         FROM students s
         JOIN (SELECT DISTINCT ss.student_id, se.class_id FROM section_students ss
               JOIN sections se ON se.id = ss.section_id) sc ON sc.student_id = s.id
         JOIN fee_structures fs ON (fs.class_id IS NULL OR fs.class_id = sc.class_id)
                                AND (?1 IS NULL OR fs.academic_year_id=?1)
         JOIN fee_heads fh ON fh.id = fs.fee_head_id
         WHERE (?2 IS NULL OR s.id=?2)
         HAVING (fs.amount - paid) > 0
         ORDER BY fs.due_date, s.first_name",
    ) {
        Ok(s) => s,
        Err(e) => return (500, json!({"error": format!("{e}")})),
    };
    let rows: Vec<Value> = match stmt.query_map(params![year_id, student_id], |r| {
        let amount: f64 = r.get(5)?;
        let paid: f64 = r.get(7)?;
        Ok(json!({
            "student_id": r.get::<_, i64>(0)?,
            "first_name": r.get::<_, Option<String>>(1)?,
            "last_name": r.get::<_, Option<String>>(2)?,
            "fee_head_id": r.get::<_, i64>(3)?,
            "fee_head_name": r.get::<_, String>(4)?,
            "amount_due": amount,
            "due_date": r.get::<_, Option<String>>(6)?,
            "amount_paid": paid,
            "balance": amount - paid,
        }))
    }) {
        Ok(mapped) => mapped.filter_map(|r| r.ok()).collect(),
        Err(e) => return (500, json!({"error": format!("{e}")})),
    };
    let total = rows.len();
    (200, json!({"outstanding": rows, "total": total}))
}

fn fee_overdue(state: &AppState, url: &str) -> (u16, Value) {
    let year_id: Option<i64> = q_param(url, "year_id").and_then(|v| v.parse().ok());
    let conn = state.conn.lock().unwrap();
    let mut stmt = match conn.prepare(
        "SELECT s.id, s.first_name, s.last_name,
                fs.fee_head_id, fh.name, fs.amount, fs.due_date,
                COALESCE((SELECT SUM(fp.amount_paid) FROM fee_payments fp
                          WHERE fp.student_id=s.id AND fp.fee_head_id=fs.fee_head_id
                            AND (?1 IS NULL OR fp.academic_year_id=?1)), 0) as paid
         FROM students s
         JOIN (SELECT DISTINCT ss.student_id, se.class_id FROM section_students ss
               JOIN sections se ON se.id = ss.section_id) sc ON sc.student_id = s.id
         JOIN fee_structures fs ON (fs.class_id IS NULL OR fs.class_id = sc.class_id)
                                AND (?1 IS NULL OR fs.academic_year_id=?1)
         JOIN fee_heads fh ON fh.id = fs.fee_head_id
         WHERE fs.due_date IS NOT NULL AND fs.due_date < date('now')
         HAVING (fs.amount - paid) > 0
         ORDER BY fs.due_date, s.first_name",
    ) {
        Ok(s) => s,
        Err(e) => return (500, json!({"error": format!("{e}")})),
    };
    let rows: Vec<Value> = match stmt.query_map(params![year_id], |r| {
        let amount: f64 = r.get(5)?;
        let paid: f64 = r.get(7)?;
        Ok(json!({
            "student_id": r.get::<_, i64>(0)?,
            "first_name": r.get::<_, Option<String>>(1)?,
            "last_name": r.get::<_, Option<String>>(2)?,
            "fee_head_id": r.get::<_, i64>(3)?,
            "fee_head_name": r.get::<_, String>(4)?,
            "amount_due": amount,
            "due_date": r.get::<_, Option<String>>(6)?,
            "amount_paid": paid,
            "balance": amount - paid,
        }))
    }) {
        Ok(mapped) => mapped.filter_map(|r| r.ok()).collect(),
        Err(e) => return (500, json!({"error": format!("{e}")})),
    };
    let total = rows.len();
    (200, json!({"overdue": rows, "total": total}))
}

// ---- Exam OS (P5) ----

fn exams_list(state: &AppState, url: &str) -> (u16, Value) {
    let year_id: Option<i64> = q_param(url, "year_id").and_then(|v| v.parse().ok());
    let conn = state.conn.lock().unwrap();
    let mut stmt = match conn.prepare(
        "SELECT id, name, exam_type, academic_year_id, term_id, start_date, end_date, created_at
         FROM exams
         WHERE (?1 IS NULL OR academic_year_id=?1)
         ORDER BY start_date DESC, name",
    ) {
        Ok(s) => s,
        Err(e) => return (500, json!({"error": format!("{e}")})),
    };
    let rows: Vec<Value> = match stmt.query_map(params![year_id], |r| {
        Ok(json!({
            "id": r.get::<_, i64>(0)?,
            "name": r.get::<_, String>(1)?,
            "exam_type": r.get::<_, Option<String>>(2)?,
            "academic_year_id": r.get::<_, Option<i64>>(3)?,
            "term_id": r.get::<_, Option<i64>>(4)?,
            "start_date": r.get::<_, Option<String>>(5)?,
            "end_date": r.get::<_, Option<String>>(6)?,
            "created_at": r.get::<_, String>(7)?,
        }))
    }) {
        Ok(mapped) => mapped.filter_map(|r| r.ok()).collect(),
        Err(e) => return (500, json!({"error": format!("{e}")})),
    };
    let total = rows.len();
    (200, json!({"exams": rows, "total": total}))
}

fn exam_create(state: &AppState, body: &str) -> (u16, Value) {
    let v: Value = serde_json::from_str(body).unwrap_or(json!({}));
    let name = match v["name"].as_str() {
        Some(n) if !n.is_empty() => n.to_string(),
        _ => return (422, json!({"error": "name required"})),
    };
    let exam_type = v["exam_type"].as_str().unwrap_or("unit").to_string();
    let year_id = v["academic_year_id"].as_i64();
    let term_id = v["term_id"].as_i64();
    let start = v["start_date"].as_str().map(|s| s.to_string());
    let end = v["end_date"].as_str().map(|s| s.to_string());
    let conn = state.conn.lock().unwrap();
    match conn.execute(
        "INSERT INTO exams(name, exam_type, academic_year_id, term_id, start_date, end_date) VALUES(?1,?2,?3,?4,?5,?6)",
        params![name, exam_type, year_id, term_id, start, end],
    ) {
        Ok(_) => (200, json!({"ok": true, "id": conn.last_insert_rowid()})),
        Err(e) => (500, json!({"error": format!("{e}")})),
    }
}

fn exam_update(state: &AppState, id: i64, body: &str) -> (u16, Value) {
    let v: Value = serde_json::from_str(body).unwrap_or(json!({}));
    let conn = state.conn.lock().unwrap();
    let _ = conn.execute(
        "UPDATE exams SET name=COALESCE(?1,name), exam_type=COALESCE(?2,exam_type),
         start_date=?3, end_date=?4 WHERE id=?5",
        params![
            v["name"].as_str().filter(|s| !s.is_empty()),
            v["exam_type"].as_str(),
            v["start_date"].as_str().map(|s| s.to_string()),
            v["end_date"].as_str().map(|s| s.to_string()),
            id
        ],
    );
    (200, json!({"ok": true}))
}

fn exam_delete(state: &AppState, id: i64) -> (u16, Value) {
    let conn = state.conn.lock().unwrap();
    let _ = conn.execute("DELETE FROM exam_marks WHERE exam_id=?1", params![id]);
    let _ = conn.execute("DELETE FROM exam_schedules WHERE exam_id=?1", params![id]);
    let _ = conn.execute("DELETE FROM exams WHERE id=?1", params![id]);
    (200, json!({"ok": true}))
}

fn exam_schedules_list(state: &AppState, url: &str) -> (u16, Value) {
    let exam_id: i64 = match q_param(url, "exam_id").and_then(|v| v.parse().ok()) {
        Some(id) => id,
        None => return (422, json!({"error": "exam_id required"})),
    };
    let conn = state.conn.lock().unwrap();
    let mut stmt = match conn.prepare(
        "SELECT es.id, es.exam_id, es.subject_id, subj.name, subj.code,
                es.section_id, sec.name, c.name,
                es.date, es.start_time, es.end_time,
                es.room_id, r.name,
                es.invigilator_id, st.first_name, st.last_name
         FROM exam_schedules es
         LEFT JOIN subjects subj ON subj.id = es.subject_id
         LEFT JOIN sections sec ON sec.id = es.section_id
         LEFT JOIN classes c ON c.id = sec.class_id
         LEFT JOIN classrooms r ON r.id = es.room_id
         LEFT JOIN staff st ON st.id = es.invigilator_id
         WHERE es.exam_id = ?1
         ORDER BY es.date, es.start_time, subj.name",
    ) {
        Ok(s) => s,
        Err(e) => return (500, json!({"error": format!("{e}")})),
    };
    let rows: Vec<Value> = match stmt.query_map(params![exam_id], |r| {
        let ifn: Option<String> = r.get(14)?;
        let iln: Option<String> = r.get(15)?;
        let inv_name: Option<String> = match (ifn.as_deref(), iln.as_deref()) {
            (Some(f), Some(l)) => Some(format!("{f} {l}")),
            (Some(f), None) => Some(f.to_string()),
            (None, Some(l)) => Some(l.to_string()),
            _ => None,
        };
        Ok(json!({
            "id": r.get::<_, i64>(0)?,
            "exam_id": r.get::<_, i64>(1)?,
            "subject_id": r.get::<_, Option<i64>>(2)?,
            "subject_name": r.get::<_, Option<String>>(3)?,
            "subject_code": r.get::<_, Option<String>>(4)?,
            "section_id": r.get::<_, Option<i64>>(5)?,
            "section_name": r.get::<_, Option<String>>(6)?,
            "class_name": r.get::<_, Option<String>>(7)?,
            "date": r.get::<_, Option<String>>(8)?,
            "start_time": r.get::<_, Option<String>>(9)?,
            "end_time": r.get::<_, Option<String>>(10)?,
            "room_id": r.get::<_, Option<i64>>(11)?,
            "room_name": r.get::<_, Option<String>>(12)?,
            "invigilator_id": r.get::<_, Option<i64>>(13)?,
            "invigilator_name": inv_name,
        }))
    }) {
        Ok(mapped) => mapped.filter_map(|r| r.ok()).collect(),
        Err(e) => return (500, json!({"error": format!("{e}")})),
    };
    let total = rows.len();
    (200, json!({"schedules": rows, "total": total}))
}

fn exam_schedule_save(state: &AppState, body: &str) -> (u16, Value) {
    let v: Value = serde_json::from_str(body).unwrap_or(json!({}));
    let exam_id = match v["exam_id"].as_i64() { Some(x) => x, None => return (422, json!({"error": "exam_id required"})) };
    let subject_id = v["subject_id"].as_i64();
    let section_id = v["section_id"].as_i64();
    let date = v["date"].as_str().map(|s| s.to_string());
    let start = v["start_time"].as_str().map(|s| s.to_string());
    let end = v["end_time"].as_str().map(|s| s.to_string());
    let room_id = v["room_id"].as_i64();
    let inv_id = v["invigilator_id"].as_i64();
    let conn = state.conn.lock().unwrap();
    let r = conn.execute(
        "INSERT INTO exam_schedules(exam_id,subject_id,section_id,date,start_time,end_time,room_id,invigilator_id)
         VALUES(?1,?2,?3,?4,?5,?6,?7,?8)
         ON CONFLICT(exam_id,subject_id,section_id) DO UPDATE SET
           date=excluded.date, start_time=excluded.start_time, end_time=excluded.end_time,
           room_id=excluded.room_id, invigilator_id=excluded.invigilator_id",
        params![exam_id, subject_id, section_id, date, start, end, room_id, inv_id],
    );
    match r {
        Ok(_) => (200, json!({"ok": true})),
        Err(e) => (500, json!({"error": format!("{e}")})),
    }
}

fn exam_marks_list(state: &AppState, url: &str) -> (u16, Value) {
    let exam_id: i64 = match q_param(url, "exam_id").and_then(|v| v.parse().ok()) {
        Some(id) => id,
        None => return (422, json!({"error": "exam_id required"})),
    };
    let subject_id: Option<i64> = q_param(url, "subject_id").and_then(|v| v.parse().ok());
    let conn = state.conn.lock().unwrap();
    let mut stmt = match conn.prepare(
        "SELECT em.id, em.exam_id, em.student_id, s.first_name, s.last_name,
                em.subject_id, subj.name, subj.code,
                em.marks_obtained, em.max_marks, em.grade, em.remarks
         FROM exam_marks em
         JOIN students s ON s.id = em.student_id
         LEFT JOIN subjects subj ON subj.id = em.subject_id
         WHERE em.exam_id=?1 AND (?2 IS NULL OR em.subject_id=?2)
         ORDER BY s.first_name, s.last_name",
    ) {
        Ok(s) => s,
        Err(e) => return (500, json!({"error": format!("{e}")})),
    };
    let rows: Vec<Value> = match stmt.query_map(params![exam_id, subject_id], |r| {
        Ok(json!({
            "id": r.get::<_, i64>(0)?,
            "exam_id": r.get::<_, i64>(1)?,
            "student_id": r.get::<_, i64>(2)?,
            "first_name": r.get::<_, Option<String>>(3)?,
            "last_name": r.get::<_, Option<String>>(4)?,
            "subject_id": r.get::<_, i64>(5)?,
            "subject_name": r.get::<_, Option<String>>(6)?,
            "subject_code": r.get::<_, Option<String>>(7)?,
            "marks_obtained": r.get::<_, Option<f64>>(8)?,
            "max_marks": r.get::<_, Option<f64>>(9)?,
            "grade": r.get::<_, Option<String>>(10)?,
            "remarks": r.get::<_, Option<String>>(11)?,
        }))
    }) {
        Ok(mapped) => mapped.filter_map(|r| r.ok()).collect(),
        Err(e) => return (500, json!({"error": format!("{e}")})),
    };
    let total = rows.len();
    (200, json!({"marks": rows, "total": total}))
}

fn exam_marks_save(state: &AppState, body: &str) -> (u16, Value) {
    let v: Value = serde_json::from_str(body).unwrap_or(json!({}));
    let exam_id = match v["exam_id"].as_i64() { Some(x) => x, None => return (422, json!({"error": "exam_id required"})) };
    let records = match v["records"].as_array() { Some(r) => r.clone(), None => return (422, json!({"error": "records required"})) };
    let conn = state.conn.lock().unwrap();
    let mut saved = 0i64;
    for rec in &records {
        let student_id = rec["student_id"].as_i64().unwrap_or(0);
        let subject_id = rec["subject_id"].as_i64().unwrap_or(0);
        let marks = rec["marks_obtained"].as_f64();
        let max = rec["max_marks"].as_f64();
        let grade = rec["grade"].as_str().map(|s| s.to_string());
        let remarks = rec["remarks"].as_str().map(|s| s.to_string());
        let _ = conn.execute(
            "INSERT INTO exam_marks(exam_id,student_id,subject_id,marks_obtained,max_marks,grade,remarks)
             VALUES(?1,?2,?3,?4,?5,?6,?7)
             ON CONFLICT(exam_id,student_id,subject_id) DO UPDATE SET
               marks_obtained=excluded.marks_obtained, max_marks=excluded.max_marks,
               grade=excluded.grade, remarks=excluded.remarks",
            params![exam_id, student_id, subject_id, marks, max, grade, remarks],
        );
        saved += 1;
    }
    (200, json!({"ok": true, "saved": saved}))
}

fn exam_marks_report(state: &AppState, url: &str) -> (u16, Value) {
    let exam_id: i64 = match q_param(url, "exam_id").and_then(|v| v.parse().ok()) {
        Some(id) => id,
        None => return (422, json!({"error": "exam_id required"})),
    };
    let section_id: Option<i64> = q_param(url, "section_id").and_then(|v| v.parse().ok());
    let conn = state.conn.lock().unwrap();
    let mut stmt = match conn.prepare(
        "SELECT em.student_id, s.first_name, s.last_name,
                SUM(em.marks_obtained) as total_obtained,
                SUM(em.max_marks) as total_max,
                COUNT(em.id) as subjects_count
         FROM exam_marks em
         JOIN students s ON s.id = em.student_id
         LEFT JOIN section_students ss ON ss.student_id = em.student_id
         WHERE em.exam_id=?1 AND (?2 IS NULL OR ss.section_id=?2)
         GROUP BY em.student_id, s.first_name, s.last_name
         ORDER BY total_obtained DESC",
    ) {
        Ok(s) => s,
        Err(e) => return (500, json!({"error": format!("{e}")})),
    };
    let rows: Vec<Value> = match stmt.query_map(params![exam_id, section_id], |r| {
        let obtained: f64 = r.get::<_, Option<f64>>(3)?.unwrap_or(0.0);
        let max: f64 = r.get::<_, Option<f64>>(4)?.unwrap_or(0.0);
        let pct = if max > 0.0 { obtained / max * 100.0 } else { 0.0 };
        Ok(json!({
            "student_id": r.get::<_, i64>(0)?,
            "first_name": r.get::<_, Option<String>>(1)?,
            "last_name": r.get::<_, Option<String>>(2)?,
            "total_obtained": obtained,
            "total_max": max,
            "subjects_count": r.get::<_, Option<i64>>(5)?.unwrap_or(0),
            "percentage": (pct * 10.0).round() / 10.0,
        }))
    }) {
        Ok(mapped) => mapped.filter_map(|r| r.ok()).collect(),
        Err(e) => return (500, json!({"error": format!("{e}")})),
    };
    let total = rows.len();
    (200, json!({"report": rows, "total": total}))
}

// ---- Staff OS (P4) ----

fn departments_list(state: &AppState) -> (u16, Value) {
    let conn = state.conn.lock().unwrap();
    let mut stmt = match conn.prepare(
        "SELECT d.id, d.name, d.head_staff_id,
                st.first_name, st.last_name,
                COUNT(s.id) AS staff_count
         FROM departments d
         LEFT JOIN staff st ON st.id = d.head_staff_id
         LEFT JOIN staff s ON s.department_id = d.id
         GROUP BY d.id
         ORDER BY d.name",
    ) {
        Ok(s) => s,
        Err(e) => return (500, json!({"error": format!("{e}")})),
    };
    let rows: Vec<Value> = match stmt.query_map([], |r| {
        let hid: Option<i64> = r.get(2)?;
        let hfn: Option<String> = r.get(3)?;
        let hln: Option<String> = r.get(4)?;
        let head_name = match (hfn.as_deref(), hln.as_deref()) {
            (Some(f), Some(l)) => Some(format!("{f} {l}")),
            (Some(f), None) => Some(f.to_string()),
            (None, Some(l)) => Some(l.to_string()),
            _ => None,
        };
        Ok(json!({
            "id": r.get::<_, i64>(0)?,
            "name": r.get::<_, String>(1)?,
            "head_staff_id": hid,
            "head_name": head_name,
            "staff_count": r.get::<_, Option<i64>>(5)?.unwrap_or(0),
        }))
    }) {
        Ok(mapped) => mapped.filter_map(|r| r.ok()).collect(),
        Err(e) => return (500, json!({"error": format!("{e}")})),
    };
    let total = rows.len();
    (200, json!({"departments": rows, "total": total}))
}

fn department_create(state: &AppState, body: &str) -> (u16, Value) {
    let v: Value = serde_json::from_str(body).unwrap_or(json!({}));
    let name = match v["name"].as_str() {
        Some(n) if !n.is_empty() => n.to_string(),
        _ => return (422, json!({"error": "name required"})),
    };
    let head_id = v["head_staff_id"].as_i64();
    let conn = state.conn.lock().unwrap();
    match conn.execute(
        "INSERT INTO departments(name, head_staff_id) VALUES(?1, ?2)",
        params![name, head_id],
    ) {
        Ok(_) => (200, json!({"ok": true, "id": conn.last_insert_rowid()})),
        Err(e) => (500, json!({"error": format!("{e}")})),
    }
}

fn department_update(state: &AppState, id: i64, body: &str) -> (u16, Value) {
    let v: Value = serde_json::from_str(body).unwrap_or(json!({}));
    let name = v["name"].as_str().map(|s| s.to_string());
    let head_id = v["head_staff_id"].as_i64();
    let conn = state.conn.lock().unwrap();
    let _ = conn.execute(
        "UPDATE departments SET name=COALESCE(?1, name), head_staff_id=COALESCE(?2, head_staff_id) WHERE id=?3",
        params![name, head_id, id],
    );
    (200, json!({"ok": true}))
}

fn department_delete(state: &AppState, id: i64) -> (u16, Value) {
    let conn = state.conn.lock().unwrap();
    // Clear FK on staff before deleting
    let _ = conn.execute("UPDATE staff SET department_id=NULL WHERE department_id=?1", params![id]);
    let _ = conn.execute("DELETE FROM departments WHERE id=?1", params![id]);
    (200, json!({"ok": true}))
}

fn payroll_structure_get(state: &AppState, url: &str) -> (u16, Value) {
    let staff_id: i64 = match q_param(url, "staff_id").and_then(|v| v.parse().ok()) {
        Some(id) => id,
        None => return (422, json!({"error": "staff_id required"})),
    };
    let conn = state.conn.lock().unwrap();
    let r = conn.query_row(
        "SELECT id, staff_id, basic, hra, da, ta, other_allowances,
                pf_deduction, pt_deduction, other_deductions, effective_from
         FROM salary_structures WHERE staff_id=?1",
        params![staff_id],
        |r| Ok(json!({
            "id": r.get::<_, i64>(0)?,
            "staff_id": r.get::<_, i64>(1)?,
            "basic": r.get::<_, f64>(2)?,
            "hra": r.get::<_, f64>(3)?,
            "da": r.get::<_, f64>(4)?,
            "ta": r.get::<_, f64>(5)?,
            "other_allowances": r.get::<_, f64>(6)?,
            "pf_deduction": r.get::<_, f64>(7)?,
            "pt_deduction": r.get::<_, f64>(8)?,
            "other_deductions": r.get::<_, f64>(9)?,
            "effective_from": r.get::<_, Option<String>>(10)?,
        })),
    );
    match r {
        Ok(v) => (200, json!({"structure": v})),
        Err(_) => (200, json!({"structure": null})),
    }
}

fn payroll_structure_save(state: &AppState, body: &str) -> (u16, Value) {
    let v: Value = serde_json::from_str(body).unwrap_or(json!({}));
    let staff_id = match v["staff_id"].as_i64() {
        Some(x) => x,
        None => return (422, json!({"error": "staff_id required"})),
    };
    let basic = v["basic"].as_f64().unwrap_or(0.0);
    let hra = v["hra"].as_f64().unwrap_or(0.0);
    let da = v["da"].as_f64().unwrap_or(0.0);
    let ta = v["ta"].as_f64().unwrap_or(0.0);
    let other_allow = v["other_allowances"].as_f64().unwrap_or(0.0);
    let pf = v["pf_deduction"].as_f64().unwrap_or(0.0);
    let pt = v["pt_deduction"].as_f64().unwrap_or(0.0);
    let other_ded = v["other_deductions"].as_f64().unwrap_or(0.0);
    let eff_from = v["effective_from"].as_str().map(|s| s.to_string());
    let conn = state.conn.lock().unwrap();
    let r = conn.execute(
        "INSERT INTO salary_structures(staff_id,basic,hra,da,ta,other_allowances,pf_deduction,pt_deduction,other_deductions,effective_from,updated_at)
         VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,datetime('now'))
         ON CONFLICT(staff_id) DO UPDATE SET
           basic=excluded.basic, hra=excluded.hra, da=excluded.da,
           ta=excluded.ta, other_allowances=excluded.other_allowances,
           pf_deduction=excluded.pf_deduction, pt_deduction=excluded.pt_deduction,
           other_deductions=excluded.other_deductions, effective_from=excluded.effective_from,
           updated_at=datetime('now')",
        params![staff_id, basic, hra, da, ta, other_allow, pf, pt, other_ded, eff_from],
    );
    match r {
        Ok(_) => (200, json!({"ok": true})),
        Err(e) => (500, json!({"error": format!("{e}")})),
    }
}

fn payslips_list(state: &AppState, url: &str) -> (u16, Value) {
    let staff_id: Option<i64> = q_param(url, "staff_id").and_then(|v| v.parse().ok());
    let month = q_param(url, "month");
    let conn = state.conn.lock().unwrap();
    let mut stmt = match conn.prepare(
        "SELECT p.id, p.staff_id, st.first_name, st.last_name,
                p.month, p.basic, p.hra, p.da, p.ta, p.other_allowances,
                p.pf_deduction, p.pt_deduction, p.other_deductions,
                p.gross, p.net, p.working_days, p.paid_days, p.generated_at
         FROM payslips p
         JOIN staff st ON st.id = p.staff_id
         WHERE (?1 IS NULL OR p.staff_id=?1)
           AND (?2 IS NULL OR p.month=?2)
         ORDER BY p.month DESC, st.first_name",
    ) {
        Ok(s) => s,
        Err(e) => return (500, json!({"error": format!("{e}")})),
    };
    let rows: Vec<Value> = match stmt.query_map(params![staff_id, month], |r| {
        Ok(json!({
            "id": r.get::<_, i64>(0)?,
            "staff_id": r.get::<_, i64>(1)?,
            "first_name": r.get::<_, Option<String>>(2)?,
            "last_name": r.get::<_, Option<String>>(3)?,
            "month": r.get::<_, String>(4)?,
            "basic": r.get::<_, f64>(5)?,
            "hra": r.get::<_, f64>(6)?,
            "da": r.get::<_, f64>(7)?,
            "ta": r.get::<_, f64>(8)?,
            "other_allowances": r.get::<_, f64>(9)?,
            "pf_deduction": r.get::<_, f64>(10)?,
            "pt_deduction": r.get::<_, f64>(11)?,
            "other_deductions": r.get::<_, f64>(12)?,
            "gross": r.get::<_, f64>(13)?,
            "net": r.get::<_, f64>(14)?,
            "working_days": r.get::<_, Option<i64>>(15)?,
            "paid_days": r.get::<_, Option<i64>>(16)?,
            "generated_at": r.get::<_, String>(17)?,
        }))
    }) {
        Ok(mapped) => mapped.filter_map(|r| r.ok()).collect(),
        Err(e) => return (500, json!({"error": format!("{e}")})),
    };
    let total = rows.len();
    (200, json!({"payslips": rows, "total": total}))
}

fn payroll_generate(state: &AppState, body: &str) -> (u16, Value) {
    let v: Value = serde_json::from_str(body).unwrap_or(json!({}));
    let month = match v["month"].as_str() {
        Some(m) if !m.is_empty() => m.to_string(),
        _ => return (422, json!({"error": "month required (YYYY-MM)"})),
    };
    let staff_ids: Vec<i64> = v["staff_ids"]
        .as_array()
        .map(|arr| arr.iter().filter_map(|x| x.as_i64()).collect())
        .unwrap_or_default();
    let working_days = v["working_days"].as_i64().unwrap_or(26);
    let paid_days = v["paid_days"].as_i64(); // per-staff override if needed
    let conn = state.conn.lock().unwrap();
    let mut generated = 0i64;
    for sid in &staff_ids {
        let ss = conn.query_row(
            "SELECT basic, hra, da, ta, other_allowances, pf_deduction, pt_deduction, other_deductions
             FROM salary_structures WHERE staff_id=?1",
            params![sid],
            |r| Ok((
                r.get::<_, f64>(0)?, r.get::<_, f64>(1)?, r.get::<_, f64>(2)?,
                r.get::<_, f64>(3)?, r.get::<_, f64>(4)?,
                r.get::<_, f64>(5)?, r.get::<_, f64>(6)?, r.get::<_, f64>(7)?,
            )),
        );
        if let Ok((basic, hra, da, ta, other_allow, pf, pt, other_ded)) = ss {
            let pd = paid_days.unwrap_or(working_days);
            let ratio = if working_days > 0 { pd as f64 / working_days as f64 } else { 1.0 };
            let gross = (basic + hra + da + ta + other_allow) * ratio;
            let net = gross - pf - pt - other_ded;
            let _ = conn.execute(
                "INSERT INTO payslips(staff_id,month,basic,hra,da,ta,other_allowances,
                  pf_deduction,pt_deduction,other_deductions,gross,net,working_days,paid_days)
                 VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14)
                 ON CONFLICT(staff_id,month) DO UPDATE SET
                   basic=excluded.basic, hra=excluded.hra, da=excluded.da,
                   ta=excluded.ta, other_allowances=excluded.other_allowances,
                   pf_deduction=excluded.pf_deduction, pt_deduction=excluded.pt_deduction,
                   other_deductions=excluded.other_deductions, gross=excluded.gross,
                   net=excluded.net, working_days=excluded.working_days,
                   paid_days=excluded.paid_days, generated_at=datetime('now')",
                params![sid, month, basic*ratio, hra*ratio, da*ratio, ta*ratio, other_allow*ratio,
                        pf, pt, other_ded, gross, net, working_days, pd],
            );
            generated += 1;
        }
    }
    (200, json!({"ok": true, "generated": generated, "month": month}))
}

fn leave_list(state: &AppState, url: &str) -> (u16, Value) {
    let status = q_param(url, "status");
    let staff_id: Option<i64> = q_param(url, "staff_id").and_then(|v| v.parse().ok());
    let conn = state.conn.lock().unwrap();
    let sql = "SELECT lr.id, lr.staff_id, st.first_name, st.last_name,
                      lr.leave_type, lr.from_date, lr.to_date, lr.reason,
                      lr.status, lr.approved_by, lr.created_at
               FROM leave_requests lr
               JOIN staff st ON st.id = lr.staff_id
               WHERE (?1 IS NULL OR lr.status = ?1)
                 AND (?2 IS NULL OR lr.staff_id = ?2)
               ORDER BY lr.created_at DESC";
    let mut stmt = match conn.prepare(sql) {
        Ok(s) => s,
        Err(e) => return (500, json!({"error": format!("{e}")})),
    };
    let rows: Vec<Value> = match stmt.query_map(params![status, staff_id], |r| {
        Ok(json!({
            "id": r.get::<_, i64>(0)?,
            "staff_id": r.get::<_, i64>(1)?,
            "first_name": r.get::<_, Option<String>>(2)?,
            "last_name": r.get::<_, Option<String>>(3)?,
            "leave_type": r.get::<_, Option<String>>(4)?,
            "from_date": r.get::<_, String>(5)?,
            "to_date": r.get::<_, String>(6)?,
            "reason": r.get::<_, Option<String>>(7)?,
            "status": r.get::<_, String>(8)?,
            "approved_by": r.get::<_, Option<i64>>(9)?,
            "created_at": r.get::<_, String>(10)?,
        }))
    }) {
        Ok(mapped) => mapped.filter_map(|r| r.ok()).collect(),
        Err(e) => return (500, json!({"error": format!("{e}")})),
    };
    let total = rows.len();
    (200, json!({"leave_requests": rows, "total": total}))
}

fn leave_create(state: &AppState, uid: i64, body: &str) -> (u16, Value) {
    let v: Value = serde_json::from_str(body).unwrap_or(json!({}));
    let staff_id = v["staff_id"].as_i64().unwrap_or(uid);
    let leave_type = v["leave_type"].as_str().unwrap_or("sick");
    let from_date = match v["from_date"].as_str() {
        Some(d) if !d.is_empty() => d.to_string(),
        _ => return (422, json!({"error": "from_date required"})),
    };
    let to_date = match v["to_date"].as_str() {
        Some(d) if !d.is_empty() => d.to_string(),
        _ => return (422, json!({"error": "to_date required"})),
    };
    let reason = v["reason"].as_str().map(|s| s.to_string());
    let conn = state.conn.lock().unwrap();
    match conn.execute(
        "INSERT INTO leave_requests(staff_id, leave_type, from_date, to_date, reason) VALUES(?1,?2,?3,?4,?5)",
        params![staff_id, leave_type, from_date, to_date, reason],
    ) {
        Ok(_) => (200, json!({"ok": true, "id": conn.last_insert_rowid()})),
        Err(e) => (500, json!({"error": format!("{e}")})),
    }
}

fn leave_approve(state: &AppState, uid: i64, body: &str) -> (u16, Value) {
    let v: Value = serde_json::from_str(body).unwrap_or(json!({}));
    let id = match v["id"].as_i64() {
        Some(x) => x,
        None => return (422, json!({"error": "id required"})),
    };
    let conn = state.conn.lock().unwrap();
    // Fetch leave request to get staff_id + dates for substitution trigger
    let leave = conn.query_row(
        "SELECT staff_id, from_date, to_date FROM leave_requests WHERE id=?1",
        params![id],
        |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?)),
    );
    let _ = conn.execute(
        "UPDATE leave_requests SET status='approved', approved_by=?1, approved_at=datetime('now') WHERE id=?2",
        params![uid, id],
    );
    // Auto-create substitution records for first leave day (timetable DOW match)
    if let Ok((staff_id, from, _to)) = &leave {
        if let Some(dow) = date_to_dow(from) {
            let entries: Vec<i64> = {
                let mut stmt = match conn.prepare(
                    "SELECT id FROM timetable_entries WHERE staff_id=?1 AND day_of_week=?2"
                ) {
                    Ok(s) => s,
                    Err(_) => return (200, json!({"ok": true})),
                };
                let collected: Vec<i64> = match stmt.query_map(params![staff_id, dow], |r| r.get::<_, i64>(0)) {
                    Ok(rows) => rows.filter_map(|r| r.ok()).collect(),
                    Err(_) => vec![],
                }; collected
            };
            for entry_id in entries {
                let _ = conn.execute(
                    "INSERT OR IGNORE INTO substitutions(original_entry_id, original_staff_id, date, reason, status)
                     VALUES(?1, ?2, ?3, 'Leave approved', 'pending')",
                    params![entry_id, staff_id, from],
                );
            }
        }
    }
    (200, json!({"ok": true}))
}

fn leave_reject(state: &AppState, uid: i64, body: &str) -> (u16, Value) {
    let v: Value = serde_json::from_str(body).unwrap_or(json!({}));
    let id = match v["id"].as_i64() {
        Some(x) => x,
        None => return (422, json!({"error": "id required"})),
    };
    let conn = state.conn.lock().unwrap();
    let _ = conn.execute(
        "UPDATE leave_requests SET status='rejected', approved_by=?1, approved_at=datetime('now') WHERE id=?2",
        params![uid, id],
    );
    (200, json!({"ok": true}))
}

// ---- Attendance OS (P3) ----

fn section_students_list(state: &AppState, url: &str) -> (u16, Value) {
    let section_id: i64 = match q_param(url, "section_id").and_then(|v| v.parse().ok()) {
        Some(id) => id,
        None => return (422, json!({"error": "section_id required"})),
    };
    let conn = state.conn.lock().unwrap();
    let mut stmt = match conn.prepare(
        "SELECT s.id, s.first_name, s.last_name, s.email, s.gender, ss.enrolled_date
         FROM section_students ss
         JOIN students s ON s.id = ss.student_id
         WHERE ss.section_id = ?1
         ORDER BY s.first_name, s.last_name",
    ) {
        Ok(s) => s,
        Err(e) => return (500, json!({"error": format!("{e}")})),
    };
    let rows: Vec<Value> = match stmt.query_map(params![section_id], |r| {
        Ok(json!({
            "id": r.get::<_, i64>(0)?,
            "first_name": r.get::<_, Option<String>>(1)?,
            "last_name": r.get::<_, Option<String>>(2)?,
            "email": r.get::<_, Option<String>>(3)?,
            "gender": r.get::<_, Option<String>>(4)?,
            "enrolled_date": r.get::<_, Option<String>>(5)?,
        }))
    }) {
        Ok(mapped) => mapped.filter_map(|r| r.ok()).collect(),
        Err(e) => return (500, json!({"error": format!("{e}")})),
    };
    let total = rows.len();
    (200, json!({"students": rows, "total": total}))
}

fn section_students_enroll(state: &AppState, body: &str) -> (u16, Value) {
    let v: Value = serde_json::from_str(body).unwrap_or(json!({}));
    let section_id = match v["section_id"].as_i64() {
        Some(x) => x,
        None => return (422, json!({"error": "section_id required"})),
    };
    let student_id = match v["student_id"].as_i64() {
        Some(x) => x,
        None => return (422, json!({"error": "student_id required"})),
    };
    let date = v["enrolled_date"].as_str().map(|s| s.to_string());
    let conn = state.conn.lock().unwrap();
    let r = conn.execute(
        "INSERT OR IGNORE INTO section_students(section_id, student_id, enrolled_date) VALUES(?1,?2,?3)",
        params![section_id, student_id, date],
    );
    match r {
        Ok(_) => (200, json!({"ok": true})),
        Err(e) => (500, json!({"error": format!("{e}")})),
    }
}

fn section_students_remove(state: &AppState, body: &str) -> (u16, Value) {
    let v: Value = serde_json::from_str(body).unwrap_or(json!({}));
    let section_id = v["section_id"].as_i64().unwrap_or(0);
    let student_id = v["student_id"].as_i64().unwrap_or(0);
    let conn = state.conn.lock().unwrap();
    let _ = conn.execute(
        "DELETE FROM section_students WHERE section_id=?1 AND student_id=?2",
        params![section_id, student_id],
    );
    (200, json!({"ok": true}))
}

fn attendance_get(state: &AppState, url: &str) -> (u16, Value) {
    let section_id: i64 = match q_param(url, "section_id").and_then(|v| v.parse().ok()) {
        Some(id) => id,
        None => return (422, json!({"error": "section_id required"})),
    };
    let date = match q_param(url, "date") {
        Some(d) => d,
        None => return (422, json!({"error": "date required"})),
    };
    let period_id: i64 = match q_param(url, "period_id").and_then(|v| v.parse().ok()) {
        Some(id) => id,
        None => return (422, json!({"error": "period_id required"})),
    };
    let conn = state.conn.lock().unwrap();
    let mut stmt = match conn.prepare(
        "SELECT s.id, s.first_name, s.last_name,
                COALESCE(sa.status, 'unmarked') AS status, sa.note
         FROM section_students ss
         JOIN students s ON s.id = ss.student_id
         LEFT JOIN student_attendance sa
           ON sa.student_id = ss.student_id AND sa.date = ?2 AND sa.period_id = ?3
         WHERE ss.section_id = ?1
         ORDER BY s.first_name, s.last_name",
    ) {
        Ok(s) => s,
        Err(e) => return (500, json!({"error": format!("{e}")})),
    };
    let rows: Vec<Value> = match stmt.query_map(params![section_id, date, period_id], |r| {
        Ok(json!({
            "student_id": r.get::<_, i64>(0)?,
            "first_name": r.get::<_, Option<String>>(1)?,
            "last_name": r.get::<_, Option<String>>(2)?,
            "status": r.get::<_, String>(3)?,
            "note": r.get::<_, Option<String>>(4)?,
        }))
    }) {
        Ok(mapped) => mapped.filter_map(|r| r.ok()).collect(),
        Err(e) => return (500, json!({"error": format!("{e}")})),
    };
    (200, json!({"students": rows, "section_id": section_id, "date": date, "period_id": period_id}))
}

fn attendance_mark(state: &AppState, uid: i64, body: &str) -> (u16, Value) {
    let v: Value = serde_json::from_str(body).unwrap_or(json!({}));
    let section_id = match v["section_id"].as_i64() {
        Some(x) => x,
        None => return (422, json!({"error": "section_id required"})),
    };
    let date = match v["date"].as_str() {
        Some(d) if !d.is_empty() => d.to_string(),
        _ => return (422, json!({"error": "date required"})),
    };
    let period_id = match v["period_id"].as_i64() {
        Some(x) => x,
        None => return (422, json!({"error": "period_id required"})),
    };
    let records = match v["records"].as_array() {
        Some(r) => r.clone(),
        None => return (422, json!({"error": "records required"})),
    };
    let conn = state.conn.lock().unwrap();
    let mut saved = 0i64;
    for rec in &records {
        let student_id = rec["student_id"].as_i64().unwrap_or(0);
        let status = rec["status"].as_str().unwrap_or("present");
        let note = rec["note"].as_str().map(|s| s.to_string());
        let _ = conn.execute(
            "INSERT INTO student_attendance(student_id, section_id, date, period_id, status, marked_by, note)
             VALUES(?1,?2,?3,?4,?5,?6,?7)
             ON CONFLICT(student_id, date, period_id) DO UPDATE SET
               status=excluded.status, marked_by=excluded.marked_by, note=excluded.note,
               marked_at=datetime('now')",
            params![student_id, section_id, date, period_id, status, uid, note],
        );
        saved += 1;
    }
    (200, json!({"ok": true, "saved": saved}))
}

fn attendance_summary(state: &AppState, url: &str) -> (u16, Value) {
    let section_id: i64 = match q_param(url, "section_id").and_then(|v| v.parse().ok()) {
        Some(id) => id,
        None => return (422, json!({"error": "section_id required"})),
    };
    let from = q_param(url, "from").unwrap_or_else(|| "1900-01-01".into());
    let to = q_param(url, "to").unwrap_or_else(|| "2099-12-31".into());
    let conn = state.conn.lock().unwrap();
    let mut stmt = match conn.prepare(
        "SELECT ss.student_id, s.first_name, s.last_name,
                COUNT(CASE WHEN sa.status='present' THEN 1 END) as present_days,
                COUNT(CASE WHEN sa.status='absent'  THEN 1 END) as absent_days,
                COUNT(CASE WHEN sa.status='late'    THEN 1 END) as late_days,
                COUNT(CASE WHEN sa.status='excused' THEN 1 END) as excused_days,
                COUNT(sa.id) as total_marked
         FROM section_students ss
         JOIN students s ON s.id = ss.student_id
         LEFT JOIN student_attendance sa
           ON sa.student_id = ss.student_id AND sa.section_id = ss.section_id
           AND sa.date >= ?2 AND sa.date <= ?3
         WHERE ss.section_id = ?1
         GROUP BY ss.student_id, s.first_name, s.last_name
         ORDER BY s.first_name, s.last_name",
    ) {
        Ok(s) => s,
        Err(e) => return (500, json!({"error": format!("{e}")})),
    };
    let rows: Vec<Value> = match stmt.query_map(params![section_id, from, to], |r| {
        let total: i64 = r.get::<_, Option<i64>>(7)?.unwrap_or(0);
        let present: i64 = r.get::<_, Option<i64>>(3)?.unwrap_or(0);
        let late: i64 = r.get::<_, Option<i64>>(5)?.unwrap_or(0);
        let pct = if total > 0 { (present + late) as f64 / total as f64 * 100.0 } else { 0.0 };
        Ok(json!({
            "student_id": r.get::<_, i64>(0)?,
            "first_name": r.get::<_, Option<String>>(1)?,
            "last_name": r.get::<_, Option<String>>(2)?,
            "present_days": present,
            "absent_days": r.get::<_, Option<i64>>(4)?.unwrap_or(0),
            "late_days": late,
            "excused_days": r.get::<_, Option<i64>>(6)?.unwrap_or(0),
            "total_marked": total,
            "attendance_pct": (pct * 10.0).round() / 10.0,
        }))
    }) {
        Ok(mapped) => mapped.filter_map(|r| r.ok()).collect(),
        Err(e) => return (500, json!({"error": format!("{e}")})),
    };
    (200, json!({"summary": rows, "section_id": section_id, "from": from, "to": to}))
}

fn attendance_alerts(state: &AppState) -> (u16, Value) {
    let conn = state.conn.lock().unwrap();
    let mut stmt = match conn.prepare(
        "SELECT s.id, s.first_name, s.last_name, sec.id, sec.name, c.name,
                COUNT(CASE WHEN sa.status='present' OR sa.status='late' THEN 1 END) as attended,
                COUNT(sa.id) as total
         FROM section_students ss
         JOIN students s ON s.id = ss.student_id
         JOIN sections sec ON sec.id = ss.section_id
         JOIN classes c ON c.id = sec.class_id
         LEFT JOIN student_attendance sa ON sa.student_id = ss.student_id AND sa.section_id = ss.section_id
         GROUP BY s.id, ss.section_id
         HAVING total > 5 AND CAST(attended AS REAL)/CAST(total AS REAL) < 0.75
         ORDER BY CAST(attended AS REAL)/CAST(total AS REAL) ASC
         LIMIT 50",
    ) {
        Ok(s) => s,
        Err(e) => return (500, json!({"error": format!("{e}")})),
    };
    let rows: Vec<Value> = match stmt.query_map([], |r| {
        let attended: i64 = r.get::<_, Option<i64>>(6)?.unwrap_or(0);
        let total: i64 = r.get::<_, Option<i64>>(7)?.unwrap_or(0);
        let pct = if total > 0 { attended as f64 / total as f64 * 100.0 } else { 0.0 };
        Ok(json!({
            "student_id": r.get::<_, i64>(0)?,
            "first_name": r.get::<_, Option<String>>(1)?,
            "last_name": r.get::<_, Option<String>>(2)?,
            "section_id": r.get::<_, i64>(3)?,
            "section_name": r.get::<_, Option<String>>(4)?,
            "class_name": r.get::<_, Option<String>>(5)?,
            "attended": attended,
            "total": total,
            "attendance_pct": (pct * 10.0).round() / 10.0,
        }))
    }) {
        Ok(mapped) => mapped.filter_map(|r| r.ok()).collect(),
        Err(e) => return (500, json!({"error": format!("{e}")})),
    };
    let total = rows.len();
    (200, json!({"alerts": rows, "total": total}))
}

// ---- .leosdb portable archive (ZIP: manifest + school.sqlite + media/docs) ----

fn leosdb_save(body: &str) -> (u16, Value) {
    let v: Value = serde_json::from_str(body).unwrap_or(json!({}));
    let out = v["path"]
        .as_str()
        .filter(|s| !s.is_empty())
        .unwrap_or("LEOS.leosdb")
        .to_string();
    match write_leosdb(&out) {
        Ok(checksum) => (200, json!({"ok": true, "path": out, "checksum": checksum})),
        Err(e) => (500, json!({"error": format!("save failed: {e}")})),
    }
}

fn write_leosdb(out: &str) -> Result<String, Box<dyn std::error::Error>> {
    use std::io::Write;
    let sqlite_bytes = std::fs::read("school.sqlite")?;
    let checksum = sha256_hex(&sqlite_bytes);
    let created = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let manifest =
        json!({"app": "LEOS", "schema": 1, "created": created, "files": ["school.sqlite"]})
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

fn leosdb_open(state: &AppState, body: &str) -> (u16, Value) {
    let v: Value = serde_json::from_str(body).unwrap_or(json!({}));
    let path = match v["path"].as_str() {
        Some(p) if !p.is_empty() => p.to_string(),
        _ => return (422, json!({"error": "path required"})),
    };
    match read_leosdb(state, &path) {
        Ok(()) => (200, json!({"ok": true, "opened": path})),
        Err(e) => (500, json!({"error": format!("open failed: {e}")})),
    }
}

fn read_leosdb(state: &AppState, path: &str) -> Result<(), Box<dyn std::error::Error>> {
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

fn course_create(state: &AppState, body: &str) -> (u16, Value) {
    let v: Value = serde_json::from_str(body).unwrap_or(json!({}));
    let name = match v["name"].as_str().filter(|s| !s.is_empty()) {
        Some(n) => n.to_string(),
        None => return (422, json!({"error": "name required"})),
    };
    let conn = state.conn.lock().unwrap();
    match conn.execute("INSERT INTO courses(name) VALUES(?1)", params![name]) {
        Ok(_) => (201, json!({"ok": true, "id": conn.last_insert_rowid()})),
        Err(e) => (500, json!({"error": format!("{e}")})),
    }
}

fn course_update(state: &AppState, id: i64, body: &str) -> (u16, Value) {
    let v: Value = serde_json::from_str(body).unwrap_or(json!({}));
    let conn = state.conn.lock().unwrap();
    match conn.execute(
        "UPDATE courses SET name=COALESCE(?1, name) WHERE id=?2",
        params![v["name"].as_str().filter(|s| !s.is_empty()), id],
    ) {
        Ok(0) => (404, json!({"error": "course not found"})),
        Ok(_) => (200, json!({"ok": true})),
        Err(e) => (500, json!({"error": format!("{e}")})),
    }
}

fn course_delete(state: &AppState, id: i64) -> (u16, Value) {
    let conn = state.conn.lock().unwrap();
    conn.execute("UPDATE subjects SET course_id=NULL WHERE course_id=?1", params![id]).ok();
    conn.execute("DELETE FROM courses WHERE id=?1", params![id]).ok();
    (200, json!({"ok": true}))
}

fn subject_create(state: &AppState, body: &str) -> (u16, Value) {
    let v: Value = serde_json::from_str(body).unwrap_or(json!({}));
    let name = match v["name"].as_str().filter(|s| !s.is_empty()) {
        Some(n) => n.to_string(),
        None => return (422, json!({"error": "name required"})),
    };
    let conn = state.conn.lock().unwrap();
    match conn.execute(
        "INSERT INTO subjects(course_id, name, code, type, weekly_periods, is_lab, mandatory) VALUES(?1,?2,?3,?4,?5,?6,?7)",
        params![
            v["course_id"].as_i64(),
            name,
            v["code"].as_str().filter(|s| !s.is_empty()),
            v["type"].as_str().filter(|s| !s.is_empty()),
            v["weekly_periods"].as_i64().unwrap_or(0),
            v["is_lab"].as_bool().unwrap_or(false) as i64,
            v["mandatory"].as_bool().unwrap_or(true) as i64,
        ],
    ) {
        Ok(_) => (201, json!({"ok": true, "id": conn.last_insert_rowid()})),
        Err(e) => (500, json!({"error": format!("{e}")})),
    }
}

fn subject_update(state: &AppState, id: i64, body: &str) -> (u16, Value) {
    let v: Value = serde_json::from_str(body).unwrap_or(json!({}));
    let conn = state.conn.lock().unwrap();
    match conn.execute(
        "UPDATE subjects SET course_id=?1, name=COALESCE(?2,name), code=?3, type=?4,
         weekly_periods=COALESCE(?5,weekly_periods), is_lab=COALESCE(?6,is_lab), mandatory=COALESCE(?7,mandatory)
         WHERE id=?8",
        params![
            v["course_id"].as_i64(),
            v["name"].as_str().filter(|s| !s.is_empty()),
            v["code"].as_str().map(str::to_string),
            v["type"].as_str().map(str::to_string),
            v["weekly_periods"].as_i64(),
            v["is_lab"].as_bool().map(|b| b as i64),
            v["mandatory"].as_bool().map(|b| b as i64),
            id,
        ],
    ) {
        Ok(0) => (404, json!({"error": "subject not found"})),
        Ok(_) => (200, json!({"ok": true})),
        Err(e) => (500, json!({"error": format!("{e}")})),
    }
}

fn subject_delete(state: &AppState, id: i64) -> (u16, Value) {
    let conn = state.conn.lock().unwrap();
    conn.execute("DELETE FROM teacher_subjects WHERE subject_id=?1", params![id]).ok();
    conn.execute("UPDATE timetable_entries SET subject_id=NULL WHERE subject_id=?1", params![id]).ok();
    conn.execute("DELETE FROM subjects WHERE id=?1", params![id]).ok();
    (200, json!({"ok": true}))
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

fn timetable_all(state: &AppState) -> (u16, Value) {
    let conn = state.conn.lock().unwrap();
    let mut sections: Vec<Value> = Vec::new();
    let mut entries: Vec<Value> = Vec::new();
    let res: rusqlite::Result<()> = (|| {
        // All sections with class info
        let mut s = conn.prepare(
            "SELECT sec.id, sec.name, c.id, c.name, c.grade_level
             FROM sections sec JOIN classes c ON c.id = sec.class_id
             ORDER BY c.grade_level, c.name, sec.name",
        )?;
        let mut rows = s.query([])?;
        while let Some(r) = rows.next()? {
            sections.push(json!({
                "id": r.get::<_, i64>(0)?,
                "name": r.get::<_, Option<String>>(1)?,
                "class_id": r.get::<_, i64>(2)?,
                "class_name": r.get::<_, Option<String>>(3)?,
                "grade_level": r.get::<_, Option<String>>(4)?,
            }));
        }
        // All timetable entries
        let mut e = conn.prepare(
            "SELECT te.id, te.section_id, te.period_id, te.day_of_week,
                    te.subject_id, subj.name, subj.code,
                    te.staff_id, st.first_name, st.last_name,
                    te.room_id, r.name
             FROM timetable_entries te
             LEFT JOIN subjects subj ON subj.id = te.subject_id
             LEFT JOIN staff st ON st.id = te.staff_id
             LEFT JOIN classrooms r ON r.id = te.room_id
             ORDER BY te.section_id, te.day_of_week, te.period_id",
        )?;
        let mut rows = e.query([])?;
        while let Some(r) = rows.next()? {
            let first: Option<String> = r.get(8)?;
            let last: Option<String> = r.get(9)?;
            let teacher = first.map(|f| format!("{} {}", f, last.unwrap_or_default()).trim().to_string());
            entries.push(json!({
                "id": r.get::<_, i64>(0)?,
                "section_id": r.get::<_, i64>(1)?,
                "period_id": r.get::<_, i64>(2)?,
                "day_of_week": r.get::<_, i64>(3)?,
                "subject_id": r.get::<_, Option<i64>>(4)?,
                "subject_name": r.get::<_, Option<String>>(5)?,
                "subject_code": r.get::<_, Option<String>>(6)?,
                "staff_id": r.get::<_, Option<i64>>(7)?,
                "teacher_name": teacher,
                "room_id": r.get::<_, Option<i64>>(10)?,
                "room_name": r.get::<_, Option<String>>(11)?,
            }));
        }
        Ok(())
    })();
    match res {
        Ok(()) => (200, json!({"sections": sections, "entries": entries})),
        Err(e) => (500, json!({"error": format!("{e}")})),
    }
}

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
