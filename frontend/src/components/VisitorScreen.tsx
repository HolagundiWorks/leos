import { useState } from 'react';
import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Container,
  Group,
  Modal,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DoorOpen, LogOut, Plus, Trash2, UserCheck } from 'lucide-react';
import dayjs from 'dayjs';
import { ApiError } from '../api/client';
import { useAuth } from '../stores/auth';

const BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8787';

interface Visitor {
  id: number;
  name: string;
  phone: string | null;
  purpose: string | null;
  whom_to_meet: string | null;
  date: string;
  in_time: string | null;
  out_time: string | null;
}

const authed = (token: string) => ({ Authorization: `Bearer ${token}` });

async function fetchVisitors(token: string, date: string): Promise<{ visitors: Visitor[] }> {
  const r = await fetch(`${BASE}/visitors?date=${date}`, { headers: authed(token) });
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

// Render a stored 'YYYY-MM-DD HH:MM:SS' datetime as just the time.
const time = (dt: string | null) => (dt ? dayjs(dt).format('h:mm A') : '—');

const blank = { name: '', phone: '', purpose: '', whom_to_meet: '' };

export function VisitorScreen() {
  const token = useAuth((s) => s.token)!;
  const qc = useQueryClient();
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(blank);

  const { data, isLoading } = useQuery({
    queryKey: ['visitors', date],
    queryFn: () => fetchVisitors(token, date),
    staleTime: 15_000,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['visitors', date] });
  const checkinMut = useMutation({
    mutationFn: () => postJSON(token, '/visitors', form),
    onSuccess: () => { invalidate(); setOpen(false); setForm(blank); },
  });
  const checkoutMut = useMutation({ mutationFn: (id: number) => postJSON(token, `/visitors/${id}/checkout`), onSuccess: invalidate });
  const deleteMut = useMutation({ mutationFn: (id: number) => postJSON(token, `/visitors/${id}/delete`), onSuccess: invalidate });

  const visitors = data?.visitors ?? [];
  const onSite = visitors.filter((v) => !v.out_time).length;
  const isToday = date === new Date().toISOString().slice(0, 10);

  return (
    <Container size="lg" px={0}>
      <Stack gap="lg">
        <Group justify="space-between" align="flex-end" wrap="nowrap">
          <div>
            <Group gap="sm">
              <DoorOpen size={20} color="var(--mantine-color-brand-6)" />
              <Title order={2}>Visitor Log</Title>
            </Group>
            <Text c="dimmed" size="sm">Gate check-in / check-out register</Text>
          </div>
          <Group gap="sm" align="flex-end">
            <TextInput type="date" label="Date" value={date} onChange={(e) => setDate(e.currentTarget.value)} w={150} />
            <Button leftSection={<Plus size={15} />} onClick={() => setOpen(true)}>Check In</Button>
          </Group>
        </Group>

        <Group gap="sm">
          <Badge variant="light" color="brand" size="lg">{visitors.length} {isToday ? 'today' : 'on this day'}</Badge>
          {onSite > 0 && <Badge variant="light" color="yellow" size="lg">{onSite} currently on-site</Badge>}
        </Group>

        <Card>
          {isLoading ? (
            <Text size="sm" c="dimmed" py="md">Loading…</Text>
          ) : visitors.length === 0 ? (
            <Text size="sm" c="dimmed" ta="center" py="md">No visitors logged for this day.</Text>
          ) : (
            <Table striped highlightOnHover withTableBorder>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Visitor</Table.Th>
                  <Table.Th>Phone</Table.Th>
                  <Table.Th>Purpose</Table.Th>
                  <Table.Th>To meet</Table.Th>
                  <Table.Th style={{ textAlign: 'center' }}>In</Table.Th>
                  <Table.Th style={{ textAlign: 'center' }}>Out</Table.Th>
                  <Table.Th />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {visitors.map((v) => (
                  <Table.Tr key={v.id}>
                    <Table.Td><Text size="sm" fw={500}>{v.name}</Text></Table.Td>
                    <Table.Td><Text size="sm">{v.phone ?? '—'}</Text></Table.Td>
                    <Table.Td><Text size="sm">{v.purpose ?? '—'}</Text></Table.Td>
                    <Table.Td><Text size="sm">{v.whom_to_meet ?? '—'}</Text></Table.Td>
                    <Table.Td ta="center"><Text size="sm">{time(v.in_time)}</Text></Table.Td>
                    <Table.Td ta="center">
                      {v.out_time
                        ? <Text size="sm">{time(v.out_time)}</Text>
                        : <Badge size="xs" color="yellow" variant="light">on-site</Badge>}
                    </Table.Td>
                    <Table.Td>
                      <Group gap={4} justify="flex-end" wrap="nowrap">
                        {!v.out_time && (
                          <Button size="compact-xs" variant="light" color="mint" leftSection={<LogOut size={12} />}
                            onClick={() => checkoutMut.mutate(v.id)} loading={checkoutMut.isPending}>
                            Check Out
                          </Button>
                        )}
                        <ActionIcon variant="subtle" color="red" onClick={() => deleteMut.mutate(v.id)}><Trash2 size={14} /></ActionIcon>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}
        </Card>
      </Stack>

      <Modal opened={open} onClose={() => setOpen(false)} title="Check In Visitor" size="sm" radius="md">
        <Stack gap="sm">
          <Group gap={6} c="dimmed"><UserCheck size={14} /><Text size="xs">New gate entry · time stamped on save</Text></Group>
          <TextInput label="Visitor name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.currentTarget.value }))} data-autofocus />
          <TextInput label="Phone" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.currentTarget.value }))} />
          <TextInput label="Purpose" placeholder="e.g. Admission enquiry" value={form.purpose} onChange={(e) => setForm((f) => ({ ...f, purpose: e.currentTarget.value }))} />
          <TextInput label="Whom to meet" placeholder="e.g. Principal" value={form.whom_to_meet} onChange={(e) => setForm((f) => ({ ...f, whom_to_meet: e.currentTarget.value }))} />
          <Group justify="flex-end">
            <Button variant="subtle" color="gray" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => checkinMut.mutate()} loading={checkinMut.isPending} disabled={!form.name.trim()}>Check In</Button>
          </Group>
        </Stack>
      </Modal>
    </Container>
  );
}
