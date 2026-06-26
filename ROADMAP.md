# HCW-SMS Roadmap

HCW School Management System — a calm, desktop-first "school operations cockpit"
(Tauri v2 + React/Mantine + TanStack Query + Zustand) over a PHP API wrapper on
openSIS / MariaDB. See the design intent in `docs` and the cockpit rules in the
School OS UI Design Guide.

Legend: ✅ done · 🟡 in progress · ⬜ planned

---

## Phase 0 — Foundation ✅

- ✅ Rebrand openSIS → HCW-SMS (code identifiers + branding; GPL attribution kept)
- ✅ Podman dev stack (Apache/PHP + MariaDB 10.11); data restored into DB `hcwsms`
- ✅ PHP API v1: bcrypt+JWT auth, `dashboard/summary`, `students`, `staff`
- ✅ React + Mantine SPA: login, auth (Zustand + TanStack Query, 401 auto-logout)
- ✅ Tauri v2 desktop shell; MSI + NSIS installers
- ✅ "School OS" cockpit: utility strip, 48px icon rail, bottom context ribbon,
  Ctrl-K command palette, Alt-1…9, Lucide icons, refreshed palette
- ✅ Students & Staff list screens

## Phase 1 — Finish the prototype (guide §19) 🟡

- ✅ **Student profile** — `GET /api/v1/students/{id}`; tabbed profile
  (Profile · Attendance · Fees · Academics · Documents) with top-right alert chips
- ⬜ **Selectable tables** — row selection refines the bottom ribbon (Edit · View ·
  Collect Fee · Print ID · Message Parent)
- ✅ **Active work-queue dashboard** — passive stat cards replaced with a "Today"
  needs-attention queue (`dashboard/today`: not-enrolled, no grades/courses)
- ⬜ Wire ribbon primary actions (Add/Edit student flows; stub the rest)

## Phase 2 — Attendance ⬜

- ⬜ Attendance schema review + seed; `GET/POST /api/v1/attendance`
- ⬜ Mark attendance (per class, bulk), daily summary, % ; feeds dashboard absentees

## Phase 3 — Fees ⬜

- ⬜ Fee structure + `collect fee` + receipts + dues; feeds dashboard pending queue

## Phase 4 — Exams & Grades ⬜

- ⬜ Exams, marks entry, publish results, report cards

## Phase 5 — Library · Transport · Reports · Settings ⬜

- ⬜ Library issue/return/fines; Transport; Reports/export; Settings; bulk import

## Phase 6 — Production hardening ⬜

- ⬜ Configurable API base (env, not hardcoded `localhost:8080`)
- ⬜ Installer signing + LAN deployment guide; auto-update
- ⬜ Consistent loading/empty/error states; full keyboard map; notifications
- ⬜ User testing per guide §20 (time-on-task, wrong clicks, ribbon discoverability)

---

### Current focus
Phase 1 → selectable-table → ribbon refinement, then the work-queue dashboard.
