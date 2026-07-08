# Timetable Manager

A **standalone** timetable management application based on LEOS (Learning Environment Operating System) scheduling logic.

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

## Quick start

```bash
cd timetable-app
npm run install:all
npm run dev
```

- **API**: http://localhost:3879
- **UI**: http://localhost:5175

## Production

```bash
cd timetable-app
npm run install:all
npm run build --prefix frontend
npm start
```

## Architecture

```
timetable-app/
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
