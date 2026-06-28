# LEOS — Test Inventory

Every module, the flows worth testing, and the stable selectors backing them.
This is the working backlog: keep the **Coverage** column honest as tests land.

Coverage legend: ✅ test exists · 🟡 partial · ⬜ none yet
Layers: **E** = E2E (Playwright) · **A** = API (Vitest) · **D** = DB (Vitest)

---

## 1. Pre-app gates

| Flow | Selectors / routes | Coverage |
|---|---|---|
| Open school file | `school-file-input`, `open-school-file-button` | ✅ E (smoke) |
| Unlock master key | `master-key-input`, `unlock-continue-button` · `POST /school/open` | ✅ E |
| Create new school | (create-mode inputs — testids ⬜) · `POST /school/new` | ⬜ |
| Login | `login-username-input`, `login-password-input`, `login-submit-button`, `login-error`, `login-form` · `POST /auth/login`, `GET /auth/me` | ✅ E, ✅ A |

---

## 2. Modules

Routes column lists the representative endpoints (server has ~315 total). CRUD =
create / read / update / delete-or-archive.

| Module | Screen | Key routes | CRUD | Coverage |
|---|---|---|---|---|
| Dashboard | `RoleDashboard`, `DashboardPage` | `GET /dashboard/summary`, `/dashboard/today`, `/dashboard/meetings-today` | read | ⬜ |
| **Students** | `StudentsScreen`, `StudentFormModal`, `StudentProfileScreen` | `GET/POST /students`, `GET /students/:id`, `POST /students/:id/update` | C R U | ✅ E, ✅ A, ✅ D |
| Staff | `StaffScreen`, `StaffFormModal` | `GET/POST /staff`, `POST /staff/:id/update` | C R U | ✅ E, ✅ A, ✅ D |
| Staff OS / HR | `StaffOSScreen` | leave / HR routes | — | ⬜ |
| Courses | `CoursesScreen` | `GET/POST /courses`, `/courses/:id/update`, `/courses/:id/delete` | C R U D | ✅ A, ✅ D · UI now full CRUD |
| Subjects | `SubjectsScreen` | `GET/POST /subjects`, `/subjects/:id/update`, `/delete` | C R U D | ✅ E, ✅ A, ✅ D |
| Classes/Sections | `ClassesScreen` | `GET/POST /classes`, `/sections`, update/delete | C R U D | ✅ E, ✅ A, ✅ D |
| Classrooms | `ClassroomsScreen` | `GET /classrooms` | C R U D | ⬜ |
| Teacher map | `TeacherSubjectsScreen` | `GET/POST /teacher-subjects`, `/remove` | C R D | ⬜ |
| Timings/Periods | `TimingsScreen` | `GET/POST /periods` | C U | ⬜ |
| Timetable | `TimetableScreen` | `GET/POST /timetable`, `/timetable/clear`, `/quota`, `/teacher-load` | C R U D | ⬜ |
| Substitution | `SubstitutionScreen` | substitution routes | — | ⬜ |
| Floor plan | `FloorPlanScreen` | `GET/POST /floorplan` | R U | ⬜ |
| Academic year | `AcademicYearScreen` | `GET/POST /academic-years`, `/activate`, `/close`, `/terms` | C R U | ⬜ |
| Attendance | `AttendanceScreen`, `AttendanceKiosk` | attendance session routes | C R U | ⬜ |
| Exams | `ExamScreen` | exam routes | C R U | ⬜ |
| Fees | `FeeScreen` | fee + payment routes, void-payment | C R U | ⬜ |
| Finance reports | `FinanceReportScreen` | read-only report routes | read | ⬜ |
| Scholarships | `ScholarshipScreen` | scholarship/concession routes | C R U | ⬜ |
| Payroll | `PayrollScreen` (stub) | — | — | ⬜ |
| Events | `EventScreen`, `EventFab` | event routes | C R U D | ⬜ |
| Activities | `ActivityScreen` | activity routes | C R U | ⬜ |
| Reminders | `RemindersScreen` | reminder routes | C R U D | ⬜ |
| ID Cards | `IdCardScreen` | `GET /students/by-card` + card routes | R | ⬜ |
| Transport | `TransportScreen` | vehicles/routes/stops/assignments | C R U D | ⬜ |
| Issued items | `IssuedItemsScreen` | issued-item markers | C R U | ⬜ |
| Visitor log | `VisitorScreen` | visitor check-in/out | C R U | ⬜ |
| Library | `LibraryScreen` | catalog + issue/return | C R U | ⬜ |
| Schedule view | `ScheduleViewScreen` | timetable read | read | ⬜ |
| Backup | `BackupScreen` | `GET /schooldb/save`, `POST /schooldb/open`, backup routes | run/restore | ⬜ |
| Security | `SecurityScreen` | audit/security routes | R | ⬜ |
| Import | `ImportScreen` | import routes | import | ⬜ |
| Hardware | `HardwareScreen` | device routes | R | ⬜ |
| Design | `DesignScreen` | theme/design routes | R U | ⬜ |
| Tech Admin | `TechAdminScreen` | `GET /admin/system-info`, `/admin/modules`, `/admin/users/levels`, toggles | R U | ⬜ |
| Settings | `InstitutionSettingsScreen` | `GET/POST /school` | R U | ⬜ |

---

> ✅ **Resolved — Courses UI now has full CRUD** (New Course + per-row edit/delete
> in `CoursesScreen.tsx`), matching the backend.
>
> Note — Subjects/Courses delete (trash icon) deletes **immediately with no
> confirmation dialog**; easy to mis-click. Consider a confirm step.

## 3. Cross-cutting flows

| Flow | Coverage |
|---|---|
| Health check (`GET /health`, `GET /`) | ✅ A |
| Auth required on protected routes (401) | ✅ A |
| Required-field validation (422) | 🟡 A (students) |
| Permission matrix — login as L1…L5, assert route allow/deny | 🟡 A — /admin/* + /audit-log L1-gated & tested (BUG-02 phase 1); general write routes still open (phase 2) |
| Import / export round-trips | ⬜ |
| Backup → restore round-trip | ⬜ A |
| `.leosdb` open/save (native dialog) | ⬜ — Tauri-only; cover the underlying `/school/open`, `/schooldb/save` via API |

---

## 4. `data-testid` convention

Stable, intent-revealing, kebab-case. Patterns in use:

| Pattern | Example | Where |
|---|---|---|
| `<entity>-<field>-input` | `student-first-name-input` | form fields |
| `<entity>-<action>-button` | `student-admit-button`, `student-form-save-button` | buttons |
| `<entity>-row` (+ `data-<entity>-id`) | `student-row` `data-student-id="42"` | table/list rows |
| `<entity>-empty` | `students-empty` | empty states |
| `<entity>-search-input` | `students-search-input` | search boxes |
| `nav-<moduleKey>` | `nav-students` | ribbon action buttons |
| `ribbon-tab-<tabId>` | `ribbon-tab-people` | ribbon tabs |
| `cockpit-shell` | — | logged-in app root |

**Rule for new UI:** every actionable control (button, input, dropdown, row,
toggle, tab) that a test needs must carry a `data-testid`. Add it in the same PR
as the feature. Already wired: the pre-app gates, Login, Students screen + modal,
and the navigation ribbon. Adding testids to the remaining screens is the first
step when extending coverage to each module above. Already wired: the pre-app
gates, Login, Students, Staff, and the navigation ribbon.
