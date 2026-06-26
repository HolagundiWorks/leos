import { useState } from 'react';
import {
  Badge,
  Button,
  Card,
  Container,
  Group,
  Modal,
  Select,
  Skeleton,
  Stack,
  Table,
  Tabs,
  Text,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CalendarDays, CheckCircle, ClipboardList, Plus, Trash2 } from 'lucide-react';
import { useStaff } from '../hooks/useStaff';
import { useAuth } from '../stores/auth';

const BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8787';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Announcement {
  id: number;
  title: string;
  body: string | null;
  audience: string | null;
  is_draft: boolean;
  published_at: string | null;
  created_at: string;
}

interface Meeting {
  id: number;
  title: string;
  meeting_type: string | null;
  date: string;
  start_time: string | null;
  end_time: string | null;
  venue: string | null;
  agenda: string | null;
  minutes: string | null;
  status: string | null;
}

interface Task {
  id: number;
  title: string;
  description: string | null;
  assigned_to: number | null;
  assignee_name: string | null;
  department_name: string | null;
  due_date: string | null;
  priority: string | null;
  status: string | null;
  completed_at: string | null;
  created_at: string;
}

// ─── API helpers ──────────────────────────────────────────────────────────────
const authed = (token: string) => ({ Authorization: `Bearer ${token}` });

async function postJSON(token: string, path: string, body: object) {
  return fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { ...authed(token), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then((r) => r.json());
}

async function apiAnnouncements(token: string): Promise<{ announcements: Announcement[] }> {
  return fetch(`${BASE}/announcements`, { headers: authed(token) }).then((r) => r.json());
}

async function apiMeetings(token: string, status?: string): Promise<{ meetings: Meeting[] }> {
  const qs = status ? `?status=${status}` : '';
  return fetch(`${BASE}/meetings${qs}`, { headers: authed(token) }).then((r) => r.json());
}

async function apiTasks(token: string, status?: string): Promise<{ tasks: Task[] }> {
  const qs = status ? `?status=${status}` : '';
  return fetch(`${BASE}/tasks${qs}`, { headers: authed(token) }).then((r) => r.json());
}

const MEETING_TYPES = ['staff', 'parent', 'government', 'board', 'other'];
const AUDIENCES = ['internal', 'all-staff', 'students', 'parents', 'public'];
const PRIORITIES = ['low', 'normal', 'high', 'urgent'];
const TASK_STATUSES = ['pending', 'in_progress', 'completed', 'cancelled'];

function priorityColor(p: string | null) {
  if (p === 'urgent') return 'red';
  if (p === 'high') return 'orange';
  if (p === 'normal') return 'brand';
  return 'gray';
}

// ─── Announcements panel ──────────────────────────────────────────────────────
function AnnouncementsPanel({ token }: { token: string }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['announcements'], queryFn: () => apiAnnouncements(token), staleTime: 60_000 });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: '', body: '', audience: 'internal', is_draft: true });

  const createMut = useMutation({
    mutationFn: () => postJSON(token, '/announcements', form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['announcements'] }); setOpen(false); setForm({ title: '', body: '', audience: 'internal', is_draft: true }); },
  });

  const publishMut = useMutation({
    mutationFn: (id: number) => postJSON(token, `/announcements/${id}/publish`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['announcements'] }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => postJSON(token, `/announcements/${id}/delete`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['announcements'] }),
  });

  const announcements = data?.announcements ?? [];

  return (
    <Stack gap="sm">
      <Group justify="space-between">
        <Text fw={600} size="sm">Announcements &amp; Circulars</Text>
        <Button size="xs" leftSection={<Plus size={12} />} onClick={() => setOpen(true)}>New</Button>
      </Group>
      {isLoading ? <Skeleton height={100} radius="md" /> : announcements.length === 0 ? (
        <Text size="sm" c="dimmed">No announcements yet.</Text>
      ) : (
        <Table withTableBorder striped>
          <Table.Thead>
            <Table.Tr><Table.Th>Title</Table.Th><Table.Th>Audience</Table.Th><Table.Th>Status</Table.Th><Table.Th>Date</Table.Th><Table.Th /></Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {announcements.map((a) => (
              <Table.Tr key={a.id}>
                <Table.Td>
                  <Text size="sm" fw={500}>{a.title}</Text>
                  {a.body && <Text size="xs" c="dimmed" lineClamp={1}>{a.body}</Text>}
                </Table.Td>
                <Table.Td><Badge size="xs" variant="outline">{a.audience}</Badge></Table.Td>
                <Table.Td><Badge size="xs" color={a.is_draft ? 'yellow' : 'mint'}>{a.is_draft ? 'Draft' : 'Published'}</Badge></Table.Td>
                <Table.Td><Text size="xs" c="dimmed">{(a.published_at ?? a.created_at).slice(0, 10)}</Text></Table.Td>
                <Table.Td>
                  <Group gap={4} justify="flex-end">
                    {a.is_draft && <Button size="xs" variant="light" color="mint" onClick={() => publishMut.mutate(a.id)}>Publish</Button>}
                    <Button size="xs" variant="subtle" color="red" onClick={() => deleteMut.mutate(a.id)}><Trash2 size={11} /></Button>
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}

      <Modal opened={open} onClose={() => setOpen(false)} title="New Announcement" size="md">
        <Stack gap="sm">
          <TextInput label="Title" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.currentTarget.value }))} />
          <Textarea label="Body" autosize minRows={3} value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.currentTarget.value }))} />
          <Group grow>
            <Select label="Audience" data={AUDIENCES.map((a) => ({ value: a, label: a }))} value={form.audience} onChange={(v) => setForm((f) => ({ ...f, audience: v ?? 'internal' }))} />
            <Select
              label="Save as"
              data={[{ value: 'draft', label: 'Draft' }, { value: 'publish', label: 'Publish now' }]}
              value={form.is_draft ? 'draft' : 'publish'}
              onChange={(v) => setForm((f) => ({ ...f, is_draft: v === 'draft' }))}
            />
          </Group>
          <Group justify="flex-end">
            <Button variant="subtle" color="gray" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => createMut.mutate()} loading={createMut.isPending} disabled={!form.title.trim()}>Save</Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}

