// Prepare a production LEOS bundle.
//
// Run automatically by Tauri's `beforeBuildCommand` (and usable standalone):
//   1. build the standalone `leos-server` (release),
//   2. copy it to the Tauri sidecar path with the target-triple suffix
//      (src-tauri/binaries/leos-server-<triple>[.exe]) so `externalBin` ships it
//      next to LEOS.exe, where the Service Manager finds and supervises it,
//   3. build the frontend (Vite → frontend/dist, which Tauri bundles).
//
// Idempotent and cross-platform. Fails loudly so a broken bundle never ships.
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const run = (cmd, cwd) => {
  console.log(`\n$ ${cmd}  (in ${cwd})`);
  execSync(cmd, { cwd, stdio: 'inherit' });
};

// Host target triple (e.g. x86_64-pc-windows-msvc).
const triple = execSync('rustc -vV')
  .toString()
  .split('\n')
  .find((l) => l.startsWith('host:'))
  ?.split(' ')[1]
  ?.trim();
if (!triple) throw new Error('could not determine the Rust host target triple');
const isWin = process.platform === 'win32';
const exe = isWin ? '.exe' : '';

// 1) Standalone backend (release).
run('cargo build --release', join(repo, 'server'));
const builtServer = join(repo, 'server', 'target', 'release', `leos-server${exe}`);
if (!existsSync(builtServer)) throw new Error(`server binary missing: ${builtServer}`);

// 2) Copy to the Tauri sidecar location.
const binDir = join(repo, 'src-tauri', 'binaries');
mkdirSync(binDir, { recursive: true });
const sidecar = join(binDir, `leos-server-${triple}${exe}`);
copyFileSync(builtServer, sidecar);
console.log(`sidecar ready: ${sidecar}`);

// 3) Frontend production build.
run('npm run build', join(repo, 'frontend'));

console.log('\n✓ prepare-build complete — `cargo tauri build` can now bundle.');
