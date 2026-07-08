import { useMemo, useRef, useState } from 'react';
import {
  ActionIcon, Alert, Badge, Button, Container, Group, Modal, Paper, Select, SimpleGrid,
  Stack, Table, Text, TextInput, Textarea, Title, Tooltip,
} from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, Download, Info, Plus, Trash2, Upload, Trash } from 'lucide-react';
import { useAuth } from '../stores/auth';
import {
  addExamArchive, deleteExamArchive, disposeExamArchive, fetchExamArchiveDoc, fetchExamArchives,
  type ExamArchiveInput,
} from '../api/client';
import { MAX_UPLOAD_BYTES, readAsDataUrl } from '../lib/fileData';

const MATERIAL_TYPES = ['Question Paper', 'Answer Scripts', 'Internal Assessment', 'Practical Record', 'Award List', 'Other'];
const STATUS: Record<string, { color: string }> = { Retained: { color: 'mint' }, 'Due for disposal': { color: 'orange' }, Disposed: { color: 'gray' } };

// CBSE: retain till September of the next academic year. Derive a sensible default.
function defaultRetention(ay: string): string {
  const m = ay.match(/(\d{4})/);
  const start = m ? parseInt(m[1], 10) : new Date().getFullYear();
  return `${start + 1}-09-30`;
}

