import { useEffect, useState } from 'react';
import {
  Alert, Badge, Button, Card, Container, Divider, Group, Paper, SimpleGrid, Stack, Table,
  Text, TextInput, Title,
} from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, FileSpreadsheet, Info, Save } from 'lucide-react';
import { useAuth } from '../stores/auth';
import { fetchSchool, fetchStatutoryReport, saveSchool, type StatutoryReport } from '../api/client';

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <Paper withBorder p="sm" radius="md">
      <Text size="xs" c="dimmed" tt="uppercase" fw={600}>{label}</Text>
      <Text fw={700} size="22px">{value}</Text>
    </Paper>
  );
}

// Flatten the aggregate into a CSV (one "field,value" row per metric).
function toCsv(r: StatutoryReport, kind: 'OASIS' | 'UDISE'): string {
  const s = r.school;
  const rows: [string, string | number][] = [
    ['Return', kind],
    ['School', s?.name ?? ''],
    ['Academic Year', s?.academic_year ?? ''],
    ['Affiliation No', s?.affiliation_no ?? ''],
    ['School Code', s?.school_code ?? ''],
    ['UDISE Code', s?.udise_code ?? ''],
    ['Generated At', r.generated_at],
    ['Students Total', r.students.total],
    ['Students Enrolled', r.students.enrolled],
    ['Boys', r.students.by_gender.Male],
    ['Girls', r.students.by_gender.Female],
    ['Other', r.students.by_gender.Other],
    ['General', r.students.by_category.General],
    ['OBC', r.students.by_category.OBC],
    ['SC', r.students.by_category.SC],
    ['ST', r.students.by_category.ST],
    ['EWS', r.students.by_category.EWS],
    ['RTE/EWS', r.students.rte_ews],
    ['CWSN', r.students.cwsn],
    ['Staff Total', r.staff.total],
    ['Teaching Staff', r.staff.teaching],
    ['Classrooms', r.infrastructure.classrooms],
    ['Classes', r.infrastructure.classes],
    ['Sections', r.infrastructure.sections],
    ['Fees Collected', r.finance.fees_collected],
  ];
  return rows.map(([k, v]) => `"${k}","${String(v).replace(/"/g, '""')}"`).join('\r\n');
}

export function StatutoryReturnsScreen() {
  const token = useAuth((s) => s.token)!;
  const qc = useQueryClient();
  const { data: report } = useQuery({ queryKey: ['statutory-report'], queryFn: () => fetchStatutoryReport(token) });
  const { data: school } = useQuery({ queryKey: ['school'], queryFn: () => fetchSchool(token) });

  const [ids, setIds] = useState({ affiliation_no: '', school_code: '', udise_code: '' });
  useEffect(() => {
    if (school) setIds({ affiliation_no: school.affiliation_no ?? '', school_code: school.school_code ?? '', udise_code: school.udise_code ?? '' });
  }, [school]);

  const saveIds = useMutation({
    mutationFn: () => saveSchool(token, {
      name: school?.name ?? '', academic_year: school?.academic_year ?? '', type: school?.type ?? 'school',
      address: school?.address ?? undefined, principal_name: school?.principal_name ?? undefined,
      logo: school?.logo ?? undefined, signature: school?.signature ?? undefined, cert_bg: school?.cert_bg ?? undefined,
      ...ids,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['school'] }); qc.invalidateQueries({ queryKey: ['statutory-report'] }); },
  });

  const download = (kind: 'OASIS' | 'UDISE') => {
    if (!report) return;
    const blob = new Blob([toCsv(report, kind)], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${kind}_${report.school?.academic_year ?? 'return'}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <Container size="xl" px={0}>
      <Stack gap="lg">
        <Group gap="sm"><FileSpreadsheet size={20} color="var(--mantine-color-brand-6)" /><Title order={2}>Government Returns — OASIS / UDISE+</Title></Group>

        <Alert color="yellow" variant="light" icon={<Info size={16} />}>
          This is a <b>working export</b> that maps your LEOS data to the figures OASIS and UDISE+ ask for. Verify the totals against the latest official template before uploading to the CBSE / education-department portal.
        </Alert>

        <Card withBorder padding="md">
          <Text fw={600} size="sm" mb="sm">School identifiers</Text>
          <Group align="flex-end" gap="sm" wrap="wrap">
            <TextInput label="Affiliation No." value={ids.affiliation_no} onChange={(e) => setIds({ ...ids, affiliation_no: e.currentTarget.value })} data-testid="affiliation-no" />
            <TextInput label="School Code" value={ids.school_code} onChange={(e) => setIds({ ...ids, school_code: e.currentTarget.value })} />
            <TextInput label="UDISE Code" value={ids.udise_code} onChange={(e) => setIds({ ...ids, udise_code: e.currentTarget.value })} />
            <Button variant="light" leftSection={<Save size={15} />} loading={saveIds.isPending} onClick={() => saveIds.mutate()}>Save</Button>
          </Group>
        </Card>

        {report && (
          <>
            <div>
              <Group justify="space-between" mb="xs">
                <Text fw={600} size="sm">Enrolment & demographics — {report.school?.academic_year ?? '—'}</Text>
                <Group gap="xs">
                  <Button size="xs" variant="light" leftSection={<Download size={14} />} onClick={() => download('OASIS')} data-testid="export-oasis">OASIS CSV</Button>
                  <Button size="xs" variant="light" leftSection={<Download size={14} />} onClick={() => download('UDISE')}>UDISE+ CSV</Button>
                </Group>
              </Group>
              <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="sm">
                <Stat label="Students" value={report.students.total} />
                <Stat label="Enrolled" value={report.students.enrolled} />
                <Stat label="Boys" value={report.students.by_gender.Male} />
                <Stat label="Girls" value={report.students.by_gender.Female} />
                <Stat label="Staff" value={report.staff.total} />
                <Stat label="Teaching" value={report.staff.teaching} />
                <Stat label="Classrooms" value={report.infrastructure.classrooms} />
                <Stat label="Sections" value={report.infrastructure.sections} />
              </SimpleGrid>
            </div>

            <Divider label="Category & special groups (RTE / CWSN)" labelPosition="left" />
            <Table withTableBorder data-testid="statutory-table">
              <Table.Tbody>
                {([
                  ['General', report.students.by_category.General],
                  ['OBC', report.students.by_category.OBC],
                  ['SC', report.students.by_category.SC],
                  ['ST', report.students.by_category.ST],
                  ['EWS (RTE quota)', report.students.by_category.EWS],
                  ['CWSN (Children With Special Needs)', report.students.cwsn],
                  ['Fees collected (₹)', report.finance.fees_collected.toLocaleString('en-IN')],
                ] as [string, number | string][]).map(([k, v]) => (
                  <Table.Tr key={k}><Table.Td><Text size="sm">{k}</Text></Table.Td><Table.Td ta="right"><Badge variant="light">{v}</Badge></Table.Td></Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
            <Text size="xs" c="dimmed">Generated {report.generated_at} · figures are live from the current school database.</Text>
          </>
        )}
      </Stack>
    </Container>
  );
}
