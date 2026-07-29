# LEOS — Build Roadmap

Learning Environment Operating System by Holagundi Consulting Works.
Offline-first education OS: Tauri v2 + React/Mantine + Rust API + SQLite.

**Direction:** LEOS is being refocused as a **dedicated architecture-education
platform** and split into a **student desktop client** (built-in CAD/BIM/PDF
viewers + on-device AI tutor) and a **lecturer web app** around a networked
**sync hub**. This document is the single roadmap for that programme; the
**foundation is already shipped** (see *Part 3*, the existing school OS).

Legend: ✅ done · 🟡 in progress · ⬜ planned

Design references:
[revision (why/what)](docs/architecture-education-revision.md) ·
[system design (how)](docs/architecture-education-system-design.md) ·
[two-app split](docs/two-app-split-architecture.md).

---

# Part 1 — Architecture-education platform (detailed roadmap)

Milestones are **dependency-ordered**; each is independently shippable and
leaves the app releasable. Two work-streams interleave: **Domain** (studio
pedagogy) and **Topology** (the two-app split). The phase tags in parentheses
map back to the design docs (AE = system-design Phases; S = split Phases).

| # | Milestone | Streams | Depends on | Status |
|---|---|---|---|---|
| **M0** | Vocabulary + design docs | Domain, Topology | — | ✅ |
| **M1** | Studio domain foundation | Domain (AE1) | M0 | 🟡 |
| **M2** | Hub networking + sync engine | Topology (S-A, S-B) | M1 | ⬜ |
| **M3** | Lecturer web app + Jury OS | Both (S-C, AE2) | M2 | ⬜ |
| **M4** | Student desktop core + Portfolio | Both (S-D, AE3) | M2 | ⬜ |
| **M5** | On-device AI tutor | Topology (S-E) | M4 | ⬜ |
| **M6** | Internship + Design Thesis | Domain (AE4) | M3, M4 | ⬜ |
| **M7** | COA/MSAR compliance + offline hand-off + scale | Both (AE5, S-F) | M3, M4 | ⬜ |

---

## M0 — Vocabulary & design ✅

- ✅ `architecture` institution type + studio vocabulary
  (Programme / Studio / Subject / Year / Jury, "Studio Faculty");
  default for new school files (`frontend/src/lib/institution.ts`)
- ✅ Research + revision proposal, system-design doc, two-app split doc
- ✅ README / ROADMAP positioning

## M1 — Studio domain foundation 🟡

Single-app still; additive and non-breaking.

- ✅ `subjects` gains `head` (core / building-science / hss / elective),
  `credits`, `is_studio` (idempotent `ALTER TABLE`; wired through subject CRUD)
- ✅ `staff` gains `is_visiting`, `coa_reg_no`, `qualification` (schema)
- ✅ `students` gains `programme`, `batch_year`, `nata_score`, `jee2_score` (schema)
- ✅ `schools` gains `coa_reg_no`, `sanctioned_intake` (schema + settings UI)
- ✅ `studios` table + `/studios` CRUD + `StudiosScreen.tsx` on Academics tab
- ✅ Compliance stub in Institution Settings (COA reg. no., intake) — shown for
  the `architecture` type
- ⬜ Student admission form fields (NATA/JEE-2, programme, batch) in the UI
- ⬜ `periods.period_type = 'studio'` long (3–4 hr) blocks in the timetable UI
  (column already accepts it)
- **Acceptance:** ✅ create studios, tag studio subjects with credits/head, set
  COA reg. no. + intake — verified end-to-end against the server; an existing
  `school` file takes the additive `ALTER`s and still opens/serves unchanged.
  Remaining UI bits (student admission fields, studio timetable blocks) tracked
  above.

## M2 — Hub networking + sync engine ⬜

Pure backend/plumbing; the current UI keeps working against the hub.

- ⬜ JWT auth (role claim → L1–L5) on top of existing bcrypt
- ⬜ Revision columns (`revision`, `updated_at`, `deleted`) on syncable tables
- ⬜ `GET /sync/changes`, `POST /sync/submit`, `GET/PUT /blobs/:hash`
- ⬜ WebSocket `/events` push signal (SSE / poll fallback)
- ⬜ `/packages/sync-client` — cursors, outbox/inbox, content-addressed blob transfer
- ⬜ Client-side local SQLite cache
- **Acceptance:** two processes sync a note + attachment via push-signal → pull;
  submissions survive an offline→online cycle (idempotent, no dupes).

