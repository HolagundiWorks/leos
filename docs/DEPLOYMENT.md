# LEOS — Deployment

How to build and ship the LEOS Windows desktop app, and what to decide before a
production release.

## Build a release

Prerequisites: Rust (stable, `x86_64-pc-windows-msvc`), Node 18+, and the Tauri
CLI (`cargo install tauri-cli` — this repo uses 2.x). On the first bundle Tauri
downloads NSIS/WiX automatically (needs internet once).

```bash
cd src-tauri
cargo tauri build
```

`beforeBuildCommand` runs [`scripts/prepare-build.mjs`](../scripts/prepare-build.mjs),
which:
1. builds the standalone backend (`cargo build --release` in `server/`),
2. copies it to the Tauri **sidecar** path
   `src-tauri/binaries/leos-server-<target-triple>.exe` (declared as
   `bundle.externalBin` in `tauri.conf.json`),
3. builds the frontend (`frontend/dist`).

Tauri then bundles **LEOS.exe + the `leos-server` sidecar + WebView2 bootstrapper**
into an installer.

**Output:** `src-tauri/target/release/bundle/` → `nsis/LEOS_<ver>_x64-setup.exe`
and `msi/LEOS_<ver>_x64_en-US.msi`.

## How it runs once installed

- The installer places `LEOS.exe` and `leos-server.exe` together in the install
  dir. On launch, the **Service Manager** locates the sidecar next to the
  executable and supervises it (start/stop/restart/health/logs/repair from
  System → Server). See [`server-control.md`](server-control.md).
- If the sidecar is somehow missing, LEOS falls back to running the backend
  embedded in-process, so the app still works (control panel shows it unmanaged).
- All data lives in `%LOCALAPPDATA%\LEOS` (`school.sqlite`, `school.leosdb`,
  backups). Uninstalling the app does **not** remove that folder.

## Readiness checklist

| Item | Status |
|---|---|
| Automated tests (59: API/DB/E2E) green | ✅ |
| Server-side admin permission enforcement | ✅ (general write-route gating = phase 2) |
| In-app Server Control Panel | ✅ |
| Sidecar packaging (`externalBin` + prepare script) | ✅ |
| Frontend production build | ✅ |
| WebView2 runtime | ✅ Tauri bundles the bootstrapper by default |
| Backend as Windows Service (headless / boot autostart) | ⬜ phase 2 (`server-control.md`) |
| **Code signing** | ⬜ decision — unsigned installers trigger SmartScreen warnings; needs an Authenticode cert |
| **Default credentials** | ⚠️ decision — see below |
| **App version** | ✅ `0.3.0` (`tauri.conf.json` + `src-tauri/Cargo.toml`); tag the merge commit `v0.3.0` |
| Installer smoke test on a clean Windows VM | ⬜ manual (see `test-plan.md` §5) |

## Security notes (decide before shipping)

- **Default credentials.** A brand-new school created via the welcome screen sets
  its own master key + admin password. Only the **bundled demo** `school.leosdb`
  uses `admin` / `ChangeMe@3201`. Decide whether to ship the demo file at all, or
  force a credential change on first run.
- **Code signing.** Sign `LEOS.exe`, `leos-server.exe`, and the installer with an
  Authenticode certificate to avoid SmartScreen blocks. Configure under
  `bundle.windows.certificateThumbprint` (or sign in CI).
- **CSP** is currently `null` (`tauri.conf.json`). Tighten it for production if
  the webview ever loads remote content (today it loads only bundled assets +
  localhost API).

## Versioning

The release version is **0.3.0** (`src-tauri/tauri.conf.json` →
`LEOS_0.3.0_x64-setup.exe`, kept in sync with `src-tauri/Cargo.toml`). For each
release bump both, then tag the **merge commit on `main`**:

```bash
git tag -a v0.3.0 -m "LEOS 0.3.0"
git push origin v0.3.0
```
