# LEOS deployment

LEOS ships as one Windows Electron application. The React renderer, TypeScript
application services, and Node's built-in SQLite engine are packaged together;
there is no localhost server, sidecar, Rust runtime, WebView2 bootstrapper, or
native database add-on.

## Build

Prerequisite: Node.js 24 or newer. Install dependencies once:

```powershell
npm run desktop:install
```

Build an unpacked application with `npm run desktop:package:dir`, or build the
Windows NSIS installer with `npm run desktop:package`.

Generated files are ignored under `desktop/release-electron/`. If real-time
scanning locks Electron's temporary extraction directory, build under `%TEMP%`:

```powershell
cd desktop
npx electron-builder --win nsis --config.directories.output="$env:TEMP\leos-installer-build"
```

## Data retention

The active database lives under `%LOCALAPPDATA%\LEOS\school.sqlite` by default.
Portable `.leosdb` archives contain a SQLite snapshot and SHA-256 checksum. The
NSIS configuration intentionally preserves application data on uninstall.

## Verified build evidence

- Electron 41.10.7 and the current lockfile report zero npm audit findings.
- Packaging needs no Python, Visual Studio, node-gyp, or native module rebuild.
- The packaged main, renderer, utility, and GPU processes launch successfully.
- Packaged `app.asar` and renderer resources are present.
- The executable and installer use the LEOS open-book identity rather than the
  default Electron icon.
- A 64-bit assisted NSIS installer is generated as
  `LEOS-0.3.0-x64-setup.exe`.
- Current local artifact: 98,739,403 bytes; SHA-256
  `D4EC9FCED298AB17CE5F5A139B6F0FCF8969DA32541616B77BD9EC4E51B85173`.

Android LAN debug client:

- `android-client/release-artifacts/LEOS-LAN-0.5.0-carbon-debug.apk`
- Native Material 3 Android client with Carbon colour tokens; it does not
  embed the LEOS web interface.
- SHA-256 `048E2555CC2749593CD9C4535BD27DD8977C51E2CD87B027265EF30757D00BE6`
- Install only for trusted testing; produce a signed release APK/AAB after TLS
  and physical-device validation.

## Clean-VM release gates

- Install and first launch.
- Create, save, reopen, and restore a school archive.
- Upgrade over a previous release and confirm school data remains.
- Uninstall and confirm `%LOCALAPPDATA%\LEOS` is retained.
- Configure Authenticode signing and verify the final signature.

The current unpacked artifact has also been smoke-launched locally: the main
process remained running with three child processes, `resources/app.asar` and
`resources/renderer/index.html` were both present. This is useful packaging
evidence, but it is not a substitute for the clean-VM gates above.