## M3 — Lecturer web app + Jury OS ⬜

- ⬜ Web (Vite) build of the shared UI; hub-backed auth
- ⬜ Notes authoring (markdown + attachments), scoped to studio/subject → publish
- ⬜ Assignment briefs (due date, deliverables, rubric) → publish
- ⬜ Submission inbox + grading against rubric → `jury_marks` + written feedback
- ⬜ Jury OS: `juries`, `jury_panel` (internal + external examiners),
  `jury_marks`; pin-up scheduling reusing timetable conflict detection
- ⬜ Attendance-eligibility gate (COA min-attendance) on final juries
- ⬜ Announcements + timetable publish (reuse Event/Timetable OS + revision cols)
- **Acceptance:** a lecturer publishes a note + assignment and grades a
  submission entirely in the browser; students receive all three via sync.

## M4 — Student desktop core + Portfolio ⬜

- ⬜ Assignment workspace: pull brief + references, work offline, attach
  deliverables, **submit** (immutable versions via outbox)
- ⬜ Built-in viewers in the WebView: **pdf.js** (PDF), **web-ifc** (BIM/IFC),
  **dxf-viewer** (CAD/DXF)
- ⬜ `portfolio_items` + media in the `.leosdb` `media/`; `PortfolioScreen.tsx`
  and a Portfolio tab on the student profile
- **Acceptance:** a student pulls an assignment, opens an IFC/DXF/PDF reference,
  attaches deliverables, submits offline, and it reaches the lecturer on reconnect.

## M5 — On-device AI tutor ⬜

- ⬜ `ai-runtime` sidecar (llama.cpp-style) supervised via the existing
  `ServerController` trait; optional model download + tiny bundled fallback
- ⬜ Local RAG over synced notes/briefs/PDFs (`sqlite-vec` embeddings index)
- ⬜ Explain-selection (IFC element / DXF region / PDF text)
- ⬜ Generated learning environments (guided modules, flashcards, self-quizzes)
- **Acceptance:** with the network off, the tutor answers grounded in the
  student's synced course material; no data leaves the device.

## M6 — Internship + Design Thesis ⬜

- ⬜ `internships` + `internship_log` — firm, COA-registered mentor, dates,
  stipend, logbook, on-return assessment; `InternshipScreen.tsx`
- ⬜ `theses` + `thesis_milestones` — topic approval, guide, milestones,
  pre-/final jury + viva, report; `ThesisScreen.tsx`
- ⬜ Both gate progression per COA rules
- **Acceptance:** a student's professional-training semester and final thesis are
  tracked end-to-end with logbook and viva grade.

## M7 — Compliance, offline hand-off & scale ⬜

- ⬜ `/architecture/compliance` — sanctioned vs enrolled intake, visiting-load %
  (25–50 % band), student:faculty ratio, studio-area coverage; read-only panel
- ⬜ Attendance-eligibility reports (export)
- ⬜ `.leospack` bundle export/import for air-gapped hand-off
- ⬜ Postgres storage option behind the DB trait for multi-school deployments
- **Acceptance:** MSAR summary renders for an inspection; a course bundle moves
  between two offline machines and re-syncs cleanly.

---

## Cross-cutting (carried through all milestones)

| Item | Notes |
|---|---|
| License diligence | pdf.js / web-ifc / llama.cpp / DWG-conversion vs GPLv2 — prerequisite for M4–M5 (see split doc §10) |
| Monorepo refactor | `/hub`, `/apps/{student-desktop,lecturer-web}`, `/packages/{ui,sync-client,viewers,domain}` — lands incrementally from M2 |
| Testing | Rust unit tests (eligibility, jury conflicts, visiting-load); Playwright happy-paths; migration-safety regression |
| Security/privacy | TLS + JWT on the hub; on-device AI (zero egress); immutable, audited submissions |

## Open decisions (blocking the noted milestones)