// ─── Meetings panel ────────────────────────────────────────────────────────────
function MeetingsPanel({ token }: { token: string }) {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<string | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ['meetings', filter],
    queryFn: () => apiMeetings(token, filter ?? undefined),
    staleTime: 60_000,
  });
  const [open, setOpen] = useState(false);
  const [minutesId, setMinutesId] = useState<number | null>(null);
  const [minutesText, setMinutesText] = useState('');
  const [form, setForm] = useState({ title: '', meeting_type: 'staff', date: '', start_time: '', end_time: '', venue: '', agenda: '' });

  const createMut = useMutation({
    mutationFn: () => postJSON(token, '/meetings', form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['meetings'] }); setOpen(false); },
  });

  const saveMinutesMut = useMutation({
    mutationFn: () => postJSON(token, `/meetings/${minutesId}/update`, { minutes: minutesText, status: 'completed' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['meetings'] }); setMinutesId(null); setMinutesText(''); },
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => postJSON(token, `/meetings/${id}/delete`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['meetings'] }),
  });

  const meetings = data?.meetings ?? [];

  return (
    <Stack gap="sm">
      <Group justify="space-between" align="flex-end">
        <Select
          label="Filter status"
          data={[{ value: '', label: 'All' }, { value: 'scheduled', label: 'Scheduled' }, { value: 'completed', label: 'Completed' }, { value: 'cancelled', label: 'Cancelled' }]}
          value={filter ?? ''}
          onChange={(v) => setFilter(v || null)}
          w={180}
        />
        <Button size="xs" leftSection={<Plus size={12} />} onClick={() => setOpen(true)}>Schedule Meeting</Button>
      </Group>

      {isLoading ? <Skeleton height={120} radius="md" /> : meetings.length === 0 ? (
        <Text size="sm" c="dimmed">No meetings found.</Text>
      ) : (
        <Table withTableBorder striped>
          <Table.Thead>
            <Table.Tr><Table.Th>Title</Table.Th><Table.Th>Type</Table.Th><Table.Th>Date</Table.Th><Table.Th>Venue</Table.Th><Table.Th>Status</Table.Th><Table.Th /></Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {meetings.map((m) => (
              <Table.Tr key={m.id}>
                <Table.Td>
                  <Text size="sm" fw={500}>{m.title}</Text>
                  {m.agenda && <Text size="xs" c="dimmed" lineClamp={1}>{m.agenda}</Text>}
                </Table.Td>
                <Table.Td><Badge size="xs" variant="outline">{m.meeting_type}</Badge></Table.Td>
                <Table.Td><Text size="sm">{m.date} {m.start_time ?? ''}</Text></Table.Td>
                <Table.Td><Text size="sm">{m.venue ?? '—'}</Text></Table.Td>
                <Table.Td><Badge size="xs" color={m.status === 'completed' ? 'mint' : m.status === 'cancelled' ? 'gray' : 'brand'}>{m.status}</Badge></Table.Td>
                <Table.Td>
                  <Group gap={4} justify="flex-end">
                    {m.status !== 'completed' && (
                      <Button size="xs" variant="light" onClick={() => { setMinutesId(m.id); setMinutesText(m.minutes ?? ''); }}>Minutes</Button>
                    )}
                    <Button size="xs" variant="subtle" color="red" onClick={() => deleteMut.mutate(m.id)}><Trash2 size={11} /></Button>
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}

      <Modal opened={open} onClose={() => setOpen(false)} title="Schedule Meeting" size="md">
        <Stack gap="sm">
          <TextInput label="Title" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.currentTarget.value }))} />
          <Group grow>
            <Select label="Type" data={MEETING_TYPES.map((t) => ({ value: t, label: t }))} value={form.meeting_type} onChange={(v) => setForm((f) => ({ ...f, meeting_type: v ?? 'staff' }))} />
            <TextInput type="date" label="Date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.currentTarget.value }))} />
          </Group>
          <Group grow>
            <TextInput type="time" label="Start" value={form.start_time} onChange={(e) => setForm((f) => ({ ...f, start_time: e.currentTarget.value }))} />
            <TextInput type="time" label="End" value={form.end_time} onChange={(e) => setForm((f) => ({ ...f, end_time: e.currentTarget.value }))} />
          </Group>
          <TextInput label="Venue" value={form.venue} onChange={(e) => setForm((f) => ({ ...f, venue: e.currentTarget.value }))} />
          <Textarea label="Agenda" autosize minRows={2} value={form.agenda} onChange={(e) => setForm((f) => ({ ...f, agenda: e.currentTarget.value }))} />
          <Group justify="flex-end">
            <Button variant="subtle" color="gray" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => createMut.mutate()} loading={createMut.isPending} disabled={!form.title.trim() || !form.date}>Schedule</Button>
          </Group>
        </Stack>
      </Modal>

      <Modal opened={minutesId !== null} onClose={() => setMinutesId(null)} title="Record Minutes" size="md">
        <Stack gap="sm">
          <Textarea label="Meeting Minutes" autosize minRows={5} value={minutesText} onChange={(e) => setMinutesText(e.currentTarget.value)} />
          <Group justify="flex-end">
            <Button variant="subtle" color="gray" onClick={() => setMinutesId(null)}>Cancel</Button>
            <Button onClick={() => saveMinutesMut.mutate()} loading={saveMinutesMut.isPending}>Save &amp; Mark Completed</Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}