export function ExamArchiveScreen() {
  const token = useAuth((s) => s.token)!;
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['exam-archives'], queryFn: () => fetchExamArchives(token) });
  const archives = data?.archives ?? [];
  const inv = () => qc.invalidateQueries({ queryKey: ['exam-archives'] });

  const years = useMemo(() => Array.from(new Set(archives.map((a) => a.academic_year).filter(Boolean))) as string[], [archives]);
  const [yearFilter, setYearFilter] = useState<string | null>(null);
  const shown = yearFilter ? archives.filter((a) => a.academic_year === yearFilter) : archives;

  const [form, setForm] = useState<ExamArchiveInput | null>(null);
  const [doc, setDoc] = useState<string | undefined>();
  const [docName, setDocName] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const openNew = () => {
    const ay = `${new Date().getFullYear()}-${(new Date().getFullYear() + 1).toString().slice(2)}`;
    setForm({ academic_year: ay, exam_name: '', material_type: 'Answer Scripts', subject: '', class_name: '', retention_until: defaultRetention(ay), notes: '' });
    setDoc(undefined); setDocName(''); setErr(null);
  };
  const close = () => setForm(null);

  const save = useMutation({ mutationFn: () => addExamArchive(token, { ...form!, document: doc }), onSuccess: () => { inv(); close(); } });
  const dispose = useMutation({ mutationFn: (id: number) => disposeExamArchive(token, id), onSuccess: inv });
  const del = useMutation({ mutationFn: (id: number) => deleteExamArchive(token, id), onSuccess: inv });

  const pickFile = (file?: File) => {
    setErr(null);
    if (!file) return;
    if (file.size > MAX_UPLOAD_BYTES) { setErr(`"${file.name}" exceeds 3 MB.`); return; }
    readAsDataUrl(file).then((d) => { setDoc(d); setDocName(file.name); });
  };
  const download = async (id: number, name: string) => {
    const a = await fetchExamArchiveDoc(token, id);
    if (!a?.document) return;
    const el = document.createElement('a'); el.href = a.document; el.download = `${name || 'archive'}.${a.document.split(';')[0].split('/')[1] || 'pdf'}`; el.click();
  };

  return (
    <Container size="xl" px={0}>
      <Stack gap="lg">
        <Group justify="space-between">
          <Group gap="sm"><Archive size={20} color="var(--mantine-color-brand-6)" /><Title order={2}>Exam Archive &amp; Retention</Title></Group>
          <Button leftSection={<Plus size={16} />} onClick={openNew} data-testid="archive-new">Archive material</Button>
        </Group>

        <Alert color="sky" variant="light" icon={<Info size={16} />}>
          CBSE requires exam material (question papers, answer scripts, internal assessment) to be preserved <b>until September of the next academic year</b>. Items past their retention date are flagged for safe disposal here.
        </Alert>

        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
          <Paper withBorder p="md" radius="md"><Text size="xs" c="dimmed" tt="uppercase" fw={600}>Archived items</Text><Text fw={700} size="28px">{data?.total ?? 0}</Text></Paper>
          <Paper withBorder p="md" radius="md"><Text size="xs" c="dimmed" tt="uppercase" fw={600}>Due for disposal</Text><Text fw={700} size="28px" c={data?.due ? 'orange' : undefined}>{data?.due ?? 0}</Text></Paper>
        </SimpleGrid>

        {years.length > 0 && <Group><Select w={160} placeholder="All years" clearable data={years} value={yearFilter} onChange={setYearFilter} /></Group>}

        {shown.length > 0 ? (
          <Table withTableBorder striped highlightOnHover data-testid="archive-table">
            <Table.Thead><Table.Tr><Table.Th>Material</Table.Th><Table.Th>Year</Table.Th><Table.Th>Subject / Class</Table.Th><Table.Th>Retain until</Table.Th><Table.Th>Status</Table.Th><Table.Th /></Table.Tr></Table.Thead>
            <Table.Tbody>
              {shown.map((a) => (
                <Table.Tr key={a.id}>
                  <Table.Td><Text size="sm" fw={500}>{a.exam_name}</Text><Badge size="xs" variant="light" color="grape">{a.material_type}</Badge></Table.Td>
                  <Table.Td><Text size="xs">{a.academic_year}</Text></Table.Td>
                  <Table.Td><Text size="xs" c="dimmed">{[a.subject, a.class_name].filter(Boolean).join(' · ') || '—'}</Text></Table.Td>
                  <Table.Td><Text size="xs">{a.retention_until || '—'}</Text></Table.Td>
                  <Table.Td>
                    <Tooltip label={a.disposed ? `Disposed ${a.disposed_at?.slice(0, 10) ?? ''}` : a.days_left == null ? 'No retention date' : a.days_left < 0 ? `${-a.days_left} days past retention` : `${a.days_left} days remaining`} withArrow>
                      <Badge color={STATUS[a.status]?.color ?? 'gray'} variant={a.status === 'Due for disposal' ? 'filled' : 'light'}>{a.status}</Badge>
                    </Tooltip>
                  </Table.Td>
                  <Table.Td>
                    <Group gap={4} wrap="nowrap">
                      {a.has_document && <ActionIcon size="sm" variant="subtle" onClick={() => download(a.id, a.exam_name ?? '')} title="Download"><Download size={14} /></ActionIcon>}
                      {!a.disposed && a.status === 'Due for disposal' && (
                        <Tooltip label="Mark disposed (audited)" withArrow><ActionIcon size="sm" variant="subtle" color="orange" onClick={() => dispose.mutate(a.id)} title="Dispose"><Trash size={14} /></ActionIcon></Tooltip>
                      )}
                      <ActionIcon size="sm" variant="subtle" color="red" onClick={() => del.mutate(a.id)} title="Delete record"><Trash2 size={14} /></ActionIcon>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        ) : <Text c="dimmed" ta="center" py="xl">No exam material archived yet.</Text>}
      </Stack>

      <Modal opened={form !== null} onClose={close} title="Archive exam material" centered size="lg">
        {form && (
          <Stack gap="sm">
            <SimpleGrid cols={2} spacing="sm">
              <TextInput label="Academic year" value={form.academic_year} onChange={(e) => setForm({ ...form, academic_year: e.currentTarget.value, retention_until: defaultRetention(e.currentTarget.value) })} />
              <Select label="Material type" data={MATERIAL_TYPES} value={form.material_type} onChange={(v) => setForm({ ...form, material_type: v ?? '' })} />
              <TextInput label="Exam name" placeholder="e.g. Mid Term 2026" value={form.exam_name} onChange={(e) => setForm({ ...form, exam_name: e.currentTarget.value })} data-testid="archive-exam-name" />
              <TextInput label="Subject" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.currentTarget.value })} />
              <TextInput label="Class" value={form.class_name} onChange={(e) => setForm({ ...form, class_name: e.currentTarget.value })} />
              <TextInput label="Retain until" type="date" value={form.retention_until} onChange={(e) => setForm({ ...form, retention_until: e.currentTarget.value })} data-testid="archive-retention" />
            </SimpleGrid>
            <Textarea label="Notes" autosize minRows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.currentTarget.value })} />
            <Group gap="sm" align="center">
              <Button variant="light" size="xs" leftSection={<Upload size={14} />} onClick={() => fileRef.current?.click()}>Attach scan</Button>
              <Text size="xs" c="dimmed">{docName || 'Optional PDF / image, under 3 MB'}</Text>
            </Group>
            {err && <Text size="xs" c="red">{err}</Text>}
            <Group justify="flex-end" mt="sm">
              <Button variant="subtle" onClick={close}>Cancel</Button>
              <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!form.exam_name.trim()} data-testid="archive-save">Archive</Button>
            </Group>
          </Stack>
        )}
      </Modal>
      <input ref={fileRef} type="file" accept="application/pdf,image/*" style={{ display: 'none' }} onChange={(e) => { pickFile(e.currentTarget.files?.[0]); e.currentTarget.value = ''; }} />
    </Container>
  );
}
