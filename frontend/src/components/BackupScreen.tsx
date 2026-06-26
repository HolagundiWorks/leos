import { useState } from 'react';
import {
  Badge,
  Button,
  Card,
  Container,
  Group,
  Select,
  Skeleton,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, CheckCircle, Database, Download, RefreshCw, RotateCcw } from 'lucide-react';
import { useAuth } from '../stores/auth';
import { isTauri, pickFile, pickFolder } from '../lib/tauriDialog';

const BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8787';

// ─── Types ────────────────────────────────────────────────────────────────────
interface BackupConfig {
  schedule: string | null;
  destinations: string | null;
  last_backup_at: string | null;
  enabled: boolean;
}

interface BackupEntry {
  id: number;
  filename: string;
  path: string | null;
  size_bytes: number | null;
  status: string | null;
  created_at: string;
}

// ─── API helpers ──────────────────────────────────────────────────────────────
const authed = (token: string) => ({ Authorization: `Bearer ${token}` });

async function apiConfig(token: string): Promise<{ config: BackupConfig }> {
  return fetch(`${BASE}/backup/config`, { headers: authed(token) }).then((r) => r.json());
}

async function apiList(token: string): Promise<{ backups: BackupEntry[] }> {
  return fetch(`${BASE}/backup/list`, { headers: authed(token) }).then((r) => r.json());
}

