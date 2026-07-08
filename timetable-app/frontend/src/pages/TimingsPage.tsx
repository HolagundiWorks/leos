import { useEffect, useState } from 'react';
import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Container,
  Group,
  Paper,
  Skeleton,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Coffee, Plus, Save, Trash2 } from 'lucide-react';
import { api, type Period } from '../api/client';

type EditRow = Omit<Period, 'id' | 'sort_order'> & { key: string };

function toMinutes(t: string): number {
  const [h = 0, m = 0] = t.split(':').map(Number);
  return h * 60 + m;
}

function toHHMM(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

function duration(start: string, end: string): string {
  const diff = toMinutes(end) - toMinutes(start);
  if (diff <= 0) return '';
  return diff < 60 ? `${diff}m` : `${Math.floor(diff / 60)}h${diff % 60 > 0 ? ` ${diff % 60}m` : ''}`;
}

function DayTimeline({ rows }: { rows: EditRow[] }) {
  const valid = rows.filter((r) => r.start_time && r.end_time && toMinutes(r.end_time) > toMinutes(r.start_time));
  if (valid.length === 0) return null;
  const dayStart = Math.min(...valid.map((r) => toMinutes(r.start_time)));
  const dayEnd = Math.max(...valid.map((r) => toMinutes(r.end_time)));
  const total = dayEnd - dayStart;
  if (total <= 0) return null;

  return (
    <Paper p="md" withBorder>
      <Group justify="space-between" mb={8}>
        <Text size="xs" c="dimmed">{toHHMM(dayStart)}</Text>
        <Text size="xs" c="dimmed">{Math.floor(total / 60)}h school day</Text>
        <Text size="xs" c="dimmed">{toHHMM(dayEnd)}</Text>
      </Group>
      <div style={{ display: 'flex', height: 36, gap: 2, borderRadius: 8, overflow: 'hidden' }}>
        {valid.map((r, i) => {
          const w = ((toMinutes(r.end_time) - toMinutes(r.start_time)) / total) * 100;
          const isBreak = r.period_type === 'break';
          return (
            <Tooltip key={i} label={`${r.label} · ${r.start_time}–${r.end_time}`} withArrow>
              <div style={{
                width: `${w}%`, minWidth: 2, background: isBreak ? '#DDE3EC' : '#3E7B7B',
                borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
              }}>
                {w > 6 && <Text size="xs" fw={600} style={{ color: isBreak ? '#4E5D72' : '#fff', fontSize: 10 }}>{r.label}</Text>}
              </div>
            </Tooltip>
          );
        })}
      </div>
    </Paper>
  );
}

let keyCounter = 0;
function nextKey() { return `row-${++keyCounter}`; }

export function TimingsPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['periods'], queryFn: () => api.fetchPeriods() });
  const [rows, setRows] = useState<EditRow[]>([]);
  const [seeded, setSeeded] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (data && !seeded) {
      setRows(data.periods.map((p) => ({
        key: nextKey(), label: p.label ?? '', period_type: p.period_type === 'break' ? 'break' : 'period',
        start_time: p.start_time ?? '08:00', end_time: p.end_time ?? '08:45',
      })));
      setSeeded(true);
    }
  }, [data, seeded]);

  const save = useMutation({
    mutationFn: () => api.savePeriods(rows.map(({ label, period_type, start_time, end_time }) => ({ label, period_type, start_time, end_time }))),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['periods'] }); setDirty(false); setSeeded(false); },
  });

  function update(i: number, field: keyof EditRow, value: string) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)));
    setDirty(true);
  }

  function move(i: number, dir: -1 | 1) {
    setRows((prev) => {
      const next = [...prev];
      const j = i + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
    setDirty(true);
  }

  function addSlot(type: 'period' | 'break') {
    const lastEnd = rows.length > 0 ? rows[rows.length - 1].end_time : '08:00';
    const defaultEnd = toHHMM(toMinutes(lastEnd) + (type === 'period' ? 45 : 15));
    const periodCount = rows.filter((r) => r.period_type === 'period').length + 1;
    setRows((prev) => [...prev, {
      key: nextKey(), label: type === 'period' ? `Period ${periodCount}` : 'Break',
      period_type: type, start_time: lastEnd, end_time: defaultEnd,
    }]);
    setDirty(true);
  }

  const periodCount = rows.filter((r) => r.period_type === 'period').length;
  const breakCount = rows.filter((r) => r.period_type === 'break').length;

  return (
    <Container size="lg" px={0}>
      <Stack gap="lg">
        <Group justify="space-between">
          <div>
            <Title order={2}>School Timings</Title>
            <Text c="dimmed">{periodCount} periods · {breakCount} breaks</Text>
          </div>
          <Button leftSection={<Save size={14} />} onClick={() => save.mutate()} loading={save.isPending} disabled={!dirty} variant={dirty ? 'filled' : 'default'}>
            Save Schedule
          </Button>
        </Group>

        {isLoading && !data ? <Skeleton height={60} /> : <DayTimeline rows={rows} />}

        <Card p={0}>
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th w={90}>Type</Table.Th>
                <Table.Th>Label</Table.Th>
                <Table.Th w={110}>Start</Table.Th>
                <Table.Th w={110}>End</Table.Th>
                <Table.Th w={60}>Duration</Table.Th>
                <Table.Th w={100} />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map((row, i) => (
                <Table.Tr key={row.key}>
                  <Table.Td>
                    <Badge color={row.period_type === 'period' ? 'brand' : 'gray'} variant={row.period_type === 'period' ? 'filled' : 'light'}
                      style={{ cursor: 'pointer' }} onClick={() => update(i, 'period_type', row.period_type === 'period' ? 'break' : 'period')}>
                      {row.period_type === 'period' ? 'Period' : 'Break'}
                    </Badge>
                  </Table.Td>
                  <Table.Td><TextInput size="xs" value={row.label} onChange={(e) => update(i, 'label', e.target.value)} /></Table.Td>
                  <Table.Td><TextInput size="xs" type="time" value={row.start_time} onChange={(e) => update(i, 'start_time', e.target.value)} /></Table.Td>
                  <Table.Td><TextInput size="xs" type="time" value={row.end_time} onChange={(e) => update(i, 'end_time', e.target.value)} /></Table.Td>
                  <Table.Td><Text size="xs" c="dimmed">{duration(row.start_time, row.end_time)}</Text></Table.Td>
                  <Table.Td>
                    <Group gap={2}>
                      <ActionIcon size="sm" variant="subtle" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp size={12} /></ActionIcon>
                      <ActionIcon size="sm" variant="subtle" disabled={i === rows.length - 1} onClick={() => move(i, 1)}><ArrowDown size={12} /></ActionIcon>
                      <ActionIcon size="sm" variant="subtle" color="red" onClick={() => { setRows((p) => p.filter((_, idx) => idx !== i)); setDirty(true); }}><Trash2 size={12} /></ActionIcon>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
          <Group p="md" gap="sm">
            <Button variant="subtle" size="xs" leftSection={<Plus size={12} />} onClick={() => addSlot('period')}>Add Period</Button>
            <Button variant="subtle" size="xs" color="gray" leftSection={<Coffee size={12} />} onClick={() => addSlot('break')}>Add Break</Button>
          </Group>
        </Card>
      </Stack>
    </Container>
  );
}
