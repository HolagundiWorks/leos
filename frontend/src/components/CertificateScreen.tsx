import { useEffect, useMemo, useState } from 'react';
import {
  Autocomplete,
  Badge,
  Button,
  Card,
  Container,
  Divider,
  Group,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  Textarea,
  Title,
} from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Award, Printer } from 'lucide-react';
import { useAuth } from '../stores/auth';
import { createCertificate, fetchCertificates, fetchSchool, fetchStudents } from '../api/client';
import { certificateHtml, printHtml } from '../lib/printDoc';
import { makeQr } from '../lib/qr';

const today = () => new Date().toISOString().slice(0, 10);
const certQrText = (school: string, serial: string, name: string, title: string, date: string) =>
  `LEOS CERTIFICATE\nSchool: ${school}\nSerial: ${serial}\nName: ${name}\nAward: ${title}\nDate: ${date}`;

// Certificate types → title + a body template ({d} = the "details" field).
const TYPES: { value: string; label: string; title: string; tmpl: (d: string) => string; hint: string }[] = [
  { value: 'completion', label: 'Completion', title: 'Certificate of Completion', tmpl: (d) => `has successfully completed ${d || '…'}.`, hint: 'Course / programme' },
  { value: 'participation', label: 'Participation', title: 'Certificate of Participation', tmpl: (d) => `for participating in ${d || '…'}.`, hint: 'Event / activity' },
  { value: 'rank', label: 'Rank / Merit', title: 'Certificate of Merit', tmpl: (d) => `for securing ${d || '…'}.`, hint: 'e.g. 1st Rank in Class 8' },
  { value: 'graduation', label: 'Graduation', title: 'Graduation Certificate', tmpl: (d) => `has successfully graduated from ${d || '…'}.`, hint: 'e.g. Class 10, 2026' },
  { value: 'field-trip', label: 'Field Trip', title: 'Field Trip Certificate', tmpl: (d) => `for participating in the educational field trip to ${d || '…'}.`, hint: 'Place / trip name' },
  { value: 'class-activity', label: 'Class Activity', title: 'Activity Certificate', tmpl: (d) => `for active participation in ${d || '…'}.`, hint: 'Activity name' },
];

