import { useMemo, useState } from 'react';
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Card,
  Center,
  Container,
  Group,
  Select,
  Skeleton,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronLeft, Layers } from 'lucide-react';
import { useClasses } from '../hooks/useClasses';
import { useTimings } from '../hooks/useTimings';
import { useAuth } from '../stores/auth';

const BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8787';

type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused' | 'unmarked';

interface StudentRow {
  student_id: number;
  first_name: string | null;
  last_name: string | null;
  status: AttendanceStatus;
}

const STATUS_COLOR: Record<AttendanceStatus, string> = {
  present: '#5C8A62',
  absent: '#e03131',
  late: '#D9A441',
  excused: '#3E7B7B',
  unmarked: '#868e96',
};

const CYCLE: AttendanceStatus[] = ['present', 'absent', 'late', 'excused'];

function nextStatus(s: AttendanceStatus): AttendanceStatus {
  const idx = CYCLE.indexOf(s);
  return idx === -1 ? 'present' : CYCLE[(idx + 1) % CYCLE.length];
}

async function fetchAttendance(
  token: string,
  sectionId: number,
  date: string,
  periodId: number,
): Promise<{ students: StudentRow[] }> {
  const r = await fetch(
    `${BASE}/attendance?section_id=${sectionId}&date=${date}&period_id=${periodId}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  return r.json();
}

async function markAttendance(
  token: string,
  data: { section_id: number; date: string; period_id: number; records: { student_id: number; status: string }[] },
) {
  const r = await fetch(`${BASE}/attendance/mark`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return r.json();
}

export function AttendanceKiosk({ onExit }: { onExit?: () => void }) {
  const token = useAuth((s) => s.token)!;
  const qc = useQueryClient();

  const { data: classesData } = useClasses();
  const { data: periodData } = useTimings();

  const [sectionId, setSectionId] = useState<string | null>(null);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [periodId, setPeriodId] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Record<number, AttendanceStatus>>({});
  const [saved, setSaved] = useState(false);

  const flatSections = useMemo(() => {
    const out: { value: string; label: string }[] = [];
    for (const cls of classesData?.classes ?? []) {
      for (const sec of cls.sections ?? []) {
        out.push({ value: String(sec.id), label: `${cls.name} — ${sec.name}` });
      }
    }
    return out;
  }, [classesData]);

  const periods = (periodData?.periods ?? []).filter((p) => p.period_type !== 'break');
  const periodOptions = periods.map((p) => ({ value: String(p.id), label: `${p.label} · ${p.start_time}–${p.end_time}` }));

  const { data, isLoading } = useQuery({
    queryKey: ['kiosk-attendance', sectionId, date, periodId],
    queryFn: () => fetchAttendance(token, Number(sectionId), date, Number(periodId)),
    enabled: !!sectionId && !!date && !!periodId,
    staleTime: 60_000,
  });

  const students: StudentRow[] = data?.students ?? [];

  const effective = (s: StudentRow): AttendanceStatus =>
    overrides[s.student_id] !== undefined ? overrides[s.student_id] : s.status;

  const toggle = (studentId: number, current: AttendanceStatus) => {
    setSaved(false);
    setOverrides((prev) => ({ ...prev, [studentId]: nextStatus(current) }));
  };

  const markAllPresent = () => {
    setSaved(false);
    const all: Record<number, AttendanceStatus> = {};
    students.forEach((s) => { all[s.student_id] = 'present'; });
    setOverrides(all);
  };

  const saveMut = useMutation({
    mutationFn: () =>
      markAttendance(token, {
        section_id: Number(sectionId),
        date,
        period_id: Number(periodId),
        records: students.map((s) => ({ student_id: s.student_id, status: effective(s) })),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['attendance'] });
      setSaved(true);
      setOverrides({});
    },
  });

  const hasChanges = Object.keys(overrides).length > 0;

  return (
    <Box style={{ minHeight: '100vh', background: '#1E2329', padding: '0 0 40px 0' }}>
      {/* Header */}
      <Box style={{ background: 'rgba(62,123,123,0.08)', borderBottom: '1px solid rgba(62,123,123,0.18)', padding: '12px 24px' }}>
        <Group justify="space-between">
          <Group gap="sm">
            {onExit && (
              <ActionIcon variant="subtle" color="gray" onClick={onExit}>
                <ChevronLeft size={18} />
              </ActionIcon>
            )}
            <Layers size={20} color="#3E7B7B" />
            <Text fw={700} size="md" c="white">LEOS · Quick Attendance</Text>
          </Group>
          <Text size="xs" c="dimmed">{new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</Text>
        </Group>
      </Box>

      <Container size="md" pt="xl">
        <Stack gap="lg">
          {/* Setup row */}
          <Card bg="rgba(255,255,255,0.04)" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
            <Group gap="sm" wrap="wrap" align="flex-end">
              <Select
                label={<Text size="xs" c="dimmed">Section</Text>}
                placeholder="Select class + section…"
                data={flatSections}
                value={sectionId}
                onChange={(v) => { setSectionId(v); setOverrides({}); setSaved(false); }}
                searchable
                styles={{ input: { background: 'rgba(255,255,255,0.06)', color: 'white', borderColor: 'rgba(255,255,255,0.15)' } }}
                w={260}
              />
              <TextInput
                type="date"
                label={<Text size="xs" c="dimmed">Date</Text>}
                value={date}
                onChange={(e) => { setDate(e.currentTarget.value); setOverrides({}); setSaved(false); }}
                styles={{ input: { background: 'rgba(255,255,255,0.06)', color: 'white', borderColor: 'rgba(255,255,255,0.15)' } }}
                w={150}
              />
              <Select
                label={<Text size="xs" c="dimmed">Period</Text>}
                placeholder="Select period…"
                data={periodOptions}
                value={periodId}
                onChange={(v) => { setPeriodId(v); setOverrides({}); setSaved(false); }}
                styles={{ input: { background: 'rgba(255,255,255,0.06)', color: 'white', borderColor: 'rgba(255,255,255,0.15)' } }}
                w={240}
              />
            </Group>
          </Card>

          {/* Student grid */}
          {!sectionId || !periodId ? (
            <Center py="xl">
              <Text c="dimmed" ta="center">Select a section and period to begin marking.</Text>
            </Center>
          ) : isLoading ? (
            <Stack gap="sm">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} height={60} radius="md" />)}</Stack>
          ) : students.length === 0 ? (
            <Card bg="rgba(255,255,255,0.04)" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
              <Text c="dimmed" ta="center" py="xl" size="sm">No students enrolled in this section. Enroll students via the Attendance module first.</Text>
            </Card>
          ) : (
            <>
              <Group justify="space-between" align="center">
                <Text size="sm" c="dimmed">{students.length} students</Text>
                <Button size="xs" variant="subtle" color="gray" onClick={markAllPresent}>Mark all present</Button>
              </Group>

              {/* Large touch-friendly cards */}
              <Stack gap="sm">
                {students.map((s) => {
                  const status = effective(s);
                  const color = STATUS_COLOR[status];
                  return (
                    <Card
                      key={s.student_id}
                      style={{
                        background: 'rgba(255,255,255,0.04)',
                        border: `1px solid ${color}40`,
                        cursor: 'pointer',
                        transition: 'border-color 0.15s',
                      }}
                      onClick={() => toggle(s.student_id, status)}
                      p="md"
                    >
                      <Group justify="space-between" align="center">
                        <Text fw={600} c="white" size="md">
                          {[s.first_name, s.last_name].filter(Boolean).join(' ')}
                        </Text>
                        <Badge style={{ background: color, color: 'white', minWidth: 80 }} size="md">
                          {status}
                        </Badge>
                      </Group>
                    </Card>
                  );
                })}
              </Stack>

              {/* Save bar */}
              <Group justify="flex-end" pt="xs">
                {saved && (
                  <Group gap={4}>
                    <Check size={14} color="#5C8A62" />
                    <Text size="xs" c="mint.5">Saved</Text>
                  </Group>
                )}
                <Button
                  leftSection={<Check size={14} />}
                  color="brand"
                  onClick={() => saveMut.mutate()}
                  loading={saveMut.isPending}
                  disabled={!hasChanges && !saved && students.every((s) => s.status !== 'unmarked')}
                >
                  Save Attendance
                </Button>
              </Group>
            </>
          )}
        </Stack>
      </Container>
    </Box>
  );
}
