import { useState } from 'react';
import {
  ActionIcon, Badge, Button, Card, Divider, Group, NumberInput, Select, Stack, Table, Text, TextInput,
} from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { useAuth } from '../stores/auth';
import {
  addStudentMark, deleteStudentMark, fetchStudentMarks,
  fetchBoardRegistrations, saveBoardRegistration, deleteBoardRegistration,
  type BoardRegistration,
} from '../api/client';

const TERMS = ['Unit Test 1', 'Unit Test 2', 'Mid Term', 'Pre-Board', 'Final Exam', 'Practical'];
const LOC = ['Pending', 'Submitted', 'Locked'];
const ADMIT = ['Not issued', 'Issued', 'Downloaded'];
const STATUS_COLOR: Record<string, string> = { Pending: 'yellow', Submitted: 'sky', Locked: 'mint', 'Not issued': 'gray', Issued: 'mint', Downloaded: 'blue' };

function pct(marks: number | null, max: number | null) {
  if (!marks || !max) return null;
  return Math.round((marks / max) * 1000) / 10;
}

export function StudentAcademicsTab({ studentId }: { studentId: number }) {
  const token = useAuth((s) => s.token)!;
  const qc = useQueryClient();

  // ── Marks ──
  const { data: marksData } = useQuery({ queryKey: ['student-marks', studentId], queryFn: () => fetchStudentMarks(token, studentId) });
  const marks = marksData?.marks ?? [];
  const invMarks = () => qc.invalidateQueries({ queryKey: ['student-marks', studentId] });
  const [m, setM] = useState({ term: 'Mid Term', subject: '', max_marks: 100, marks: undefined as number | undefined, grade: '' });
  const addMark = useMutation({
    mutationFn: () => addStudentMark(token, { student_id: studentId, term: m.term, subject: m.subject, max_marks: m.max_marks, marks: m.marks, grade: m.grade || undefined }),
    onSuccess: () => { invMarks(); setM((s) => ({ ...s, subject: '', marks: undefined, grade: '' })); },
  });
  const delMark = useMutation({ mutationFn: (id: number) => deleteStudentMark(token, id), onSuccess: invMarks });

  // ── Board registration ──
  const { data: regData } = useQuery({ queryKey: ['board-regs', studentId], queryFn: () => fetchBoardRegistrations(token, studentId) });
  const regs = regData?.registrations ?? [];
  const invRegs = () => qc.invalidateQueries({ queryKey: ['board-regs', studentId] });
  const [r, setR] = useState({ exam_year: String(new Date().getFullYear()), registration_no: '', board_subjects: '', notes: '' });
  const addReg = useMutation({
    mutationFn: () => saveBoardRegistration(token, { student_id: studentId, ...r, loc_status: 'Pending', admit_card_status: 'Not issued' }),
    onSuccess: () => { invRegs(); setR((s) => ({ ...s, registration_no: '', board_subjects: '', notes: '' })); },
  });
  const patchReg = useMutation({ mutationFn: ({ reg, patch }: { reg: BoardRegistration; patch: Partial<BoardRegistration> }) => saveBoardRegistration(token, { ...reg, ...patch } as never, reg.id), onSuccess: invRegs });
  const delReg = useMutation({ mutationFn: (id: number) => deleteBoardRegistration(token, id), onSuccess: invRegs });

  return (
    <Stack gap="xl">
      {/* ── CBSE board-exam registration ── */}
      <div>
        <Divider label="Board-exam registration (CBSE)" labelPosition="left" mb="sm" />
        <Stack gap="sm">
          {regs.map((reg) => (
            <Card key={reg.id} withBorder padding="sm">
              <Group justify="space-between" wrap="nowrap" align="flex-start">
                <div style={{ flex: 1 }}>
                  <Group gap="xs"><Text fw={600}>{reg.exam_year}</Text>{reg.registration_no && <Badge variant="outline" size="sm">Reg {reg.registration_no}</Badge>}</Group>
                  {reg.board_subjects && <Text size="xs" c="dimmed" mt={2}>{reg.board_subjects}</Text>}
                </div>
                <Group gap="xs" wrap="nowrap">
                  <Select size="xs" w={130} label="LOC status" data={LOC} value={reg.loc_status ?? 'Pending'} onChange={(v) => v && patchReg.mutate({ reg, patch: { loc_status: v } })} allowDeselect={false} />
                  <Select size="xs" w={130} label="Admit card" data={ADMIT} value={reg.admit_card_status ?? 'Not issued'} onChange={(v) => v && patchReg.mutate({ reg, patch: { admit_card_status: v } })} allowDeselect={false} />
                  <ActionIcon mt={22} variant="subtle" color="red" onClick={() => delReg.mutate(reg.id)} title="Delete"><Trash2 size={15} /></ActionIcon>
                </Group>
              </Group>
              <Group gap="xs" mt="xs">
                <Badge size="sm" color={STATUS_COLOR[reg.loc_status ?? 'Pending']} variant="light">LOC: {reg.loc_status ?? 'Pending'}</Badge>
                <Badge size="sm" color={STATUS_COLOR[reg.admit_card_status ?? 'Not issued']} variant="light">Admit card: {reg.admit_card_status ?? 'Not issued'}</Badge>
              </Group>
            </Card>
          ))}
          <Group align="flex-end" gap="sm" wrap="wrap">
            <TextInput label="Exam year" w={100} value={r.exam_year} onChange={(e) => setR({ ...r, exam_year: e.currentTarget.value })} />
            <TextInput label="Registration no." w={150} value={r.registration_no} onChange={(e) => setR({ ...r, registration_no: e.currentTarget.value })} />
            <TextInput label="Board subjects" placeholder="Eng, Maths, Sci, SST, Hindi" style={{ flex: 1, minWidth: 180 }} value={r.board_subjects} onChange={(e) => setR({ ...r, board_subjects: e.currentTarget.value })} />
            <Button leftSection={<Plus size={15} />} loading={addReg.isPending} onClick={() => addReg.mutate()} data-testid="board-reg-add">Add registration</Button>
          </Group>
        </Stack>
      </div>

      {/* ── Assessment marks ── */}
      <div>
        <Divider label="Assessment scores" labelPosition="left" mb="sm" />
        <Group align="flex-end" gap="sm" wrap="wrap" mb="sm">
          <Select label="Term" w={150} data={TERMS} value={m.term} onChange={(v) => setM({ ...m, term: v ?? 'Mid Term' })} allowDeselect={false} />
          <TextInput label="Subject" w={150} value={m.subject} onChange={(e) => setM({ ...m, subject: e.currentTarget.value })} data-testid="mark-subject" />
          <NumberInput label="Marks" w={90} value={m.marks} onChange={(v) => setM({ ...m, marks: typeof v === 'number' ? v : undefined })} min={0} />
          <NumberInput label="Out of" w={90} value={m.max_marks} onChange={(v) => setM({ ...m, max_marks: typeof v === 'number' ? v : 100 })} min={1} />
          <TextInput label="Grade" w={80} value={m.grade} onChange={(e) => setM({ ...m, grade: e.currentTarget.value })} />
          <Button leftSection={<Plus size={15} />} loading={addMark.isPending} disabled={!m.subject.trim()} onClick={() => addMark.mutate()} data-testid="mark-add">Add score</Button>
        </Group>
        {marks.length > 0 ? (
          <Table withTableBorder striped data-testid="marks-table">
            <Table.Thead><Table.Tr><Table.Th>Term</Table.Th><Table.Th>Subject</Table.Th><Table.Th>Score</Table.Th><Table.Th>%</Table.Th><Table.Th>Grade</Table.Th><Table.Th /></Table.Tr></Table.Thead>
            <Table.Tbody>
              {marks.map((row) => {
                const p = pct(row.marks, row.max_marks);
                return (
                  <Table.Tr key={row.id}>
                    <Table.Td><Text size="sm">{row.term}</Text></Table.Td>
                    <Table.Td><Text size="sm" fw={500}>{row.subject}</Text></Table.Td>
                    <Table.Td><Text size="sm">{row.marks ?? '—'} / {row.max_marks ?? '—'}</Text></Table.Td>
                    <Table.Td>{p != null && <Badge size="sm" variant="light" color={p >= 33 ? 'mint' : 'red'}>{p}%</Badge>}</Table.Td>
                    <Table.Td>{row.grade && <Badge size="sm" variant="outline">{row.grade}</Badge>}</Table.Td>
                    <Table.Td><ActionIcon size="sm" variant="subtle" color="red" onClick={() => delMark.mutate(row.id)}><Trash2 size={14} /></ActionIcon></Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        ) : <Text c="dimmed" ta="center" py="md">No scores recorded yet.</Text>}
      </div>
    </Stack>
  );
}
