import { useMemo, useState } from 'react';
import {
  Badge,
  Card,
  Container,
  Group,
  SegmentedControl,
  Select,
  Skeleton,
  Stack,
  Table,
  Tabs,
  Text,
  Title,
} from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { CalendarClock, DoorOpen } from 'lucide-react';
import { ApiError } from '../api/client';
import { useClasses } from '../hooks/useClasses';
import { useAuth } from '../stores/auth';

const BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8787';

const DAYS = [
  { value: '0', label: 'Mon' }, { value: '1', label: 'Tue' }, { value: '2', label: 'Wed' },
  { value: '3', label: 'Thu' }, { value: '4', label: 'Fri' }, { value: '5', label: 'Sat' },
];
const todayDow = String(Math.min(5, (new Date().getDay() + 6) % 7)); // 0=Mon..5=Sat

interface DayEntry {
  id: number;
  section_id: number;
  section_label: string;
  period_id: number;
  period_label: string | null;
  start_time: string | null;
  end_time: string | null;
  sort_order: number | null;
  subject_name: string | null;
  subject_code: string | null;
  teacher_name: string | null;
  room_id: number | null;
  room_name: string | null;
}

function useDay(token: string, day: string) {
  return useQuery({
    queryKey: ['timetable-day', day],
    queryFn: async () => {
      const r = await fetch(`${BASE}/timetable/day?day=${day}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) throw new ApiError(`HTTP ${r.status}`, r.status);
      return r.json() as Promise<{ entries: DayEntry[] }>;
    },
    enabled: !!token,
    staleTime: 60_000,
  });
}

// ─── Daily Schedule (per class) ─────────────────────────────────────────────────
function DailySchedule({ token, day }: { token: string; day: string }) {
  const { data, isLoading } = useDay(token, day);
  const { data: classesData } = useClasses();
  const [sectionId, setSectionId] = useState<string | null>(null);

  const sectionOptions = useMemo(() => {
    const out: { value: string; label: string }[] = [];
    for (const c of classesData?.classes ?? []) for (const s of c.sections ?? []) out.push({ value: String(s.id), label: `${c.name} — ${s.name}` });
    return out;
  }, [classesData]);

  const entries = (data?.entries ?? []).filter((e) => !sectionId || String(e.section_id) === sectionId);

  return (
    <Stack gap="sm">
      <Select label="Class / Section" placeholder="All sections" data={sectionOptions} value={sectionId} onChange={setSectionId} searchable clearable w={280} />
      {isLoading ? <Skeleton height={200} radius="md" /> : entries.length === 0 ? (
        <Text size="sm" c="dimmed">No periods scheduled for this day{sectionId ? ' / section' : ''}.</Text>
      ) : (
        <Table withTableBorder striped>
          <Table.Thead><Table.Tr><Table.Th>Period</Table.Th>{!sectionId && <Table.Th>Section</Table.Th>}<Table.Th>Subject</Table.Th><Table.Th>Teacher</Table.Th><Table.Th>Room</Table.Th></Table.Tr></Table.Thead>
          <Table.Tbody>
            {entries.map((e) => (
              <Table.Tr key={e.id}>
                <Table.Td><Text size="sm" fw={500}>{e.period_label ?? '—'}</Text><Text size="xs" c="dimmed">{[e.start_time, e.end_time].filter(Boolean).join('–')}</Text></Table.Td>
                {!sectionId && <Table.Td><Text size="sm">{e.section_label}</Text></Table.Td>}
                <Table.Td><Text size="sm">{e.subject_name ?? '—'}</Text></Table.Td>
                <Table.Td><Text size="sm">{e.teacher_name ?? '—'}</Text></Table.Td>
                <Table.Td>{e.room_name ? <Badge size="xs" variant="light">{e.room_name}</Badge> : '—'}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
    </Stack>
  );
}

// ─── Room Status ────────────────────────────────────────────────────────────────
function RoomStatus({ token, day }: { token: string; day: string }) {
  const { data, isLoading } = useDay(token, day);
  const { data: roomsData } = useQuery({
    queryKey: ['classrooms-all'],
    queryFn: async () => {
      const r = await fetch(`${BASE}/classrooms`, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) throw new ApiError(`HTTP ${r.status}`, r.status);
      return r.json() as Promise<{ classrooms: { id: number; name: string | null }[] }>;
    },
    enabled: !!token,
    staleTime: 60_000,
  });

  const occupied = (data?.entries ?? []).filter((e) => e.room_id != null);
  const usedRoomIds = new Set(occupied.map((e) => e.room_id));
  const allRooms = roomsData?.classrooms ?? [];
  const freeRooms = allRooms.filter((r) => !usedRoomIds.has(r.id));

  // Group occupied slots by room.
  const byRoom = new Map<string, DayEntry[]>();
  for (const e of occupied) {
    const key = e.room_name ?? `Room ${e.room_id}`;
    (byRoom.get(key) ?? byRoom.set(key, []).get(key)!).push(e);
  }

  return (
    <Stack gap="sm">
      <Group gap="sm">
        <Badge variant="light" color="brand" size="lg">{byRoom.size} rooms in use</Badge>
        {allRooms.length > 0 && <Badge variant="light" color="mint" size="lg">{freeRooms.length} free</Badge>}
      </Group>
      {isLoading ? <Skeleton height={200} radius="md" /> : byRoom.size === 0 ? (
        <Text size="sm" c="dimmed">No rooms scheduled for this day.</Text>
      ) : (
        <Stack gap="sm">
          {[...byRoom.entries()].map(([room, slots]) => (
            <Card key={room} withBorder p="sm">
              <Group gap="xs" mb="xs"><DoorOpen size={15} color="var(--mantine-color-brand-6)" /><Text fw={600}>{room}</Text><Badge size="xs" variant="light">{slots.length} periods</Badge></Group>
              <Group gap={6} wrap="wrap">
                {slots.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)).map((s) => (
                  <Badge key={s.id} variant="outline" color="gray">
                    {s.period_label ?? s.start_time}: {s.section_label}{s.subject_name ? ` · ${s.subject_name}` : ''}
                  </Badge>
                ))}
              </Group>
            </Card>
          ))}
          {freeRooms.length > 0 && (
            <Card withBorder p="sm" style={{ background: 'var(--mantine-color-gray-0)' }}>
              <Text size="sm" fw={600} mb={4} c="mint.7">Free all day</Text>
              <Group gap={6} wrap="wrap">{freeRooms.map((r) => <Badge key={r.id} color="mint" variant="light">{r.name}</Badge>)}</Group>
            </Card>
          )}
        </Stack>
      )}
    </Stack>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────
export function ScheduleViewScreen({ defaultTab = 'daily' }: { defaultTab?: 'daily' | 'rooms' }) {
  const token = useAuth((s) => s.token)!;
  const [tab, setTab] = useState(defaultTab);
  const [day, setDay] = useState(todayDow);

  return (
    <Container size="xl" px={0}>
      <Stack gap="lg">
        <Group justify="space-between" align="flex-end" wrap="nowrap">
          <Group gap="sm"><CalendarClock size={20} color="var(--mantine-color-brand-6)" /><Title order={2}>Schedule</Title></Group>
          <SegmentedControl value={day} onChange={setDay} data={DAYS} />
        </Group>
        <Card>
          <Tabs value={tab} onChange={(v) => setTab((v as 'daily' | 'rooms') ?? 'daily')}>
            <Tabs.List mb="md">
              <Tabs.Tab value="daily" leftSection={<CalendarClock size={13} />}>Daily Schedule</Tabs.Tab>
              <Tabs.Tab value="rooms" leftSection={<DoorOpen size={13} />}>Room Status</Tabs.Tab>
            </Tabs.List>
            <Tabs.Panel value="daily"><DailySchedule token={token} day={day} /></Tabs.Panel>
            <Tabs.Panel value="rooms"><RoomStatus token={token} day={day} /></Tabs.Panel>
          </Tabs>
        </Card>
      </Stack>
    </Container>
  );
}
