import { useMemo, useRef, useState } from 'react';
import {
  ActionIcon, Badge, Button, Container, Group, Modal, Paper, Select, SimpleGrid,
  Stack, Table, Text, TextInput, Textarea, Title, Tooltip,
} from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Download, FileWarning, Pencil, Plus, ShieldCheck, Trash2, Upload } from 'lucide-react';
import { useAuth } from '../stores/auth';
import {
  deleteComplianceCert, fetchComplianceCertDoc, fetchComplianceCerts, fetchStaff,
  saveComplianceCert, type ComplianceCert, type ComplianceCertInput,
} from '../api/client';

const SCHOOL_TYPES = ['Fire Safety', 'Building Safety / Stability', 'Sanitation', 'Water Testing', 'CCTV Audit', 'Transport Fitness', 'Pollution NOC', 'Land / Lease', 'Affiliation', 'Society Registration', 'Other'];
const STAFF_TYPES = ['Appointment Letter', 'Qualification', 'Experience Certificate', 'Training', 'CBSE Workshop', 'Police Verification', 'Medical Fitness', 'Other'];
const MAX_BYTES = 3 * 1024 * 1024;

const STATUS: Record<string, { color: string }> = { Valid: { color: 'mint' }, Expiring: { color: 'yellow' }, Expired: { color: 'red' }, 'No expiry': { color: 'gray' } };

const readAsDataUrl = (file: File) => new Promise<string>((res, rej) => {
  const r = new FileReader();
  r.onerror = () => rej(new Error('read failed'));
  r.onload = () => res(r.result as string);
  r.readAsDataURL(file);
});

const blank = (): ComplianceCertInput => ({ scope: 'school', cert_type: 'Fire Safety', authority: '', reference_no: '', issue_date: '', expiry_date: '', notes: '' });