async function postJSON(token: string, path: string, body: object) {
  return fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { ...authed(token), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then((r) => r.json());
}

function fmtBytes(b: number | null) {
  if (b == null) return '—';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(2)} MB`;
}

const SCHEDULES = ['manual', 'daily', 'weekly', 'monthly'];

// ─── Main screen ──────────────────────────────────────────────────────────────
export function BackupScreen() {
  const token = useAuth((s) => s.token)!;
  const qc = useQueryClient();
  const [destDir, setDestDir] = useState('.');
  const [restorePath, setRestorePath] = useState('');
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);

  const { data: configData, isLoading: loadingConfig } = useQuery({
    queryKey: ['backup-config'],
    queryFn: () => apiConfig(token),
    staleTime: 60_000,
  });

  const { data: listData, isLoading: loadingList } = useQuery({
    queryKey: ['backup-list'],
    queryFn: () => apiList(token),
    staleTime: 30_000,
  });

  const configMut = useMutation({
    mutationFn: (cfg: { schedule: string }) =>
      postJSON(token, '/backup/config', { schedule: cfg.schedule, destinations: [destDir], enabled: true }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['backup-config'] }),
  });

  const runMut = useMutation({
    mutationFn: () => postJSON(token, '/backup/run', { destination: destDir }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['backup-list'] });
      qc.invalidateQueries({ queryKey: ['backup-config'] });
      setLastResult(res.ok ? `Saved: ${res.filename} (${fmtBytes(res.size_bytes)})` : `Error: ${res.error}`);
    },
  });

  const restoreMut = useMutation({
    mutationFn: () => postJSON(token, '/backup/restore', { path: restorePath }),
    onSuccess: (res) => {
      setConfirmRestore(false);
      setLastResult(res.ok ? `Restored from ${res.restored_from}` : `Error: ${res.error}`);
      qc.invalidateQueries({ queryKey: ['backup-config'] });
    },
  });

  const config = configData?.config;
  const backups = listData?.backups ?? [];

  return (
    <Container size="lg" px={0}>
      <Stack gap="lg">
        <Group gap="sm" mb={4}>
          <Database size={20} color="var(--mantine-color-brand-6)" />
          <Title order={2}>Backup &amp; Recovery</Title>
        </Group>

        {/* Config card */}
        <Card>
          <Text fw={600} mb="sm">Backup Configuration</Text>
          {loadingConfig ? <Skeleton height={80} radius="md" /> : (
            <Stack gap="sm">
              <Group gap="sm" align="flex-end">
                <Select
                  label="Schedule"
                  data={SCHEDULES.map((s) => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) }))}
                  value={config?.schedule ?? 'daily'}
                  onChange={(v) => configMut.mutate({ schedule: v ?? 'daily' })}
                  w={180}
                />
                <TextInput
                  label="Destination directory"
                  value={destDir}
                  onChange={(e) => setDestDir(e.currentTarget.value)}
                  placeholder="e.g. C:\Backups or /mnt/nas"
                  style={{ flex: 1 }}
                  rightSectionWidth={isTauri ? 84 : undefined}
                  rightSection={isTauri ? (
                    <Button size="compact-xs" variant="light" onClick={async () => { const d = await pickFolder(); if (d) setDestDir(d); }}>
                      Browse…
                    </Button>
                  ) : undefined}
                />
              </Group>
              {config?.last_backup_at && (
                <Text size="xs" c="dimmed">Last backup: {config.last_backup_at}</Text>
              )}
            </Stack>
          )}
        </Card>

        {/* Run backup */}
        <Card>
          <Group justify="space-between" mb="sm">
            <Text fw={600}>Manual Backup</Text>
            <Button
              leftSection={<Download size={14} />}
              onClick={() => runMut.mutate()}
              loading={runMut.isPending}
            >
              Run Backup Now
            </Button>
          </Group>
          {lastResult && (
            <Group gap="xs">
              {lastResult.startsWith('Error') ? (
                <AlertCircle size={14} color="var(--mantine-color-red-6)" />
              ) : (
                <CheckCircle size={14} color="var(--mantine-color-green-6)" />
              )}
              <Text size="sm" c={lastResult.startsWith('Error') ? 'red' : 'green'}>{lastResult}</Text>
            </Group>
          )}
        </Card>

        {/* Backup list */}
        <Card>
          <Group justify="space-between" mb="sm">
            <Text fw={600}>Backup History</Text>
            <Button size="xs" variant="subtle" leftSection={<RefreshCw size={12} />} onClick={() => qc.invalidateQueries({ queryKey: ['backup-list'] })}>Refresh</Button>
          </Group>
          {loadingList ? <Skeleton height={120} radius="md" /> : backups.length === 0 ? (
            <Text size="sm" c="dimmed">No backups yet. Run your first backup above.</Text>
          ) : (
            <Table withTableBorder striped>
              <Table.Thead>
                <Table.Tr><Table.Th>Filename</Table.Th><Table.Th>Size</Table.Th><Table.Th>Status</Table.Th><Table.Th>Created</Table.Th><Table.Th>Path</Table.Th><Table.Th /></Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {backups.map((b) => (
                  <Table.Tr key={b.id}>
                    <Table.Td><Text size="sm" fw={500}>{b.filename}</Text></Table.Td>
                    <Table.Td><Text size="sm">{fmtBytes(b.size_bytes)}</Text></Table.Td>
                    <Table.Td><Badge size="xs" color={b.status === 'ok' ? 'mint' : 'red'}>{b.status}</Badge></Table.Td>
                    <Table.Td><Text size="xs" c="dimmed">{b.created_at.slice(0, 16)}</Text></Table.Td>
                    <Table.Td><Text size="xs" c="dimmed" style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.path ?? '—'}</Text></Table.Td>
                    <Table.Td ta="right">
                      {b.status === 'ok' && (
                        <Button size="xs" variant="subtle" onClick={() => { setRestorePath(b.path ?? ''); setConfirmRestore(false); }}>
                          Restore
                        </Button>
                      )}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}
        </Card>

        {/* Restore panel */}
        <Card style={{ borderTop: '3px solid var(--mantine-color-peach-5)' }}>
          <Text fw={600} mb="xs">Restore from Backup</Text>
          <Text size="xs" c="dimmed" mb="sm">This will REPLACE the current database with the selected backup. All data created after that backup will be lost.</Text>
          <Stack gap="sm">
            <TextInput
              label="Backup file path (.leosdb)"
              value={restorePath}
              onChange={(e) => { setRestorePath(e.currentTarget.value); setConfirmRestore(false); }}
              placeholder="e.g. C:\Backups\LEOS-backup-xxxx.leosdb"
              rightSectionWidth={isTauri ? 84 : undefined}
              rightSection={isTauri ? (
                <Button size="compact-xs" variant="light" onClick={async () => { const f = await pickFile(); if (f) { setRestorePath(f); setConfirmRestore(false); } }}>
                  Browse…
                </Button>
              ) : undefined}
            />
            {restorePath && !confirmRestore && (
              <Button variant="outline" color="red" leftSection={<RotateCcw size={14} />} onClick={() => setConfirmRestore(true)}>
                Restore Database
              </Button>
            )}
            {confirmRestore && (
              <Group gap="sm">
                <Text size="sm" c="red" fw={500}>Are you sure? This cannot be undone.</Text>
                <Button color="red" onClick={() => restoreMut.mutate()} loading={restoreMut.isPending}>
                  Yes, Restore Now
                </Button>
                <Button variant="subtle" color="gray" onClick={() => setConfirmRestore(false)}>Cancel</Button>
              </Group>
            )}
          </Stack>
        </Card>
      </Stack>
    </Container>
  );
}
