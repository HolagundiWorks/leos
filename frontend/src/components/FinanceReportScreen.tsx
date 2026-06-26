import {
  Badge,
  Card,
  Container,
  Grid,
  Group,
  SimpleGrid,
  Skeleton,
  Stack,
  Table,
  Text,
  ThemeIcon,
  Title,
} from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, Banknote, Receipt, TrendingUp, Wallet } from 'lucide-react';
import { ApiError } from '../api/client';
import { useAuth } from '../stores/auth';

const BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8787';

interface KV { label: string; amount: number; }
interface RecentPayment { date: string | null; student: string; head: string; amount: number; mode: string | null; receipt_no: string | null; }
interface Report {
  collected: number;
  payments_count: number;
  by_head: KV[];
  by_mode: KV[];
  outstanding_total: number;
  outstanding_students: number;
  recent: RecentPayment[];
}

const money = (n: number) => `₹${(n ?? 0).toLocaleString('en-IN')}`;

function StatCard({ label, value, sub, Icon, color }: { label: string; value: string; sub?: string; Icon: typeof Wallet; color: string }) {
  return (
    <Card p="md" style={{ borderTop: `3px solid var(--mantine-color-${color}-5)` }}>
      <Group justify="space-between" wrap="nowrap">
        <Stack gap={0}>
          <Text size="xl" fw={700} lh={1.1}>{value}</Text>
          <Text size="xs" c="dimmed">{label}</Text>
          {sub && <Text size="xs" c="dimmed">{sub}</Text>}
        </Stack>
        <ThemeIcon variant="light" color={color} size={40} radius="md"><Icon size={20} /></ThemeIcon>
      </Group>
    </Card>
  );
}

function BreakdownCard({ title, rows }: { title: string; rows: KV[] }) {
  const max = Math.max(1, ...rows.map((r) => r.amount));
  return (
    <Card p="md">
      <Text fw={650} size="sm" mb="sm">{title}</Text>
      {rows.length === 0 ? (
        <Text size="xs" c="dimmed">No collections yet.</Text>
      ) : (
        <Stack gap={8}>
          {rows.map((r) => (
            <div key={r.label}>
              <Group justify="space-between" gap="xs" mb={2}>
                <Text size="xs" tt="capitalize">{r.label}</Text>
                <Text size="xs" fw={600}>{money(r.amount)}</Text>
              </Group>
              <div style={{ height: 6, borderRadius: 3, background: 'var(--mantine-color-gray-2)', overflow: 'hidden' }}>
                <div style={{ width: `${(r.amount / max) * 100}%`, height: '100%', background: 'var(--mantine-color-brand-5)' }} />
              </div>
            </div>
          ))}
        </Stack>
      )}
    </Card>
  );
}

export function FinanceReportScreen() {
  const token = useAuth((s) => s.token)!;
  const { data, isLoading } = useQuery({
    queryKey: ['fee-report'],
    queryFn: async () => {
      const r = await fetch(`${BASE}/fees/report`, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) throw new ApiError(`HTTP ${r.status}`, r.status);
      return r.json() as Promise<Report>;
    },
    staleTime: 60_000,
  });

  return (
    <Container size="xl" px={0}>
      <Stack gap="lg">
        <div>
          <Group gap="sm"><TrendingUp size={20} color="var(--mantine-color-brand-6)" /><Title order={2}>Finance Reports</Title></Group>
          <Text c="dimmed" size="sm">Collections summary and outstanding overview</Text>
        </div>

        {isLoading || !data ? (
          <Skeleton height={300} radius="md" />
        ) : (
          <>
            <SimpleGrid cols={{ base: 2, md: 4 }} spacing="sm">
              <StatCard label="Total Collected" value={money(data.collected)} Icon={Banknote} color="mint" />
              <StatCard label="Payments" value={String(data.payments_count)} Icon={Receipt} color="brand" />
              <StatCard label="Outstanding" value={money(data.outstanding_total)} Icon={Wallet} color="peach" />
              <StatCard label="Students with dues" value={String(data.outstanding_students)} Icon={AlertCircle} color="yellow" />
            </SimpleGrid>

            <Grid gutter="sm">
              <Grid.Col span={{ base: 12, md: 6 }}><BreakdownCard title="Collections by Fee Head" rows={data.by_head} /></Grid.Col>
              <Grid.Col span={{ base: 12, md: 6 }}><BreakdownCard title="Collections by Payment Mode" rows={data.by_mode} /></Grid.Col>
            </Grid>

            <Card p="md">
              <Text fw={650} size="sm" mb="sm">Recent Payments</Text>
              {data.recent.length === 0 ? (
                <Text size="xs" c="dimmed">No payments recorded yet.</Text>
              ) : (
                <Table striped withTableBorder>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Date</Table.Th><Table.Th>Student</Table.Th><Table.Th>Fee Head</Table.Th>
                      <Table.Th>Mode</Table.Th><Table.Th ta="right">Amount</Table.Th><Table.Th>Receipt</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {data.recent.map((p, i) => (
                      <Table.Tr key={i}>
                        <Table.Td><Text size="sm">{p.date ?? '—'}</Text></Table.Td>
                        <Table.Td><Text size="sm">{p.student || '—'}</Text></Table.Td>
                        <Table.Td><Text size="sm">{p.head}</Text></Table.Td>
                        <Table.Td>{p.mode ? <Badge size="xs" variant="light" tt="capitalize">{p.mode}</Badge> : '—'}</Table.Td>
                        <Table.Td ta="right"><Text size="sm" fw={600}>{money(p.amount)}</Text></Table.Td>
                        <Table.Td><Text size="xs" c="dimmed">{p.receipt_no ?? '—'}</Text></Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              )}
            </Card>
          </>
        )}
      </Stack>
    </Container>
  );
}
