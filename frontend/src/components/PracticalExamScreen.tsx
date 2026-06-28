import { useRef, useState } from 'react';
import {
  ActionIcon, Alert, Badge, Button, Container, Group, Image, Modal, NumberInput, Paper, SimpleGrid,
  Stack, Table, Text, TextInput, Title,
} from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FlaskConical, Lock, MapPin, Plus, Trash2, Upload } from 'lucide-react';
import { useAuth } from '../stores/auth';
import {
  addPracticalExam, addPracticalMark, deletePracticalExam, deletePracticalMark, fetchPracticalExam,
  fetchPracticalExams, lockPracticalExam, type PracticalExamInput,
} from '../api/client';

const MAX_BYTES = 3 * 1024 * 1024;
const STATUS: Record<string, string> = { Scheduled: 'sky', 'Marks uploaded': 'yellow', Locked: 'mint' };
const readAsDataUrl = (file: File) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onerror = () => rej(new Error('x')); r.onload = () => res(r.result as string); r.readAsDataURL(file); });
const blank = (): PracticalExamInput => ({ subject: '', class_name: '', exam_date: new Date().toISOString().slice(0, 10), batch: '', internal_examiner: '', external_examiner: '', lab: '', max_marks: 30, geo: '' });

export function PracticalExamScreen() {
  const token = useAuth((s) => s.token)!;
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['practical-exams'], queryFn: () => fetchPracticalExams(token) });
  const exams = data?.exams ?? [];
  const inv = () => qc.invalidateQueries({ queryKey: ['practical-exams'] });

  const [form, setForm] = useState<PracticalExamInput | null>(null);
  const [evidence, setEvidence] = useState<string | undefined>();
  const [evName, setEvName] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const [openId, setOpenId] = useState<number | null>(null);

  const save = useMutation({ mutationFn: () => addPracticalExam(token, { ...form!, evidence }), onSuccess: () => { inv(); setForm(null); setEvidence(undefined); setEvName(''); } });
  const del = useMutation({ mutationFn: (id: number) => deletePracticalExam(token, id), onSuccess: inv });

  return (
    <Container size="xl" px={0}>
      <Stack gap="lg">
        <Group justify="space-between">
          <Group gap="sm"><FlaskConical size={20} color="var(--mantine-color-brand-6)" /><Title order={2}>Practical Examinations</Title></Group>
          <Button leftSection={<Plus size={16} />} onClick={() => { setForm(blank()); setEvidence(undefined); setEvName(''); }} data-testid="practical-new">Schedule practical</Button>
        </Group>

        <Alert color="sky" variant="light" icon={<FlaskConical size={16} />}>
          SOP: schedule → assign internal &amp; external examiner → capture geo-tagged evidence → upload marks the same day → <b>lock</b>. Once locked, marks cannot be changed.
        </Alert>

        {exams.length > 0 ? (
          <Table withTableBorder striped highlightOnHover data-testid="practical-table">
            <Table.Thead><Table.Tr><Table.Th>Subject / Batch</Table.Th><Table.Th>Date</Table.Th><Table.Th>Examiners</Table.Th><Table.Th>Lab</Table.Th><Table.Th>Marks</Table.Th><Table.Th>Status</Table.Th><Table.Th /></Table.Tr></Table.Thead>
            <Table.Tbody>
              {exams.map((e) => (
                <Table.Tr key={e.id} style={{ cursor: 'pointer' }} onClick={() => setOpenId(e.id)}>
                  <Table.Td><Text size="sm" fw={500}>{e.subject}</Text><Text size="xs" c="dimmed">{[e.class_name, e.batch].filter(Boolean).join(' · ')}</Text></Table.Td>
                  <Table.Td><Text size="xs">{e.exam_date}</Text></Table.Td>
                  <Table.Td><Text size="xs">Int: {e.internal_examiner || '—'}</Text><Text size="xs" c="dimmed">Ext: {e.external_examiner || '—'}</Text></Table.Td>
                  <Table.Td><Text size="xs">{e.lab || '—'}</Text>{e.has_evidence && <Badge size="xs" variant="light" color="grape" ml={4}>evidence</Badge>}</Table.Td>
                  <Table.Td><Text size="sm">{e.marks_count}</Text></Table.Td>
                  <Table.Td><Badge color={STATUS[e.status]} variant={e.status === 'Locked' ? 'filled' : 'light'} leftSection={e.status === 'Locked' ? <Lock size={10} /> : undefined}>{e.status}</Badge></Table.Td>
                  <Table.Td onClick={(ev) => ev.stopPropagation()}><ActionIcon size="sm" variant="subtle" color="red" disabled={e.marks_locked} onClick={() => del.mutate(e.id)}><Trash2 size={14} /></ActionIcon></Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        ) : <Text c="dimmed" ta="center" py="xl">No practical exams scheduled yet.</Text>}
      </Stack>

      {/* Schedule modal */}
      <Modal opened={form !== null} onClose={() => setForm(null)} title="Schedule practical exam" centered size="lg">
        {form && (
          <Stack gap="sm">
            <SimpleGrid cols={2} spacing="sm">
              <TextInput label="Subject" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.currentTarget.value })} data-testid="practical-subject" />
              <TextInput label="Class" value={form.class_name} onChange={(e) => setForm({ ...form, class_name: e.currentTarget.value })} />
              <TextInput label="Exam date" type="date" value={form.exam_date} onChange={(e) => setForm({ ...form, exam_date: e.currentTarget.value })} />
              <TextInput label="Batch" placeholder="e.g. Batch A" value={form.batch} onChange={(e) => setForm({ ...form, batch: e.currentTarget.value })} />
              <TextInput label="Internal examiner" value={form.internal_examiner} onChange={(e) => setForm({ ...form, internal_examiner: e.currentTarget.value })} />
              <TextInput label="External examiner" value={form.external_examiner} onChange={(e) => setForm({ ...form, external_examiner: e.currentTarget.value })} />
              <TextInput label="Lab" value={form.lab} onChange={(e) => setForm({ ...form, lab: e.currentTarget.value })} />
              <NumberInput label="Max marks" value={form.max_marks} onChange={(v) => setForm({ ...form, max_marks: typeof v === 'number' ? v : undefined })} min={0} />
            </SimpleGrid>
            <TextInput label="Geo-tag (lat, long)" placeholder="12.9716, 77.5946" leftSection={<MapPin size={14} />} value={form.geo} onChange={(e) => setForm({ ...form, geo: e.currentTarget.value })} />
            <Group gap="sm" align="center">
              <Button variant="light" size="xs" leftSection={<Upload size={14} />} onClick={() => fileRef.current?.click()}>Attach evidence photo</Button>
              <Text size="xs" c="dimmed">{evName || 'Geo-tagged photo, under 3 MB'}</Text>
            </Group>
            <Group justify="flex-end" mt="sm">
              <Button variant="subtle" onClick={() => setForm(null)}>Cancel</Button>
              <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!form.subject.trim()} data-testid="practical-save">Schedule</Button>
            </Group>
          </Stack>
        )}
      </Modal>
      <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { const f = e.currentTarget.files?.[0]; if (f && f.size <= MAX_BYTES) readAsDataUrl(f).then((d) => { setEvidence(d); setEvName(f.name); }); e.currentTarget.value = ''; }} />

      {openId !== null && <PracticalDetail examId={openId} onClose={() => setOpenId(null)} />}
    </Container>
  );
}

