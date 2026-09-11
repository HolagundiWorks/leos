# LEOS architecture

## Approved runtime

LEOS has one TypeScript application/backend stack. The Android package is a
native HTTP/JSON client and contains no duplicate school logic or storage:

| Layer | Technology |
|---|---|
| Desktop | Electron 41 |
| Renderer | React 18, TypeScript, Vite, Mantine |
| State | Zustand and TanStack Query |
| Boundary | sandboxed preload bridge with Zod-validated typed IPC |
| Services | TypeScript in the Electron main process |
| Storage | Node's built-in `node:sqlite` engine |
| Portable file | `.leosdb` ZIP with SQLite snapshot and SHA-256 checksum |
| Android client | Native Java/Material 3 views with Carbon colour tokens, using the paired LAN API |

```text
React renderer
      │ typed request contract
      ▼
sandboxed preload bridge
      │ trusted-frame IPC
      ▼
TypeScript domain routers ──► node:sqlite ──► school.sqlite
      │                                      │
      └── paired private-LAN transport       └── .leosdb save/open/restore
```

Production has no localhost API, Rust sidecar, native SQLite add-on, or second
backend. LAN clients forward the same validated request contract to the host
and never open the school database themselves.

## Client hierarchy

| Client | Intended capability |
| --- | --- |
| Host Electron desktop | Full administration, configuration, backup/import, hardware, Supabase, and operations |
| Paired LAN browser | Operational viewing and major data entry; no host settings or administration |
| Android LAN app | Day-to-day views, attendance, faculty plans, LMS submissions, tasks, and reminders |

These are server-side boundaries. Hiding a ribbon action is only a usability
measure; `ApiRouter` rejects operations outside the identified client surface.

## Security boundaries

- Context isolation, renderer sandboxing, and disabled Node integration.
- IPC accepts only trusted packaged files or the configured development origin.
- Zod validates IPC envelopes and domain payloads.
- Sessions are process-local and cleared when a school is replaced.
- Backup, restore, and import filesystem operations are host-local only.
- `.leosdb` open/restore validates size, checksum, integrity, and master key,
  then atomically swaps the active database.
- Role levels and linked-account checks protect administrative and portal data.
- Write domains record audit events.

## Data compatibility

`desktop/src/schema.ts` keeps the existing SQLite table names and advances
databases idempotently to schema version 4. `desktop/src/sqlite.ts` is a narrow
compatibility wrapper over `node:sqlite`, preserving the transaction, prepared
statement, pluck, and backup semantics used by migrated services.

## Legacy cutover

The former `server/`, `src-tauri/`, and `timetable-app/` implementations were
removed after schema/archive compatibility, generated route parity, automated
tests, packaging, and packaged-app launch checks passed. Git history remains the
recovery source for those retired implementations. Clean-VM installation,
signing, upgrade, and uninstall checks remain release-readiness gates, not a
second supported runtime.
