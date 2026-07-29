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
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Coffee, DraftingCompass, Plus, Save, Trash2 } from 'lucide-react';
import { savePeriods } from '../api/client';
import type { Period } from '../api/client';
import { useTimings } from '../hooks/useTimings';
import { useAuth } from '../stores/auth';
import { useSchool } from '../hooks/useSchool';

type SlotType = 'period' | 'break' | 'studio';
const SLOT_META: Record<SlotType, { label: string; color: string }> = {
  period: { label: 'Period', color: 'brand' },
  studio: { label: 'Studio', color: 'teal' },
  break: { label: 'Break', color: 'gray' },
};
// Click-through order on the type badge.
const nextSlotType: Record<SlotType, SlotType> = { period: 'studio', studio: 'break', break: 'period' };
function slotMeta(t: string) {
  return SLOT_META[(t as SlotType)] ?? SLOT_META.period;
}

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

  const academicMins = valid
    .filter((r) => r.period_type === 'period' || r.period_type === 'studio')
    .reduce((s, r) => s + toMinutes(r.end_time) - toMinutes(r.start_time), 0);

  return (
    <Paper p="md" withBorder>
      <Group justify="space-between" mb={8}>
        <Text size="xs" c="dimmed" fw={500}>
          {toHHMM(dayStart)}
        </Text>
        <Group gap="lg">
          <Text size="xs" c="dimmed">
            {Math.floor(total / 60)}h {total % 60 > 0 ? `${total % 60}m` : ''} school day
          </Text>
          <Text size="xs" c="dimmed">
            {Math.floor(academicMins / 60)}h {academicMins % 60 > 0 ? `${academicMins % 60}m` : ''} academic
          </Text>
        </Group>
        <Text size="xs" c="dimmed" fw={500}>
          {toHHMM(dayEnd)}
        </Text>
      </Group>
      <div style={{ display: 'flex', height: 36, gap: 2, borderRadius: 8, overflow: 'hidden' }}>
        {valid.map((r, i) => {
          const w = ((toMinutes(r.end_time) - toMinutes(r.start_time)) / total) * 100;
          const isBreak = r.period_type === 'break';
          return (
            <Tooltip
              key={i}
              label={`${r.label} · ${r.start_time}–${r.end_time} (${duration(r.start_time, r.end_time)})`}
              withArrow
            >
              <div
                style={{
                  width: `${w}%`,
                  minWidth: 2,
                  background: isBreak
                    ? 'var(--mantine-color-gray-2)'
                    : 'var(--mantine-color-brand-5)',
                  borderRadius: 4,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                  cursor: 'default',
                  transition: 'opacity 0.15s',
                }}
              >
                {w > 6 && (
                  <Text
                    size="xs"
                    fw={600}
                    style={{ color: isBreak ? 'var(--mantine-color-gray-6)' : '#fff', whiteSpace: 'nowrap', fontSize: 10 }}
                  >
                    {r.label}
                  </Text>
                )}
              </div>
            </Tooltip>
          );
        })}
      </div>
    </Paper>
  );
}

let keyCounter = 0;
function nextKey() {
  return `row-${++keyCounter}`;
}

function fromPeriod(p: Period): EditRow {
  return {
    key: nextKey(),
    label: p.label ?? '',
    period_type: p.period_type === 'break' ? 'break' : p.period_type === 'studio' ? 'studio' : 'period',
    start_time: p.start_time ?? '08:00',
    end_time: p.end_time ?? '08:45',
  };
}