1. **Hub hosting** — self-hosted campus LAN (recommended) vs cloud/multi-tenant — *M2*
2. **Local AI packaging** — bundled model vs optional download (recommended) — *M5*
3. **Minimum student hardware** for the local LLM — *M5*
4. **Grading scale** — rubric score vs letter/GPA (`jury_marks` stores both) — *M3*
5. **DWG/RVT support depth** — native-convert vs bring-your-own IFC/DXF — *M4*
6. **Retire generic school/college modes** once fully architecture-dedicated? — *M1+*

---

# Part 2 — Near-term backlog (pre-existing)

Legacy school-OS items still open, folded into the milestones above where they
overlap (attendance export → M7; report cards/ranking → superseded by Jury OS in
M3; LAN mode → M2).

| Item | Maps to |
|---|---|
| Attendance reports + export (PDF/Excel) | M7 |
| Report cards / ranking engine | Superseded by Jury OS (M3) |
| LAN server/client mode | Generalised into the Hub (M2) |
| Installer signing + auto-update | Production hardening |
| At-rest encryption (SQLCipher) | Production hardening |

---

# Part 3 — Foundation (shipped school OS)

The sections below record the **already-built** LEOS school OS that this
programme builds on. Status as of the open-source release.

## Foundation (P0) ✅

- ✅ Rust + SQLite API server (`tiny_http`, `rusqlite`, bcrypt, bearer auth) on `:8787`
- ✅ React 18 + TypeScript + Vite frontend with Mantine v7
- ✅ Tauri v2 desktop shell; supervised `leos-server` sidecar; MSI + NSIS installers
- ✅ LEOS brand palette (Deep Graphite `#1E2329`, Muted Teal `#3E7B7B`)
- ✅ School ops cockpit: utility strip + MS Office two-level tab ribbon + `Ctrl-K` palette
- ✅ Zustand auth store + TanStack Query v5 for server state
- ✅ `.leosdb` portable file (ZIP: manifest + school.sqlite + media/ + checksum) — save/open
- ✅ Academic year engine (`academic_years` table, active year selection)
- ✅ Institution-generic terminology (School / Pre-School / College / PUC via `useTerms`)

## Core People & Data (P1) ✅

- ✅ Students — list, search, profile screen (Profile · Attendance · Fees · Academics · Documents)
- ✅ Staff — list, search
- ✅ Courses & Subjects — CRUD
- ✅ Classes & Sections — CRUD
- ✅ Teacher-Subject mapper
- ✅ Row selection in list screens (Zustand)

## Timetable OS (P2) ✅

- ✅ School Timings — period slot definitions
- ✅ Classrooms — CRUD with capacity
- ✅ Floor-plan editor — Konva canvas, room labels, save/load per building
- ✅ Timetable builder — cell assignment with conflict detection + teacher load tracking
- ✅ Substitution engine

## Attendance OS (P3) ✅

- ✅ Per-period attendance marking
- ✅ Quick Attendance kiosk UI (NFC / barcode HID scan mode)
- ⬜ Attendance reports + export

## Staff OS (P4) ✅

- ✅ Staff OS screen — department management, leave management
- ✅ Payroll screen (structure stub, hooks in place)

## Exam OS (P5) ✅

- ✅ Exam scheduling
- ✅ Marks entry
- ⬜ Report cards
- ⬜ Ranking engine

## Fee OS (P6) ✅

- ✅ Fee structure
- ✅ Payment tracking
- ✅ Due-date alerts
- ✅ Fee outstanding on principal dashboard

## Event Management OS (P7) ✅

