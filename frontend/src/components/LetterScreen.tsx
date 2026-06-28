import { useState } from 'react';
import {
  Badge,
  Button,
  Card,
  Container,
  Divider,
  Group,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  Textarea,
  Title,
} from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Mail, Printer } from 'lucide-react';
import { useAuth } from '../stores/auth';
import { createLetter, fetchLetters, fetchSchool } from '../api/client';
import { letterHtml, printHtml } from '../lib/printDoc';

const today = () => new Date().toISOString().slice(0, 10);

export function LetterScreen() {
  const token = useAuth((s) => s.token)!;
  const qc = useQueryClient();
  const { data: school } = useQuery({ queryKey: ['school'], queryFn: () => fetchSchool(token) });
  const { data: letters } = useQuery({ queryKey: ['letters'], queryFn: () => fetchLetters(token) });

  const [recipient, setRecipient] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [date, setDate] = useState(today());

  const head = {
    name: school?.name ?? 'Your School',
    address: school?.address,
    principalName: school?.principal_name,
  };

  const print = (refNo: string) =>
    printHtml(letterHtml(head, { ref_no: refNo, date, recipient, subject, body }));

  const save = useMutation({
    mutationFn: () => createLetter(token, { recipient, subject, body, letter_date: date }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['letters'] });
      print(res.ref_no);
    },
  });

  const canSave = subject.trim() !== '' && body.trim() !== '';

  return (
    <Container size="xl" px={0}>
      <Stack gap="lg">
        <Group gap="sm">
          <Mail size={20} color="var(--mantine-color-brand-6)" />
          <Title order={2}>Letters</Title>
        </Group>

        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
          {/* Composer */}
          <Card withBorder>
            <Stack gap="sm">
              <TextInput label="Date" type="date" value={date} onChange={(e) => setDate(e.currentTarget.value)} data-testid="letter-date" />
              <Textarea label="To (recipient address)" placeholder={'The District Education Officer\nBengaluru South'} autosize minRows={2} value={recipient} onChange={(e) => setRecipient(e.currentTarget.value)} data-testid="letter-recipient" />
              <TextInput label="Subject" placeholder="e.g. Annual Day Invitation" value={subject} onChange={(e) => setSubject(e.currentTarget.value)} required data-testid="letter-subject" />
              <Textarea label="Body" placeholder="Write the letter… (blank line = new paragraph)" autosize minRows={8} value={body} onChange={(e) => setBody(e.currentTarget.value)} required data-testid="letter-body" />
              <Group justify="flex-end">
                <Button leftSection={<Printer size={15} />} loading={save.isPending} disabled={!canSave} onClick={() => save.mutate()} data-testid="letter-save-print">
                  Save &amp; Print
                </Button>
              </Group>
              {save.isError && <Text size="xs" c="red">Could not save the letter.</Text>}
            </Stack>
          </Card>

          {/* Live letterhead preview */}
          <Card withBorder data-testid="letter-preview">
            <Stack gap={2} style={{ fontFamily: 'Georgia, serif', color: '#1a1a1a' }}>
              <div style={{ textAlign: 'center', borderBottom: '3px double #1f3a5f', paddingBottom: 8 }}>
                <Text fw={700} size="lg" style={{ color: '#1f3a5f' }}>{head.name}</Text>
                {head.address && <Text size="xs" c="dimmed">{head.address}</Text>}
                <Text size="xs" style={{ letterSpacing: '.18em', textTransform: 'uppercase', color: '#1f3a5f' }}>Office of the Principal</Text>
              </div>
              <Group justify="space-between" mt="sm">
                <Text size="xs" c="dimmed">Ref: (on save)</Text>
                <Text size="xs" c="dimmed">Date: {date}</Text>
              </Group>
              {recipient && <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>{recipient}</Text>}
              <Text fw={700} ta="center" td="underline" mt="xs">{subject ? `Subject: ${subject}` : 'Subject: …'}</Text>
              <Text size="sm" mt={4} style={{ whiteSpace: 'pre-wrap', textAlign: 'justify' }}>{body || 'The letter body will appear here…'}</Text>
              <Text size="sm" mt="lg">Yours sincerely,</Text>
              <Text fw={700} mt="lg">{head.principalName || '(set principal in Settings)'}</Text>
              <Text size="sm">Principal, {head.name}</Text>
            </Stack>
          </Card>
        </SimpleGrid>

        <Divider label="Recent letters" labelPosition="left" />
        {letters && letters.letters.length > 0 ? (
          <Table withTableBorder striped data-testid="letter-register">
            <Table.Thead>
              <Table.Tr><Table.Th>Ref</Table.Th><Table.Th>Date</Table.Th><Table.Th>Recipient</Table.Th><Table.Th>Subject</Table.Th><Table.Th /></Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {letters.letters.map((l) => (
                <Table.Tr key={l.id}>
                  <Table.Td><Badge size="xs" variant="outline">{l.ref_no}</Badge></Table.Td>
                  <Table.Td><Text size="xs">{l.letter_date}</Text></Table.Td>
                  <Table.Td><Text size="xs" lineClamp={1}>{l.recipient?.split('\n')[0] ?? '—'}</Text></Table.Td>
                  <Table.Td><Text size="sm" lineClamp={1}>{l.subject}</Text></Table.Td>
                  <Table.Td>
                    <Button size="compact-xs" variant="subtle" leftSection={<Printer size={12} />}
                      onClick={() => printHtml(letterHtml(head, { ref_no: l.ref_no ?? '', date: l.letter_date ?? '', recipient: l.recipient ?? '', subject: l.subject ?? '', body: l.body ?? '' }))}>
                      Print
                    </Button>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        ) : (
          <Text size="sm" c="dimmed">No letters yet.</Text>
        )}
      </Stack>
    </Container>
  );
}