// ─── Tasks panel ──────────────────────────────────────────────────────────────
function TasksPanel({ token }: { token: string }) {
  const qc = useQueryClient();
  const { data: staffData } = useStaff('');
  const [filter, setFilter] = useState<string | null>('pending');
  const { data, isLoading } = useQuery({
    queryKey: ['tasks', filter],
    queryFn: () => apiTasks(token, filter ?? undefined),
    staleTime: 30_000,
  });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', assigned_to: '', due_date: '', priority: 'normal' });

  const createMut = useMutation({
    mutationFn: () => postJSON(token, '/tasks', { ...form, assigned_to: form.assigned_to ? Number(form.assigned_to) : undefined }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tasks'] }); setOpen(false); setForm({ title: '', description: '', assigned_to: '', due_date: '', priority: 'normal' }); },
  });

  const completeMut = useMutation({
    mutationFn: (id: number) => postJSON(token, `/tasks/${id}/complete`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => postJSON(token, `/tasks/${id}/delete`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });

  const staffOptions = (staffData?.staff ?? []).map((s) => ({
    value: String(s.id),
    label: `${s.first_name ?? ''} ${s.last_name ?? ''}`.trim(),
  }));

  const tasks = data?.tasks ?? [];
  const today = new Date().toISOString().slice(0, 10);

  return (
    <Stack gap="sm">
      <Group justify="space-between" align="flex-end">
        <Select
          label="Filter"
          data={[{ value: '', label: 'All' }, ...TASK_STATUSES.map((s) => ({ value: s, label: s.replace('_', ' ') }))]}
          value={filter ?? ''}
          onChange={(v) => setFilter(v || null)}
          w={160}
        />
        <Button size="xs" leftSection={<Plus size={12} />} onClick={() => setOpen(true)}>Assign Task</Button>
      </Group>

      {isLoading ? <Skeleton height={120} radius="md" /> : tasks.length === 0 ? (
        <Text size="sm" c="dimmed">No tasks found.</Text>
      ) : (
        <Table withTableBorder striped>
          <Table.Thead>
            <Table.Tr><Table.Th>Task</Table.Th><Table.Th>Assigned To</Table.Th><Table.Th>Due</Table.Th><Table.Th>Priority</Table.Th><Table.Th>Status</Table.Th><Table.Th /></Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {tasks.map((t) => {
              const overdue = t.due_date && t.due_date < today && t.status !== 'completed';
              return (
                <Table.Tr key={t.id}>
                  <Table.Td>
                    <Text size="sm" fw={500}>{t.title}</Text>
                    {t.description && <Text size="xs" c="dimmed" lineClamp={1}>{t.description}</Text>}
                  </Table.Td>
                  <Table.Td><Text size="sm">{t.assignee_name ?? t.department_name ?? '—'}</Text></Table.Td>
                  <Table.Td><Text size="sm" c={overdue ? 'red' : undefined}>{t.due_date ?? '—'}</Text></Table.Td>
                  <Table.Td><Badge size="xs" color={priorityColor(t.priority)}>{t.priority}</Badge></Table.Td>
                  <Table.Td><Badge size="xs" color={t.status === 'completed' ? 'mint' : t.status === 'cancelled' ? 'gray' : 'brand'}>{t.status?.replace('_', ' ')}</Badge></Table.Td>
                  <Table.Td>
                    <Group gap={4} justify="flex-end">
                      {t.status !== 'completed' && (
                        <Button size="xs" variant="light" color="mint" onClick={() => completeMut.mutate(t.id)} loading={completeMut.isPending}>
                          <CheckCircle size={11} />
                        </Button>
                      )}
                      <Button size="xs" variant="subtle" color="red" onClick={() => deleteMut.mutate(t.id)}><Trash2 size={11} /></Button>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      )}

      <Modal opened={open} onClose={() => setOpen(false)} title="Assign Task" size="sm">
        <Stack gap="sm">
          <TextInput label="Title" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.currentTarget.value }))} />
          <Textarea label="Description" autosize minRows={2} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.currentTarget.value }))} />
          <Group grow>
            <Select label="Assign to" placeholder="Select staff…" data={staffOptions} value={form.assigned_to} onChange={(v) => setForm((f) => ({ ...f, assigned_to: v ?? '' }))} searchable clearable />
            <Select label="Priority" data={PRIORITIES.map((p) => ({ value: p, label: p }))} value={form.priority} onChange={(v) => setForm((f) => ({ ...f, priority: v ?? 'normal' }))} />
          </Group>
          <TextInput type="date" label="Due Date" value={form.due_date} onChange={(e) => setForm((f) => ({ ...f, due_date: e.currentTarget.value }))} />
          <Group justify="flex-end">
            <Button variant="subtle" color="gray" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => createMut.mutate()} loading={createMut.isPending} disabled={!form.title.trim()}>Assign</Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────
