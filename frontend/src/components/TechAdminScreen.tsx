import { useEffect, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  Container,
  Group,
  Select,
  Skeleton,
  Stack,
  Switch,
  Table,
  Tabs,
  Text,
  Title,
  Alert,
  Divider,
  SimpleGrid,
  TextInput,
  PasswordInput,
} from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, Cloud, Database, Layers, Shield, Users, Wrench } from 'lucide-react';
import { useAuth } from '../stores/auth';

const BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8787';

// ─── Types ────────────────────────────────────────────────────────────────────
interface SystemInfo {
  users: number;
  students: number;
  staff: number;
  db_size_kb: number;
  last_backup: string | null;
  server_version: string;
}

interface ModuleSetting {
  key: string;
  display_name: string;
  enabled: boolean;
  min_level: number;
}

interface UserLevel {
  id: number;
  username: string;
  name: string | null;
  profile: string | null;
  level: number;
  role_name: string | null;
}

const LEVEL_LABELS: Record<number, string> = {
  1: 'L1 — Principal',
  2: 'L2 — Staff / Teacher / Accountant',
  3: 'L3 — Class Teacher',
  4: 'L4 — Support Staff',
  5: 'L5 — Parent / Read-only',
};

const LEVEL_COLORS: Record<number, string> = {
  1: 'red',
  2: 'brand',
  3: 'green',
  4: 'gray',
  5: 'orange',
};

// ─── API helpers ──────────────────────────────────────────────────────────────
const authed = (token: string) => ({ Authorization: `Bearer ${token}` });

async function apiGet<T>(token: string, path: string): Promise<T> {
  return fetch(`${BASE}${path}`, { headers: authed(token) }).then((r) => r.json());
}

async function postJSON(token: string, path: string, body?: object) {
  return fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { ...authed(token), 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  }).then((r) => r.json());
}

// ─── System Health tab ────────────────────────────────────────────────────────
function SystemHealthPanel({ token }: { token: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-system-info'],
    queryFn: () => apiGet<SystemInfo>(token, '/admin/system-info'),
    staleTime: 30_000,
  });

  const stats = [
    { label: 'Users', value: data?.users ?? '—', icon: Users, color: 'brand' },
    { label: 'Students', value: data?.students ?? '—', icon: Users, color: 'blue' },
    { label: 'Staff', value: data?.staff ?? '—', icon: Users, color: 'green' },
    { label: 'DB Size', value: data ? `${(data.db_size_kb / 1024).toFixed(2)} MB` : '—', icon: Database, color: 'gray' },
  ];

  return (
    <Stack gap="md">
      {isLoading ? (
        <Skeleton height={120} radius="md" />
      ) : (
        <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="sm">
          {stats.map((s) => {
            const Icon = s.icon;
            return (
              <Card key={s.label} p="sm" withBorder style={{ borderTop: `3px solid var(--mantine-color-${s.color}-5)` }}>
                <Group gap="xs" mb={4}>
                  <Icon size={14} />
                  <Text size="xs" c="dimmed">{s.label}</Text>
                </Group>
                <Text fw={700} size="xl">{String(s.value)}</Text>
              </Card>
            );
          })}
        </SimpleGrid>
      )}

      <Card withBorder p="sm">
        <Stack gap="xs">
          <Group gap="xs"><Activity size={14} /><Text size="sm" fw={500}>Server</Text></Group>
          <Group gap="xl">
            <Stack gap={2}>
              <Text size="xs" c="dimmed">Version</Text>
              <Text size="sm" fw={500} style={{ fontFamily: 'monospace' }}>{data?.server_version ?? '—'}</Text>
            </Stack>
            <Stack gap={2}>
              <Text size="xs" c="dimmed">Last backup</Text>
              <Text size="sm">{data?.last_backup ? data.last_backup.slice(0, 16) : 'Never'}</Text>
            </Stack>
            <Stack gap={2}>
              <Text size="xs" c="dimmed">SQLite</Text>
              <Badge size="xs" color="green">Online</Badge>
            </Stack>
          </Group>
        </Stack>
      </Card>
    </Stack>
  );
}