export function TimingsScreen() {
  const token = useAuth((s) => s.token)!;
  const qc = useQueryClient();
  const { data, isLoading } = useTimings();
  const { data: school } = useSchool();
  const isArchitecture = school?.type === 'architecture';
  const [rows, setRows] = useState<EditRow[]>([]);
  const [seeded, setSeeded] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (data && !seeded) {
      setRows(data.periods.map(fromPeriod));
      setSeeded(true);
    }
  }, [data, seeded]);

  const save = useMutation({
    mutationFn: () =>
      savePeriods(
        token,
        rows.map(({ label, period_type, start_time, end_time }) => ({
          label,
          period_type,
          start_time,
          end_time,
        })),
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['periods'] });
      setDirty(false);
    },
  });

  function update(i: number, field: keyof EditRow, value: string) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)));
    setDirty(true);
  }

  function remove(i: number) {
    setRows((prev) => prev.filter((_, idx) => idx !== i));
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

  function addSlot(type: SlotType) {
    const lastEnd = rows.length > 0 ? rows[rows.length - 1].end_time : '08:00';
    const mins = type === 'studio' ? 180 : type === 'period' ? 45 : 15; // studio = long 3h block
    const defaultEnd = toHHMM(toMinutes(lastEnd) + mins);
    const count = rows.filter((r) => r.period_type === type).length + 1;
    const label = type === 'period' ? `Period ${count}` : type === 'studio' ? `Studio ${count}` : 'Break';
    setRows((prev) => [
      ...prev,
      { key: nextKey(), label, period_type: type, start_time: lastEnd, end_time: defaultEnd },
    ]);
    setDirty(true);
  }

  const periodCount = rows.filter((r) => r.period_type === 'period').length;
  const breakCount = rows.filter((r) => r.period_type === 'break').length;

  return (
    <Container size="lg" px={0}>
      <Stack gap="lg">
        <Group justify="space-between" align="flex-start">
          <div>
            <Title order={2}>School Timings</Title>
            <Text c="dimmed">
              {isLoading && !data
                ? 'Loading…'
                : `${periodCount} periods · ${breakCount} breaks`}
            </Text>
          </div>
          <Button
            leftSection={<Save size={14} />}
            onClick={() => save.mutate()}
            loading={save.isPending}
            disabled={!dirty}
            variant={dirty ? 'filled' : 'default'}
          >
            Save Schedule
          </Button>
        </Group>

        {isLoading && !data ? (
          <Skeleton height={60} radius="md" />
        ) : (
          <DayTimeline rows={rows} />
        )}

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
              {isLoading && !data
                ? Array.from({ length: 6 }).map((_, i) => (
                    <Table.Tr key={i}>
                      {Array.from({ length: 6 }).map((__, j) => (
                        <Table.Td key={j}>
                          <Skeleton height={24} radius="sm" />
                        </Table.Td>
                      ))}
                    </Table.Tr>
                  ))
                : rows.map((row, i) => (
                    <Table.Tr key={row.key}>
                      <Table.Td>
                        <Badge
                          color={slotMeta(row.period_type).color}
                          variant={row.period_type === 'break' ? 'light' : 'filled'}
                          style={{ cursor: 'pointer', userSelect: 'none' }}
                          onClick={() =>
                            update(i, 'period_type', nextSlotType[(row.period_type as SlotType) ?? 'period'])
                          }
                        >
                          {slotMeta(row.period_type).label}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        <TextInput
                          size="xs"
                          value={row.label}
                          onChange={(e) => update(i, 'label', e.target.value)}
                          styles={{ input: { minWidth: 120 } }}
                        />
                      </Table.Td>
                      <Table.Td>
                        <TextInput
                          size="xs"
                          type="time"
                          value={row.start_time}
                          onChange={(e) => update(i, 'start_time', e.target.value)}
                          styles={{ input: { width: 90 } }}
                        />
                      </Table.Td>
                      <Table.Td>
                        <TextInput
                          size="xs"
                          type="time"
                          value={row.end_time}
                          onChange={(e) => update(i, 'end_time', e.target.value)}
                          styles={{ input: { width: 90 } }}
                        />
                      </Table.Td>
                      <Table.Td>
                        <Text size="xs" c="dimmed">
                          {duration(row.start_time, row.end_time)}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Group gap={2} wrap="nowrap">
                          <Tooltip label="Move up">
                            <ActionIcon
                              size="sm"
                              variant="subtle"
                              disabled={i === 0}
                              onClick={() => move(i, -1)}
                            >
                              <ArrowUp size={12} />
                            </ActionIcon>
                          </Tooltip>
                          <Tooltip label="Move down">
                            <ActionIcon
                              size="sm"
                              variant="subtle"
                              disabled={i === rows.length - 1}
                              onClick={() => move(i, 1)}
                            >
                              <ArrowDown size={12} />
                            </ActionIcon>
                          </Tooltip>
                          <Tooltip label="Delete">
                            <ActionIcon
                              size="sm"
                              variant="subtle"
                              color="red"
                              onClick={() => remove(i)}
                            >
                              <Trash2 size={12} />
                            </ActionIcon>
                          </Tooltip>
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  ))}
            </Table.Tbody>
          </Table>

          <Group p="md" gap="sm">
            <Button
              variant="subtle"
              size="xs"
              leftSection={<Plus size={12} />}
              onClick={() => addSlot('period')}
            >
              Add Period
            </Button>
            {isArchitecture && (
              <Button
                variant="subtle"
                size="xs"
                color="teal"
                leftSection={<DraftingCompass size={12} />}
                onClick={() => addSlot('studio')}
              >
                Add Studio
              </Button>
            )}
            <Button
              variant="subtle"
              size="xs"
              color="gray"
              leftSection={<Coffee size={12} />}
              onClick={() => addSlot('break')}
            >
              Add Break
            </Button>
          </Group>
        </Card>
      </Stack>
    </Container>
  );
}
