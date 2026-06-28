import { useState } from 'react';
import {
  Avatar,
  Badge,
  Button,
  Card,
  Container,
  Divider,
  Group,
  SimpleGrid,
  Stack,
  Tabs,
  Text,
  Title,
} from '@mantine/core';
import { ArrowLeft, Lock, Pencil, ShieldCheck, Sparkles } from 'lucide-react';
import dayjs from 'dayjs';
import { useStudent } from '../hooks/useStudent';
import { initials } from '../types';
import type { StudentDetail } from '../api/client';
import { StudentFormModal } from './StudentFormModal';
import { StudentDocumentsTab } from './StudentDocumentsTab';
import { StudentAcademicsTab } from './StudentAcademicsTab';
import { StudentCommsTab } from './StudentCommsTab';
import { StudentInsightsTab } from './StudentInsightsTab';
import { StudentComplianceTab } from './StudentComplianceTab';

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <Text size="xs" c="dimmed" fw={600} tt="uppercase">{label}</Text>
      <Text>{value || '—'}</Text>
    </div>
  );
}

const STATUS_COLOR: Record<string, string> = {
  Active: 'mint', Admitted: 'mint', Applied: 'sky', Inquiry: 'gray',
  'On Leave': 'yellow', Suspended: 'red', 'Transfer Requested': 'orange',
  Graduated: 'blue', Alumni: 'grape',
};

function PersonBlock({ label, p }: { label: string; p: { name?: string | null; occupation?: string | null; employer?: string | null; income?: string | null; phone?: string | null; email?: string | null; aadhaar?: string | null; relation?: string | null } }) {
  return (
    <div>
      <Divider label={label} labelPosition="left" mb="sm" />
      <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
        <Field label="Name" value={p.name} />
        {p.relation !== undefined && <Field label="Relationship" value={p.relation} />}
        {p.occupation !== undefined && <Field label="Occupation" value={p.occupation} />}
        {p.employer !== undefined && <Field label="Employer" value={p.employer} />}
        {p.income !== undefined && <Field label="Annual income" value={p.income} />}
        <Field label="Phone" value={p.phone} />
        <Field label="Email" value={p.email} />
        <Field label="Aadhaar" value={p.aadhaar} />
      </SimpleGrid>
    </div>
  );
}

