import { useCallback, useEffect, useState } from 'react';
import { Box, Group, Loader, Menu, Text } from '@mantine/core';
import { Play, RotateCw, Server, Square, Wrench } from 'lucide-react';
import {
  isTauri,
  serverRepair,
  serverRestart,
  serverStart,
  serverStatus,
  serverStop,
  type ServerState,
  type ServerStatus,
} from '../api/serverControl';

// Persistent, always-reachable backend control. Rendered at the App root —
// OUTSIDE the school-file/login gates — because those gates need the backend
// (/school/open, /auth/login). If the backend hangs you could never log in to
// reach the in-app Server Control panel, so the recovery controls (Restart /
// Repair / Start / Stop) must live somewhere that's available everywhere and
// that talks to the Service Manager over Tauri IPC, not the HTTP backend.

const STATE_DOT: Record<ServerState, string> = {
  running: 'var(--mantine-color-mint-5, #2bbf8a)',
  starting: 'var(--mantine-color-sky-5, #3b9ae1)',
  repairing: 'var(--mantine-color-yellow-5, #f1c40f)',
  crashed: 'var(--mantine-color-red-6, #e03131)',
  stopped: 'var(--mantine-color-gray-5, #adb5bd)',
};

const STATE_LABEL: Record<ServerState, string> = {
  running: 'Running',
  starting: 'Starting…',
  repairing: 'Repairing…',
  crashed: 'Crashed',
  stopped: 'Stopped',
};

export function ServerControlFooter({ onOpenPanel }: { onOpenPanel?: () => void }) {
  const [status, setStatus] = useState<ServerStatus | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setStatus(await serverStatus());
    } catch {
      /* IPC not ready yet */
    }
  }, []);

  useEffect(() => {
    if (!isTauri) return;
    void refresh();
    const id = setInterval(refresh, 3000);
    return () => clearInterval(id);
  }, [refresh]);

  // Only meaningful inside the desktop app (Tauri IPC). No-op in a browser.
  if (!isTauri) return null;

  const state = status?.state ?? 'stopped';
  const managed = status?.managed ?? false;
  const healthy = status?.healthy ?? false;
  // Draw attention when something is wrong; stay quiet when all is well.
  const attention = state === 'crashed' || (!healthy && state !== 'starting' && state !== 'repairing');

  const run = async (action: () => Promise<ServerStatus>) => {
    setBusy(true);
    try {
      setStatus(await action());
    } catch {
      /* surfaced via status.last_error on next refresh */
    } finally {
      setBusy(false);
      void refresh();
    }
  };

  return (
    <Box
      style={{
        position: 'fixed',
        left: 12,
        bottom: 12,
        zIndex: 400, // above modals so it's reachable even with a dialog open
      }}
    >
      <Menu shadow="md" width={210} position="top-start" withinPortal>
        <Menu.Target>
          <Group
            data-testid="server-footer-pill"
            gap={8}
            wrap="nowrap"
            px="sm"
            py={6}
            style={{
              cursor: 'pointer',
              borderRadius: 999,
              background: 'rgba(30,35,41,0.92)',
              border: attention ? '1px solid var(--mantine-color-red-6, #e03131)' : '1px solid rgba(255,255,255,0.08)',
              boxShadow: '0 4px 14px rgba(0,0,0,0.25)',
              userSelect: 'none',
            }}
            title="Backend server controls"
          >
            <Server size={13} color="#e9ecef" />
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: STATE_DOT[state],
                boxShadow: state === 'running' ? '0 0 6px var(--mantine-color-mint-5, #2bbf8a)' : undefined,
                flexShrink: 0,
              }}
            />
            <Text size="xs" c="gray.2" fw={500}>
              Server: {STATE_LABEL[state]}
            </Text>
            {busy && <Loader size={12} color="gray.4" />}
          </Group>
        </Menu.Target>

        <Menu.Dropdown>
          <Menu.Label>
            leos-server · :{status?.port ?? '—'}
            {status?.pid ? ` · pid ${status.pid}` : ''}
          </Menu.Label>

          <Menu.Item
            leftSection={<RotateCw size={14} />}
            disabled={busy || !managed}
            onClick={() => run(serverRestart)}
            data-testid="server-footer-restart"
          >
            Restart server
          </Menu.Item>
          <Menu.Item
            leftSection={<Wrench size={14} />}
            disabled={busy || !managed}
            onClick={() => run(serverRepair)}
            data-testid="server-footer-repair"
          >
            Repair (check database)
          </Menu.Item>
          <Menu.Item
            leftSection={<Play size={14} />}
            disabled={busy || !managed || state === 'running'}
            onClick={() => run(serverStart)}
          >
            Start
          </Menu.Item>
          <Menu.Item
            leftSection={<Square size={14} />}
            disabled={busy || !managed || state === 'stopped'}
            color="red"
            onClick={() => run(serverStop)}
          >
            Stop
          </Menu.Item>

          {onOpenPanel && (
            <>
              <Menu.Divider />
              <Menu.Item leftSection={<Server size={14} />} onClick={onOpenPanel} data-testid="server-footer-open-panel">
                Open Server Control
              </Menu.Item>
            </>
          )}

          {status?.last_error && (
            <Text size="xs" c="red.5" px="sm" pt={4} pb={2} style={{ wordBreak: 'break-word' }}>
              {status.last_error}
            </Text>
          )}
          {!managed && (
            <Text size="xs" c="dimmed" px="sm" pt={4} pb={2}>
              Backend is embedded — restart the app to recover.
            </Text>
          )}
        </Menu.Dropdown>
      </Menu>
    </Box>
  );
}
