# System Architecture — Two-App Split (Student Desktop + Lecturer Web + Sync Hub)

**Status:** Draft · **Date:** 2026-07-29 · **Builds on:**
[`architecture-education-revision.md`](architecture-education-revision.md) ·
[`architecture-education-system-design.md`](architecture-education-system-design.md)

This draft splits LEOS into **two client apps around a shared hub**:

- **Student Desktop Client** — offline-first Tauri app with built-in CAD/BIM
  viewers, PDF reader, and a **local (on-device) AI tutor**. Students study,
  work assignments, and **submit**.
- **Lecturer Web App** — browser-based authoring: notes, assignments, grading,
  announcements, timetables. Lecturers **publish** and **grade**.
- **LEOS Hub** — the sync/identity server that mediates. Communication is
  **push-signalled, pull-fetched**: producers submit, the hub notifies, the
  other side pulls.

It is continuous with the studio model already designed: **assignments = studio
briefs**, **grades = jury marks**, **notes attach to studios/subjects**.

---

## 1. Topology

```
                         ┌───────────────────────────────┐
                         │        LEOS Hub (Rust)        │
   push signal (WS/SSE)  │  identity (JWT) · sync API ·  │  push signal (WS/SSE)
        ┌────────────────│  canonical DB · blob store    │────────────────┐
        │        pull ▲  └───────────────────────────────┘  ▲ pull        │
        │       submit │            ▲ submit  │ pull         │ submit      │
        ▼              │            │         ▼              │             ▼
┌──────────────────────┴───┐              ┌───┴──────────────────────────────┐
│  Student Desktop (Tauri) │              │      Lecturer Web (browser)       │
│  • CAD/BIM/PDF viewers    │              │  • Notes authoring                │
│  • Local AI sidecar (LLM) │              │  • Assignment briefs + grading    │
│  • Assignment workspace   │              │  • Announcements · Timetables     │
│  • Local cache (SQLite)   │              │  • Reads submissions              │
│  • Outbox / Inbox queue   │              │  (stateless-ish; hub is source)   │
└───────────────────────────┘              └───────────────────────────────────┘
```

**Deployment (recommended):** the Hub runs **on-campus / self-hosted** — the
natural evolution of the roadmap's planned *LAN server mode* (`IP:8787`). This
keeps the offline-first, on-prem, no-subscription ethos: student data and AI
never leave the campus. Cloud/multi-tenant hosting is possible later behind the
same API (see §11 open questions).

---

## 2. Why a hub (reconciling with offline-first)

LEOS today is single-app, single `.leosdb`. A two-client split needs a shared
source of truth, but we keep the offline-first promise:

- The **Hub holds the canonical data**; each client keeps a **full local cache**
  (SQLite) and works **fully offline**.
- Sync is **opportunistic**: clients flush their **outbox** and pull their
  **inbox** whenever the hub is reachable. A dropped network never blocks study,
  authoring, or working on an assignment — only the moment of submit/receive.
- The portable `.leosdb` concept survives as **content bundles** (`.leospack`)
  for offline hand-off where no network exists at all (§6).

---

## 3. Student Desktop Client

Reuses the current Tauri v2 shell and the **supervised-sidecar** pattern already
in `src-tauri/src/server_manager.rs` (the `ServerController` trait) — the app
already knows how to launch and babysit a child process; we add a second one.

### 3.1 Built-in viewers (in the WebView, offline)
| Content | Approach | Library (open-source) |
|---|---|---|
| **PDF** | Embedded reader + annotate | **pdf.js** (Mozilla) |
| **BIM / IFC** | 3D model viewer, element tree, properties | **web-ifc / @thatopen/components** (WASM IFC parser + three.js) |
| **CAD / DXF** | 2D/3D drawing viewer | **dxf-viewer** (three.js) + `dxf-parser` |
| **CAD / DWG, Revit RVT** | Import via conversion to DXF/IFC | see license note §10 — treat proprietary formats as *import → open format* |

IFC is the interoperability spine for BIM (Revit/ArchiCAD/etc. all export IFC),
so the viewer targets **IFC + DXF + PDF** natively and treats DWG/RVT as
convert-on-import.

### 3.2 Local AI tutor (on-device, private)
A second Tauri sidecar — an **`ai-runtime`** (llama.cpp / Ollama-style server)
running a small **quantized local LLM**, supervised exactly like `leos-server`.

- **Explain details:** select an element in the IFC tree, a region of a DXF, or
  text in a PDF → "explain this" → the model answers from the selection +
  retrieved course context.
- **RAG over pulled material:** notes, assignment briefs, and PDFs the student
  has synced are chunked and embedded locally (small embedding model) into a
  local vector index (`sqlite-vec`); the tutor answers grounded in *this course's*
  material, offline.
- **Create learning environments:** the tutor generates guided study modules
  from the synced material — lesson walkthroughs, flashcards, self-quizzes, and
  worked design-brief breakdowns — as local, revisitable artefacts.
- **Privacy:** everything runs on the student's machine; no prompts, drawings, or
  documents leave the device. Aligns with LEOS's no-cloud stance.
