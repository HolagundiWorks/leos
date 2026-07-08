# Timetable Manager

[![License: GPL v2](https://img.shields.io/badge/License-GPL%20v2-blue.svg)](LICENSE)

**Open source** · A standalone timetable management application based on [LEOS](../) scheduling logic.

## What it does

This app implements the same timetable model as LEOS:

```
section × period × day_of_week → { subject, teacher, room }
```

| Concept | Description |
|---------|-------------|
| **Periods** | School day time slots (periods + breaks) from Timings |
| **Subjects** | Catalog with weekly period quotas |
| **Teacher Map** | Up to 3 teachers per subject (priority-based) |
| **Sections** | Class divisions — timetables are per section |
| **Timetable** | Mon–Fri grid; click to assign, drag to move |
| **Conflicts** | Teacher double-booking and room conflicts blocked (HTTP 409) |
| **Quotas** | Scheduled vs target periods per subject |
| **Teacher Load** | Aggregate workload across sections |

## Quick start (web)

```bash
cd timetable-app
npm run install:all
npm run dev
```

- **API**: http://localhost:3879
- **UI**: http://localhost:5175

## Desktop app

The same app runs as a standalone Windows desktop application (Electron).

### Development

```bash
cd timetable-app
npm run install:all
npm run desktop:dev
```

Opens a native window connected to the Vite dev server and API.

### Run packaged locally (no installer)

```bash
npm run desktop
```

Builds the frontend and launches Electron with an embedded API server.

### Build installer

```bash
npm run dist
```

Output: `timetable-app/release/Timetable Manager Setup x.x.x.exe`

Data is stored per-user at `%APPDATA%/timetable-app/data/timetable.db`.

> **Note:** `npm run desktop` / `npm run dist` rebuild `better-sqlite3` for Electron.
> To switch back to browser dev (`npm run dev`), run `npm run rebuild:server` first.

## Production (web)

```bash
cd timetable-app
npm run install:all
npm run build --prefix frontend
npm start
```

## Architecture

```
timetable-app/
├── electron/        Electron shell (desktop window + embedded server)
├── server/          Express + better-sqlite3 (port 3879)
│   ├── db.js        Schema, seed data (CBSE Class 8 demo)
│   └── index.js     REST API mirroring LEOS timetable endpoints
└── frontend/        React + Mantine + TanStack Query (port 5175)
    └── src/pages/   Timetable, Timings, Subjects, Teachers, etc.
```

Data is stored in `server/data/timetable.db` (SQLite, portable).

## LEOS parity

This standalone app reuses LEOS concepts without the full cockpit:

- Same `day_of_week` convention: 0 = Monday … 6 = Sunday (UI uses Mon–Fri)
- Same conflict detection for teacher and room slots
- Same subject quota tracking via `weekly_periods`
- Same period/break grid layout for timetable builder
- Demo seed: CBSE 8-period day, 8 subjects, 7 teachers, 3 classes × 2 sections

## API endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/periods` | List school day slots |
| POST | `/periods` | Replace all periods |
| GET/POST | `/subjects` | Subject CRUD |
| GET/POST | `/staff` | Teacher directory |
| GET/POST | `/teacher-subjects` | Teacher-subject mapping |
| GET/POST | `/classes`, `/sections` | Classes & sections |
| GET | `/classrooms` | Rooms list |
| GET/POST | `/timetable` | Section timetable builder |
| GET | `/timetable/all` | School-wide view |
| GET | `/timetable/quota` | Subject quota status |
| GET | `/timetable/teacher-load` | Teacher workload |

## License

**Copyright © 2026 Holagundi Consulting Works**

Timetable Manager is open source software licensed under the
[GNU General Public License v2.0](LICENSE). It implements scheduling logic
from [LEOS](../), which is a derivative of openSIS Classic Community Edition
(GPL v2). See the [root LICENSE](../LICENSE) for the full license text.
