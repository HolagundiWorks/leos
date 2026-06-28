import { useState, type ReactNode } from 'react';
import {
  Alert,
  Button,
  Checkbox,
  Divider,
  Group,
  Modal,
  Select,
  SimpleGrid,
  Stack,
  Tabs,
  Text,
  TextInput,
  Textarea,
} from '@mantine/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { BadgeCheck, GraduationCap, HeartPulse, Lock, Users } from 'lucide-react';
import type { StudentDetail, StudentFormData } from '../api/client';
import { ApiError, createStudent, updateStudent } from '../api/client';
import { useAuth } from '../stores/auth';
import { ImageUpload } from './ImageUpload';

interface Props {
  onClose: () => void;
  initial?: StudentDetail | null;
}

type FormState = Record<string, string | boolean | null | undefined>;

const GENDERS = ['Male', 'Female', 'Other'];
const CATEGORIES = ['General', 'OBC', 'SC', 'ST', 'EWS'];
const RELATIONS = ['Father', 'Mother', 'Guardian', 'Grandparent', 'Sibling', 'Other'];
const BOARDS = ['CBSE', 'ICSE', 'State Board', 'IGCSE', 'IB', 'Other'];
const VERIFY = ['Pending', 'Submitted', 'Verified', 'Discrepancy'];
const LIFECYCLE = ['Inquiry', 'Applied', 'Admitted', 'Active', 'On Leave', 'Suspended', 'Transfer Requested', 'Graduated', 'Alumni'];
const BLOOD = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'];

