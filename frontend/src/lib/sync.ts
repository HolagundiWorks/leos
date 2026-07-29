// Hub sync engine (M2) — the pull side of the push-signalled, pull-fetched
// protocol in docs/two-app-split-architecture.md §5.
//
// A client keeps a per-channel cursor (the highest revision it has pulled). On
// a sync tick it asks the hub for everything changed since that cursor, applies
// the delta locally, then advances and persists the cursor — locally first (so
// it survives offline restarts) and, best-effort, back to the hub. This is
// deliberately transport-agnostic: today it is invoked on an interval / after a
// poll; when the WebSocket push signal lands it is invoked on the signal
// instead, with no change to the logic here.

import { fetchSyncChanges, saveSyncCursor, putBlob, getBlob } from '../api/client';

const CURSOR_KEY = (channel: string) => `leos.sync.cursor.${channel}`;

/** Locally cached cursor for a channel (0 if never synced). */
export function localCursor(channel: string): number {
  const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(CURSOR_KEY(channel)) : null;
  const n = raw ? Number(raw) : 0;
  return Number.isFinite(n) ? n : 0;
}

function setLocalCursor(channel: string, since: number): void {
  if (typeof localStorage !== 'undefined') localStorage.setItem(CURSOR_KEY(channel), String(since));
}

export interface PullResult<T> {
  changes: T[];
  deletes: number[];
  cursor: number;
  applied: number;
}

/**
 * Pull one channel forward from the local cursor and hand the delta to
 * `apply`. Advances the cursor only after `apply` resolves, so a failure mid-
 * apply is retried on the next tick (at-least-once delivery). Offline-safe: a
 * network error throws to the caller and the cursor is left untouched.
 */
export async function pullChannel<T = Record<string, unknown>>(
  token: string,
  channel: string,
  apply: (changes: T[], deletes: number[]) => void | Promise<void>,
): Promise<PullResult<T>> {
  const since = localCursor(channel);
  const res = await fetchSyncChanges<T>(token, channel, since);
  if (res.changes.length > 0 || res.deletes.length > 0) {
    await apply(res.changes, res.deletes);
  }
  // Advance to the server's reported cursor (the max revision it knows about).
  setLocalCursor(channel, res.cursor);
  // Best-effort: mirror the cursor to the hub so other devices / a fresh
  // install can resume; never let this failing block local progress.
  try {
    await saveSyncCursor(token, channel, res.cursor);
  } catch {
    /* offline or hub unreachable — local cursor already advanced */
  }
  return { changes: res.changes, deletes: res.deletes, cursor: res.cursor, applied: res.changes.length + res.deletes.length };
}

/** Reset a channel's cursor so the next pull re-fetches from the beginning. */
export function resetChannel(channel: string): void {
  setLocalCursor(channel, 0);
}

/** Upload an attachment payload (base64 / data-URL); returns its content hash. */
export async function uploadBlob(token: string, data: string): Promise<string> {
  const res = await putBlob(token, data);
  return res.hash;
}

/** Fetch an attachment payload by content hash. */
export async function downloadBlob(token: string, hash: string): Promise<string> {
  const res = await getBlob(token, hash);
  return res.data;
}