export function ComplianceCertsScreen() {
  const token = useAuth((s) => s.token)!;
  const qc = useQueryClient();
  const [scopeFilter, setScopeFilter] = useState<string | null>(null);
  const { data } = useQuery({ queryKey: ['compliance-certs'], queryFn: () => fetchComplianceCerts(token) });
  const { data: staffData } = useQuery({ queryKey: ['staff', 'all'], queryFn: () => fetchStaff(token, { limit: 500 }) });
  const certs = data?.certificates ?? [];
  const shown = scopeFilter ? certs.filter((c) => c.scope === scopeFilter) : certs;
  const inv = () => qc.invalidateQueries({ queryKey: ['compliance-certs'] });

  const [editing, setEditing] = useState<ComplianceCert | null>(null);
  const [form, setForm] = useState<ComplianceCertInput | null>(null);
  const [doc, setDoc] = useState<string | undefined>(undefined);
  const [docName, setDocName] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const staffOptions = useMemo(
    () => (staffData?.staff ?? []).map((s) => ({ value: String(s.id), label: `${s.first_name ?? ''} ${s.last_name ?? ''}`.trim() || `Staff ${s.id}` })),
    [staffData],
  );

  const openNew = () => { setEditing(null); setForm(blank()); setDoc(undefined); setDocName(''); setErr(null); };
  const openEdit = (c: ComplianceCert) => {
    setEditing(c);
    setForm({ scope: c.scope ?? 'school', staff_id: c.staff_id, cert_type: c.cert_type ?? '', authority: c.authority ?? '', reference_no: c.reference_no ?? '', issue_date: c.issue_date ?? '', expiry_date: c.expiry_date ?? '', notes: c.notes ?? '' });
    setDoc(undefined); setDocName(''); setErr(null);
  };
  const close = () => setForm(null);

  const save = useMutation({
    mutationFn: () => saveComplianceCert(token, { ...form!, document: doc }, editing?.id),
    onSuccess: () => { inv(); close(); },
  });
  const del = useMutation({ mutationFn: (id: number) => deleteComplianceCert(token, id), onSuccess: inv });

  const pickFile = (file?: File) => {
    setErr(null);
    if (!file) return;
    if (file.size > MAX_BYTES) { setErr(`"${file.name}" exceeds 3 MB.`); return; }
    readAsDataUrl(file).then((d) => { setDoc(d); setDocName(file.name); });
  };
  const download = async (id: number, type: string) => {
    const c = await fetchComplianceCertDoc(token, id);
    if (!c?.document) return;
    const a = document.createElement('a');
    a.href = c.document; a.download = `${type || 'certificate'}.${(c.document.split(';')[0].split('/')[1] || 'pdf')}`; a.click();
  };

  const typeOptions = form?.scope === 'staff' ? STAFF_TYPES : SCHOOL_TYPES;

  return (
    <Container size="xl" px={0}>
      <Stack gap="lg">
        <Group justify="space-between">
          <Group gap="sm"><ShieldCheck size={20} color="var(--mantine-color-brand-6)" /><Title order={2}>Compliance &amp; Safety</Title></Group>
          <Button leftSection={<Plus size={16} />} onClick={openNew} data-testid="cert-new">Add certificate</Button>
        </Group>

        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
          <StatCard label="Tracked certificates" value={data?.total ?? 0} color="brand" icon={<ShieldCheck size={18} />} />
          <StatCard label="Expiring ≤ 30 days" value={data?.expiring ?? 0} color="yellow" icon={<AlertTriangle size={18} />} />
          <StatCard label="Expired — penalty risk" value={data?.expired ?? 0} color="red" icon={<FileWarning size={18} />} />
        </SimpleGrid>

        <Group>
          <Select w={200} placeholder="All scopes" clearable data={[{ value: 'school', label: 'School / Safety' }, { value: 'staff', label: 'Staff' }]} value={scopeFilter} onChange={setScopeFilter} />
        </Group>

        {shown.length > 0 ? (
          <Table withTableBorder striped highlightOnHover data-testid="cert-table">
            <Table.Thead><Table.Tr><Table.Th>Certificate</Table.Th><Table.Th>For</Table.Th><Table.Th>Authority</Table.Th><Table.Th>Issued</Table.Th><Table.Th>Expires</Table.Th><Table.Th>Status</Table.Th><Table.Th /></Table.Tr></Table.Thead>
            <Table.Tbody>
              {shown.map((c) => (
                <Table.Tr key={c.id}>
                  <Table.Td><Text size="sm" fw={500}>{c.cert_type}</Text>{c.reference_no && <Text size="xs" c="dimmed">Ref {c.reference_no}</Text>}</Table.Td>
                  <Table.Td><Badge size="xs" variant="light" color={c.scope === 'staff' ? 'grape' : 'sky'}>{c.scope === 'staff' ? (c.staff_name ?? 'Staff') : 'School'}</Badge></Table.Td>
                  <Table.Td><Text size="sm">{c.authority || '—'}</Text></Table.Td>
                  <Table.Td><Text size="xs">{c.issue_date || '—'}</Text></Table.Td>
                  <Table.Td><Text size="xs">{c.expiry_date || '—'}</Text></Table.Td>
                  <Table.Td>
                    <Tooltip label={c.days_left == null ? 'No expiry tracked' : c.days_left < 0 ? `${-c.days_left} days overdue` : `${c.days_left} days left`} withArrow>
                      <Badge color={STATUS[c.status]?.color ?? 'gray'} variant={c.status === 'Expired' ? 'filled' : 'light'}>{c.status}</Badge>
                    </Tooltip>
                  </Table.Td>
                  <Table.Td>
                    <Group gap={4} wrap="nowrap">
                      {c.has_document && <ActionIcon size="sm" variant="subtle" onClick={() => download(c.id, c.cert_type ?? '')} title="Download"><Download size={14} /></ActionIcon>}
                      <ActionIcon size="sm" variant="subtle" onClick={() => openEdit(c)} title="Edit"><Pencil size={14} /></ActionIcon>
                      <ActionIcon size="sm" variant="subtle" color="red" onClick={() => del.mutate(c.id)} title="Delete"><Trash2 size={14} /></ActionIcon>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        ) : <Text c="dimmed" ta="center" py="xl">No certificates tracked yet. Add fire-safety, building, water-testing, transport-fitness and staff certificates to get expiry reminders.</Text>}
      </Stack>

      <Modal opened={form !== null} onClose={close} title={editing ? 'Edit certificate' : 'Add compliance certificate'} centered size="lg">
        {form && (
          <Stack gap="sm">
            <SimpleGrid cols={2} spacing="sm">
              <Select label="Scope" data={[{ value: 'school', label: 'School / Safety' }, { value: 'staff', label: 'Staff' }]} value={form.scope} onChange={(v) => setForm({ ...form, scope: v ?? 'school', cert_type: (v === 'staff' ? STAFF_TYPES : SCHOOL_TYPES)[0] })} allowDeselect={false} />
              <Select label="Certificate type" data={typeOptions} value={form.cert_type} onChange={(v) => setForm({ ...form, cert_type: v ?? '' })} searchable />
            </SimpleGrid>
            {form.scope === 'staff' && (
              <Select label="Staff member" placeholder="Pick staff" data={staffOptions} value={form.staff_id ? String(form.staff_id) : null} onChange={(v) => setForm({ ...form, staff_id: v ? Number(v) : null })} searchable />
            )}
            <SimpleGrid cols={2} spacing="sm">
              <TextInput label="Issuing authority" value={form.authority} onChange={(e) => setForm({ ...form, authority: e.currentTarget.value })} />
              <TextInput label="Reference no." value={form.reference_no} onChange={(e) => setForm({ ...form, reference_no: e.currentTarget.value })} />
              <TextInput label="Issue date" type="date" value={form.issue_date} onChange={(e) => setForm({ ...form, issue_date: e.currentTarget.value })} />
              <TextInput label="Expiry date" type="date" value={form.expiry_date} onChange={(e) => setForm({ ...form, expiry_date: e.currentTarget.value })} data-testid="cert-expiry" />
            </SimpleGrid>
            <Textarea label="Notes" autosize minRows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.currentTarget.value })} />
            <Group gap="sm" align="center">
              <Button variant="light" size="xs" leftSection={<Upload size={14} />} onClick={() => fileRef.current?.click()}>Attach scan</Button>
              <Text size="xs" c="dimmed">{docName || (editing?.has_document ? 'Existing document kept' : 'PDF / image, under 3 MB')}</Text>
            </Group>
            {err && <Text size="xs" c="red">{err}</Text>}
            <Group justify="flex-end" mt="sm">
              <Button variant="subtle" onClick={close}>Cancel</Button>
              <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!form.cert_type || (form.scope === 'staff' && !form.staff_id)} data-testid="cert-save">{editing ? 'Save' : 'Add'}</Button>
            </Group>
          </Stack>
        )}
      </Modal>
      <input ref={fileRef} type="file" accept="application/pdf,image/*" style={{ display: 'none' }} onChange={(e) => { pickFile(e.currentTarget.files?.[0]); e.currentTarget.value = ''; }} />
    </Container>
  );
}

function StatCard({ label, value, color, icon }: { label: string; value: number; color: string; icon: React.ReactNode }) {
  return (
    <Paper withBorder p="md" radius="md">
      <Group justify="space-between">
        <div><Text size="xs" c="dimmed" tt="uppercase" fw={600}>{label}</Text><Text fw={700} size="28px" c={value > 0 && color !== 'brand' ? color : undefined}>{value}</Text></div>
        <ActionIcon variant="light" color={color} size="lg" radius="md">{icon}</ActionIcon>
      </Group>
    </Paper>
  );
}