- ✅ Announcements + Circulars
- ✅ Meetings (today's meetings on dashboard)
- ✅ Tasks

## Activity Scheduler OS (P8) ✅

- ✅ Activity creation (field trips, events)
- ✅ Staff / class assignment
- ✅ Itinerary
- ✅ Auto Field Guide Generator

## Principal Dashboard (P9) ✅

- ✅ Active work-queue dashboard (needs-attention queue, not passive stats)
- ✅ Stat cards (students, staff, sections, fee outstanding)
- ✅ Today's meetings widget
- ✅ Role-based personal dashboards (L1–L5 each get their own view)

## Backup & Recovery OS (P10) ✅

- ✅ `.leosdb` save / open
- ✅ Integrity check (SHA-256 checksum in manifest)
- ✅ Backup screen

## Security & Audit (P11) ✅

- ✅ Write-event audit log
- ✅ Security screen with log viewer

## External DB Connector (P12) ✅

- ✅ CSV import
- ✅ SQLite one-time import

## Hardware Integration (P13) ✅

- ✅ NFC / barcode HID listener (HID input → student lookup)
- ✅ Card enrollment flow

## Design Connect (P14) ✅

- ✅ Canva integration (OAuth2, encrypted access + refresh token storage)
- ✅ Design screen

## Navigation & Access Control ✅

- ✅ MS Office two-level tab ribbon (tab strip + contextual action ribbon)
- ✅ 8 tabs: Home · People · Academics · Schedule · Operations · Finance · Events · System
- ✅ L1–L5 user hierarchy with per-tab and per-action access filtering
- ✅ Tech Admin panel — system health, module enable/disable, hierarchy editor
- ✅ Role-based dashboards: Principal · Teacher · Accountant · Class Teacher · Parent/Support

---

## Module backlog (ribbon placeholders — greyed, not yet built)

The ribbon shows greyed `placeholder: true` actions for planned modules. These
are the real remaining build targets. Tier = build priority; Gate = dependency.

| # | Module | Tab | Tier | Gate | Status |
|---|---|---|---|---|---|
| M1 | **ID Cards** | People | High | Students, Hardware (NFC) | ✅ done |
| M2 | Transport (vehicles/routes/stops/assignments) | Operations | High | P1 | ✅ done |
| M3 | Visitor Log (gate check-in/out register) | Operations | Medium | P1 | ✅ done |
| M4 | **Issued Items** markers (ID/books/uniform, no accounting) | Operations | Medium | P1 | ✅ done |
| M5 | Library (catalog + issue/return) | Academics + Ops | Medium | P1 | ✅ done |
| M6 | Finance Reports (collections + outstanding) | Finance | Medium | Fee OS (P6) | ✅ done |
| M7 | Scholarships / concessions | Finance | Medium | Fee OS (P6) | ✅ done |
| M8 | Receipts history / reprint | Finance | Low | Fee OS (P6) ✅ collect+print exists | ⬜ |
| M9 | Daily Schedule view | Schedule | Low | Timetable (P2) | ✅ done |
| M10 | Room Status / occupancy | Schedule | Low | Timetable + Classrooms | ✅ done |
| M11 | Parent Guide (activity) | Events | Low | Activities (P8) | ✅ via Activities → Field Guide |
| M12 | Itinerary (activity) | Events | Low | Activities (P8) | ✅ via Activities |

**Already built — placeholder was misleading (de-placeholder/remove):**
- Admissions → works via **Students → Admit** (`StudentFormModal`)
- Fee receipts → **Fees → Collect & Generate Receipt** prints already

## Cross-cutting / later

| Item | Priority | Gate |
|---|---|---|
| Attendance reports + export (PDF/Excel) | High | P3 |
| Report cards (PDF) | Medium | P5 |
| Ranking engine | Medium | P5 |
| LAN server/client mode | Medium | P0 |
| Installer signing + auto-update | Low | Production |
| Full keyboard map + accessibility audit | Low | Production |

---

### Current focus

**All M1–M12 ribbon placeholder modules are now built** — no greyed modules
remain. Also added a Tally-style **pre-login flow**:

1. **Open School File** — pick a `.leosdb` (server generates `school.leosdb`
   on first run; path prefilled)
2. **Master key** — database password gating the file (bcrypt hash in the
   file's `meta` table); verified before the DB is swapped in
3. **Sign in** — validates against that file's users

The welcome screen can also **create a new empty school**: name, institution
type, file name, and a master key → server builds a fresh `.leosdb` with the
full schema + module/role config but **no demo data** (just admin + master
key + the school record), then opens it.

Defaults: master key **ChangeMe@3201**, login **admin / ChangeMe@3201**.

Note: master key is an access gate (hash-verified), not yet at-rest
encryption — SQLCipher is a future hardening step. `/school/open` is
unauthenticated by design for the local desktop gate; restrict to localhost
before any LAN deployment.

Next candidates: change-master-key UI, at-rest encryption (SQLCipher),
attendance report export, report cards, LAN mode.