- **Hardware realism:** ships with a small default model; heavier models are
  opt-in. Model files are large — distributed as an optional download, not baked
  into the installer (§11 decision).

### 3.3 Assignment workspace + submit
- Pull assignment brief (+ attached reference notes/CAD/PDF) into a local
  workspace.
- Work offline; attach deliverables (sheets, IFC/DXF, PDF, model photos).
- **Submit** → queued in the **outbox** → flushed to the hub when online →
  becomes a `submission` the lecturer pulls. Submissions are **immutable
  versions** (resubmit = new revision, never overwrite).

---

## 4. Lecturer Web App

Browser build of the shared React/Mantine UI (no Tauri, no local AI, no heavy
viewers — lecturers get lightweight web previews of submitted CAD/PDF, powered
by the same viewer packages compiled for the web).

- **Notes:** rich authoring (markdown + attachments), scoped to a
  studio/subject; publish → students pull.
- **Assignments:** create briefs (due date, deliverables, rubric), receive
  submissions, **grade** against a rubric → writes `jury_marks`/grade + written
  feedback → students pull result.
- **Announcements, Timetables:** reuse the existing Event OS and Timetable OS;
  publish → push to students.
- The lecturer app is **hub-backed** (thin cache), since lecturers are typically
  online on campus; it degrades to read-only cached data offline.

---

## 5. Sync & push protocol

**Model:** *publish + pull, push-signalled.* Producers submit; the hub emits a
lightweight "something changed" push; consumers pull the delta.

### 5.1 Channels (per user, role-scoped)
| Direction | Channel | Producer → Consumer |
|---|---|---|
| Down | `notes`, `assignments`, `announcements`, `timetable`, `grades` | Lecturer/Admin → Students |
| Up | `submissions` | Student → Lecturer |

### 5.2 Mechanics
- **Cursor:** each client stores a per-channel `since` revision. Hub assigns a
  monotonic `revision` to every change.
- **Push signal:** hub → connected clients over **WebSocket** (fallback SSE /
  interval poll): `{channel, latest_revision}`. Signal carries no payload — it
  just wakes the puller.
- **Pull:** client calls `GET /sync/changes?channel=&since=` → manifest of
  new/changed items (ids, revisions, blob hashes) → fetches item bodies +
  attachments it doesn't already have → advances cursor.
- **Outbox / submit:** local writes (a submission, a note, a grade) go to a local
  **outbox** with an **idempotency key**; on connect, `POST /sync/submit` each;
  hub acks with assigned revision; item leaves the outbox. Safe across crashes
  and duplicate sends.
- **Attachments = content-addressed blobs:** SHA-256 keyed, uploaded/downloaded
  once, deduplicated, resumable — reusing LEOS's existing checksum discipline.
- **Conflicts:** rare by construction (single-owner entities, immutable
  submission versions). Field-level last-write-wins by revision covers the edge
  cases (e.g., an edited note).

### 5.3 Offline hand-off (no network at all)
Any channel item + its blobs can be exported as a signed **`.leospack`** bundle
(the `.leosdb` archive format, scoped to one course/assignment) and sideloaded on
the other client — for field studios or air-gapped labs.

---

## 6. Hub — server design

Evolves the current `server/src/lib.rs` (`tiny_http` + `rusqlite`) into a
networked service:

- **Identity/auth:** bcrypt (existing) → issue **JWT** with a `role` claim
  (`student` | `lecturer` | `admin` → maps onto the existing L1–L5 levels).
  Endpoints are role-gated as today via `module_settings.min_level`.
- **Sync API:** `/auth/*`, `/sync/changes`, `/sync/submit`, `/blobs/:hash`
  (GET/PUT), `/events` (WebSocket). All new route branches follow the existing
  `if method == … && path.starts_with(…)` dispatch convention.
- **Storage:** canonical SQLite in **WAL mode** for a single school's
  concurrency (fits the current rusqlite code); DB access fenced behind a trait
  so **Postgres** can slot in for large/multi-school deployments without touching
  handlers.
- **Schema:** reuses the studio tables from the system-design doc, plus sync
  columns:
  ```sql
  -- every syncable row carries:
  --   revision INTEGER, owner_id INTEGER, updated_at TEXT, deleted INTEGER
  CREATE TABLE IF NOT EXISTS notes(id INTEGER PRIMARY KEY AUTOINCREMENT,
     subject_id INTEGER, studio_id INTEGER, author_id INTEGER,
     title TEXT, body TEXT, revision INTEGER, updated_at TEXT, deleted INTEGER DEFAULT 0);
  CREATE TABLE IF NOT EXISTS assignments(id INTEGER PRIMARY KEY AUTOINCREMENT,
     studio_id INTEGER, title TEXT, brief TEXT, rubric TEXT,
     due_date TEXT, author_id INTEGER, revision INTEGER, updated_at TEXT, deleted INTEGER DEFAULT 0);
  CREATE TABLE IF NOT EXISTS submissions(id INTEGER PRIMARY KEY AUTOINCREMENT,
     assignment_id INTEGER, student_id INTEGER, version INTEGER DEFAULT 1,
     submitted_at TEXT, note TEXT, revision INTEGER, deleted INTEGER DEFAULT 0);
  CREATE TABLE IF NOT EXISTS submission_blobs(id INTEGER PRIMARY KEY AUTOINCREMENT,
     submission_id INTEGER, blob_hash TEXT, filename TEXT, kind TEXT);
  CREATE TABLE IF NOT EXISTS blobs(hash TEXT PRIMARY KEY, size_bytes INTEGER,
     path TEXT, created_at TEXT DEFAULT (datetime('now')));
  CREATE TABLE IF NOT EXISTS sync_cursors(user_id INTEGER, channel TEXT,
     since_revision INTEGER, updated_at TEXT, PRIMARY KEY(user_id, channel));
  ```
  Grades reuse `jury_marks`; announcements/timetable reuse existing tables, gaining
  `revision`/`updated_at` for sync.