export function CertificateScreen() {
  const token = useAuth((s) => s.token)!;
  const qc = useQueryClient();
  const { data: school } = useQuery({ queryKey: ['school'], queryFn: () => fetchSchool(token) });
  const { data: students } = useQuery({ queryKey: ['students', ''], queryFn: () => fetchStudents(token, {}) });
  const { data: certs } = useQuery({ queryKey: ['certificates'], queryFn: () => fetchCertificates(token) });

  const [type, setType] = useState('participation');
  const [studentName, setStudentName] = useState('');
  const [detail, setDetail] = useState('');
  const [body, setBody] = useState('');
  const [date, setDate] = useState(today());
  const [touched, setTouched] = useState(false);
  const [qrPreview, setQrPreview] = useState('');

  const def = TYPES.find((t) => t.value === type)!;

  // Auto-fill the body from the template until the user edits it manually.
  useEffect(() => {
    if (!touched) setBody(def.tmpl(detail));
  }, [type, detail, def, touched]);

  const studentOptions = useMemo(
    () => (students?.students ?? []).map((s) => `${s.first_name} ${s.last_name}`.trim()),
    [students],
  );
  const matchedId = (students?.students ?? []).find((s) => `${s.first_name} ${s.last_name}`.trim() === studentName.trim())?.id ?? null;

  const head = {
    name: school?.name ?? 'Your School',
    address: school?.address,
    principalName: school?.principal_name,
    logo: school?.logo,
    signature: school?.signature,
    certBg: school?.cert_bg,
  };

  // Live preview QR (draft; the real serial is embedded on issue).
  useEffect(() => {
    void makeQr(certQrText(head.name, '(on issue)', studentName || '…', def.title, date)).then(setQrPreview);
  }, [head.name, studentName, def.title, date]);

  const buildPrint = async (serial: string, who: string, t: string, b: string, d: string) => {
    const qr = await makeQr(certQrText(head.name, serial, who, t, d));
    printHtml(certificateHtml(head, { serial, date: d, type, title: t, studentName: who, body: b, qr }));
  };

  const issue = useMutation({
    mutationFn: () =>
      createCertificate(token, { cert_type: type, student_name: studentName, student_id: matchedId, title: def.title, body, issued_date: date }),
    onSuccess: async (res) => {
      qc.invalidateQueries({ queryKey: ['certificates'] });
      await buildPrint(res.serial, studentName, def.title, body, date);
    },
  });

  const canIssue = studentName.trim() !== '' && type !== '';

  return (
    <Container size="xl" px={0}>
      <Stack gap="lg">
        <Group gap="sm">
          <Award size={20} color="var(--mantine-color-brand-6)" />
          <Title order={2}>Certificates</Title>
        </Group>

        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
          <Card withBorder>
            <Stack gap="sm">
              <Select label="Certificate type" data={TYPES.map((t) => ({ value: t.value, label: t.label }))} value={type} onChange={(v) => { setType(v ?? 'participation'); setTouched(false); }} allowDeselect={false} data-testid="cert-type" />
              <Autocomplete label="Student / recipient" placeholder="Type or pick a student" data={studentOptions} value={studentName} onChange={setStudentName} data-testid="cert-student" />
              <TextInput label="Details" description={def.hint} placeholder={def.hint} value={detail} onChange={(e) => { setDetail(e.currentTarget.value); setTouched(false); }} data-testid="cert-detail" />
              <Textarea label="Citation (auto-filled, editable)" autosize minRows={2} value={body} onChange={(e) => { setBody(e.currentTarget.value); setTouched(true); }} data-testid="cert-body" />
              <TextInput label="Issue date" type="date" value={date} onChange={(e) => setDate(e.currentTarget.value)} data-testid="cert-date" />
              <Group justify="flex-end">
                <Button leftSection={<Printer size={15} />} color="yellow" loading={issue.isPending} disabled={!canIssue} onClick={() => issue.mutate()} data-testid="cert-issue-print">
                  Issue &amp; Print
                </Button>
              </Group>
              {issue.isError && <Text size="xs" c="red">Could not issue the certificate.</Text>}
            </Stack>
          </Card>

          {/* Live certificate preview */}
          <Card withBorder data-testid="cert-preview" style={{ background: '#fff', position: 'relative', overflow: 'hidden' }}>
            {head.certBg && <img src={head.certBg} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.16 }} />}
            <div style={{ position: 'relative', border: '5px solid #b8860b', outline: '2px solid #b8860b', outlineOffset: 5, padding: 20, textAlign: 'center', fontFamily: 'Georgia, serif', color: '#1a1a1a' }}>
              {head.logo && <img src={head.logo} alt="logo" style={{ height: 42, marginBottom: 2 }} />}
              <Text fw={700} size="lg" style={{ color: '#1f3a5f' }}>{head.name}</Text>
              {head.address && <Text size="xs" c="dimmed">{head.address}</Text>}
              <Text fw={700} my="sm" style={{ color: '#b8860b', fontSize: 24, fontVariant: 'small-caps', letterSpacing: 1 }}>{def.title}</Text>
              <Text size="sm" c="dimmed">This is to certify that</Text>
              <Text fw={700} my={6} style={{ fontSize: 22, borderBottom: '1px solid #999', display: 'inline-block', padding: '0 18px 3px' }}>{studentName || 'Student Name'}</Text>
              <Text size="sm" mt={4}>{body || def.tmpl(detail)}</Text>
              <Group justify="space-between" align="flex-end" mt="xl">
                <Text size="xs" c="dimmed" ta="left">Serial: (on issue)<br />Date: {date}</Text>
                {qrPreview && <div style={{ textAlign: 'center' }}><img src={qrPreview} alt="verify" style={{ width: 48, height: 48 }} /><Text size="9px" c="dimmed">Scan to verify</Text></div>}
                <div style={{ textAlign: 'center' }}>
                  {head.signature && <img src={head.signature} alt="signature" style={{ height: 32, display: 'block', margin: '0 auto 2px' }} />}
                  <Text size="xs" style={{ borderTop: '1px solid #333', paddingTop: 4 }}>{head.principalName || 'Principal'}<br />Principal</Text>
                </div>
              </Group>
            </div>
          </Card>
        </SimpleGrid>

        <Divider label="Issued certificates" labelPosition="left" />
        {certs && certs.certificates.length > 0 ? (
          <Table withTableBorder striped data-testid="cert-register">
            <Table.Thead>
              <Table.Tr><Table.Th>Serial</Table.Th><Table.Th>Type</Table.Th><Table.Th>Student</Table.Th><Table.Th>Date</Table.Th><Table.Th /></Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {certs.certificates.map((c) => (
                <Table.Tr key={c.id}>
                  <Table.Td><Badge size="xs" variant="outline">{c.serial}</Badge></Table.Td>
                  <Table.Td><Badge size="xs" color="yellow" variant="light">{c.cert_type}</Badge></Table.Td>
                  <Table.Td><Text size="sm">{c.student_name}</Text></Table.Td>
                  <Table.Td><Text size="xs">{c.issued_date}</Text></Table.Td>
                  <Table.Td>
                    <Button size="compact-xs" variant="subtle" leftSection={<Printer size={12} />}
                      onClick={() => buildPrint(c.serial ?? '', c.student_name ?? '', c.title ?? '', c.body ?? '', c.issued_date ?? '')}>
                      Print
                    </Button>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        ) : (
          <Text size="sm" c="dimmed">No certificates issued yet.</Text>
        )}
      </Stack>
    </Container>
  );
}
