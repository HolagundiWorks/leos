// Client for the in-app Service Manager. These call Tauri commands exposed by
// src-tauri/src/main.rs, which delegate to the server_manager supervisor.
//
// Only available inside the LEOS desktop app — in a plain browser there is no
// Tauri bridge, so callers must guard on `isTauri`.
import { invoke } from '@tauri-apps/api/core';
import { isTauri as detectTauri } from '../lib/tauriDialog';

export type ServerState = 'stopped' | 'starting' | 'running' | 'crashed' | 'repairing';

export interface ServerStatus {
  state: ServerState;
  healthy: boolean;
  port: number;
  pid: number | null;
  uptime_secs: number;
  /** Auto-restart the backend if it exits unexpectedly. */
  autostart: boolean;
  /** true = supervised child process (controllable); false = embedded fallback. */
  managed: boolean;
  backend: string;
  binary: string | null;
  last_error: string | null;
}

export const isTauri = detectTauri;

export const serverStatus = () => invoke<ServerStatus>('server_status');
export const serverStart = () => invoke<ServerStatus>('server_start');
export const serverStop = () => invoke<ServerStatus>('server_stop');
export const serverRestart = () => invoke<ServerStatus>('server_restart');
export const serverRepair = () => invoke<ServerStatus>('server_repair');
export const serverLogs = (limit = 200) => invoke<string[]>('server_logs', { limit });
export const serverSetAutostart = (enabled: boolean) =>
  invoke<ServerStatus>('server_set_autostart', { enabled });
