import { useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  Container,
  Group,
  SegmentedControl,
  Select,
  Skeleton,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Download, Monitor } from 'lucide-react';
import { useClasses } from '../hooks/useClasses';
import { useTimings } from '../hooks/useTimings';
import { useAuth } from '../stores/auth';

const BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8787';

type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused' | 'unmarked';

interface StudentAttendance {
  student_id: number;
  first_name: string | null;
  last_name: string | null;
  status: AttendanceStatus;
  note: string | null;
}

interface SummaryRow {
  student_id: number;
  first_name: string | null;
  last_name: string | null;
  present_days: number;
  absent_days: number;
  late_days: number;
  excused_days: number;
  total_marked: number;
  attendance_pct: number;
}

// ─── API helpers ──────────────────────────────────────────────────────────────
async function fetchAttendance(token: string, sectionId: number, date: string, periodId: number): Promise<{ students: StudentAttendance[]; section_id: number; date: string; period_id: number }> {
  const r = await fetch(
    `${BASE}/attendance?section_id=${sectionId}&date=${date}&period_id=${periodId}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  return r.json();
}

async function markAttendance(token: string, data: { section_id: number; date: string; period_id: number; records: { student_id: number; status: string }[] }) {
  const r = await fetch(`${BASE}/attendance/mark`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return r.json();
}

async function fetchSummary(token: string, sectionId: number, from: string, to: string): Promise<{ summary: SummaryRow[] }> {
  const r = await fetch(
    `${BASE}/attendance/summary?section_id=${sectionId}&from=${from}&to=${to}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  return r.json();
}

// ─── Status toggle button ──────────────────────────────────────────────────────
const STATUS_COLOR: Record<AttendanceStatus, string> = {
  present: 'mint',
  absent: 'red',
  late: 'yellow',
  excused: 'blue',
  unmarked: 'gray',
};
const STATUSES: AttendanceStatus[] = ['present', 'absent', 'late', 'excused'];

function StatusToggle({ status, onChange }: { status: AttendanceStatus; onChange: (s: AttendanceStatus) => void }) {
  const next: AttendanceStatus = status === 'present' ? 'absent' : status === 'absent' ? 'late' : status === 'late' ? 'excused' : 'present';
  return (
    <Badge
      color={STATUS_COLOR[status]}
      style={{ cursor: 'pointer', userSelect: 'none', minWidth: 72 }}
      onClick={() => onChange(next)}
    >
      {status}
    </Badge>
  );
}

// ─── Mark attendance panel ─────────────────────────────────────────────────────
function MarkAttendancePanel({ token, sectionId }: { token: string; sectionId: number }) {
  const qc = useQueryClient();
  const { data: periodData } = useTimings();
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [periodId, setPeriodId] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Record<number, AttendanceStatus>>({});

  const periods = (periodData?.periods ?? []).filter((p) => p.period_type !== 'break');
  const periodOptions = periods.map((p) => ({ value: String(p.id), label: `${p.label} (${p.start_time})` }));

  const { data, isLoading } = useQuery({
    queryKey: ['attendance', sectionId, date, periodId],
    queryFn: () => fetchAttendance(token, sectionId, date, Number(periodId)),
    enabled: !!sectionId && !!date && !!periodId,
    staleTime: 60_000,
  });

  const students = data?.students ?? [];

  const effectiveStatus = (s: StudentAttendance): AttendanceStatus =>
    overrides[s.student_id] !== undefined ? overrides[s.student_id] : s.status;

  const handleToggle = (studentId: number, status: AttendanceStatus) => {
    setOverrides((prev) => ({ ...prev, [studentId]: status }));
  };

  const markAll = (status: AttendanceStatus) => {
    const all: Record<number, AttendanceStatus> = {};
    students.forEach((s) => { all[s.student_id] = status; });
    setOverrides(all);
  };

  const saveMut = useMutation({
    mutationFn: () =>
      markAttendance(token, {
        section_id: sectionId,
        date,
        period_id: Number(periodId),
        records: students.map((s) => ({ student_id: s.student_id, status: effectiveStatus(s) })),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['attendance', sectionId] });
      qc.invalidateQueries({ queryKey: ['attendance-summary'] });
      setOverrides({});
    },
  });

  const hasChanges = Object.keys(overrides).length > 0;

  return (
    <Stack gap="md">
      <Group gap="sm" wrap="wrap">
        <TextInput type="date" label="Date" value={date} onChange={(e) => setDate(e.currentTarget.value)} w={150} />
        <Select label="Period" placeholder="Select period…" data={periodOptions} value={periodId} onChange={setPeriodId} w={220} />
        {students.length > 0 && (
          <Group gap={4} mt={22}>
            {STATUSES.map((s) => (
              <Button key={s} size="xs" variant="subtle" color={STATUS_COLOR[s]} onClick={() => markAll(s)}>
                All {s}
              </Button>
            ))}
          </Group>
        )}
      </Group>

      {!periodId ? (
        <Text size="sm" c="dimmed">Select a period to mark attendance.</Text>
      ) : isLoading ? (
        <Stack gap="xs">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} height={36} radius="md" />)}</Stack>
      ) : students.length === 0 ? (
        <Card>
          <Text size="sm" c="dimmed" ta="center" py="md">No students enrolled in this section yet. Enroll students first.</Text>
        </Card>
      ) : (
        <Stack gap={0}>
          <Table striped highlightOnHover withTableBorder withColumnBorders>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Student</Table.Th>
                <Table.Th style={{ width: 100 }}>Status</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {students.map((s) => (
                <Table.Tr key={s.student_id}>
                  <Table.Td>
                    <Text size="sm">{[s.first_name, s.last_name].filter(Boolean).join(' ')}</Text>
                  </Table.Td>
                  <Table.Td>
                    <StatusToggle
                      status={effectiveStatus(s)}
                      onChange={(status) => handleToggle(s.student_id, status)}
                    />
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
          <Group justify="flex-end" mt="sm">
            <Button
              leftSection={<Check size={14} />}
              onClick={() => saveMut.mutate()}
              loading={saveMut.isPending}
              disabled={!hasChanges && students.every((s) => s.status !== 'unmarked')}
            >
              Save Attendance
            </Button>
          </Group>
        </Stack>
      )}
    </Stack>
  );
}