function PracticalDetail({ examId, onClose }: { examId: number; onClose: () => void }) {
  const token = useAuth((s) => s.token)!;
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['practical-exam', examId], queryFn: () => fetchPracticalExam(token, examId) });
  const exam = data?.exam;
  const marks = data?.marks ?? [];
  const locked = !!exam?.marks_locked;
  const inv = () => { qc.invalidateQueries({ queryKey: ['practical-exam', examId] }); qc.invalidateQueries({ queryKey: ['practical-exams'] }); };

  const [name, setName] = useState('');
  const [mk, setMk] = useState<number | undefined>(undefined);
  const add = useMutation({ mutationFn: () => addPracticalMark(token, examId, { student_name: name, marks: mk }), onSuccess: () => { inv(); setName(''); setMk(undefined); } });
  const delMark = useMutation({ mutationFn: (mid: number) => deletePracticalMark(token, examId, mid), onSuccess: inv });
  const lock = useMutation({ mutationFn: () => lockPracticalExam(token, examId), onSuccess: inv });

  return (
    <Modal opened onClose={onClose} title={exam ? `${exam.subject} — practical` : 'Practical'} centered size="lg">
      {exam && (
        <Stack gap="md">
          <SimpleGrid cols={2} spacing="xs">
            <Text size="sm"><b>Date:</b> {exam.exam_date || '—'}</Text>
            <Text size="sm"><b>Lab:</b> {exam.lab || '—'}</Text>
            <Text size="sm"><b>Internal:</b> {exam.internal_examiner || '—'}</Text>
            <Text size="sm"><b>External:</b> {exam.external_examiner || '—'}</Text>
            {exam.geo && <Text size="sm"><b>Geo:</b> {exam.geo}</Text>}
            <Text size="sm"><b>Max marks:</b> {exam.max_marks ?? '—'}</Text>
          </SimpleGrid>
          {exam.evidence && <Image src={exam.evidence} alt="evidence" radius="sm" h={140} w="auto" fit="contain" />}

          {locked ? (
            <Alert color="mint" variant="light" icon={<Lock size={16} />}>Marks locked on {exam.locked_at?.slice(0, 16).replace('T', ' ')}. They can no longer be changed.</Alert>
          ) : (
            <Paper withBorder p="sm" radius="md">
              <Group align="flex-end" gap="sm">
                <TextInput label="Student" value={name} onChange={(e) => setName(e.currentTarget.value)} style={{ flex: 1 }} data-testid="practical-mark-name" />
                <NumberInput label="Marks" w={100} value={mk} onChange={(v) => setMk(typeof v === 'number' ? v : undefined)} min={0} max={exam.max_marks ?? undefined} />
                <Button onClick={() => add.mutate()} loading={add.isPending} disabled={!name.trim()} data-testid="practical-mark-add">Add</Button>
              </Group>
            </Paper>
          )}

          {marks.length > 0 ? (
            <Table withTableBorder striped>
              <Table.Thead><Table.Tr><Table.Th>Student</Table.Th><Table.Th>Marks</Table.Th><Table.Th /></Table.Tr></Table.Thead>
              <Table.Tbody>{marks.map((m) => (
                <Table.Tr key={m.id}><Table.Td><Text size="sm">{m.student_name}</Text></Table.Td><Table.Td>{m.marks ?? '—'}{exam.max_marks ? ` / ${exam.max_marks}` : ''}</Table.Td>
                  <Table.Td>{!locked && <ActionIcon size="sm" variant="subtle" color="red" onClick={() => delMark.mutate(m.id)}><Trash2 size={13} /></ActionIcon>}</Table.Td></Table.Tr>
              ))}</Table.Tbody>
            </Table>
          ) : <Text size="sm" c="dimmed" ta="center" py="sm">No marks uploaded yet.</Text>}

          {!locked && (
            <Group justify="flex-end">
              <Button color="orange" leftSection={<Lock size={15} />} loading={lock.isPending} disabled={marks.length === 0} onClick={() => lock.mutate()} data-testid="practical-lock">
                Lock marks (final)
              </Button>
            </Group>
          )}
        </Stack>
      )}
    </Modal>
  );
}
