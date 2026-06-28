# LEOS Server Control / Service Manager

LEOS is **one** user-facing app, but internally it treats the Rust API backend
as a separately managed service. This document describes that layer.

## Layers

```
LEOS Desktop App (LEOS.exe)
├─ UI (React / Mantine)            — System → Server panel
├─ Tauri command bridge           — server_status/start/stop/restart/repair/logs/set_autostart
├─ Service Manager                — src-tauri/src/server_manager.rs
│   └─ ServerController (trait)
│       └─ ChildProcessController  — supervises leos-server.exe (phase 1)
│       └─ [WindowsServiceController] — phase 2 (not yet built)
├─ leos-server                     — Rust API (tiny_http + rusqlite)
└─ SQLite (school.sqlite)
```

The UI never talks to a process directly — it calls Tauri commands, which call
the `ServerController` trait. Swapping the backend (child process → Windows
Service) is an implementation change behind that trait; the UI and commands stay
the same.

## Control surface (what the panel does)

| Action | Command | Behaviour |
|---|---|---|
| Start | `server_start` | Spawn `leos-server` if not running |
| Stop | `server_stop` | Kill the supervised child |
| Restart | `server_restart` | Stop, brief pause, start |
| Repair | `server_repair` | Stop → `PRAGMA integrity_check` on the DB → start |
| Health | `server_status.healthy` | `GET /health` probed each second by the supervisor |
| Logs | `server_logs` | Last N lines of backend stdout/stderr (ring buffer, 500) |
| Auto-restart | `server_set_autostart` | Supervisor relaunches the backend if it crashes (≤5×, resets on health) |

## Always-reachable recovery (footer)

The full Server Control panel lives behind the login gate — but logging in needs
the backend (`/auth/login`). If the backend hangs you could never reach the panel
to fix it. So a compact **server-status pill is rendered at the App root, in the
Welcome and Login gates too** (`ServerControlFooter`, bottom-left). It polls
status and offers Restart / Repair / Start / Stop directly over Tauri IPC, so the
backend can be recovered from anywhere — even before sign-in, even with a dialog
open (it sits above modals). It turns red when the backend is unhealthy.

## Supervisor states

`stopped → starting → running` on success; `running → crashed` on unexpected
exit (then auto-restart if enabled); `repairing` while Repair runs. The
supervisor thread polls `try_wait()` + `/health` every second and folds the
result into the status the panel reads.

## Backend resolution

`leos-server` is located in this order:
1. `LEOS_SERVER_BIN` (explicit override; used by tests)
2. next to `LEOS.exe` (how it should ship in production — see packaging below)
3. `server/target/{release,debug}/leos-server[.exe]` (dev)

If none is found, LEOS runs the backend **embedded in-process** as a fallback.
The panel then shows it as *unmanaged* (health + logs only; Start/Stop/Restart
disabled), because you can't stop an in-process server without closing the app.

## Verification

`cargo test -p leos supervises_real_backend_lifecycle` (in `src-tauri/`) spawns
the real backend on an isolated port + temp data dir, waits for it to report
healthy, then stops it — proving the supervisor genuinely manages the process.

## Phase 2 — Windows Service (not yet built)

For a backend that outlives the UI (LAN "always-on" multi-user, true auto-start
on boot), implement `WindowsServiceController: ServerController`:

- Wrap `leos-server` in a service entry point (e.g. the `windows-service` crate).
- Register it during install (NSIS/MSI, elevated): `sc create LEOSServer …`,
  start type *automatic*.
- `start/stop/restart` shell out to the Service Control Manager (`sc`/`net`), or
  use the service APIs (may require elevation; the app can request it on demand).
- `status` reads the service state + the same `/health` probe.

Because everything is behind `ServerController`, the panel and commands need no
changes — only the `manage()` wiring in `main.rs` selects which controller to
use (e.g. Service if installed, else child process).

## Packaging note (production)

The child-process backend needs `leos-server.exe` shipped next to `LEOS.exe`.
Configure it as a Tauri **sidecar** (`bundle.externalBin` in `tauri.conf.json`)
or an installer resource. Until then, the embedded fallback keeps the app working
from a single binary. Tracked alongside the installer tests in `test-plan.md`.
