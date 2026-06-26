import { useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  Container,
  Group,
  Modal,
  NumberInput,
  Select,
  Skeleton,
  Stack,
  Table,
  Tabs,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardList, Printer, Plus, Trophy } from 'lucide-react';
import { useClasses } from '../hooks/useClasses';
import { useSubjects } from '../hooks/useSubjects';
import { useStaff } from '../hooks/useStaff';
import { useClassrooms } from '../hooks/useClassrooms';
import { useAuth } from '../stores/auth';
import { useSchool } from '../hooks/useSchool';

const BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8787';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Exam {
  id: number;
  name: string;
  exam_type: string | null;
  academic_year_id: number | null;
  term_id: number | null;
  start_date: string | null;
  end_date: string | null;
}

interface ExamSchedule {
  id: number;
  exam_id: number;
  subject_id: number | null;
  subject_name: string | null;
  subject_code: string | null;
  section_id: number | null;
  section_name: string | null;
  class_name: string | null;
  date: string | null;
  start_time: string | null;
  end_time: string | null;
  room_id: number | null;
  room_name: string | null;
  invigilator_id: number | null;
  invigilator_name: string | null;
}

interface ExamMark {
  student_id: number;
  first_name: string | null;
  last_name: string | null;
  subject_id: number;
  subject_name: string | null;
  marks_obtained: number | null;
  max_marks: number | null;
  grade: string | null;
}

interface ReportRow {
  student_id: number;
  first_name: string | null;
  last_name: string | null;
  total_obtained: number;
  total_max: number;
  subjects_count: number;
  percentage: number;
}

// ─── API ──────────────────────────────────────────────────────────────────────
async function fetchExams(token: string, yearId?: number): Promise<{ exams: Exam[] }> {
  const qs = yearId ? `?year_id=${yearId}` : '';
  const r = await fetch(`${BASE}/exams${qs}`, { headers: { Authorization: `Bearer ${token}` } });
  return r.json();
}

async function createExam(token: string, data: { name: string; exam_type?: string; start_date?: string; end_date?: string; academic_year_id?: number }) {
  const r = await fetch(`${BASE}/exams`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return r.json();
}

async function fetchSchedules(token: string, examId: number): Promise<{ schedules: ExamSchedule[] }> {
  const r = await fetch(`${BASE}/exam-schedules?exam_id=${examId}`, { headers: { Authorization: `Bearer ${token}` } });
  return r.json();
}

async function saveSchedule(token: string, data: object) {
  const r = await fetch(`${BASE}/exam-schedules`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return r.json();
}

async function fetchMarks(token: string, examId: number, subjectId?: number): Promise<{ marks: ExamMark[] }> {
  const qs = subjectId ? `?exam_id=${examId}&subject_id=${subjectId}` : `?exam_id=${examId}`;
  const r = await fetch(`${BASE}/exam-marks${qs}`, { headers: { Authorization: `Bearer ${token}` } });
  return r.json();
}

async function saveMarks(token: string, examId: number, records: { student_id: number; subject_id: number; marks_obtained: number; max_marks: number; grade?: string }[]) {
  const r = await fetch(`${BASE}/exam-marks`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ exam_id: examId, records }),
  });
  return r.json();
}

async function fetchReport(token: string, examId: number, sectionId?: number): Promise<{ report: ReportRow[] }> {
  const qs = sectionId ? `?exam_id=${examId}&section_id=${sectionId}` : `?exam_id=${examId}`;
  const r = await fetch(`${BASE}/exam-marks/report${qs}`, { headers: { Authorization: `Bearer ${token}` } });
  return r.json();
}

const EXAM_TYPES = ['unit', 'midterm', 'final', 'quarterly', 'half-yearly', 'annual', 'practical', 'internal'];

// ─── Grade helper ──────────────────────────────────────────────────────────────
function gradeFromPct(pct: number): string {
  if (pct >= 90) return 'A+';
  if (pct >= 75) return 'A';
  if (pct >= 60) return 'B';
  if (pct >= 50) return 'C';
  if (pct >= 35) return 'D';
  return 'F';
}

