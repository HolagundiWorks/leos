# LEOS — Build Roadmap

Learning Environment Operating System by Holagundi Consulting Works.
Offline-first desktop school OS: Tauri v2 + React/Mantine + Rust API + SQLite.

Legend: ✅ done · 🟡 in progress · ⬜ planned

---

## Foundation (P0) ✅

- ✅ Rust + SQLite API server (`tiny_http`, `rusqlite`, bcrypt, bearer auth) on `:8787`
- ✅ React 18 + TypeScript + Vite frontend with Mantine v7
- ✅ Tauri v2 desktop shell; Rust server embedded; MSI + NSIS installers
- ✅ LEOS brand palette (Deep Graphite `#1E2329`, Muted Teal `#3E7B7B`)
- ✅ School ops cockpit: utility strip + MS Office two-level tab ribbon + bottom context ribbon + `Ctrl-K` palette
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
- ✅ Selectable rows refine the bottom context ribbon

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
remain. Also added a Tally-style **pre-login school-file gate**: launch →
open a `.leosdb` (demo or by path) → sign in. The server auto-generates
`demo-school.leosdb` on first run. Default credentials: **admin / ChangeMe@3201**.

Next candidates: attendance report export (PDF/Excel), report cards, native
Tauri file dialog for the welcome screen, and LAN server/client mode.