// ─── Module Control tab ───────────────────────────────────────────────────────
function ModuleControlPanel({ token }: { token: string }) {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['admin-modules'],
    queryFn: () => apiGet<{ modules: ModuleSetting[] }>(token, '/admin/modules'),
    staleTime: 30_000,
  });

  const toggleMut = useMutation({
    mutationFn: (key: string) => postJSON(token, `/admin/modules/${key}/toggle`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-modules'] }),
  });

  const modules = data?.modules ?? [];

  return (
    <Stack gap="sm">
      <Alert color="orange" variant="light">
        Disabling a module hides it from the ribbon for all users at or above the minimum level.
        The underlying data is preserved.
      </Alert>
      {isLoading ? (
        <Skeleton height={200} radius="md" />
      ) : (
        <Table withTableBorder striped>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Module</Table.Th>
              <Table.Th>Minimum access level</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th>Toggle</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {modules.map((m) => (
              <Table.Tr key={m.key}>
                <Table.Td>
                  <Stack gap={0}>
                    <Text size="sm" fw={500}>{m.display_name}</Text>
                    <Text size="xs" c="dimmed" style={{ fontFamily: 'monospace' }}>{m.key}</Text>
                  </Stack>
                </Table.Td>
                <Table.Td>
                  <Badge size="xs" color={LEVEL_COLORS[m.min_level] ?? 'gray'}>
                    L{m.min_level}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  <Badge size="xs" color={m.enabled ? 'green' : 'red'} variant="light">
                    {m.enabled ? 'Enabled' : 'Disabled'}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  <Switch
                    checked={m.enabled}
                    onChange={() => toggleMut.mutate(m.key)}
                    size="sm"
                    color="brand"
                  />
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
    </Stack>
  );
}

// ─── Staff Hierarchy tab ──────────────────────────────────────────────────────
function StaffHierarchyPanel({ token }: { token: string }) {
  const qc = useQueryClient();
  const [editId, setEditId] = useState<number | null>(null);
  const [editLevel, setEditLevel] = useState<string>('3');

  const { data, isLoading } = useQuery({
    queryKey: ['admin-users-levels'],
    queryFn: () => apiGet<{ users: UserLevel[] }>(token, '/admin/users/levels'),
    staleTime: 30_000,
  });

  const setLevelMut = useMutation({
    mutationFn: ({ id, level }: { id: number; level: number }) =>
      postJSON(token, `/admin/users/${id}/level`, { level }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-users-levels'] }); setEditId(null); },
  });

  const users = data?.users ?? [];

  // Group by level
  const byLevel: Record<number, UserLevel[]> = { 1: [], 2: [], 3: [], 4: [], 5: [] };
  for (const u of users) byLevel[u.level]?.push(u);

  return (
    <Stack gap="md">
      <Text size="sm" c="dimmed">
        Staff hierarchy controls which modules each user can access. Assign levels carefully —
        L1 has full system access.
      </Text>

      {/* Access matrix legend */}
      <Card withBorder p="sm">
        <Text size="sm" fw={600} mb="xs">Access Matrix</Text>
        <Stack gap="xs">
          {[1, 2, 3, 4, 5].map((l) => (
            <Group key={l} gap="sm">
              <Badge w={130} color={LEVEL_COLORS[l] ?? 'gray'}>{LEVEL_LABELS[l]}</Badge>
              <Text size="xs" c="dimmed">
                {l === 1 && 'Full system access: all modules, settings, admin panel, audit log'}
                {l === 2 && 'Operational access: modules relevant to role (staff, teacher, accountant)'}
                {l === 3 && 'Class-level access: attendance, students (read), timetable'}
                {l === 4 && 'Support access: read-only, limited operational modules'}
                {l === 5 && 'Parent / Student: own data only — fees, results, attendance'}
              </Text>
            </Group>
          ))}
        </Stack>
      </Card>

      <Divider label="User Assignments" labelPosition="left" />

      {isLoading ? (
        <Skeleton height={200} radius="md" />
      ) : (
        <Stack gap="md">
          {([1, 2, 3, 4, 5] as number[]).map((level) => {
            const group = byLevel[level] ?? [];
            if (group.length === 0) return null;
            return (
              <div key={level}>
                <Group gap="xs" mb="xs">
                  <Badge color={LEVEL_COLORS[level] ?? 'gray'}>{LEVEL_LABELS[level]}</Badge>
                  <Text size="xs" c="dimmed">{group.length} user{group.length !== 1 ? 's' : ''}</Text>
                </Group>
                <Table withTableBorder>
                  <Table.Tbody>
                    {group.map((u) => (
                      <Table.Tr key={u.id}>
                        <Table.Td>
                          <Stack gap={0}>
                            <Text size="sm" fw={500}>{u.name ?? u.username}</Text>
                            <Text size="xs" c="dimmed">{u.profile ?? 'no profile'}</Text>
                          </Stack>
                        </Table.Td>
                        <Table.Td><Text size="xs" style={{ fontFamily: 'monospace' }}>{u.username}</Text></Table.Td>
                        <Table.Td>
                          {editId === u.id ? (
                            <Group gap="xs">
                              <Select
                                size="xs"
                                value={editLevel}
                                onChange={(v) => setEditLevel(v ?? '3')}
                                data={[1, 2, 3, 4, 5].map((l) => ({ value: String(l), label: `L${l}` }))}
                                w={80}
                              />
                              <Button
                                size="xs"
                                onClick={() => setLevelMut.mutate({ id: u.id, level: Number(editLevel) })}
                                loading={setLevelMut.isPending}
                              >Save</Button>
                              <Button size="xs" variant="subtle" onClick={() => setEditId(null)}>Cancel</Button>
                            </Group>
                          ) : (
                            <Button
                              size="xs"
                              variant="subtle"
                              onClick={() => { setEditId(u.id); setEditLevel(String(u.level)); }}
                            >Change Level</Button>
                          )}
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </div>
            );
          })}
        </Stack>
      )}
    </Stack>
  );
}

function SupabasePanel({ token }: { token: string }) {
  const [url, setUrl] = useState('');
  const [anonKey, setAnonKey] = useState('');
  const [enabled, setEnabled] = useState(false);
  const config = useQuery({
    queryKey: ['supabase-config'],
    queryFn: () => apiGet<{enabled:boolean;url:string;keyConfigured:boolean}>(token, '/integrations/supabase'),
  });
  useEffect(() => {
    if (config.data) { setUrl(config.data.url); setEnabled(config.data.enabled); }
  }, [config.data]);
  const save = useMutation({
    mutationFn: () => postJSON(token, '/integrations/supabase', { enabled, url, anonKey }),
    onSuccess: () => { setAnonKey(''); void config.refetch(); },
  });
  const test = useMutation({
    mutationFn: () => postJSON(token, '/integrations/supabase/test'),
  });
  const saveError = (save.data as {error?:string} | undefined)?.error;
  const testResult = test.data as {ok?:boolean;error?:string} | undefined;
  return <Stack gap="md">
    <Alert color="blue">Optional cloud connection. Local SQLite remains authoritative and LEOS continues to work offline. Use the project URL and anon/publishable key only—never enter a service-role key.</Alert>
    <Switch label="Enable Supabase connection" checked={enabled} onChange={(event)=>setEnabled(event.currentTarget.checked)} />
    <TextInput label="Supabase project URL" placeholder="https://project-ref.supabase.co" value={url} onChange={(event)=>setUrl(event.currentTarget.value)} />
    <PasswordInput label="Anon / publishable API key" description={config.data?.keyConfigured ? 'A key is already stored. Enter a value to replace it.' : undefined} value={anonKey} onChange={(event)=>setAnonKey(event.currentTarget.value)} />
    {(saveError || testResult?.error) && <Alert color="red">{saveError ?? testResult?.error}</Alert>}
    {testResult?.ok && <Alert color="green">Supabase REST connection succeeded.</Alert>}
    <Group>
      <Button loading={save.isPending} disabled={!url || anonKey.length < 20} onClick={()=>save.mutate()}>Save connection</Button>
      <Button variant="light" loading={test.isPending} disabled={!config.data?.keyConfigured || !config.data?.enabled} onClick={()=>test.mutate()}>Test connection</Button>
    </Group>
  </Stack>;
}

// ─── Main screen ──────────────────────────────────────────────────────────────
export function TechAdminScreen() {
  const token = useAuth((s) => s.token)!;
  const [tab, setTab] = useState('health');

  return (
    <Container size="xl" px={0}>
      <Stack gap="lg">
        <Group gap="sm" mb={4}>
          <Wrench size={20} color="var(--mantine-color-brand-6)" />
          <Title order={2}>Tech Admin</Title>
          <Badge color="red" variant="light">L1 Only</Badge>
        </Group>

        <Card>
          <Tabs value={tab} onChange={(v) => setTab(v ?? 'health')}>
            <Tabs.List mb="md">
              <Tabs.Tab value="health" leftSection={<Activity size={13} />}>System Health</Tabs.Tab>
              <Tabs.Tab value="modules" leftSection={<Layers size={13} />}>Module Control</Tabs.Tab>
              <Tabs.Tab value="hierarchy" leftSection={<Users size={13} />}>Staff Hierarchy</Tabs.Tab>
              <Tabs.Tab value="supabase" leftSection={<Cloud size={13} />}>Supabase</Tabs.Tab>
              <Tabs.Tab value="security-link" leftSection={<Shield size={13} />}>Audit Log ↗</Tabs.Tab>
            </Tabs.List>
            <Tabs.Panel value="health"><SystemHealthPanel token={token} /></Tabs.Panel>
            <Tabs.Panel value="modules"><ModuleControlPanel token={token} /></Tabs.Panel>
            <Tabs.Panel value="hierarchy"><StaffHierarchyPanel token={token} /></Tabs.Panel>
            <Tabs.Panel value="supabase"><SupabasePanel token={token} /></Tabs.Panel>
            <Tabs.Panel value="security-link">
              <Text size="sm" c="dimmed">Use the Security module (Audit Log tab) to view a full audit trail of all write actions.</Text>
            </Tabs.Panel>
          </Tabs>
        </Card>
      </Stack>
    </Container>
  );
}
