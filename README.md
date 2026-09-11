# LEOS — Learning Environment Operating System

[![License: GPL v2](https://img.shields.io/badge/License-GPL%20v2-blue.svg)](LICENSE)

**Open source** · Offline-first, desktop-first school operating system built by [Holagundi Consulting Works](https://github.com/HolagundiWorks).
A calm "school ops cockpit" — not another ERP dashboard. All data lives in a single portable file.

Brand assets, colour tokens, logo rules, typography, voice, accessibility, and
print guidance are defined in [`docs/BRAND.md`](docs/BRAND.md).

A populated fictional school archive for demonstrations can be regenerated with
`npm run demo:create --prefix desktop`; credentials and contents are documented
in [`demo/README.md`](demo/README.md).
No internet. No server to maintain. No monthly subscription.

> **Derived from openSIS Classic Community Edition** (GPL v2) by [OS4ED](https://www.os4ed.com/).
> The original PHP/MySQL stack has been replaced with an offline SQLite core.
> See [§ Attribution & License](#attribution--license) below.

---

## What is LEOS?

openSIS Classic is a web-based school management system requiring a server, PHP, and MySQL.
LEOS takes that domain knowledge and rebuilds it as a self-contained desktop application.

| | openSIS Classic | LEOS |
|---|---|---|
| **Delivery** | Web app — needs a server, PHP, MySQL | Native desktop `.exe` — double-click and run |
| **Data** | MariaDB/MySQL on a server | SQLite in a portable `.leosdb` file |
| **Offline** | No — server must be reachable | Yes — fully offline, no internet required |
| **Navigation** | Sidebar menu | MS Office two-level tab ribbon, role-aware |
| **Dashboard** | Static summary counts | Active work queue — "what needs attention today" |
| **User roles** | Admin / Teacher / Parent | Principal, teacher, parent, and student accounts with scoped dashboards |
| **Learning** | Separate LMS normally required | Built-in lessons, resources, assignments, submissions, grading, and feedback |
| **Timetable** | Basic schedule entry | Conflict detection, teacher load tracking, substitution engine |
| **Floor plan** | None | Canvas-based classroom floor-plan editor |
| **Hardware** | None | NFC / barcode HID scan for attendance kiosk |
| **External data** | Manual entry only | CSV + SQLite one-time import connector |
| **Backup** | Database dump | `.leosdb` ZIP archive (manifest + SQLite + media + checksum) |
| **Audit** | None | Security audit log with write-event trail |
| **LAN multi-user** | Web server serves all clients | 🟡 paired desktop and browser access on trusted private networks; TLS hardening remains |
| **Module admin** | Static | Tech Admin panel — enable/disable modules per access level |
| **Institution type** | School-only terminology | Generic: School / Pre-School / College / PUC — terms adapt |

---

## Stack

| Layer | Technology |
|---|---|
| Desktop shell | **Electron** — migration target and active desktop runtime |
| Android client | Native **Java/Android** UI using the paired LAN API |
| UI | **React 18 + TypeScript + Vite**, **Mantine v7**, **Lucide** icons |
| Client state | **Zustand** (auth + selection) + **TanStack Query v5** (server state) |
| Application services | **TypeScript** in the Electron main process with Zod-validated IPC |
| Database | **SQLite** via Node's built-in `node:sqlite` engine |
| Portable data file | **`.leosdb`** — ZIP: `manifest.json` + `school.sqlite` + `media/` + `documents/` + checksum |
| Auth | bcrypt password hash + bearer token |
| Optional cloud API | Supabase REST via native `fetch` (no additional SDK/runtime) |

The verified cutover is complete: the former Tauri/Rust implementation and the
duplicate timetable application have been removed. All product work, including
the LMS, now uses the TypeScript/Electron path. Git history preserves the
migration record.

---

## Architecture

```
┌──────────────────────────────────────────────────────┐
│  LEOS.exe  (Electron desktop window)                 │
│                                                      │
│   React / Mantine cockpit UI                         │
│        │  validated, typed IPC                       │
│        ▼                                             │
│   TypeScript application services (Electron main)    │
│        │                                             │
│        ▼                                             │
│   SQLite  (school.sqlite)                            │
│        ▲                                             │
│        └── open / save ──►  school.leosdb            │  ← portable, Tally-style
└──────────────────────────────────────────────────────┘
        (optional paired LAN host/client transport)
```

- The sandboxed UI never talks to SQLite directly; the narrow preload bridge
  sends validated requests to TypeScript services in the Electron main process.
- LAN mode serves the same React application and API from the host. Other
  devices can open the displayed `http://<host-ip>:8788` address in a browser,
  enter the temporary pairing code, and sign in with their LEOS account. This
  does not add a second application server or database implementation.
- L1 administrators can configure and test an optional Supabase project from
  Tech Admin. SQLite remains authoritative and all core workflows stay offline.
- The Android client under `android-client/` has native connection, login,
  dashboard, list, attendance, planning, LMS, task, and reminder screens. Its
  server permissions are limited to day-to-day work; configuration and
  administration remain on the host desktop.
- A school's entire dataset lives in one `.leosdb` file — copy, move, or back it up like any file.

---

## Modules

| Module | Status | Notes |
|---|---|---|
| Login + auth | ✅ | bcrypt + bearer token, L1–L5 role dispatch |
| Role dashboards | ✅ | Personal view per level: Principal · Teacher · Accountant · Class Teacher · Parent |
| Students | ✅ | List, search, profile (Profile · Attendance · Fees · Academics · Documents) |
| Staff | ✅ | List, search, Staff OS (departments, leave, payroll hooks) |
| Courses & Subjects | ✅ | CRUD, teacher-subject mapper |
| Classes & Sections | ✅ | CRUD |
| Academic Years | ✅ | Create, activate |
| Timetable OS | ✅ | Period slots, conflict detection, teacher load, substitution engine |
| Floor-plan editor | ✅ | Canvas (Konva), room labels, save/load per building |
| Attendance | ✅ | Per-period marking + Quick Attendance kiosk (NFC/barcode HID) |
| Exams & Marks | ✅ | Exam scheduling, marks entry |
| Fee OS | ✅ | Fee structure, payment tracking, due-date alerts |
| Events & Meetings | ✅ | Announcements, circulars, meetings |
| Activity Scheduler | ✅ | Field trips, itinerary, auto Field Guide Generator |
| Backup & Recovery | ✅ | `.leosdb` save/open, integrity check |
| Security & Audit | ✅ | Write-event audit trail |
| External DB Connector | ✅ | CSV + SQLite one-time import |
| Hardware Integration | 🟡 | NFC/barcode keyboard-wedge scan + card enrollment; native biometric integration is planned |
| Tech Admin | ✅ | System health, module enable/disable, L1–L5 hierarchy editor |
| Institution Settings | ✅ | Type (School/College/etc.), logo, academic config |
| Payroll | ✅ | Salary structures, monthly generation, payslip history + print |

---

## Running (development)

**Prerequisite:** Node.js 24 or newer. No Rust, Python, Visual Studio, native
SQLite add-on, or separately managed server is required for the active stack.

```bash
npm run desktop:install
npm run ui:dev
# In a second terminal:
npm run desktop:dev
```

Create or open a school file, then sign in with that school's administrator
credentials.

For full architecture detail see [`ARCHITECTURE.md`](ARCHITECTURE.md).

### Production build

```bash
npm run desktop:package
```

---

## Cockpit UI

No wide sidebar. Three fixed chrome elements:

- **Utility strip** (44px) — school name · search · academic year · alerts · user menu
- **Two-level tab ribbon** — 8 tabs (Home · People · Academics · Schedule · Operations · Finance · Events · System) with a contextual action ribbon beneath, filtered by the current user's access level
- **Command palette** — `Ctrl-K` for keyboard-first navigation

Keyboard shortcuts: `Ctrl-K` command palette, `Alt-1…8` tab shortcuts.

---

## Documentation

| Doc | Description |
|-----|-------------|
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | Runtime model, navigation, module map |
| [`ROADMAP.md`](ROADMAP.md) | Feature completion tracker |
| [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) | Production build and release checklist |
| [`docs/BRAND.md`](docs/BRAND.md) | Carbon colour tokens, logo, themes, and accessibility rules |
| [`demo/README.md`](demo/README.md) | Fictional demo school generator and credentials |
| [`test-plan.md`](test-plan.md) | Automated test strategy |
| [`tests/README.md`](tests/README.md) | How to run the test suite |
---

## Security notes

- Repo is **public**. Never commit `*.sqlite`, `*.leosdb`, or any file containing credentials.
- New schools require user-selected master and administrator passwords. Fixed
  credentials exist only inside isolated automated test fixtures.

---

## Attribution & License

LEOS is a derivative work of **openSIS Classic Community Edition**, copyright
**Open Solutions for Education, Inc. (OS4ED)**, released under the
**GNU General Public License v2.0**.

**What was taken from openSIS:**
- School management domain model (students, staff, courses, sections, attendance, fees, exams)
- Database schema concepts and academic-year / grading terminology

**What was replaced entirely:**
- Backend: PHP + MySQL → TypeScript + built-in SQLite (embedded, no installation required)
- Frontend: server-rendered PHP templates → React 18 + TypeScript + Mantine v7
- Deployment: web server required → self-contained desktop `.exe`
- Data portability: database dump → single `.leosdb` portable archive

In accordance with GPL v2, LEOS is released as **open source** under the **GNU General Public License v2.0**.
See [`LICENSE`](LICENSE) for the full license text.

**Copyright © 2026 Holagundi Consulting Works**

openSIS Classic source and original license:
https://github.com/os4ed/openSIS-Classic
