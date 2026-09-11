# LEOS — Test Inventory

Every module, the flows worth testing, and the stable selectors backing them.
This is the working backlog: keep the **Coverage** column honest as tests land.

Coverage legend: ✅ test exists · 🟡 partial · ⬜ none yet
Layers: **E** = E2E (Playwright) · **A** = API (Vitest) · **D** = DB (Vitest)

Current automated baseline: 98 API tests, 15 database tests, and 12 renderer
E2E tests pass against the TypeScript implementation.

---

## 1. Pre-app gates

| Flow              | Selectors / routes                                                                                                                      | Coverage     |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| Open school file  | `school-file-input`, `open-school-file-button`                                                                                          | ✅ E (smoke) |
| Unlock master key | `master-key-input`, `unlock-continue-button` · Electron `school:open`                                                                   | ✅ E         |
| Create new school | create-mode inputs · Electron `school:create`                                                                                           | ⬜           |
| Login             | `login-username-input`, `login-password-input`, `login-submit-button`, `login-error`, `login-form` · `POST /auth/login`, `GET /auth/me` | ✅ E, ✅ A   |

---

## 2. Modules

Routes column lists the representative endpoints (server has ~315 total). CRUD =
create / read / update / delete-or-archive.

| Module                 | Screen                                                       | Key routes                                                                                | CRUD                    | Coverage                                                                                                                                                                              |
| ---------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dashboard              | `RoleDashboard`, `DashboardPage`                             | `GET /dashboard/summary`, `/dashboard/today`, `/dashboard/meetings-today`                 | read                    | ⬜                                                                                                                                                                                    |
| **Students**           | `StudentsScreen`, `StudentFormModal`, `StudentProfileScreen` | `GET/POST /students`, `GET /students/:id`, `POST /students/:id/update`                    | C R U                   | ✅ E, ✅ A, ✅ D                                                                                                                                                                      |
| Staff                  | `StaffScreen`, `StaffFormModal`                              | `GET/POST /staff`, `POST /staff/:id/update`                                               | C R U                   | ✅ E, ✅ A, ✅ D                                                                                                                                                                      |
| Portal accounts        | `PortalAccountsScreen`, `PortalProfileScreen`                | linked teacher, parent, student accounts and scoped profiles                              | C R D + reset           | 🟡 TypeScript IPC ported; student profile isolation and denial of general routes are verified; parent multi-child and teacher coverage pending                                        |
| Learning management    | `LmsScreen`                                                  | `/lms/spaces`, modules, lessons, assignments, submissions, grading                        | C R U D + grade         | 🟡 Teacher ownership, learner isolation, publishing, submission, parent denial, and grading limits are API-tested; renderer E2E remains                                                |
| Staff OS / HR          | `StaffOSScreen`                                              | departments, leave requests, approval/rejection                                           | C R U D                 | 🟡 TypeScript IPC ported; DB verification covers aggregation, approval, and safe department detach                                                                                    |
| Courses                | `CoursesScreen`                                              | `GET/POST /courses`, `/courses/:id/update`, `/courses/:id/delete`                         | C R U D                 | ✅ A, ✅ D · UI now full CRUD                                                                                                                                                         |
| Subjects               | `SubjectsScreen`                                             | `GET/POST /subjects`, `/subjects/:id/update`, `/delete`                                   | C R U D                 | ✅ E, ✅ A, ✅ D                                                                                                                                                                      |
| Classes/Sections       | `ClassesScreen`                                              | `GET/POST /classes`, `/sections`, update/delete                                           | C R U D                 | ✅ E, ✅ A, ✅ D                                                                                                                                                                      |
| Classrooms             | `ClassroomsScreen`                                           | `GET /classrooms`                                                                         | C R U D                 | ⬜                                                                                                                                                                                    |
| Teacher map            | `TeacherSubjectsScreen`                                      | `GET/POST /teacher-subjects`, `/remove`                                                   | C R D                   | ⬜                                                                                                                                                                                    |
| Timings/Periods        | `TimingsScreen`                                              | `GET/POST /periods`                                                                       | C U                     | ⬜                                                                                                                                                                                    |
| Timetable              | `TimetableScreen`                                            | `GET/POST /timetable`, `/timetable/clear`, `/quota`, `/teacher-load`                      | C R U D                 | ⬜                                                                                                                                                                                    |
| Faculty planner        | `FacultyPlannerScreen`                                       | `GET/POST /faculty-plans`, update/delete, print reports                                   | C R U D + print         | ⬜ Electron integration: periods, ownership, date validation, schema v2                                                                                                               |
| Substitution           | `SubstitutionScreen`                                         | absence expansion, suggestions, assignment, resolution                                    | C R U                   | 🟡 TypeScript IPC ported; availability, subject mapping, lifecycle, and audit are DB-verified                                                                                         |
| Floor plan             | `FloorPlanScreen`                                            | `GET/POST /floorplan`                                                                     | R U                     | ⬜                                                                                                                                                                                    |
| Academic year          | `AcademicYearScreen`                                         | `GET/POST /academic-years`, `/activate`, `/close`, `/terms`                               | C R U                   | ⬜                                                                                                                                                                                    |
| Attendance             | `AttendanceScreen`, `AttendanceKiosk`                        | attendance entry, summary, alerts, student eligibility, warnings                          | C R U + print           | 🟡 TypeScript IPC ported; Electron integration coverage pending                                                                                                                       |
| Exams                  | `ExamScreen`                                                 | exams, schedules, marks, ranked reports                                                   | C R U D + print         | 🟡 TypeScript IPC ported; Electron integration coverage pending                                                                                                                       |
| Fees                   | `FeeScreen`                                                  | fee + payment routes, void-payment                                                        | C R U                   | 🟡 TypeScript IPC ported; DB verification covers balances and collections                                                                                                             |
| Finance reports        | `FinanceReportScreen`                                        | read-only report routes                                                                   | read                    | 🟡 TypeScript IPC ported; aggregate DB verification exists                                                                                                                            |
| Scholarships           | `ScholarshipScreen`                                          | scholarship/concession routes                                                             | C R U                   | 🟡 TypeScript IPC ported; UI coverage pending                                                                                                                                         |
| Payroll                | `PayrollScreen`                                              | salary structures, payroll generation, payslips                                           | C R U + print           | 🟡 TypeScript IPC ported; DB verification covers proration and deductions                                                                                                             |
| Events                 | `EventScreen`, `EventFab`                                    | announcements, meetings/minutes, assigned tasks                                           | C R U D                 | 🟡 TypeScript IPC ported; DB verification covers publish and completion lifecycles                                                                                                    |
| Activities             | `ActivityScreen`                                             | activities, staff, sections, expenses, status                                             | C R U D                 | 🟡 TypeScript IPC ported; DB verification covers linked detail and expense totals                                                                                                     |
| Reminders              | `RemindersScreen`                                            | reminder routes                                                                           | C R U D                 | 🟡 TypeScript IPC ported; DB verification covers active-to-done lifecycle                                                                                                             |
| Letters                | `LetterScreen`                                               | `GET/POST /letters`                                                                       | C R + print             | 🟡 TypeScript IPC ported; deterministic numbering is DB-verified                                                                                                                      |
| Certificates           | `CertificateScreen`                                          | `GET/POST /certificates`                                                                  | C R + print             | 🟡 TypeScript IPC ported; deterministic numbering is DB-verified                                                                                                                      |
| Student records        | `StudentProfileScreen`                                       | documents, marks/analytics, board registration, communications, record lock/audit         | C R U D                 | 🟡 TypeScript IPC ported; lifecycle, validation, analytics, and audit are DB-verified                                                                                                 |
| Sports and clubs       | `SportsScreen`, `ClubScreen`                                 | events, results, leaderboard, clubs, members                                              | C R U D                 | 🟡 TypeScript IPC ported; roster, aggregation, cascade, and audit are DB-verified                                                                                                     |
| ID Cards               | `IdCardScreen`                                               | `GET /students/by-card` + card routes                                                     | R                       | ⬜                                                                                                                                                                                    |
| Transport              | `TransportScreen`                                            | vehicles/routes/stops/assignments                                                         | C R U D                 | 🟡 TypeScript IPC ported; DB verification covers route aggregation and assignment                                                                                                     |
| Issued items           | `IssuedItemsScreen`                                          | issued-item markers                                                                       | C R U                   | 🟡 TypeScript IPC ported; DB marker verification exists                                                                                                                               |
| Visitor log            | `VisitorScreen`                                              | visitor check-in/out                                                                      | C R U                   | 🟡 TypeScript IPC ported; DB checkout verification exists                                                                                                                             |
| Library                | `LibraryScreen`                                              | catalog + issue/return                                                                    | C R U                   | 🟡 TypeScript IPC ported; transactional inventory verification exists                                                                                                                 |
| Schedule view          | `ScheduleViewScreen`                                         | timetable read                                                                            | read                    | ⬜                                                                                                                                                                                    |
| Backup                 | `BackupScreen`                                               | archive save/open plus `/backup/config`, `/backup/run`, `/backup/list`, `/backup/restore` | run/restore             | 🟡 TypeScript IPC ported; DB verification covers archive creation, history, LAN blocking, wrong-key/checksum rejection, and restore round-trip                                        |
| Security               | `SecurityScreen`                                             | audit log and role permission routes                                                      | R U                     | 🟡 TypeScript IPC ported; DB verification covers filtering and audited role updates                                                                                                   |
| Import / Merge         | `ImportScreen`, `MergePanel`                                 | `/import/csv`, `/import/sqlite`, `/import/merge/preview`, `/import/merge/apply`           | import + merge          | 🟡 TypeScript IPC ported; DB verification covers quoted CSV/deduplication, allowlisted SQLite, checked archives, natural-key preview, audited apply, and LAN blocking; UI E2E remains |
| Hardware               | `HardwareScreen`                                             | device routes                                                                             | R                       | ⬜                                                                                                                                                                                    |
| Tech Admin             | `TechAdminScreen`                                            | system health, modules, user levels, toggles                                              | R U                     | 🟡 TypeScript IPC ported; L1 DB verification covers module audit, hierarchy update, and final-admin protection                                                                        |
| Settings               | `InstitutionSettingsScreen`                                  | `GET/POST /school`                                                                        | R U                     | ⬜                                                                                                                                                                                    |
| LAN connection manager | `LanConnectionManager`                                       | Electron `lan:*` IPC, paired host transport, browser UI, remote auth/API forwarding       | host/connect/disconnect | 🟡 pairing page/cookie, browser renderer, pairing rejection, token forwarding, logout revocation, concurrent transport, and disconnect fallback tested; TLS, SQLite write concurrency, firewall, and multi-device coverage pending |
| Supabase integration   | `TechAdminScreen`                                            | L1-only URL/publishable-key configuration and REST health test                             | configure/test          | 🟡 authorization, persistence, masking, and validation tested; data synchronization mappings and conflict handling remain planned |
| Client hierarchy       | `clientMode`, native Android client, `ApiRouter`              | desktop/web/mobile capability boundaries                                                   | allow/deny              | ✅ host admin isolation, web data-entry allowance, Android mutation restriction, Android request identification, and UI module filtering implemented |