// ─── Exam selector sidebar ─────────────────────────────────────────────────────
function ExamList({ token, selected, onSelect }: { token: string; selected: number | null; onSelect: (id: number) => void }) {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['exams'], queryFn: () => fetchExams(token), staleTime: 60_000 });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', exam_type: 'unit', start_date: '', end_date: '' });

  const createMut = useMutation({
    mutationFn: () => createExam(token, { ...form, start_date: form.start_date || undefined, end_date: form.end_date || undefined }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['exams'] });
      setOpen(false);
      if (res.id) onSelect(res.id);
    },
  });

  const exams = data?.exams ?? [];

  return (
    <Stack gap="xs" style={{ width: 220, flexShrink: 0 }}>
      <Group justify="space-between">
        <Text size="xs" fw={600} c="dimmed">EXAMS</Text>
        <Button size="xs" variant="subtle" leftSection={<Plus size={11} />} onClick={() => setOpen(true)}>New</Button>
      </Group>
      {exams.length === 0 ? (
        <Text size="xs" c="dimmed">No exams yet. Create one.</Text>
      ) : (
        exams.map((ex) => (
          <Card
            key={ex.id}
            p="xs"
            style={{ cursor: 'pointer', border: selected === ex.id ? '1.5px solid var(--mantine-color-brand-5)' : '1px solid var(--mantine-color-gray-2)' }}
            onClick={() => onSelect(ex.id)}
          >
            <Text size="sm" fw={selected === ex.id ? 700 : 400}>{ex.name}</Text>
            <Group gap={4} mt={2}>
              <Badge size="xs" variant="outline" color="gray">{ex.exam_type}</Badge>
              {ex.start_date && <Text size="xs" c="dimmed">{ex.start_date}</Text>}
            </Group>
          </Card>
        ))
      )}

      <Modal opened={open} onClose={() => setOpen(false)} title="Create Exam" size="sm">
        <Stack gap="sm">
          <TextInput label="Exam name" placeholder="e.g. Unit Test 1" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.currentTarget.value }))} />
          <Select
            label="Type"
            data={EXAM_TYPES.map((t) => ({ value: t, label: t.charAt(0).toUpperCase() + t.slice(1) }))}
            value={form.exam_type}
            onChange={(v) => setForm((f) => ({ ...f, exam_type: v ?? 'unit' }))}
          />
          <Group grow>
            <TextInput type="date" label="Start date" value={form.start_date} onChange={(e) => setForm((f) => ({ ...f, start_date: e.currentTarget.value }))} />
            <TextInput type="date" label="End date" value={form.end_date} onChange={(e) => setForm((f) => ({ ...f, end_date: e.currentTarget.value }))} />
          </Group>
          <Group justify="flex-end">
            <Button variant="subtle" color="gray" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => createMut.mutate()} loading={createMut.isPending} disabled={!form.name.trim()}>Create</Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}