export function StudentProfileScreen({ id, onBack }: { id: number; onBack: () => void }) {
  const { data: s, isLoading } = useStudent(id) as { data: StudentDetail | undefined; isLoading: boolean };
  const [editing, setEditing] = useState(false);
  const name = s ? `${s.first_name} ${s.middle_name ? s.middle_name + ' ' : ''}${s.last_name}`.replace(/\s+/g, ' ').trim() : '';
  const admission = s?.alt_id || `ID ${id}`;
  const status = s?.status || 'Active';

  return (
    <Container size="xl" px={0}>
      <Stack gap="md">
        <Button variant="subtle" color="gray" size="compact-sm" leftSection={<ArrowLeft size={16} />} onClick={onBack} w="fit-content">
          Back to students
        </Button>

        <Card>
          <Group justify="space-between" align="flex-start" wrap="nowrap">
            <Group wrap="nowrap" gap="md">
              <Avatar size={64} radius="xl" color="brand" variant="light" src={s?.photo ?? undefined}>
                {initials(name || 'S')}
              </Avatar>
              <div>
                <Title order={3}>{isLoading ? 'Loading…' : name}</Title>
                <Text c="dimmed" size="sm">{(s?.gender ?? '—') + ' · Admission ' + admission}{s?.admission_class ? ` · ${s.admission_class}` : ''}</Text>
              </div>
            </Group>
            <Group gap="xs">
              {s && !s.aadhaar && <Badge color="yellow" variant="light">Aadhaar missing</Badge>}
              {s && !s.apaar_id && <Badge color="peach" variant="light">APAAR missing</Badge>}
              <Badge color={STATUS_COLOR[status] ?? 'gray'} variant="light" data-testid="student-status">{status}</Badge>
              {s && (s.lock_state === 'Locked'
                ? <Badge color="red" variant="filled" leftSection={<Lock size={11} />}>Locked</Badge>
                : <Badge color="sky" variant="light" leftSection={<ShieldCheck size={11} />}>{s.lock_state || 'Draft'}</Badge>)}
              <Button size="xs" variant="light" leftSection={<Pencil size={13} />} onClick={() => setEditing(true)} disabled={!s}>Edit</Button>
            </Group>
          </Group>
        </Card>

        <Card p={0}>
          <Tabs defaultValue="identity">
            <Tabs.List>
              <Tabs.Tab value="identity">Identity</Tabs.Tab>
              <Tabs.Tab value="parents">Parents</Tabs.Tab>
              <Tabs.Tab value="admission">Admission</Tabs.Tab>
              <Tabs.Tab value="health">Health</Tabs.Tab>
              <Tabs.Tab value="academics">Academics</Tabs.Tab>
              <Tabs.Tab value="insights" leftSection={<Sparkles size={13} />}>Insights</Tabs.Tab>
              <Tabs.Tab value="compliance" leftSection={<ShieldCheck size={13} />}>Compliance</Tabs.Tab>
              <Tabs.Tab value="cocurricular">Co-curricular</Tabs.Tab>
              <Tabs.Tab value="comms">Comms</Tabs.Tab>
              <Tabs.Tab value="documents">Documents</Tabs.Tab>
            </Tabs.List>

            <Tabs.Panel value="identity" p="lg">
              <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="lg">
                <Field label="Full name" value={name} />
                <Field label="Gender" value={s?.gender} />
                <Field label="Date of birth" value={s?.birthdate ? dayjs(s.birthdate).format('D MMM YYYY') : null} />
                <Field label="Blood group" value={s?.blood_group} />
                <Field label="Category" value={s?.category} />
                <Field label="Nationality" value={s?.nationality} />
                <Field label="Religion" value={s?.religion} />
                <Field label="Mother tongue" value={s?.mother_tongue} />
                <Field label="Admission / Roll No" value={s?.alt_id} />
                <Field label="APAAR ID" value={s?.apaar_id} />
                <Field label="PEN" value={s?.pen} />
                <Field label="Aadhaar" value={s?.aadhaar} />
                <Field label="Email" value={s?.email} />
                <Field label="Mobile" value={s?.phone} />
                <Field label="Residential address" value={s?.address} />
                <Field label="Permanent address" value={s?.permanent_address} />
              </SimpleGrid>
            </Tabs.Panel>

            <Tabs.Panel value="parents" p="lg">
              <Stack gap="lg">
                <PersonBlock label="Father" p={{ name: s?.father_name, occupation: s?.father_occupation, employer: s?.father_employer, income: s?.father_income, phone: s?.father_phone, email: s?.father_email, aadhaar: s?.father_aadhaar }} />
                <PersonBlock label="Mother" p={{ name: s?.mother_name, occupation: s?.mother_occupation, employer: s?.mother_employer, income: s?.mother_income, phone: s?.mother_phone, email: s?.mother_email, aadhaar: s?.mother_aadhaar }} />
                <PersonBlock label="Guardian" p={{ name: s?.guardian_name, relation: s?.guardian_relation, phone: s?.guardian_phone, email: s?.guardian_email, aadhaar: s?.guardian_aadhaar }} />
              </Stack>
            </Tabs.Panel>

            <Tabs.Panel value="admission" p="lg">
              <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="lg">
                <Field label="Admission date" value={s?.admission_date ? dayjs(s.admission_date).format('D MMM YYYY') : null} />
                <Field label="Admission class" value={s?.admission_class} />
                <Field label="Lifecycle status" value={status} />
                <Field label="Previous school" value={s?.previous_school} />
                <Field label="Previous board" value={s?.previous_board} />
                <Field label="Document verification" value={s?.verification_status} />
                <Field label="Transfer Certificate No." value={s?.tc_number} />
                <Field label="Migration Certificate No." value={s?.migration_number} />
                <Field label="Enrolled in a class" value={s?.enrolled ? 'Yes' : 'No'} />
              </SimpleGrid>
            </Tabs.Panel>

            <Tabs.Panel value="health" p="lg">
              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="lg">
                <Field label="Blood group" value={s?.blood_group} />
                <Field label="Emergency contact" value={s?.emergency_contact} />
                <div style={{ gridColumn: '1 / -1' }}><Field label="Medical conditions / allergies / accommodations" value={s?.medical_notes} /></div>
              </SimpleGrid>
            </Tabs.Panel>

            <Tabs.Panel value="academics" p="lg"><StudentAcademicsTab studentId={id} /></Tabs.Panel>
            <Tabs.Panel value="insights" p="lg"><StudentInsightsTab studentId={id} /></Tabs.Panel>
            <Tabs.Panel value="compliance" p="lg"><StudentComplianceTab studentId={id} /></Tabs.Panel>
            <Tabs.Panel value="cocurricular" p="lg"><Text c="dimmed" ta="center" py="xl">Club memberships and sports participation will appear here.</Text></Tabs.Panel>
            <Tabs.Panel value="comms" p="lg"><StudentCommsTab studentId={id} /></Tabs.Panel>
            <Tabs.Panel value="documents" p="lg"><StudentDocumentsTab studentId={id} /></Tabs.Panel>
          </Tabs>
        </Card>
      </Stack>

      {editing && s && <StudentFormModal initial={s} onClose={() => setEditing(false)} />}
    </Container>
  );
}
