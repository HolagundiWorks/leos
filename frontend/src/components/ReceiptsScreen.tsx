import {
  Badge, Button, Container, Group, Stack, Table, Text, Title,
} from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { Printer, Receipt } from 'lucide-react';
import { useAuth } from '../stores/auth';
import { fetchReceipts, fetchSchool } from '../api/client';
import { printHtml, receiptHtml } from '../lib/printDoc';

export function ReceiptsScreen() {
  const token = useAuth((s) => s.token)!;
  const { data: school } = useQuery({ queryKey: ['school'], queryFn: () => fetchSchool(token) });
  const { data } = useQuery({ queryKey: ['receipts'], queryFn: () => fetchReceipts(token) });

  const head = {
    name: school?.name ?? 'Your School',
    address: school?.address,
    principalName: school?.principal_name,
    logo: school?.logo,
    signature: school?.signature,
  };

  const rows = data?.payments ?? [];
  const total = rows.reduce((s, r) => s + (r.amount_paid || 0), 0);

  return (
    <Container size="xl" px={0}>
      <Stack gap="lg">
        <Group justify="space-between" align="flex-end">
          <Group gap="sm"><Receipt size={20} color="var(--mantine-color-brand-6)" /><Title order={2}>Fee Receipts</Title></Group>
          {rows.length > 0 && <Badge size="lg" variant="light" color="mint">₹ {total.toFixed(2)} collected · {rows.length} receipts</Badge>}
        </Group>

        {rows.length > 0 ? (
          <Table withTableBorder striped data-testid="receipts-table">
            <Table.Thead>
              <Table.Tr><Table.Th>Receipt</Table.Th><Table.Th>Date</Table.Th><Table.Th>Student</Table.Th><Table.Th>Fee head</Table.Th><Table.Th>Mode</Table.Th><Table.Th>Amount</Table.Th><Table.Th /></Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map((r) => {
                const student = `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim();
                return (
                  <Table.Tr key={r.id}>
                    <Table.Td><Badge size="xs" variant="outline">{r.receipt_no ?? `#${r.id}`}</Badge></Table.Td>
                    <Table.Td><Text size="xs">{r.payment_date}</Text></Table.Td>
                    <Table.Td><Text size="sm">{student}</Text></Table.Td>
                    <Table.Td><Text size="sm">{r.fee_head_name}</Text></Table.Td>
                    <Table.Td><Text size="xs" tt="capitalize">{r.payment_mode ?? '—'}</Text></Table.Td>
                    <Table.Td><Text fw={600}>₹ {r.amount_paid.toFixed(2)}</Text></Table.Td>
                    <Table.Td>
                      <Button size="compact-xs" variant="subtle" leftSection={<Printer size={12} />}
                        onClick={() => printHtml(receiptHtml(head, {
                          receipt_no: r.receipt_no ?? `#${r.id}`, date: r.payment_date ?? '', student,
                          fee_head: r.fee_head_name, amount: r.amount_paid, mode: r.payment_mode ?? 'cash', reference: r.reference ?? undefined,
                        }))}>
                        Print
                      </Button>
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        ) : (
          <Text size="sm" c="dimmed">No fee payments recorded yet. Collect a payment in Finance → Fees to generate receipts.</Text>
        )}
      </Stack>
    </Container>
  );
}
