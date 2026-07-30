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
import { Check, Download, Monitor, Printer, Sun, Sunset } from 'lucide-react';
import { useClasses } from '../hooks/useClasses';
import { useSchool } from '../hooks/useSchool';
import { useAuth } from '../stores/auth';
import { attendanceReportHtml, printHtml, type AttendanceReportRow } from '../lib/printDoc';

const BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8787';

type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused' | 'unmarked';

// Daily attendance is taken twice per class: a morning and an afternoon
// session. These reserved (negative) codes occupy the period_id slot so they
// never collide with real timetable periods (which are positive).
type Session = 'morning' | 'afternoon';
const SESSION_CODE: Record<Session, number> = { morning: -1, afternoon: -2 };

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
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [session, setSession] = useState<Session>('morning');
  const [overrides, setOverrides] = useState<Record<number, AttendanceStatus>>({});

  const periodId = SESSION_CODE[session];

  const { data, isLoading } = useQuery({
    queryKey: ['attendance', sectionId, date, periodId],
    queryFn: () => fetchAttendance(token, sectionId, date, periodId),
    enabled: !!sectionId && !!date,
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
        period_id: periodId,
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
      <Group gap="sm" wrap="wrap" align="flex-end">
        <TextInput type="date" label="Date" value={date} onChange={(e) => { setDate(e.currentTarget.value); setOverrides({}); }} w={150} />
        <div>
          <Text size="sm" fw={500} mb={4}>Session</Text>
          <SegmentedControl
            value={session}
            onChange={(v) => { setSession(v as Session); setOverrides({}); }}
            data={[
              { value: 'morning', label: (<Group gap={6} wrap="nowrap"><Sun size={14} /> Morning</Group>) },
              { value: 'afternoon', label: (<Group gap={6} wrap="nowrap"><Sunset size={14} /> Afternoon</Group>) },
            ]}
          />
        </div>
        {students.length > 0 && (
          <Group gap={4}>
            {STATUSES.map((s) => (
              <Button key={s} size="xs" variant="subtle" color={STATUS_COLOR[s]} onClick={() => markAll(s)}>
                All {s}
              </Button>
            ))}
          </Group>
        )}
      </Group>

      {isLoading ? (
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

// Quote a CSV cell only when it contains a comma, quote, or newline.
const csvCell = (v: string | number) => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const rowName = (r: { first_name: string | null; last_name: string | null }) =>
  [r.first_name, r.last_name].filter(Boolean).join(' ');
const safeFile = (s: string) => s.replace(/[^\w-]+/g, '_').replace(/^_+|_+$/g, '') || 'section';

// ─── Monthly summary panel ─────────────────────────────────────────────────────
function SummaryPanel({ token, sectionId, sectionLabel }: { token: string; sectionId: number; sectionLabel: string }) {
  const today = new Date();
  const defaultFrom = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
  const defaultTo = today.toISOString().slice(0, 10);
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const { data: school } = useSchool();

  const { data, isLoading } = useQuery({
    queryKey: ['attendance-summary', sectionId, from, to],
    queryFn: () => fetchSummary(token, sectionId, from, to),
    enabled: !!sectionId && !!from && !!to,
    staleTime: 60_000,
  });

  const rows = data?.summary ?? [];
  const hasRows = rows.length > 0;

  const exportCsv = () => {
    const header = ['Student', 'Present', 'Absent', 'Late', 'Excused', 'Total Marked', 'Attendance %'];
    const lines = [header.join(',')];
    for (const r of rows) {
      lines.push(
        [rowName(r), r.present_days, r.absent_days, r.late_days, r.excused_days, r.total_marked, r.attendance_pct]
          .map(csvCell)
          .join(','),
      );
    }
    const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `attendance_${safeFile(sectionLabel)}_${from}_to_${to}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const printReport = () => {
    const reportRows: AttendanceReportRow[] = rows.map((r) => ({
      name: rowName(r),
      present: r.present_days,
      absent: r.absent_days,
      late: r.late_days,
      excused: r.excused_days,
      total: r.total_marked,
      pct: r.attendance_pct,
    }));
    printHtml(
      attendanceReportHtml(
        {
          name: school?.name ?? 'School',
          address: school?.address,
          principalName: school?.principal_name,
          logo: school?.logo,
          signature: school?.signature,
        },
        { section: sectionLabel, from, to, academicYear: school?.academic_year },
        reportRows,
      ),
    );
  };

  return (
    <Stack gap="md">
      <Group gap="sm" align="flex-end">
        <TextInput type="date" label="From" value={from} onChange={(e) => setFrom(e.currentTarget.value)} w={150} />
        <TextInput type="date" label="To" value={to} onChange={(e) => setTo(e.currentTarget.value)} w={150} />
        <Button size="sm" variant="default" leftSection={<Download size={13} />} onClick={exportCsv} disabled={!hasRows} data-testid="attendance-export-csv">
          Export CSV
        </Button>
        <Button size="sm" variant="default" leftSection={<Printer size={13} />} onClick={printReport} disabled={!hasRows} data-testid="attendance-print">
          Print / PDF
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
  const sectionLabel = flatSections.find((s) => String(s.id) === sectionId)?.label ?? '';

  return (
    <Container size="xl" px={0}>
      <Stack gap="lg">
        <Group justify="space-between" align="flex-end" wrap="nowrap">
          <div>
            <Title order={2}>Attendance</Title>
            <Text c="dimmed" size="sm">Daily morning &amp; afternoon attendance, per class</Text>
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
              <SummaryPanel token={token} sectionId={Number(sectionId)} sectionLabel={sectionLabel} />
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