// ─── Schedule tab ──────────────────────────────────────────────────────────────
function ScheduleTab({ token, examId }: { token: string; examId: number }) {
  const qc = useQueryClient();
  const { data: subjectData } = useSubjects('');
  const { data: classesData } = useClasses();
  const { data: roomData } = useClassrooms();
  const { data: staffData } = useStaff('');
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({
    subject_id: '', section_id: '', date: '', start_time: '', end_time: '',
    room_id: '', invigilator_id: '',
  });

  const { data, isLoading } = useQuery({
    queryKey: ['exam-schedules', examId],
    queryFn: () => fetchSchedules(token, examId),
    enabled: !!examId,
    staleTime: 60_000,
  });

  const subjectOptions = (subjectData?.subjects ?? []).map((s) => ({ value: String(s.id), label: `${s.code ? s.code + ' — ' : ''}${s.name}` }));
  const roomOptions = (roomData?.classrooms ?? []).map((r) => ({ value: String(r.id), label: r.name ?? `Room ${r.id}` }));
  const staffOptions = (staffData?.staff ?? []).map((s) => ({ value: String(s.id), label: `${s.first_name ?? ''} ${s.last_name ?? ''}`.trim() }));
  const sectionOptions = useMemo(() => {
    const out: { value: string; label: string }[] = [];
    for (const cls of classesData?.classes ?? []) {
      for (const sec of cls.sections ?? []) {
        out.push({ value: String(sec.id), label: `${cls.name} — ${sec.name}` });
      }
    }
    return out;
  }, [classesData]);

  const saveMut = useMutation({
    mutationFn: () => saveSchedule(token, {
      exam_id: examId,
      subject_id: form.subject_id ? Number(form.subject_id) : null,
      section_id: form.section_id ? Number(form.section_id) : null,
      date: form.date || null,
      start_time: form.start_time || null,
      end_time: form.end_time || null,
      room_id: form.room_id ? Number(form.room_id) : null,
      invigilator_id: form.invigilator_id ? Number(form.invigilator_id) : null,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['exam-schedules', examId] }); setAddOpen(false); },
  });

  const schedules = data?.schedules ?? [];

  return (
    <Stack gap="md">
      <Group justify="flex-end">
        <Button size="xs" leftSection={<Plus size={12} />} onClick={() => setAddOpen(true)}>Add Slot</Button>
      </Group>
      {isLoading ? <Skeleton height={120} radius="md" /> : schedules.length === 0 ? (
        <Text size="sm" c="dimmed">No schedule slots yet. Add subject+section+date slots.</Text>
      ) : (
        <Table withTableBorder striped>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Subject</Table.Th>
              <Table.Th>Section</Table.Th>
              <Table.Th>Date</Table.Th>
              <Table.Th>Time</Table.Th>
              <Table.Th>Room</Table.Th>
              <Table.Th>Invigilator</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {schedules.map((s) => (
              <Table.Tr key={s.id}>
                <Table.Td><Text size="sm" fw={500}>{s.subject_code ?? ''} {s.subject_name}</Text></Table.Td>
                <Table.Td><Text size="sm">{s.class_name} · {s.section_name}</Text></Table.Td>
                <Table.Td><Text size="sm">{s.date ?? '—'}</Text></Table.Td>
                <Table.Td><Text size="sm">{s.start_time} – {s.end_time}</Text></Table.Td>
                <Table.Td><Text size="sm">{s.room_name ?? '—'}</Text></Table.Td>
                <Table.Td><Text size="sm">{s.invigilator_name ?? '—'}</Text></Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}

      <Modal opened={addOpen} onClose={() => setAddOpen(false)} title="Add Schedule Slot" size="md">
        <Stack gap="sm">
          <Group grow>
            <Select label="Subject" placeholder="Select…" data={subjectOptions} value={form.subject_id} onChange={(v) => setForm((f) => ({ ...f, subject_id: v ?? '' }))} searchable />
            <Select label="Section" placeholder="Select…" data={sectionOptions} value={form.section_id} onChange={(v) => setForm((f) => ({ ...f, section_id: v ?? '' }))} searchable />
          </Group>
          <TextInput type="date" label="Date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.currentTarget.value }))} />
          <Group grow>
            <TextInput type="time" label="Start" value={form.start_time} onChange={(e) => setForm((f) => ({ ...f, start_time: e.currentTarget.value }))} />
            <TextInput type="time" label="End" value={form.end_time} onChange={(e) => setForm((f) => ({ ...f, end_time: e.currentTarget.value }))} />
          </Group>
          <Group grow>
            <Select label="Room" placeholder="Optional" data={roomOptions} value={form.room_id} onChange={(v) => setForm((f) => ({ ...f, room_id: v ?? '' }))} clearable />
            <Select label="Invigilator" placeholder="Optional" data={staffOptions} value={form.invigilator_id} onChange={(v) => setForm((f) => ({ ...f, invigilator_id: v ?? '' }))} searchable clearable />
          </Group>
          <Group justify="flex-end">
            <Button variant="subtle" color="gray" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={() => saveMut.mutate()} loading={saveMut.isPending}>Save Slot</Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}

// ─── Marks entry tab ───────────────────────────────────────────────────────────
function MarksTab({ token, examId }: { token: string; examId: number }) {
  const qc = useQueryClient();
  const { data: subjectData } = useSubjects('');
  const [subjectId, setSubjectId] = useState<string | null>(null);
  const [maxMarks, setMaxMarks] = useState<number | string>(100);
  const [marksOverride, setMarksOverride] = useState<Record<number, string>>({});

  const subjectOptions = (subjectData?.subjects ?? []).map((s) => ({
    value: String(s.id),
    label: `${s.code ? s.code + ' — ' : ''}${s.name}`,
  }));

  const { data, isLoading } = useQuery({
    queryKey: ['exam-marks', examId, subjectId],
    queryFn: () => fetchMarks(token, examId, subjectId ? Number(subjectId) : undefined),
    enabled: !!examId && !!subjectId,
    staleTime: 60_000,
  });

  const marks = data?.marks ?? [];

  const effectiveMarks = (m: ExamMark) =>
    marksOverride[m.student_id] !== undefined ? marksOverride[m.student_id] : String(m.marks_obtained ?? '');

  const saveMut = useMutation({
    mutationFn: () => {
      const max = typeof maxMarks === 'number' ? maxMarks : 100;
      const records = marks.map((m) => {
        const raw = marksOverride[m.student_id] ?? String(m.marks_obtained ?? '');
        const obtained = parseFloat(raw) || 0;
        const pct = max > 0 ? obtained / max * 100 : 0;
        return { student_id: m.student_id, subject_id: Number(subjectId), marks_obtained: obtained, max_marks: max, grade: gradeFromPct(pct) };
      });
      return saveMarks(token, examId, records);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['exam-marks', examId] }); setMarksOverride({}); },
  });

  return (
    <Stack gap="md">
      <Group gap="sm" align="flex-end">
        <Select
          label="Subject"
          placeholder="Select subject…"
          data={subjectOptions}
          value={subjectId}
          onChange={(v) => { setSubjectId(v); setMarksOverride({}); }}
          searchable
          w={260}
        />
        <NumberInput label="Max marks" value={maxMarks} onChange={setMaxMarks} min={1} max={1000} w={120} />
      </Group>

      {!subjectId ? (
        <Text size="sm" c="dimmed">Select a subject to enter marks.</Text>
      ) : isLoading ? (
        <Skeleton height={160} radius="md" />
      ) : marks.length === 0 ? (
        <Text size="sm" c="dimmed">No students found for this exam+subject. Ensure section enrollment is set up.</Text>
      ) : (
        <>
          <Table withTableBorder striped>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Student</Table.Th>
                <Table.Th style={{ width: 120 }}>Marks / {typeof maxMarks === 'number' ? maxMarks : 100}</Table.Th>
                <Table.Th style={{ width: 60, textAlign: 'center' }}>Grade</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {marks.map((m) => {
                const raw = effectiveMarks(m);
                const obtained = parseFloat(raw) || 0;
                const max = typeof maxMarks === 'number' ? maxMarks : 100;
                const pct = max > 0 ? obtained / max * 100 : 0;
                const grade = raw ? gradeFromPct(pct) : '—';
                return (
                  <Table.Tr key={m.student_id}>
                    <Table.Td><Text size="sm">{[m.first_name, m.last_name].filter(Boolean).join(' ')}</Text></Table.Td>
                    <Table.Td>
                      <TextInput
                        size="xs"
                        value={raw}
                        onChange={(e) => setMarksOverride((prev) => ({ ...prev, [m.student_id]: e.currentTarget.value }))}
                        placeholder="—"
                      />
                    </Table.Td>
                    <Table.Td ta="center">
                      <Badge color={pct >= 35 ? 'mint' : 'red'} size="xs">{grade}</Badge>
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
          <Group justify="flex-end">
            <Button onClick={() => saveMut.mutate()} loading={saveMut.isPending} disabled={Object.keys(marksOverride).length === 0}>
              Save Marks
            </Button>
          </Group>
        </>
      )}
    </Stack>
  );
}

// ─── Report card / ranking tab ─────────────────────────────────────────────────
function ReportTab({ token, examId }: { token: string; examId: number }) {
  const { data: classesData } = useClasses();
  const { data: schoolData } = useSchool();
  const [sectionId, setSectionId] = useState<string | null>(null);

  const sectionOptions = useMemo(() => {
    const out: { value: string; label: string }[] = [];
    for (const cls of classesData?.classes ?? []) {
      for (const sec of cls.sections ?? []) {
        out.push({ value: String(sec.id), label: `${cls.name} — ${sec.name}` });
      }
    }
    return out;
  }, [classesData]);

  const { data, isLoading } = useQuery({
    queryKey: ['exam-report', examId, sectionId],
    queryFn: () => fetchReport(token, examId, sectionId ? Number(sectionId) : undefined),
    enabled: !!examId,
    staleTime: 60_000,
  });

  const report = data?.report ?? [];

  const printReport = () => {
    const schoolName = schoolData?.name ?? 'School';
    const rows = report.map((r, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${r.first_name ?? ''} ${r.last_name ?? ''}</td>
        <td>${r.total_obtained} / ${r.total_max}</td>
        <td>${r.percentage}%</td>
        <td>${gradeFromPct(r.percentage)}</td>
      </tr>`).join('');
    const html = `<!DOCTYPE html><html><head><title>Exam Report</title>
<style>body{font-family:'Segoe UI',sans-serif;max-width:720px;margin:40px auto;}
table{width:100%;border-collapse:collapse;}td,th{border:1px solid #ddd;padding:6px 10px;font-size:0.85rem;}
th{background:#f0f4f8;}@media print{body{margin:10mm;}}</style></head>
<body><h2>${schoolName}</h2><p>Exam Result</p>
<table><thead><tr><th>#</th><th>Student</th><th>Marks</th><th>%</th><th>Grade</th></tr></thead>
<tbody>${rows}</tbody></table>
<p style="font-size:0.75rem;color:#888;margin-top:24px;">Generated by LEOS</p>
</body></html>`;
    const w = window.open('', '_blank');
    if (w) { w.document.write(html); w.document.close(); w.print(); }
  };

  return (
    <Stack gap="md">
      <Group gap="sm" align="flex-end" justify="space-between">
        <Select
          label="Filter by section"
          placeholder="All sections"
          data={sectionOptions}
          value={sectionId}
          onChange={setSectionId}
          clearable
          w={240}
        />
        <Button size="sm" variant="subtle" leftSection={<Printer size={13} />} onClick={printReport} disabled={report.length === 0}>
          Print Report
        </Button>
      </Group>

      {isLoading ? <Skeleton height={160} radius="md" /> : report.length === 0 ? (
        <Text size="sm" c="dimmed">No marks entered yet. Enter marks in the Marks tab first.</Text>
      ) : (
        <Table withTableBorder striped>
          <Table.Thead>
            <Table.Tr>
              <Table.Th style={{ width: 40, textAlign: 'center' }}><Trophy size={12} /></Table.Th>
              <Table.Th>Student</Table.Th>
              <Table.Th style={{ textAlign: 'right' }}>Marks</Table.Th>
              <Table.Th style={{ textAlign: 'center' }}>%</Table.Th>
              <Table.Th style={{ textAlign: 'center' }}>Grade</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {report.map((r, i) => (
              <Table.Tr key={r.student_id}>
                <Table.Td ta="center"><Text size="sm" fw={600} c={i < 3 ? 'yellow.7' : 'dimmed'}>{i + 1}</Text></Table.Td>
                <Table.Td><Text size="sm">{[r.first_name, r.last_name].filter(Boolean).join(' ')}</Text></Table.Td>
                <Table.Td ta="right"><Text size="sm">{r.total_obtained} / {r.total_max}</Text></Table.Td>
                <Table.Td ta="center"><Text size="sm" fw={500}>{r.percentage}%</Text></Table.Td>
                <Table.Td ta="center">
                  <Badge color={r.percentage >= 35 ? 'mint' : 'red'} size="sm">{gradeFromPct(r.percentage)}</Badge>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
    </Stack>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────
export function ExamScreen() {
  const token = useAuth((s) => s.token)!;
  const [selectedExam, setSelectedExam] = useState<number | null>(null);
  const [tab, setTab] = useState('schedule');

  return (
    <Container size="xl" px={0}>
      <Stack gap="lg">
        <Group gap="sm" mb={4}>
          <ClipboardList size={20} color="var(--mantine-color-brand-6)" />
          <Title order={2}>Exams</Title>
        </Group>

        <Group gap="lg" align="flex-start" wrap="nowrap">
          <ExamList token={token} selected={selectedExam} onSelect={(id) => { setSelectedExam(id); setTab('schedule'); }} />

          {selectedExam ? (
            <Card style={{ flex: 1 }}>
              <Tabs value={tab} onChange={(v) => setTab(v ?? 'schedule')}>
                <Tabs.List mb="md">
                  <Tabs.Tab value="schedule">Schedule</Tabs.Tab>
                  <Tabs.Tab value="marks">Marks Entry</Tabs.Tab>
                  <Tabs.Tab value="report">Report / Ranking</Tabs.Tab>
                </Tabs.List>
                <Tabs.Panel value="schedule">
                  <ScheduleTab token={token} examId={selectedExam} />
                </Tabs.Panel>
                <Tabs.Panel value="marks">
                  <MarksTab token={token} examId={selectedExam} />
                </Tabs.Panel>
                <Tabs.Panel value="report">
                  <ReportTab token={token} examId={selectedExam} />
                </Tabs.Panel>
              </Tabs>
            </Card>
          ) : (
            <Card style={{ flex: 1 }}>
              <Text size="sm" c="dimmed" ta="center" py="xl">Select an exam from the list to manage it.</Text>
            </Card>
          )}
        </Group>
      </Stack>
    </Container>
  );
}