export function EventScreen() {
  const token = useAuth((s) => s.token)!;
  const [tab, setTab] = useState('announcements');

  return (
    <Container size="xl" px={0}>
      <Stack gap="lg">
        <Group gap="sm" mb={4}>
          <Bell size={20} color="var(--mantine-color-brand-6)" />
          <Title order={2}>Events &amp; Communications</Title>
        </Group>

        <Card>
          <Tabs value={tab} onChange={(v) => setTab(v ?? 'announcements')}>
            <Tabs.List mb="md">
              <Tabs.Tab value="announcements" leftSection={<Bell size={13} />}>Announcements</Tabs.Tab>
              <Tabs.Tab value="meetings" leftSection={<CalendarDays size={13} />}>Meetings</Tabs.Tab>
              <Tabs.Tab value="tasks" leftSection={<ClipboardList size={13} />}>Tasks</Tabs.Tab>
            </Tabs.List>
            <Tabs.Panel value="announcements"><AnnouncementsPanel token={token} /></Tabs.Panel>
            <Tabs.Panel value="meetings"><MeetingsPanel token={token} /></Tabs.Panel>
            <Tabs.Panel value="tasks"><TasksPanel token={token} /></Tabs.Panel>
          </Tabs>
        </Card>
      </Stack>
    </Container>
  );
}
