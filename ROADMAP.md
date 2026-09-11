# LEOS roadmap

This roadmap reflects the code in the repository as of September 2026. A screen
or API route being present means the feature is implemented; it does not by
itself mean the feature is production-ready. Production readiness also requires
permission enforcement, automated coverage, security hardening, and a clean
installer test.

Legend: ✅ implemented · 🟡 implemented but incomplete/hardening needed · ⬜ planned

## Implemented product surface

- ✅ Electron desktop shell, React/Mantine UI, typed IPC, and SQLite data; the
  legacy Tauri/Rust and duplicate timetable implementations are removed
- ✅ portable `.leosdb` create/open/save flow with checksum verification
- ✅ students, admissions, staff, courses, subjects, classes, classrooms, and academic years
- ✅ timetable, timings, substitutions, teacher mapping, daily schedule, room occupancy, and floor plans
- ✅ attendance entry, kiosk scanning, reporting, CSV export, and printable reports
- ✅ exams, marks, practical exams, exam archive, board eligibility, and compliance records
- ✅ fees, receipts, finance reports, scholarships/concessions, salary structures, and payslips
- ✅ events, reminders, activities, itineraries, parent guides, sports, clubs, letters, and certificates
- ✅ library, transport, visitor log, issued-item tracking, and ID cards
- ✅ backup/recovery UI, CSV/SQLite import and merge, audit log, roles UI, module settings, and institution settings
- ✅ role-specific dashboards and L1–L5 ribbon visibility
- ✅ faculty-entered daily, weekly, and monthly lesson/activity/schedule plans
  with individual and consolidated A4 print/PDF reports
- ✅ linked teacher, parent, and student portal accounts with scoped personal
  profiles and locally hashed passwords
- ✅ offline learning management spaces linked to classes and subjects, with
  publishable modules, lessons/resources, assignments, student submissions,
  teacher grading, feedback, and parent read-only visibility
- 🟡 LAN Connection Manager for hosting an open school from the same address to
  ordinary browsers and other LEOS desktops using a temporary pairing code;
  trusted private networks only until transport encryption is complete
- 🟡 optional L1-only Supabase REST connection configuration and health test;
  define explicit, conflict-safe synchronization jobs before enabling cloud sync
- ✅ native Android LAN client with remembered host URL, pairing, login,
  dashboard, students, attendance, plans, LMS, tasks, reminders, schedules,
  and server-enforced day-to-day feature boundaries

## Required before production

| Work                                              | Priority | Status | Evidence / scope                                                                                                                                                                                                                                     |
| ------------------------------------------------- | -------: | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Enforce authorization on every application route  |       P0 | 🟡     | Admin routes are L1-gated; parent/student sessions fail closed outside linked profile/LMS routes; and L2–L4 read boundaries are API-tested for staff, students, and faculty plans. Complete an exhaustive generated route matrix. See `bug-reports/BUG-20260627-02-security.md`. |
| Secure pre-login archive operations               |       P0 | ✅     | Create/open/unlock are dedicated Electron IPC handlers. LAN clients pair through the LAN manager and cannot invoke host filesystem archive operations.                                                                                             |
| Remove default/demo credentials from release flow |       P0 | ✅     | New schools require user-entered credentials. Fixed credentials exist only in isolated tests and the opt-in, Git-ignored fictional demo archive; neither ships in the installer.                                                                     |
| Backup/restore round-trip tests                   |       P0 | 🟡     | Electron verification covers archive creation, history, LAN blocking, wrong-key and corrupt-checksum rejection, and a successful restore round-trip. Add an old-schema fixture.                                                                      |
| Installer smoke test on a clean Windows VM        |       P0 | ⬜     | Verify Electron installer, first run, built-in SQLite loading, upgrade, and uninstall data retention.                                                                                                                                                 |
| Code signing and release pipeline                 |       P1 | ⬜     | Sign the Electron application and installers; build and test tagged releases in CI.                                                                                                                                                                  |
| Automated coverage for operational modules        |       P1 | 🟡     | Core CRUD/compliance API coverage plus finance, operations, HR, coordination, and backup DB verification exists; most screens still lack E2E coverage. See `test-inventory.md`.                                                                      |
| Harden TypeScript operations behavior              |       P1 | 🟡     | Core operations and all 159 renderer path shapes pass the generated TypeScript route probe. Add behavior-level coverage for remaining hardware and edge flows before production.                                                                    |
| Dependency/security maintenance | P1 | 🟡 | Electron 41.10.7 and the desktop lockfile currently audit clean; pin Node 24 and the lockfile in CI and keep the runtime patched. |
| Frontend code splitting                           |       P2 | ✅     | Heavy module screens, QR/canvas tools, and the PDF engine are lazy-loaded. The startup JS chunk is below 500 kB (about 485 kB in the verified production build), down from roughly 1.65 MB.                                                           |
| LMS automated coverage                            |       P1 | 🟡     | Teacher ownership, published visibility, linked/unlinked learner isolation, student-only submission, parent denial, grading limits, and schema migration are verified. Add renderer E2E for authoring controls.                                      |
| Supabase synchronization                          |       P1 | 🟡     | L1-only project URL/publishable-key configuration, masked reads, audit logging, and REST connection testing are implemented. SQLite remains authoritative; add opt-in table mappings, conflict policy, retry queue, and sync tests before moving data. |
| Android release hardening                         |       P1 | 🟡     | Native Material 3 APK builds with SDK 35, Carbon light/dark tokens, and branded adaptive icons; physical-device launch is verified. Add release signing, network-loss UX, and TLS before distribution. |
| Accessibility and keyboard audit                  |       P2 | ⬜     | Validate focus order, dialogs, tables, contrast, screen readers, and the complete shortcut map.                                                                                                                                                      |

## Later product work

| Work                                          | Status | Notes                                                                                                                                                                                                                         |
| --------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Change-master-key UI                          | ⬜     | Add key rotation and recovery policy.                                                                                                                                                                                         |
| At-rest database encryption                   | ⬜     | Evaluate SQLCipher separately from `.leosdb` access gating.                                                                                                                                                                   |
| Harden LAN multi-user mode                    | 🟡     | Host/client workflow, paired browser UI, private-address validation, remote login/logout revocation, concurrent transport, and disconnect fallback are tested. Add TLS, SQLite write-concurrency tests, discovery, multi-device validation, and firewall guidance before production use. |
| Auto-update                                   | ⬜     | Add only after signing and a trusted release channel exist.                                                                                                                                                                   |
| Retire the duplicate Electron timetable stack | ✅     | Timings, conflict detection, quotas, teacher load, timetable editing, and scheduling verification exist in LEOS; the duplicate stack was removed with the approved legacy allowlist. |

## Completed architecture migration

LEOS now has one TypeScript desktop stack: React/Vite renderer, Electron main
process, typed IPC, and SQLite. Runtime services live under `desktop/`; the
automated harness runs entirely against this stack, and the former Tauri/Rust
and duplicate timetable sources have been removed. Git history preserves the
cutover record. Clean-VM and signing work remains in the production-release
section above.

## Clarified scope

- NFC/barcode keyboard-wedge scanning and card enrollment are implemented.
  Native biometric-device integration is not.
- Printable HTML/PDF-oriented reports exist in individual modules; there is no
  generic SheetJS/ExcelJS reporting layer.
- The master key gates opening a school file but does not encrypt SQLite at rest.
