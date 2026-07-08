# LEOS — Learning Environment Operating System

[![License: GPL v2](https://img.shields.io/badge/License-GPL%20v2-blue.svg)](LICENSE)

**Open source** · Offline-first, desktop-first school operating system built by [Holagundi Consulting Works](https://github.com/HolagundiWorks).
A calm "school ops cockpit" — not another ERP dashboard. All data lives in a single portable file.
No internet. No server to maintain. No monthly subscription.

> **Derived from openSIS Classic Community Edition** (GPL v2) by [OS4ED](https://www.os4ed.com/).
> The original PHP/MySQL stack has been completely replaced with a native Rust + SQLite core.
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
| **User roles** | Admin / Teacher / Parent | L1 Principal → L5 Parent, each with a personal dashboard |
| **Timetable** | Basic schedule entry | Conflict detection, teacher load tracking, substitution engine |
| **Floor plan** | None | Canvas-based classroom floor-plan editor |
| **Hardware** | None | NFC / barcode HID scan for attendance kiosk |
| **Design tools** | None | Canva integration module (encrypted token) |
| **External data** | Manual entry only | CSV + SQLite one-time import connector |
| **Backup** | Database dump | `.leosdb` ZIP archive (manifest + SQLite + media + checksum) |
| **Audit** | None | Security audit log with write-event trail |
| **LAN multi-user** | Web server serves all clients | ⬜ planned — other PCs will point at this machine's IP:8787 |
| **Module admin** | Static | Tech Admin panel — enable/disable modules per access level |
| **Institution type** | School-only terminology | Generic: School / Pre-School / College / PUC — terms adapt |

---

## Stack

| Layer | Technology |
|---|---|
| Desktop shell | **Tauri v2** — single self-contained `.exe`, WebView2 |
| UI | **React 18 + TypeScript + Vite**, **Mantine v7**, **Lucide** icons |
| Client state | **Zustand** (auth + selection) + **TanStack Query v5** (server state) |
| API server | **Rust** (`tiny_http` + `rusqlite` + `bcrypt` + `uuid`) — supervised `leos-server` sidecar |
| Database | **SQLite** via `rusqlite` |
| Portable data file | **`.leosdb`** — ZIP: `manifest.json` + `school.sqlite` + `media/` + `documents/` + checksum |
| Auth | bcrypt password hash + bearer token |

---

## Architecture

```
┌──────────────────────────────────────────────────────┐
│  LEOS.exe  (Tauri v2 desktop window)                 │
│                                                      │
│   React / Mantine cockpit UI                         │
│        │  fetch http://localhost:8787                │
│        ▼                                             │
│   leos-server  (supervised child process / sidecar)  │
│        │                                             │
│        ▼                                             │
│   SQLite  (school.sqlite)                            │
│        ▲                                             │
│        └── open / save ──►  school.leosdb            │  ← portable, Tally-style
└──────────────────────────────────────────────────────┘
        (LAN mode: planned — other machines point at IP:8787)
```

- UI never talks to SQLite directly — it calls the Rust API.
- The Rust server runs as a **supervised sidecar** in production (see [`docs/server-control.md`](docs/server-control.md)) or **standalone** during development.
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
| Hardware Integration | ✅ | NFC / barcode HID scan, card enrollment |
| Design Connect | ✅ | Canva integration, encrypted token storage |
| Tech Admin | ✅ | System health, module enable/disable, L1–L5 hierarchy editor |
| Institution Settings | ✅ | Type (School/College/etc.), logo, academic config |
| Payroll | 🟡 | Structure stub — hooks in place |

---

## Running (development)

**Prerequisites:** Node.js 18+, Rust stable-msvc + MSVC build tools, WebView2 (pre-installed on Win 10/11).

```bash
# 1. Start the Rust API server (creates + seeds school.sqlite, listens on :8787)
cargo run --manifest-path server/Cargo.toml

# 2. Start the Vite dev server (:5174)
cd frontend && npm install && npm run dev

# 3. Optional: open the native desktop window (embeds the server)
cargo tauri dev
```

Open `http://localhost:5174`. **Login: `admin` / `ChangeMe@3201`.**

For full architecture detail see [`ARCHITECTURE.md`](ARCHITECTURE.md).

### Production build

```bash
cd frontend && npm run build
cargo tauri build   # → src-tauri/target/release/bundle/ (MSI + NSIS)
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
| [`docs/server-control.md`](docs/server-control.md) | Service Manager and sidecar architecture |
| [`test-plan.md`](test-plan.md) | Automated test strategy |
| [`tests/README.md`](tests/README.md) | How to run the test suite |
| [`timetable-app/README.md`](timetable-app/README.md) | Standalone open-source timetable desktop app |

---

## Related projects

**[Timetable Manager](timetable-app/)** — a standalone Electron desktop app that implements LEOS scheduling logic (periods, conflicts, quotas, teacher load) without the full cockpit. Open source under GPL v2.

---

## Security notes

- Repo is **public**. Never commit `*.sqlite`, `*.leosdb`, or any file containing credentials.
- Canva API tokens are stored encrypted — never committed in plain text.
- The `admin`/`ChangeMe@3201` seed credential is for development only. Change it before deployment.

---

## Attribution & License

LEOS is a derivative work of **openSIS Classic Community Edition**, copyright
**Open Solutions for Education, Inc. (OS4ED)**, released under the
**GNU General Public License v2.0**.

**What was taken from openSIS:**
- School management domain model (students, staff, courses, sections, attendance, fees, exams)
- Database schema concepts and academic-year / grading terminology

**What was replaced entirely:**
- Backend: PHP + MySQL → Rust + SQLite (embedded, no installation required)
- Frontend: server-rendered PHP templates → React 18 + TypeScript + Mantine v7
- Deployment: web server required → self-contained desktop `.exe`
- Data portability: database dump → single `.leosdb` portable archive

In accordance with GPL v2, LEOS is released as **open source** under the **GNU General Public License v2.0**.
See [`LICENSE`](LICENSE) for the full license text.

**Copyright © 2026 Holagundi Consulting Works**

openSIS Classic source and original license:
https://github.com/os4ed/openSIS-Classic