---

## 7. Shared code — monorepo target

Refactor the current `frontend/` + `server/` + `src-tauri/` into:

```
/hub                      Rust networked hub (from server/)
/apps
  /student-desktop         Tauri v2 + React; ai-runtime + leos-server sidecars; viewers
  /lecturer-web            React web build (Vite)
/packages
  /ui                      shared Mantine cockpit components (extracted from frontend/)
  /sync-client             TS sync engine: cursors, outbox/inbox, blob transfer
  /viewers                 pdf.js / web-ifc / dxf-viewer wrappers (web + desktop)
  /domain                  shared types (studios, juries, notes, assignments)
```

Both apps consume `/packages/ui`, `/packages/domain`, and `/packages/sync-client`
so the two front-ends stay consistent and the sync logic exists once.

---

## 8. Security & privacy

- **On-device AI** = zero data egress for tutoring; the most privacy-sensitive
  work (a student's drawings and questions) never touches the network.
- **Transport:** hub over TLS even on LAN; JWT bearer per request; WebSocket
  authenticated at handshake.
- **Blobs:** content-addressed + integrity-checked (SHA-256); submissions are
  immutable and audit-logged (existing `audit_log`).
- **Least privilege:** students can read published channels and write only their
  own submissions; lecturers write notes/assignments/grades and read their
  studios' submissions — enforced by the `role`/level gate.

---

## 9. Phased delivery

| Phase | Deliverable |
|---|---|
| **A — Hub networking** | JWT auth, `/sync/changes` + `/sync/submit` + `/blobs`, WebSocket push, revision columns; keep the current app working against it |
| **B — Sync client** | `/packages/sync-client` (cursor, outbox/inbox, blob transfer) + local SQLite cache |
| **C — Lecturer web** | Web build: notes, assignments, grading (→ jury marks), announcements, timetable publish |
| **D — Student desktop core** | Assignment workspace + submit; PDF + IFC + DXF viewers |
| **E — Local AI** | `ai-runtime` sidecar, local RAG over synced material, explain-selection, learning-environment generation |
| **F — Offline hand-off** | `.leospack` export/import; conflict-edge polish; Postgres option for scale |

Phases A–B are pure backend/plumbing and ship behind the existing UI; the split
becomes user-visible from C onward.

---

## 10. License diligence (GPL v2 repo)

Third-party viewers/AI must be checked against LEOS's GPL v2 posture — flag, do
not assume:
- **pdf.js** (Apache-2.0) and **web-ifc** (MPL-2.0) are loaded as arm's-length
  components in the WebView (aggregation) — the typical distribution path, but
  confirm before bundling.
- **llama.cpp** (MIT), **dxf-viewer** (MIT) — permissive, low risk.
- **DWG conversion** (e.g., LibreDWG is **GPL-3.0**) can conflict with a
  *GPLv2-only* project — prefer shipping DXF/IFC native and keeping any GPLv3 DWG
  converter as an **external, user-installed tool**, not a bundled dependency.

A short license review is a prerequisite for Phases D–E.

---

## 11. Open questions / decisions for you

1. **Hub hosting:** on-campus/self-hosted LAN (recommended, keeps the offline,
   no-subscription ethos) — or cloud/multi-tenant? Design supports both; default
   assumed is self-hosted.
2. **Local AI packaging:** bundle a default small model (bigger installer, works
   out-of-box) vs. optional post-install model download (lean installer, needs a
   fetch step). Recommended: **optional download**, with a bundled tiny fallback.
3. **Minimum student hardware** for the local LLM (RAM/GPU) — sets the default
   model size; needs a target spec.
4. **Grading scale** (carried over): rubric score vs letter/GPA — `jury_marks`
   already stores both; confirm before Phase C grading UI.
5. **DWG/RVT support depth:** native-convert vs "bring an exported IFC/DXF."
   Affects license posture (§10).

---

*Draft only — no code changes in this commit. This architecture supersedes the
single-app assumption in the earlier docs for the student/lecturer workflow; the
studio/jury/portfolio/internship/thesis data model from
[`architecture-education-system-design.md`](architecture-education-system-design.md)
is reused as the hub's domain schema.*
