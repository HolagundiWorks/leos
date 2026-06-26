# HCW-SMS — Architecture Map (current ↔ target)

Target = the **School Operating System** spec: an offline-first native
desktop app with a **Rust core + SQLite + portable `.schooldb`** file, optional
**LAN server/client** mode, and a **timetable engine** as the central scheduler.

Status: ✅ done · 🟡 partial · ⬜ not started · ⚠️ conflicts with current (must change)

---

## The headline change — backend

| | Current (built) | Target |
|---|---|---|
| Data store | **SQLite** embedded | **SQLite** embedded |
| Backend | **Rust API** at `localhost:8787` (embedded in Tauri) | same |
| Portability | **`.schooldb`** ZIP (manifest · `school.sqlite` · `media/` · `documents/` …) | same |
| Multi-user | single-machine | **LAN server/client** (server-only writes, DB lock) |

**Status (2026-06-26):** Rust `server/` (tiny_http + rusqlite) serves auth,
students, staff, courses, subjects, classes/sections, teacher-subject mapper,
school timings (period slots), timetable builder (conflict detection, quota
tracking, teacher load), classrooms, floor-plan, dashboard over SQLite on
`:8787`. The `.schooldb` portable file (ZIP: manifest + school.sqlite + checksum
+ media/docs) save/open is implemented (`/schooldb/save|open`). Server embedded
in Tauri → single self-contained app. Login: **`admin` / `admin123`**.

---

## Stack

| Target | Current | Status |
|---|---|---|
| React + TypeScript + Vite | ✅ same | ✅ |
| Tauri desktop shell | ✅ Tauri v2 (MSI/NSIS built) | ✅ |
| Rust core backend | ✅ HTTP server on `:8787` | ✅ |
| SQLite | ✅ `school.sqlite` (seeded) | ✅ |
| `.schooldb` portable file | ✅ save/open (ZIP) | ✅ |
| LAN server mode | — | ⬜ |
| Zustand + TanStack Query | ✅ | ✅ |
| Excel (SheetJS/ExcelJS) | — | ⬜ |
| PDF generator | — | ⬜ |
| Drag & drop (dnd-kit) | — | ⬜ (timetable drag) |
| Canvas (Konva) | ✅ floor-plan editor | ✅ |
| Mantine UI | ✅ | ✅ |
| Lucide icons | ✅ | ✅ |

---

## Build roadmap (phases with dependencies — canonical order)

| Phase | Name | Status | Gate |
|---|---|---|---|
| P0 | Foundation Cleanup | 🟡 | — |
| P0.1 | `.schoolpkg` → `.schooldb` rename | ✅ | — |
| P0.2 | Academic year engine | ⬜ | — |
| P1 | Core CRUD (data entry) | ⬜ | P0 |
| P1.1 | Student admission form | ⬜ | P0 |
| P1.2 | Staff create/edit | ⬜ | P0 |
| P1.3 | Classes/Sections create/edit | ⬜ | P0 |
| P1.4 | Subjects/Courses create/edit | ⬜ | P0 |
| P2 | Timetable OS completion | ⬜ | P1 |
| P2.1 | School-wide timetable view | ⬜ | P1 |
| P2.2 | Drag/drop cell assignment | ⬜ | P1 |
| P2.3 | Substitution engine | ⬜ | P1 |
| P3 | Attendance OS | ⬜ | P1, P2 |
| P3.1 | Per-period attendance marking | ⬜ | P1, P2 |
| P3.2 | Attendance reports | ⬜ | P3.1 |
| P3.3 | Quick Attendance kiosk UI | ⬜ | P3.1 |
| P4 | Staff OS | ⬜ | P1.2 |
| P4.1 | Department management | ⬜ | P1.2 |
| P4.2 | Leave management | ⬜ | P4.1, P2.3 |
| P4.3 | Payroll hooks | ⬜ | P4.1 |
| P5 | Exam OS | ⬜ | P1, P2, P3 |
| P5.1 | Exam scheduling | ⬜ | P1, P2 |
| P5.2 | Marks entry | ⬜ | P5.1 |
| P5.3 | Report cards | ⬜ | P5.2 |
| P5.4 | Ranking engine | ⬜ | P5.2 |
| P6 | Fee OS | ⬜ | P1.1, P0.2 |
| P6.1 | Fee structure | ⬜ | P0.2 |
| P6.2 | Payment tracking | ⬜ | P6.1 |
| P6.3 | Due date alerts | ⬜ | P6.2 |
| P7 | Event Management OS | ⬜ | P1, P0.2 |
| P7.1 | Announcements + Circulars | ⬜ | P1 |
| P7.2 | Meetings | ⬜ | P1 |
| P7.3 | Tasks | ⬜ | P1 |
| P8 | Activity Scheduler OS | ⬜ | P7 |
| P8.1 | Activity creation | ⬜ | P7 |
| P8.2 | Staff/class assignment | ⬜ | P8.1 |
| P8.3 | Itinerary + Accounts | ⬜ | P8.1 |
| P8.4 | Auto Field Guide Generator | ⬜ | P8.1 |
| P9 | Principal Dashboard enhancement | ⬜ | P3–P7 |
| P10 | Backup & Recovery OS | ⬜ | P0.1 |
| P11 | Security & Audit | ⬜ | all modules |
| P12 | External DB Connector | ⬜ | P0, P11 |
| P13 | Hardware Integration | ⬜ | P3 |

---

## UI navigation

- **Have:** Dashboard · Students · Staff · Classes · Teacher-Subjects · Courses · Subjects · Classrooms · Floor-plan · Timetable · School Timings · Attendance (placeholder) · Fees (placeholder) · Exams (placeholder) · Library (placeholder) · Transport (placeholder) · Settings.
- **Add:** Department · Leave · Exams (full) · Events · Activities · Backup · LAN.

## Attribution

HCW-SMS is derived from **openSIS Classic Community Edition** by OS4ED. PHP/MySQL stack replaced by Rust/SQLite. GPL v2 — see `docs/License.txt`.