export function StudentFormModal({ onClose, initial }: Props) {
  const token = useAuth((s) => s.token)!;
  const qc = useQueryClient();
  const isEdit = !!initial;

  const [f, setF] = useState<FormState>(() =>
    initial
      ? ({ ...(initial as unknown as FormState) })
      : ({ enrolled: false, status: 'Active', nationality: 'Indian', verification_status: 'Pending' }),
  );
  const up = (k: string, v: string | boolean | null) => setF((s) => ({ ...s, [k]: v }));
  // When editing a Locked record, a CBSE-locked field edit returns 423; we then
  // reveal an override-reason field and retry with override=true.
  const [override, setOverride] = useState<string | null>(null);

  // Plain helpers (return elements, not components → no focus loss on re-render).
  const txt = (label: string, key: string, o?: { placeholder?: string; type?: string }): ReactNode => (
    <TextInput label={label} placeholder={o?.placeholder} type={o?.type} value={(f[key] as string) ?? ''} onChange={(e) => up(key, e.currentTarget.value)} data-testid={`student-${key}`} />
  );
  const sel = (label: string, key: string, data: string[], clearable = true): ReactNode => (
    <Select label={label} data={data} value={(f[key] as string) ?? null} onChange={(v) => up(key, v)} clearable={clearable} searchable allowDeselect={!clearable ? false : undefined} />
  );

  const payload = (): StudentFormData => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(f)) {
      if (k === 'id') continue;
      out[k] = v === '' ? undefined : v;
    }
    out.first_name = (f.first_name as string) ?? '';
    out.last_name = (f.last_name as string) ?? '';
    out.enrolled = !!f.enrolled;
    if (override !== null) { out.override = true; out.reason = override; }
    return out as unknown as StudentFormData;
  };

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['students'] });
    if (isEdit && initial) qc.invalidateQueries({ queryKey: ['student', initial.id] });
  };
  const create = useMutation({ mutationFn: () => createStudent(token, payload()), onSuccess: () => { invalidate(); onClose(); } });
  const update = useMutation({
    mutationFn: () => updateStudent(token, initial!.id, payload()),
    onSuccess: () => { invalidate(); onClose(); },
    onError: (e) => { if (e instanceof ApiError && e.status === 423 && override === null) setOverride(''); },
  });
  const save = () => (isEdit ? update.mutate() : create.mutate());
  const busy = create.isPending || update.isPending;
  const canSave = ((f.first_name as string) ?? '').trim() !== '' && ((f.last_name as string) ?? '').trim() !== '';

  return (
    <Modal opened onClose={onClose} title={isEdit ? `Edit — ${initial?.first_name} ${initial?.last_name}` : 'Admit New Student'} centered size="xl" styles={{ body: { maxHeight: '78vh', overflowY: 'auto' } }}>
      <Tabs defaultValue="identity">
        <Tabs.List mb="md">
          <Tabs.Tab value="identity" leftSection={<BadgeCheck size={14} />}>Identity</Tabs.Tab>
          <Tabs.Tab value="parents" leftSection={<Users size={14} />}>Parents</Tabs.Tab>
          <Tabs.Tab value="admission" leftSection={<GraduationCap size={14} />}>Admission</Tabs.Tab>
          <Tabs.Tab value="health" leftSection={<HeartPulse size={14} />}>Health</Tabs.Tab>
        </Tabs.List>

        {/* ── Identity (CBSE-mandatory) ── */}
        <Tabs.Panel value="identity">
          <Stack gap="sm">
            <Group align="flex-start" gap="lg" wrap="nowrap">
              <ImageUpload label="Photograph" guideline="Passport photo, ~300×400 px, JPEG" value={(f.photo as string) ?? null} onChange={(v) => up('photo', v)} maxDim={400} output="jpeg" height={96} />
              <div style={{ flex: 1 }}>
                <SimpleGrid cols={3} spacing="sm">
                  {txt('First name', 'first_name')}
                  {txt('Middle name', 'middle_name')}
                  {txt('Last name', 'last_name')}
                </SimpleGrid>
              </div>
            </Group>
            <SimpleGrid cols={{ base: 1, sm: 4 }} spacing="sm">
              {sel('Gender', 'gender', GENDERS)}
              {txt('Date of birth', 'birthdate', { type: 'date' })}
              {sel('Blood group', 'blood_group', BLOOD)}
              {sel('Category', 'category', CATEGORIES)}
            </SimpleGrid>
            <Divider label="Government / board IDs" labelPosition="left" />
            <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
              {txt('Admission / Roll No', 'alt_id', { placeholder: 'ADM-001' })}
              {txt('APAAR ID (Academic ID)', 'apaar_id')}
              {txt('PEN (if applicable)', 'pen')}
              {txt('Aadhaar number', 'aadhaar')}
              {txt('Nationality', 'nationality')}
              {txt('Religion', 'religion')}
              {txt('Mother tongue', 'mother_tongue')}
              {sel('CWSN status', 'cwsn', ['No', 'Yes'])}
              {txt('Email', 'email', { type: 'email' })}
              {txt('Mobile', 'phone')}
            </SimpleGrid>
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
              <Textarea label="Residential address" autosize minRows={2} value={(f.address as string) ?? ''} onChange={(e) => up('address', e.currentTarget.value)} />
              <Textarea label="Permanent address" autosize minRows={2} value={(f.permanent_address as string) ?? ''} onChange={(e) => up('permanent_address', e.currentTarget.value)} />
            </SimpleGrid>
          </Stack>
        </Tabs.Panel>

        {/* ── Parents / Guardian ── */}
        <Tabs.Panel value="parents">
          <Stack gap="sm">
            <Divider label="Father" labelPosition="left" />
            <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
              {txt('Name', 'father_name')}
              {txt('Occupation', 'father_occupation')}
              {txt('Employer', 'father_employer')}
              {txt('Annual income', 'father_income')}
              {txt('Phone', 'father_phone')}
              {txt('Email', 'father_email', { type: 'email' })}
              {txt('Aadhaar', 'father_aadhaar')}
            </SimpleGrid>
            <Divider label="Mother" labelPosition="left" />
            <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
              {txt('Name', 'mother_name')}
              {txt('Occupation', 'mother_occupation')}
              {txt('Employer', 'mother_employer')}
              {txt('Annual income', 'mother_income')}
              {txt('Phone', 'mother_phone')}
              {txt('Email', 'mother_email', { type: 'email' })}
              {txt('Aadhaar', 'mother_aadhaar')}
            </SimpleGrid>
            <Divider label="Guardian (if applicable)" labelPosition="left" />
            <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
              {txt('Name', 'guardian_name')}
              {sel('Relationship', 'guardian_relation', RELATIONS)}
              {txt('Phone', 'guardian_phone')}
              {txt('Email', 'guardian_email', { type: 'email' })}
              {txt('Aadhaar', 'guardian_aadhaar')}
            </SimpleGrid>
          </Stack>
        </Tabs.Panel>

        {/* ── Admission & lifecycle ── */}
        <Tabs.Panel value="admission">
          <Stack gap="sm">
            <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
              {txt('Admission date', 'admission_date', { type: 'date' })}
              {txt('Admission class', 'admission_class', { placeholder: 'e.g. Class 8' })}
              {sel('Document verification', 'verification_status', VERIFY, false)}
              {txt('Previous school', 'previous_school')}
              {sel('Previous board', 'previous_board', BOARDS)}
              {txt('Transfer Certificate No.', 'tc_number')}
              {txt('Migration Certificate No.', 'migration_number')}
              {sel('Lifecycle status', 'status', LIFECYCLE, false)}
            </SimpleGrid>
            <Checkbox label="Mark as enrolled (counts toward class strength)" checked={!!f.enrolled} onChange={(e) => up('enrolled', e.currentTarget.checked)} />
          </Stack>
        </Tabs.Panel>

        {/* ── Health ── */}
        <Tabs.Panel value="health">
          <Stack gap="sm">
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
              {txt('Emergency contact', 'emergency_contact', { placeholder: '+91 90000 XXXXX' })}
              {sel('Blood group', 'blood_group', BLOOD)}
            </SimpleGrid>
            <Textarea label="Medical conditions / allergies / accommodations" autosize minRows={3} value={(f.medical_notes as string) ?? ''} onChange={(e) => up('medical_notes', e.currentTarget.value)} />
          </Stack>
        </Tabs.Panel>
      </Tabs>

      {override !== null && (
        <Alert color="orange" variant="light" icon={<Lock size={16} />} mt="md" title="This record is CBSE-locked">
          <Text size="sm" mb="xs">Editing a locked field (name, parents, DOB, gender, category, CWSN) requires a documented reason. The override is recorded in the audit trail.</Text>
          <TextInput placeholder="e.g. CBSE correction approval ref. #…" value={override} onChange={(e) => setOverride(e.currentTarget.value)} data-testid="override-reason" />
        </Alert>
      )}
      <Group justify="flex-end" mt="md">
        <Button variant="subtle" onClick={onClose} data-testid="student-form-cancel-button">Cancel</Button>
        {override !== null ? (
          <Button color="orange" leftSection={<Lock size={14} />} onClick={save} loading={busy} disabled={!override.trim()} data-testid="student-form-override-button">
            Override &amp; save
          </Button>
        ) : (
          <Button onClick={save} loading={busy} disabled={!canSave} data-testid="student-form-save-button">
            {isEdit ? 'Save changes' : 'Admit student'}
          </Button>
        )}
      </Group>
      {(create.isError || (update.isError && override === null)) && (
        <Text size="xs" c="red" ta="center" mt="xs">
          {(create.error as Error)?.message ?? (update.error as Error)?.message ?? 'Save failed'}
        </Text>
      )}
    </Modal>
  );
}