---

> ✅ **Resolved — Courses UI now has full CRUD** (New Course + per-row edit/delete
> in `CoursesScreen.tsx`), matching the backend.
>
> Note — Subjects/Courses delete (trash icon) deletes **immediately with no
> confirmation dialog**; easy to mis-click. Consider a confirm step.

## 3. Cross-cutting flows

| Flow                                                        | Coverage                                                                                                    |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Health check (`GET /health`, `GET /`)                       | ✅ A                                                                                                        |
| Auth required on protected routes (401)                     | ✅ A                                                                                                        |
| Required-field validation (422)                             | 🟡 A (students)                                                                                             |
| Permission matrix — login as L1…L5, assert route allow/deny | 🟡 A — admin and portal boundaries plus representative L2–L4 read routes are tested; exhaustive generated read/write route coverage remains |
| Import / export round-trips                                 | ⬜                                                                                                          |
| Backup → restore round-trip                                 | ✅ Electron verifier: archive, checksum, wrong key, restore, and LAN denial                                 |
| `.leosdb` open/save (native dialog)                         | 🟡 Electron archive and backup verification exists; add packaged UI automation and a legacy fixture         |
| Renderer endpoint parity                                   | ✅ 159 frontend route shapes probe successfully through the TypeScript router                                |

---

## 4. `data-testid` convention

Stable, intent-revealing, kebab-case. Patterns in use:

| Pattern                               | Example                                            | Where                 |
| ------------------------------------- | -------------------------------------------------- | --------------------- |
| `<entity>-<field>-input`              | `student-first-name-input`                         | form fields           |
| `<entity>-<action>-button`            | `student-admit-button`, `student-form-save-button` | buttons               |
| `<entity>-row` (+ `data-<entity>-id`) | `student-row` `data-student-id="42"`               | table/list rows       |
| `<entity>-empty`                      | `students-empty`                                   | empty states          |
| `<entity>-search-input`               | `students-search-input`                            | search boxes          |
| `nav-<moduleKey>`                     | `nav-students`                                     | ribbon action buttons |
| `ribbon-tab-<tabId>`                  | `ribbon-tab-people`                                | ribbon tabs           |
| `cockpit-shell`                       | —                                                  | logged-in app root    |

**Rule for new UI:** every actionable control (button, input, dropdown, row,
toggle, tab) that a test needs must carry a `data-testid`. Add it in the same PR
as the feature. Already wired: the pre-app gates, Login, Students, Staff, and
the navigation ribbon.
