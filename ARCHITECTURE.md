# LEOS — Architecture

Learning Environment Operating System by Holagundi Consulting Works.
Offline-first, desktop-first school OS. All data in a single portable `.leosdb` file.

Status: ✅ done · 🟡 partial · ⬜ not started

---

## Stack

| Layer | Technology | Status |
|---|---|---|
| Desktop shell | Tauri v2 (single `.exe`, WebView2) | ✅ |
| UI | React 18 + TypeScript + Vite | ✅ |
| Components | Mantine v7 + Lucide icons | ✅ |
| Client state | Zustand (auth + selection) + TanStack Query v5 | ✅ |
| API server | Rust (`tiny_http` + `rusqlite` + `bcrypt` + `uuid`) | ✅ |
| Database | SQLite (embedded, `school.sqlite`) | ✅ |
| Portable file | `.leosdb` ZIP (manifest + school.sqlite + media/ + checksum) | ✅ |
| LAN multi-user | Standalone server mode — other PCs point at IP:8787 | ⬜ |
| PDF output | SheetJS / ExcelJS / PDF generator | ⬜ |

---

## Runtime model

```
┌──────────────────────────────────────────────────────────┐
│  LEOS.exe  (Tauri v2 desktop window)  — ONE user-facing app │
│                                                            │
│   React / Mantine cockpit UI                               │
│     │  fetch http://localhost:8787   │  invoke server_* cmds │
│     ▼                                ▼                      │
│   (data)                    Service Manager (server_manager) │
│     │                                │  supervises           │
│     │                                ▼                      │
│     └──────────────►  leos-server  (child process)          │
│                            │   start · stop · restart ·      │
│                            ▼   health · logs · repair        │
│                       SQLite (school.sqlite)                │
│                            ▲                                 │
│                            └── open / save ──► school.leosdb │
└──────────────────────────────────────────────────────────┘
        (development: server runs standalone, Vite on :5174)
        (LAN mode: other machines fetch from IP:8787)
```

**Service Manager.** The backend is run as a *supervised child process*, not an
in-process thread, so the in-app **Server Control Panel** (System → Server) can
start / stop / restart / repair it, show health + live logs, and auto-restart it
on crash. It's built behind a `ServerController` trait
(`src-tauri/src/server_manager.rs`); the current `ChildProcessController` needs
no elevation. If the standalone `leos-server` binary isn't found, LEOS falls back
to running the backend embedded in-process (health/logs only — no live control).
A Windows-Service backend can implement the same trait in phase 2 so the server
can run headless (auto-start on boot, LAN-always-on) — see
`docs/server-control.md`.

Login: **`admin` / `ChangeMe@3201`** (change before deployment).

---

## Navigation

**Two-level MS Office ribbon** (no sidebar):

- **Tab strip** (32px, Deep Graphite) — 8 tabs: Home · People · Academics · Schedule · Operations · Finance · Events · System
- **Action ribbon** (62px, glassmorphism) — contextual buttons per tab, filtered by user level
- **Utility strip** (44px, top) — school name · search · academic year · alerts · user menu
- **Command palette** — `Ctrl-K` for keyboard-first navigation

Row selection (Zustand) highlights the active record in list screens; contextual
actions live in the tab ribbon above the content area.

Keyboard: `Ctrl-K` command palette, `Alt-1…8` tab shortcuts.

Single source of truth: `frontend/src/ribbon.config.ts` — `ribbonTabs`, `moduleToTab`, `tabForModule()`, `profileToLevel()`.

---

## User levels (L1–L5)

| Level | Role | Access |
|---|---|---|
| L1 | Principal | Full system — all modules, Tech Admin, audit log |
| L2 | Admin / Teacher / Accountant | Operational — modules relevant to their role |
| L3 | Class Teacher | Class-level — attendance, students (read), timetable |
| L4 | Support Staff | Read-only, limited operational modules |
| L5 | Parent / Student | Own data only — fees, results, attendance |

Stored as `users.level INTEGER` in SQLite. Managed via Tech Admin → Staff Hierarchy.

---

## Server routes (selected)

| Method | Path | Description |
|---|---|---|
| POST | `/auth/login` | bcrypt verify → bearer token |
| GET | `/students` | List with search |
| GET | `/students/:id` | Student profile |
| GET | `/staff` | Staff list |
| GET | `/dashboard/stats` | Students / staff / sections / pending fees |
| GET | `/dashboard/today` | Needs-attention work queue |
| GET | `/dashboard/meetings-today` | Today's meetings |
| GET | `/academic-years/active` | Current academic year |
| GET/POST | `/schooldb/save`, `/schooldb/open` | `.leosdb` portable file |
| GET | `/admin/system-info` | DB stats, server version |
| GET | `/admin/modules` | Module enable/disable list |
| POST | `/admin/modules/:key/toggle` | Toggle module |
| GET | `/admin/users/levels` | All users with levels |
| POST | `/admin/users/:id/level` | Set user level |

---

## Modules

| Screen file | Module key | Status |
|---|---|---|
| `DashboardPage.tsx` + `RoleDashboard.tsx` | `dashboard` | ✅ |
| `StudentsScreen.tsx` + `StudentProfileScreen.tsx` | `students` | ✅ |
| `StaffScreen.tsx` + `StaffOSScreen.tsx` | `staff`, `staff-os` | ✅ |
| `CoursesScreen.tsx` | `courses` | ✅ |
| `SubjectsScreen.tsx` | `subjects` | ✅ |
| `ClassesScreen.tsx` | `classes` | ✅ |
| `ClassroomsScreen.tsx` | `classrooms` | ✅ |
| `TeacherSubjectsScreen.tsx` | `teacher-subjects` | ✅ |
| `TimingsScreen.tsx` | `timings` | ✅ |
| `TimetableScreen.tsx` | `timetable` | ✅ |
| `SubstitutionScreen.tsx` | `substitution` | ✅ |
| `FloorPlanScreen.tsx` | `floorplan` | ✅ |
| `AcademicYearScreen.tsx` | `academic-year` | ✅ |
| `AttendanceScreen.tsx` + `AttendanceKiosk.tsx` | `attendance` | ✅ |
| `ExamScreen.tsx` | `exams` | ✅ |
| `FeeScreen.tsx` | `fees` | ✅ |
| `PayrollScreen.tsx` | `payroll` | 🟡 stub |
| `EventScreen.tsx` | `events` | ✅ |
| `ActivityScreen.tsx` | `activities` | ✅ |
| `BackupScreen.tsx` | `backup` | ✅ |
| `SecurityScreen.tsx` | `security` | ✅ |
| `ImportScreen.tsx` | `import` | ✅ |
| `HardwareScreen.tsx` | `hardware` | ✅ |
| `DesignScreen.tsx` | `design` | ✅ |
| `TechAdminScreen.tsx` | `tech-admin` | ✅ |
| `InstitutionSettingsScreen.tsx` | `settings` | ✅ |

---

## Attribution

LEOS is derived from **openSIS Classic Community Edition** by OS4ED (GPL v2).
PHP/MySQL backend replaced by Rust/SQLite. See [`LICENSE`](LICENSE) and [`README.md`](README.md).
