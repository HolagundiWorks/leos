# HCW-SMS — Architecture Map (current ↔ target)

Target = the **School Desktop App Architecture** spec: an offline-first native
desktop SMS with a **Rust core + SQLite + portable `.schoolpkg`** file, optional
**LAN server/client** mode, and a **timetable engine** as the central scheduler.

Status: ✅ done · 🟡 partial · ⬜ not started · ⚠️ conflicts with current (must change)

---

## The headline change — backend

| | Current (built) | Target (spec §2, §26, §33) |
|---|---|---|
| Data store | **MariaDB 10.11** (restored openSIS) | **SQLite** embedded |
| Backend | **PHP API v1** at `localhost:8080` (Podman pod) | **Rust core** inside Tauri |
| Portability | needs the Podman stack running | **`.schoolpkg`** ZIP (manifest · `school.sqlite` · `media/` · `documents/` …) |
| Multi-user | single (HTTP to PHP) | **LAN server/client** (Rust API, server-only writes, DB lock) |

**Status (2026-06-26):** the Rust `server/` (tiny_http + rusqlite) now serves
`auth`, `students`(+detail), `staff`, `dashboard/summary|today` over **SQLite**
on `:8787`; the React app is re-pointed there (`VITE_API_BASE`). The **PHP API +
MariaDB/openSIS are retired** as the backend. The **`.schoolpkg`** portable file
(ZIP: manifest + school.sqlite + checksum + media/docs) save/open is implemented
(`/schoolpkg/save|open`). The server is now **embedded in the Tauri process**
(spawned on a thread) → single self-contained app; the **offline-first core is
complete**. (Follow-up: move `school.sqlite` to the app-data dir for installed
builds.) Login is now **`admin` / `admin123`**.

## Stack mapping

| Target | Current | Status |
|---|---|---|
| React + TypeScript + Vite | ✅ same | ✅ |
| Tauri desktop shell | ✅ Tauri v2 (MSI/NSIS built) | ✅ |
| Rust core backend | ✅ HTTP server on `:8787` | ✅ |
| SQLite | ✅ `school.sqlite` (seeded) | ✅ |
| `.schoolpkg` file | ✅ save/open (ZIP) | ✅ |
| LAN server mode | — | ⬜ new |
| Zustand | ✅ (+ TanStack Query) | ✅ |
| Excel (SheetJS/ExcelJS) | — | ⬜ |
| PDF generator | — | ⬜ |
| Drag & drop (dnd-kit) | — | ⬜ (needed for timetable) |
| Canvas + PDF (Konva + pdf.js) | ✅ floor-plan editor | ✅ |
| UI lib | Mantine | ✅ (satisfies "custom design system") |
| Icons | Lucide | ✅ |

## Modules (spec §5) → status

| # | Module | Status | Notes |
|---|---|---|---|
| 1 | School Setup | ⬜ | academic year, wings, timings |
| 2 | Users & Roles | 🟡 | JWT+bcrypt auth done; roles need the spec set (§6: Principal, Timetable/Exam Coordinator, Class Teacher, Accountant, Front Office …) |
| 3 | Student Management | 🟡 | list · search · profile · detail API (UI done; data in MariaDB) |
| 4 | Staff/Teacher Management | 🟡 | list done |
| 5 | Course & Subject | 🟡 | list screens + seed (CBSE Class 8 · 8 subjects); create/edit pending |
| 6 | Teacher-Subject Mapper | ⬜ | up to 3 teachers/subject, priority |
| 7 | Classroom & Lab | 🟡 | list + seed (7 rooms/labs); **floor-plan editor** ✅ — PDF import (pdf.js) + Konva canvas, draw/label/move/resize rooms by type, link rects to Classroom records, persisted (`/floorplan`) |
| 8 | **Timetable Builder** | ⬜ | **centerpiece** — drag-drop, conflict detection, auto-assist |
| 9 | Substitution | ⬜ | absence → affected slots → suggest → approve |
| 10 | Attendance | ⬜ | placeholder only (work-queue surfaces "not enrolled") |
| 11 | Exam | ⬜ | types, schedule, marks |
| 12 | Exam Infrastructure | ⬜ | rooms, seating, invigilators |
| 13 | Dashboards | 🟡 | active work-queue dashboard done; needs Principal/Admin split + widgets (§17/§18) |
| 14 | Excel Import/Export | ⬜ | templates + validation/preview/log |
| 15 | Backup & Restore | ⬜ | `.schoolpkg` snapshots |
| 16 | LAN Sync/Server | ⬜ | |
| — | Audit logs (§29) | ⬜ | |

## UI navigation (spec §30) vs current icon rail

- **Have:** Dashboard · Students · Staff · Attendance · Fees · Exams · Library · Transport · Settings (most are placeholders).
- **Add per spec:** Teachers · Courses · Subjects · Classrooms · **Timetable** · Substitution · Reports · Import/Export · Backup · LAN.
- The cockpit shell (utility strip · icon rail · bottom context ribbon · Ctrl-K) ✅ already matches the spec's "modern interface" intent; timetable will need the spec's 3-panel layout (left: subjects/teachers/rooms · center: grid · right: conflicts/load).

## Implementation phases (spec §31) vs progress

- **Phase 1 — Core foundation:** Tauri ✅ · Student/Teacher UI 🟡 · **SQLite + `.schoolpkg` ⬜** · Course/Subject ⬜ · Excel ⬜ · Backup ⬜
- **Phase 2 — Timetable:** ⬜ (timings → periods → mapper → builder → conflicts → views)
- **Phase 3 — Substitution:** ⬜
- **Phase 4 — Exam:** ⬜
- **Phase 5 — LAN:** ⬜
- **Phase 6 — Intelligence (auto-assist):** ⬜

## Key decisions (open)

1. **Backend pivot** to Rust + SQLite + `.schoolpkg` (recommended — it defines everything downstream).
2. **Data**: migrate restored openSIS data into the new SQLite schema, or start a clean schema and re-import via Excel.
3. **First target** after the core: the timetable prerequisites (Course/Subject + Teacher-Subject mapper + Classroom/Lab + timings) so the timetable engine has inputs.

> Reusable as-is: the whole React cockpit UI, Zustand stores, screen patterns,
> Tauri shell/installers. Replaced: the data/backend layer (PHP/MariaDB → Rust/SQLite).
