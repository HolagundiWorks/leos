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
  Tabs,
  Text,
  Textarea,
  Title,
} from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw, Shield } from 'lucide-react';
import { useAuth } from '../stores/auth';

const BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8787';

// ─── Types ────────────────────────────────────────────────────────────────────
interface AuditEntry {
  id: number;
  user_id: number | null;
  username: string | null;
  action: string;
  resource_type: string | null;
  resource_id: number | null;
  detail: string | null;
  ip: string | null;
  created_at: string;
}

interface Role {
  id: number;
  name: string;
  permissions: string | null;
}

// ─── API helpers ──────────────────────────────────────────────────────────────
const authed = (token: string) => ({ Authorization: `Bearer ${token}` });

async function apiAuditLog(token: string, resource?: string, limit?: number): Promise<{ audit_log: AuditEntry[] }> {
  const qs = new URLSearchParams();
  if (resource) qs.set('resource', resource);
  if (limit) qs.set('limit', String(limit));
  return fetch(`${BASE}/audit-log?${qs}`, { headers: authed(token) }).then((r) => r.json());
}

async function apiRoles(token: string): Promise<{ roles: Role[] }> {
  return fetch(`${BASE}/roles`, { headers: authed(token) }).then((r) => r.json());
}

async function postJSON(token: string, path: string, body: object) {
  return fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { ...authed(token), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then((r) => r.json());
}

const RESOURCE_TYPES = ['students', 'staff', 'exams', 'fees', 'attendance', 'timetable', 'leave', 'payroll', 'backup'];
const LIMIT_OPTIONS = ['25', '50', '100', '200', '500'];

// ─── Audit log panel ──────────────────────────────────────────────────────────
function AuditLogPanel({ token }: { token: string }) {
  const qc = useQueryClient();
  const [resource, setResource] = useState<string | null>(null);
  const [limit, setLimit] = useState('100');

  const { data, isLoading } = useQuery({
    queryKey: ['audit-log', resource, limit],
    queryFn: () => apiAuditLog(token, resource ?? undefined, Number(limit)),
    staleTime: 30_000,
  });

  const entries = data?.audit_log ?? [];

  return (
    <Stack gap="sm">
      <Group justify="space-between" align="flex-end">
        <Group gap="sm">
          <Select
            label="Resource type"
            placeholder="All"
            data={RESOURCE_TYPES.map((r) => ({ value: r, label: r }))}
            value={resource}
            onChange={setResource}
            clearable
            w={180}
          />
          <Select
            label="Limit"
            data={LIMIT_OPTIONS.map((l) => ({ value: l, label: l + ' entries' }))}
            value={limit}
            onChange={(v) => setLimit(v ?? '100')}
            w={130}
          />
        </Group>
        <Button size="xs" variant="subtle" leftSection={<RefreshCw size={12} />} onClick={() => qc.invalidateQueries({ queryKey: ['audit-log'] })}>Refresh</Button>
      </Group>

      {isLoading ? <Skeleton height={200} radius="md" /> : entries.length === 0 ? (
        <Text size="sm" c="dimmed">No audit entries yet. Actions will appear here after they are performed.</Text>
      ) : (
        <Table withTableBorder striped>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Time</Table.Th>
              <Table.Th>User</Table.Th>
              <Table.Th>Action</Table.Th>
              <Table.Th>Resource</Table.Th>
              <Table.Th>Detail</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {entries.map((e) => (
              <Table.Tr key={e.id}>
                <Table.Td><Text size="xs" c="dimmed">{e.created_at.slice(0, 16)}</Text></Table.Td>
                <Table.Td><Text size="sm">{e.username ?? `uid:${e.user_id}`}</Text></Table.Td>
                <Table.Td><Badge size="xs" variant="outline">{e.action}</Badge></Table.Td>
                <Table.Td><Text size="sm">{e.resource_type ?? '—'}{e.resource_id ? ` #${e.resource_id}` : ''}</Text></Table.Td>
                <Table.Td><Text size="xs" c="dimmed" lineClamp={1}>{e.detail ?? '—'}</Text></Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
    </Stack>
  );
}

// ─── Roles panel ──────────────────────────────────────────────────────────────
function RolesPanel({ token }: { token: string }) {
  const qc = useQueryClient();
  const [editId, setEditId] = useState<number | null>(null);
  const [editPerms, setEditPerms] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['roles'],
    queryFn: () => apiRoles(token),
    staleTime: 120_000,
  });

  const saveMut = useMutation({
    mutationFn: () => {
      let perms: object;
      try { perms = JSON.parse(editPerms); } catch { return Promise.reject(new Error('Invalid JSON')); }
      return postJSON(token, `/roles/${editId}/update`, { permissions: perms });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['roles'] }); setEditId(null); },
  });

  const roles = data?.roles ?? [];

  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        Roles define what each user type can access. Default roles are seeded automatically. Edit permissions JSON to customize.
      </Text>
      {isLoading ? <Skeleton height={200} radius="md" /> : (
        roles.map((r) => (
          <Card key={r.id} p="sm" withBorder>
            <Group justify="space-between" mb={editId === r.id ? 'xs' : 0}>
              <Group gap="xs">
                <Badge color="brand" variant="light">{r.name.replace('_', ' ')}</Badge>
              </Group>
              <Button size="xs" variant="subtle" onClick={() => {
                setEditId(r.id);
                setEditPerms(r.permissions ? JSON.stringify(JSON.parse(r.permissions), null, 2) : '{}');
              }}>Edit</Button>
            </Group>
            {editId === r.id ? (
              <Stack gap="xs" mt="xs">
                <Textarea
                  label="Permissions JSON"
                  autosize
                  minRows={4}
                  value={editPerms}
                  onChange={(e) => setEditPerms(e.currentTarget.value)}
                  styles={{ input: { fontFamily: 'monospace', fontSize: '0.8rem' } }}
                />
                <Group justify="flex-end" gap="xs">
                  <Button variant="subtle" color="gray" size="xs" onClick={() => setEditId(null)}>Cancel</Button>
                  <Button size="xs" onClick={() => saveMut.mutate()} loading={saveMut.isPending}>Save</Button>
                </Group>
              </Stack>
            ) : (
              <Text size="xs" c="dimmed" style={{ fontFamily: 'monospace' }} lineClamp={2}>{r.permissions}</Text>
            )}
          </Card>
        ))
      )}
    </Stack>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────
export function SecurityScreen() {
  const token = useAuth((s) => s.token)!;
  const [tab, setTab] = useState('audit');

  return (
    <Container size="xl" px={0}>
      <Stack gap="lg">
        <Group gap="sm" mb={4}>
          <Shield size={20} color="var(--mantine-color-brand-6)" />
          <Title order={2}>Security &amp; Audit</Title>
        </Group>

        <Card>
          <Tabs value={tab} onChange={(v) => setTab(v ?? 'audit')}>
            <Tabs.List mb="md">
              <Tabs.Tab value="audit">Audit Log</Tabs.Tab>
              <Tabs.Tab value="roles">Roles &amp; Permissions</Tabs.Tab>
            </Tabs.List>
            <Tabs.Panel value="audit"><AuditLogPanel token={token} /></Tabs.Panel>
            <Tabs.Panel value="roles"><RolesPanel token={token} /></Tabs.Panel>
          </Tabs>
        </Card>
      </Stack>
    </Container>
  );
}
