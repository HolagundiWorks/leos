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
  Text,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlarmClock, Check, Plus, Trash2 } from 'lucide-react';
import dayjs from 'dayjs';
import { ApiError } from '../api/client';
import { useAuth } from '../stores/auth';
import { TASK_TAGS } from '../lib/tags';

const BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8787';

const tagColor = (t: string | null) => (t === 'critical' ? 'red' : t === 'urgent' ? 'orange' : 'brand');

interface Reminder {
  id: number;
  title: string;
  tag: string | null;
  due_date: string | null;
  notes: string | null;
  done: boolean;
  created_at: string;
}

const authed = (token: string) => ({ Authorization: `Bearer ${token}` });

async function apiGet(token: string): Promise<{ reminders: Reminder[] }> {
  const r = await fetch(`${BASE}/reminders`, { headers: authed(token) });
  if (!r.ok) throw new ApiError(`HTTP ${r.status}`, r.status);
  return r.json();
}

async function postJSON(token: string, path: string, body?: object) {
  const r = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { ...authed(token), 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new ApiError(`HTTP ${r.status}`, r.status);
  return r.json();
}

const blank = { title: '', tag: 'normal', due_date: '', notes: '' };

export function RemindersScreen() {
  const token = useAuth((s) => s.token)!;
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(blank);

  const { data, isLoading } = useQuery({
    queryKey: ['reminders'],
    queryFn: () => apiGet(token),
    staleTime: 30_000,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['reminders'] });
    qc.invalidateQueries({ queryKey: ['dashboard-focus'] });
  };

  const createMut = useMutation({
    mutationFn: () => postJSON(token, '/reminders', {
      title: form.title, tag: form.tag, due_date: form.due_date || undefined, notes: form.notes || undefined,
    }),
    onSuccess: () => { invalidate(); setOpen(false); setForm(blank); },
  });
  const doneMut = useMutation({
    mutationFn: (id: number) => postJSON(token, `/reminders/${id}/done`),
    onSuccess: invalidate,
  });
  const deleteMut = useMutation({
    mutationFn: (id: number) => postJSON(token, `/reminders/${id}/delete`),
    onSuccess: invalidate,
  });

  const reminders = data?.reminders ?? [];
  const today = dayjs().startOf('day');

  return (
    <Container size="lg" px={0}>
      <Stack gap="lg">
        <Group justify="space-between">
          <Group gap="sm">
            <AlarmClock size={20} color="var(--mantine-color-brand-6)" />
            <Title order={2}>Reminders</Title>
          </Group>
          <Button size="xs" leftSection={<Plus size={13} />} onClick={() => setOpen(true)}>New Reminder</Button>
        </Group>

        <Card>
          {isLoading ? (
            <Skeleton height={160} radius="md" />
          ) : reminders.length === 0 ? (
            <Text size="sm" c="dimmed" py="md">No active reminders. Create one with the + button.</Text>
          ) : (
            <Table withTableBorder striped>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Reminder</Table.Th>
                  <Table.Th>Tag</Table.Th>
                  <Table.Th>Due</Table.Th>
                  <Table.Th />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {reminders.map((r) => {
                  const overdue = r.due_date ? dayjs(r.due_date).isBefore(today) : false;
                  return (
                    <Table.Tr key={r.id}>
                      <Table.Td>
                        <Text size="sm" fw={500}>{r.title}</Text>
                        {r.notes && <Text size="xs" c="dimmed" lineClamp={1}>{r.notes}</Text>}
                      </Table.Td>
                      <Table.Td><Badge size="xs" color={tagColor(r.tag)}>{r.tag}</Badge></Table.Td>
                      <Table.Td>
                        <Text size="sm" c={overdue ? 'red' : undefined}>
                          {r.due_date ? dayjs(r.due_date).format('MMM D, YYYY') : '—'}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Group gap={4} justify="flex-end">
                          <Button size="xs" variant="light" color="mint" onClick={() => doneMut.mutate(r.id)} loading={doneMut.isPending}>
                            <Check size={12} />
                          </Button>
                          <Button size="xs" variant="subtle" color="red" onClick={() => deleteMut.mutate(r.id)}>
                            <Trash2 size={12} />
                          </Button>
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          )}
        </Card>
      </Stack>

      <Modal opened={open} onClose={() => setOpen(false)} title="New Reminder" size="md" radius="md">
        <Stack gap="sm">
          <TextInput label="Title" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.currentTarget.value }))} data-autofocus />
          <Group grow>
            <Select
              label="Tag"
              data={TASK_TAGS.map((t) => ({ value: t, label: t.charAt(0).toUpperCase() + t.slice(1) }))}
              value={form.tag}
              onChange={(v) => setForm((f) => ({ ...f, tag: v ?? 'normal' }))}
              allowDeselect={false}
            />
            <TextInput type="date" label="Due date" value={form.due_date} onChange={(e) => setForm((f) => ({ ...f, due_date: e.currentTarget.value }))} />
          </Group>
          <Textarea label="Notes" autosize minRows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.currentTarget.value }))} />
          <Group justify="flex-end">
            <Button variant="subtle" color="gray" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => createMut.mutate()} loading={createMut.isPending} disabled={!form.title.trim()}>Create</Button>
          </Group>
        </Stack>
      </Modal>
    </Container>
  );
}
