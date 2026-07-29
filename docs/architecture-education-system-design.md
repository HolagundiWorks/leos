# System Architecture — Architecture-Education Platform

**Status:** Draft · **Date:** 2026-07-29 · **Companion to:**
[`architecture-education-revision.md`](architecture-education-revision.md)
(the *what/why*). This document is the *how* — the implementation architecture
for turning LEOS into a dedicated school-of-architecture OS, expressed against
the real codebase (`server/src/lib.rs`, `frontend/src/`).

---

## 1. Principles

1. **Reuse the existing stack, don't fork it.** Tauri v2 shell, React 18 +
   Mantine v7 + TanStack Query, Rust (`tiny_http` + `rusqlite`) API, SQLite in the
   portable `.leosdb`. No new runtime, language, or service.
2. **Additive & non-breaking.** New tables via `CREATE TABLE IF NOT EXISTS` in
   `migrate_schema()`; new columns via idempotent `ALTER TABLE … ADD COLUMN`
   (the codebase's existing `let _ = conn.execute("ALTER TABLE …", [])` pattern).
   Existing school/college installs keep working untouched.
3. **Institution-gated.** Studio behaviour activates when `schools.type =
   'architecture'`. The vocabulary switch already lives in
   `frontend/src/lib/institution.ts`; new modules register their ribbon actions
   and enforcement only for that type.
4. **Same conventions.** Routes are `if method == … && path.starts_with(…)`
   branches in `handle()`; screens are `frontend/src/components/*Screen.tsx`
   wired through `ribbon.config.ts` (`moduleToTab`, `tabForModule`) and gated by
   `module_settings.min_level` (L1–L5). Writes go through the existing audit-log
   helper.

---

## 2. Layered view

```
┌───────────────────────────────────────────────────────────────┐
│ Tauri v2 desktop shell (unchanged) — supervises leos-server    │
├───────────────────────────────────────────────────────────────┤
│ React / Mantine cockpit                                        │
│   ribbon.config.ts  → Academics tab gains: Studios · Juries ·  │
│                       Portfolio · Internship · Thesis          │
│   useTerms() → studio vocabulary (institution.ts, done)        │
│   new screens: StudiosScreen, JuryScreen, PortfolioScreen,     │
│                InternshipScreen, ThesisScreen                  │
│   new hooks + api/client.ts calls (TanStack Query)             │
├───────────────────────────────────────────────────────────────┤
│ Rust API (server/src/lib.rs) — new route branches in handle()  │
│   /studios /juries /jury-marks /portfolio /internships /theses │
│   attendance-eligibility helper · jury-scheduling on timetable │
├───────────────────────────────────────────────────────────────┤
│ SQLite (migrate_schema): new studio tables + additive columns  │
│   media (sheets/model photos) stored under the .leosdb media/  │
└───────────────────────────────────────────────────────────────┘
```

---

## 3. Data model

### 3.1 Additive columns on existing tables
Placed alongside the current `ALTER TABLE … ADD COLUMN` block in
`migrate_schema()` (errors ignored → idempotent):

```rust
// subjects: classify by MSAR head, credits, and mark the design studio
let _ = conn.execute("ALTER TABLE subjects ADD COLUMN head TEXT", []);           // 'core'|'building_science'|'hss'|'elective'
let _ = conn.execute("ALTER TABLE subjects ADD COLUMN credits INTEGER DEFAULT 0", []);
let _ = conn.execute("ALTER TABLE subjects ADD COLUMN is_studio INTEGER DEFAULT 0", []);

// staff: visiting faculty + COA registration (MSAR visiting-load tracking)
let _ = conn.execute("ALTER TABLE staff ADD COLUMN is_visiting INTEGER DEFAULT 0", []);
let _ = conn.execute("ALTER TABLE staff ADD COLUMN coa_reg_no TEXT", []);
let _ = conn.execute("ALTER TABLE staff ADD COLUMN qualification TEXT", []);

// students: programme + admission (NATA / JEE-2 + PCM eligibility)
let _ = conn.execute("ALTER TABLE students ADD COLUMN programme TEXT", []);       // 'barch'|'march'|'phd'
let _ = conn.execute("ALTER TABLE students ADD COLUMN batch_year INTEGER", []);
let _ = conn.execute("ALTER TABLE students ADD COLUMN nata_score REAL", []);
let _ = conn.execute("ALTER TABLE students ADD COLUMN jee2_score REAL", []);

// schools: COA institution identity
let _ = conn.execute("ALTER TABLE schools ADD COLUMN coa_reg_no TEXT", []);
let _ = conn.execute("ALTER TABLE schools ADD COLUMN sanctioned_intake INTEGER", []);
```

### 3.2 New tables (studio objects)
Added to the `execute_batch(...)` block in `migrate_schema()`:

```sql
CREATE TABLE IF NOT EXISTS studios(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL, year INTEGER, semester INTEGER,
  subject_id INTEGER, section_id INTEGER, academic_year_id INTEGER,
  credits INTEGER DEFAULT 0, coordinator_staff_id INTEGER,
  created_at TEXT DEFAULT (datetime('now')));

CREATE TABLE IF NOT EXISTS juries(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  studio_id INTEGER NOT NULL, title TEXT NOT NULL,
  kind TEXT DEFAULT 'pinup',            -- pinup|mid|final|thesis
  date TEXT, start_time TEXT, end_time TEXT, room_id INTEGER,
  status TEXT DEFAULT 'scheduled',
  created_at TEXT DEFAULT (datetime('now')));

CREATE TABLE IF NOT EXISTS jury_panel(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  jury_id INTEGER NOT NULL, staff_id INTEGER,
  external_name TEXT, external_firm TEXT,
  is_external INTEGER DEFAULT 0);

CREATE TABLE IF NOT EXISTS jury_marks(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  jury_id INTEGER NOT NULL, student_id INTEGER NOT NULL,
  criterion TEXT, score REAL, max_score REAL DEFAULT 100,
  grade TEXT, comments TEXT,
  UNIQUE(jury_id, student_id, criterion));

CREATE TABLE IF NOT EXISTS portfolio_items(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL, studio_id INTEGER,
  kind TEXT DEFAULT 'sheet',           -- sheet|model|drawing|report
  title TEXT, media_path TEXT, sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')));

CREATE TABLE IF NOT EXISTS internships(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL, firm_name TEXT,
  mentor_name TEXT, mentor_coa_reg TEXT,
  start_date TEXT, end_date TEXT, stipend REAL,
  status TEXT DEFAULT 'ongoing',       -- ongoing|completed|assessed
  assessment TEXT, grade TEXT,
  created_at TEXT DEFAULT (datetime('now')));

CREATE TABLE IF NOT EXISTS internship_log(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  internship_id INTEGER NOT NULL,
  entry_date TEXT, hours REAL, description TEXT);

CREATE TABLE IF NOT EXISTS theses(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL, guide_staff_id INTEGER,
  title TEXT, topic_status TEXT DEFAULT 'proposed',  -- proposed|approved|rejected
  pre_jury_grade TEXT, final_jury_grade TEXT,
  viva_date TEXT, report_path TEXT,
  created_at TEXT DEFAULT (datetime('now')));

CREATE TABLE IF NOT EXISTS thesis_milestones(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  thesis_id INTEGER NOT NULL, name TEXT, due_date TEXT,
  done INTEGER DEFAULT 0);
```

**Media.** `portfolio_items.media_path` / `theses.report_path` reference files
saved under the `.leosdb` archive's `media/` (and `documents/`) directory — the
same mechanism student documents already use — so portfolios travel inside the
portable file and are covered by the SHA-256 integrity check.

---

## 4. API layer

New route branches in `handle()` in `server/src/lib.rs`, following the existing
`starts_with` / `ends_with` convention and auth/audit wrappers:

| Method | Path | Purpose |
|---|---|---|
| GET / POST | `/studios`, `/studios/:id/update`, `/studios/:id/delete` | Studio CRUD |
| GET | `/studios/:id/roster` | Students in the studio's section |
| GET / POST | `/juries`, `/juries/:id/update`, `/juries/:id/delete` | Jury scheduling |
| GET / POST | `/juries/:id/panel` | Panel members (internal + external) |
| GET / POST | `/juries/:id/marks` | Per-criterion grades + written crit |
| GET | `/juries/:id/eligibility` | Attendance gate per student (see §6.1) |
| GET / POST | `/portfolio/:studentId`, `/portfolio/:id/delete` | Portfolio items + media |
| GET / POST | `/internships`, `/internships/:id/update`, `/internships/:id/assess` | Professional training |
| GET / POST | `/internships/:id/log` | Logbook entries |
| GET / POST | `/theses`, `/theses/:id/update`, `/theses/:id/approve` | Thesis lifecycle |
| GET / POST | `/theses/:id/milestones`, `/theses/:id/milestones/:mid/done` | Thesis milestones |
| GET | `/architecture/compliance` | MSAR summary: intake, visiting-load %, faculty ratios |

Each handler: bearer-token check → `rusqlite` query/exec → JSON via the existing
response helper; every write appends to `audit_log` (`resource_type` =
`studio`/`jury`/`portfolio`/`internship`/`thesis`).

Frontend side: add typed calls in `frontend/src/api/client.ts` and TanStack
Query hooks in `frontend/src/hooks/` (mirroring `useSubjects`, `useTimetable`),
each `enabled: !!token`.

---

## 5. Frontend

### 5.1 New screens (`frontend/src/components/`)
| Screen | Module key | Ribbon tab |
|---|---|---|
| `StudiosScreen.tsx` | `studios` | Academics |
| `JuryScreen.tsx` (reframes/extends `ExamScreen`) | `juries` | Academics |
| `PortfolioScreen.tsx` | `portfolio` | Academics |
| `InternshipScreen.tsx` | `internship` | Academics / Operations |
| `ThesisScreen.tsx` | `thesis` | Academics |
| Compliance panel in `InstitutionSettingsScreen.tsx` | `settings` | System |

### 5.2 Wiring
- Register the module keys in `frontend/src/ribbon.config.ts` (`moduleToTab`
  entries + action buttons on the **Academics** tab), and route them in the
  screen switch in `App.tsx` (same place existing modules render).
- Show the studio actions only when `useSchool().type === 'architecture'` (ribbon
  actions can carry an `institutionTypes?: InstitutionType[]` filter, defaulting
  to all — a small addition to the ribbon action shape).
- Labels come from `useTerms()` — already returns `program`/`section`/`course`/
  `cohort`/`assessment` for the architecture type, so screens read "Studio",
  "Jury", "Programme" without hard-coding.
- Access levels reuse `module_settings.min_level`; the L1–L5 model maps cleanly:
  L1 Principal, L2 Faculty/Studio-coordinator, L3 Studio-tutor, L4 support,
  L5 Student (own portfolio / results / attendance).

### 5.3 Portfolio & Jury student integration
`StudentProfileScreen.tsx` gains **Portfolio** and **Juries** tabs beside the
existing Attendance/Academics/Documents tabs, reusing `ImageUpload.tsx` /
`StudentDocumentsTab.tsx` patterns for sheet/model uploads.

---

## 6. Cross-cutting engines

### 6.1 Attendance-eligibility gate (COA)
A helper `student_attendance_pct(conn, student_id, subject_id, year_id)` reuses
the existing per-period attendance data. `/juries/:id/eligibility` returns, per
student, `{ pct, eligible: pct >= threshold }` where the threshold is a
`settings` value (`coa_min_attendance`, default 75). The Jury screen renders
ineligible students as blocked from final-jury grading — mirroring how COA ties
studio attendance to jury eligibility.

### 6.2 Jury scheduling on the timetable
Juries are calendar events with a `room_id` and time window. Reuse the timetable
conflict-detection logic (`timetable_entries` room/staff overlap checks) to warn
when a jury double-books a room or a panel member already teaching that slot. No
new scheduler — extend the existing conflict helper to accept jury rows.

### 6.3 Studio blocks in the timetable
`periods.period_type` already exists (`'period'` default). Add a `'studio'`
value for long (3–4 hr) contiguous blocks; the timetable builder treats a studio
block as one assignable unit. Additive, no schema change beyond seeding.

### 6.4 MSAR compliance summary
`/architecture/compliance` aggregates: sanctioned vs enrolled intake, visiting
faculty load % (`staff.is_visiting` × studio hours) against the 25–50% band,
student:faculty ratio, and studio-area coverage from `classrooms.room_type`.
Rendered read-only in Institution Settings.

---

## 7. Reframing Exam OS → Jury OS (migration strategy)

`exams`/`exam_marks` stay in place (school/college mode still uses them). For the
`architecture` type, `JuryScreen` is the primary assessment surface backed by
the new `juries`/`jury_marks` tables. A one-time optional converter can map
legacy exam rows to juries if a school switches type — but default path is: new
architecture files use juries from the start. This avoids a destructive rewrite
of the existing, tested Exam OS.

---

## 8. Build sequence (maps to revision-doc phases)

| Phase | Backend | Frontend | Ships |
|---|---|---|---|
| **0 (done)** | — | `institution.ts` studio vocab + default | vocabulary switch |
| **1** | additive columns (§3.1); `/studios` CRUD; studio `period_type` | `StudiosScreen`, subject head/credits UI, student admission fields, compliance stub | studios + metadata |
| **2** | `juries`, `jury_panel`, `jury_marks`; eligibility helper (§6.1); scheduling (§6.2) | `JuryScreen`, student Juries tab | Jury OS |
| **3** | `portfolio_items` + media save/serve | `PortfolioScreen`, student Portfolio tab | Portfolio |
| **4** | `internships`+`internship_log`, `theses`+`thesis_milestones` | `InternshipScreen`, `ThesisScreen` | internship + thesis |
| **5** | `/architecture/compliance` full | compliance panel, attendance-eligibility reports | MSAR compliance |

Each phase is independently shippable and leaves the app releasable.

---

## 9. Testing

- **Rust:** unit tests for the eligibility helper, jury conflict detection, and
  visiting-load computation (pure functions over in-memory SQLite), following
  the server's existing test style.
- **E2E (Playwright, `tests/`):** a `create architecture file → add studio →
  schedule jury → grade → portfolio upload` happy-path, added under the current
  Playwright config.
- **Migration safety:** open an existing `school`-type `.leosdb` and assert all
  additive `ALTER`s are no-ops and screens still render (regression guard for the
  non-breaking claim).

---

## 10. Risks & mitigations

| Risk | Mitigation |
|---|---|
| `lib.rs` is one 8k-line file; more routes worsen it | Group new handlers into a clearly-fenced `// --- architecture ---` block; optionally split into a module later — out of scope for this change |
| Grading convention varies (marks vs letter/GPA) | `jury_marks` stores both `score` and `grade`; confirm target school's scale before Phase 2 |
| Media bloat in `.leosdb` (model photos) | Reuse existing document-size handling; document a compression/rescale step on upload in `ImageUpload.tsx` |
| Institution-type gating leaks studio UI into school mode | Central `institutionTypes` filter on ribbon actions + `useSchool().type` guard, covered by the migration-safety test |

---

*This is a design draft. Phase 0 is implemented; Phases 1–5 are staged in
[`ROADMAP.md`](../ROADMAP.md) and gated on the open questions in the revision
proposal (grading scale, whether to retire generic modes).*