// ─── Monthly summary panel ─────────────────────────────────────────────────────
function SummaryPanel({ token, sectionId }: { token: string; sectionId: number }) {
  const today = new Date();
  const defaultFrom = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
  const defaultTo = today.toISOString().slice(0, 10);
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);

  const { data, isLoading } = useQuery({
    queryKey: ['attendance-summary', sectionId, from, to],
    queryFn: () => fetchSummary(token, sectionId, from, to),
    enabled: !!sectionId && !!from && !!to,
    staleTime: 60_000,
  });

  const rows = data?.summary ?? [];

  return (
    <Stack gap="md">
      <Group gap="sm" align="flex-end">
        <TextInput type="date" label="From" value={from} onChange={(e) => setFrom(e.currentTarget.value)} w={150} />
        <TextInput type="date" label="To" value={to} onChange={(e) => setTo(e.currentTarget.value)} w={150} />
        <Button size="sm" variant="default" leftSection={<Download size={13} />} disabled>
          Export CSV
        </Button>
      </Group>
      {isLoading ? (
        <Skeleton height={200} radius="md" />
      ) : rows.length === 0 ? (
        <Text size="sm" c="dimmed">No attendance records for this period.</Text>
      ) : (
        <Table striped withTableBorder withColumnBorders>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Student</Table.Th>
              <Table.Th style={{ textAlign: 'center' }}>Present</Table.Th>
              <Table.Th style={{ textAlign: 'center' }}>Absent</Table.Th>
              <Table.Th style={{ textAlign: 'center' }}>Late</Table.Th>
              <Table.Th style={{ textAlign: 'center' }}>Excused</Table.Th>
              <Table.Th style={{ textAlign: 'center' }}>%</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.map((r) => (
              <Table.Tr key={r.student_id}>
                <Table.Td>
                  <Text size="sm">{[r.first_name, r.last_name].filter(Boolean).join(' ')}</Text>
                </Table.Td>
                <Table.Td ta="center"><Text size="sm" c="mint.7">{r.present_days}</Text></Table.Td>
                <Table.Td ta="center"><Text size="sm" c="red.7">{r.absent_days}</Text></Table.Td>
                <Table.Td ta="center"><Text size="sm" c="yellow.7">{r.late_days}</Text></Table.Td>
                <Table.Td ta="center"><Text size="sm" c="blue.7">{r.excused_days}</Text></Table.Td>
                <Table.Td ta="center">
                  <Badge color={r.attendance_pct >= 75 ? 'mint' : 'red'} size="sm">{r.attendance_pct}%</Badge>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
    </Stack>
  );
}

// ─── Section selector from classes data ──────────────────────────────────────
interface FlatSection { id: number; label: string; }

// ─── Main screen ──────────────────────────────────────────────────────────────
export function AttendanceScreen({ onKiosk }: { onKiosk?: () => void } = {}) {
  const token = useAuth((s) => s.token)!;
  const [view, setView] = useState<'mark' | 'report'>('mark');
  const [sectionId, setSectionId] = useState<string | null>(null);

  const { data: classesData } = useClasses();

  const flatSections = useMemo<FlatSection[]>(() => {
    const out: FlatSection[] = [];
    for (const cls of classesData?.classes ?? []) {
      for (const sec of cls.sections ?? []) {
        out.push({ id: sec.id, label: `${cls.name} — ${sec.name}` });
      }
    }
    return out;
  }, [classesData]);

  const sectionOptions = flatSections.map((s) => ({ value: String(s.id), label: s.label }));

  return (
    <Container size="xl" px={0}>
      <Stack gap="lg">
        <Group justify="space-between" align="flex-end" wrap="nowrap">
          <div>
            <Title order={2}>Attendance</Title>
            <Text c="dimmed" size="sm">Per-period attendance marking and monthly reports</Text>
          </div>
          <Group gap="sm">
            {onKiosk && (
              <Button size="sm" variant="subtle" leftSection={<Monitor size={14} />} onClick={onKiosk}>
                Kiosk Mode
              </Button>
            )}
            <SegmentedControl
              value={view}
              onChange={(v) => setView(v as 'mark' | 'report')}
              data={[
                { value: 'mark', label: 'Mark' },
                { value: 'report', label: 'Report' },
              ]}
            />
          </Group>
        </Group>

        <Card>
          <Select
            label="Section"
            placeholder="Select class + section…"
            data={sectionOptions}
            value={sectionId}
            onChange={setSectionId}
            searchable
            w={300}
          />
        </Card>

        {sectionId ? (
          view === 'mark' ? (
            <Card>
              <MarkAttendancePanel token={token} sectionId={Number(sectionId)} />
            </Card>
          ) : (
            <Card>
              <SummaryPanel token={token} sectionId={Number(sectionId)} />
            </Card>
          )
        ) : (
          <Card>
            <Text size="sm" c="dimmed" ta="center" py="md">Select a section to view attendance.</Text>
          </Card>
        )}
      </Stack>
    </Container>
  );
}
