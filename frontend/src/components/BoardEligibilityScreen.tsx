import { useState } from 'react';
import {
  Alert, Badge, Button, Container, Group, Paper, Progress, SimpleGrid, Stack, Table, Text, Title,
} from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, BellRing, CheckCircle2, GraduationCap } from 'lucide-react';
import { useAuth } from '../stores/auth';
import { fetchAttendanceAlerts, warnAttendance, type AttendanceAlert } from '../api/client';

export function BoardEligibilityScreen({ onViewStudent }: { onViewStudent?: (id: number) => void }) {
  const token = useAuth((s) => s.token)!;
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['attendance-alerts'], queryFn: () => fetchAttendanceAlerts(token) });
  const alerts = data?.alerts ?? [];
  const [warned, setWarned] = useState<Set<number>>(new Set());

  const warn = useMutation({
    mutationFn: (a: AttendanceAlert) => warnAttendance(token, a.student_id, a.attendance_pct),
    onSuccess: (_r, a) => {
      setWarned((s) => new Set(s).add(a.student_id));
      qc.invalidateQueries({ queryKey: ['student-comms', a.student_id] });
    },
  });

  return (
    <Container size="xl" px={0}>
      <Stack gap="lg">
        <Group gap="sm"><GraduationCap size={20} color="var(--mantine-color-brand-6)" /><Title order={2}>Board Exam Eligibility</Title></Group>

        <Alert color="sky" variant="light" icon={<AlertTriangle size={16} />}>
          CBSE requires a minimum <b>75% attendance</b> for board-exam eligibility (Classes 9–12). Students below the line are flagged here so you can warn the parent and principal in time.
        </Alert>

        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
          <Paper withBorder p="md" radius="md">
            <Group justify="space-between">
              <div><Text size="xs" c="dimmed" tt="uppercase" fw={600}>Below 75% — eligibility risk</Text><Text fw={700} size="28px" c={alerts.length ? 'red' : undefined}>{alerts.length}</Text></div>
              <AlertTriangle size={26} color={alerts.length ? 'var(--mantine-color-red-6)' : 'var(--mantine-color-gray-5)'} />
            </Group>
          </Paper>
          <Paper withBorder p="md" radius="md">
            <Group justify="space-between">
              <div><Text size="xs" c="dimmed" tt="uppercase" fw={600}>Warnings sent this session</Text><Text fw={700} size="28px">{warned.size}</Text></div>
              <BellRing size={26} color="var(--mantine-color-brand-6)" />
            </Group>
          </Paper>
        </SimpleGrid>

        {isLoading ? (
          <Text c="dimmed" ta="center" py="xl">Checking attendance…</Text>
        ) : alerts.length === 0 ? (
          <Paper withBorder p="xl" radius="md">
            <Group justify="center" gap="sm"><CheckCircle2 size={20} color="var(--mantine-color-mint-6)" /><Text c="dimmed">All students with recorded attendance are at or above 75%.</Text></Group>
          </Paper>
        ) : (
          <Table withTableBorder striped highlightOnHover data-testid="eligibility-table">
            <Table.Thead><Table.Tr><Table.Th>Student</Table.Th><Table.Th>Class</Table.Th><Table.Th w={200}>Attendance</Table.Th><Table.Th>Shortfall</Table.Th><Table.Th /></Table.Tr></Table.Thead>
            <Table.Tbody>
              {alerts.map((a) => {
                const name = `${a.first_name ?? ''} ${a.last_name ?? ''}`.trim();
                const shortfall = Math.max(0, Math.round((75 - a.attendance_pct) * 10) / 10);
                const sent = warned.has(a.student_id);
                return (
                  <Table.Tr key={`${a.student_id}-${a.section_id}`}>
                    <Table.Td>
                      <Text size="sm" fw={500} style={{ cursor: onViewStudent ? 'pointer' : undefined }} onClick={() => onViewStudent?.(a.student_id)}>{name}</Text>
                    </Table.Td>
                    <Table.Td><Text size="xs" c="dimmed">{a.class_name} · {a.section_name}</Text></Table.Td>
                    <Table.Td>
                      <Group gap="xs" wrap="nowrap">
                        <Progress value={a.attendance_pct} color="red" w={90} radius="sm" />
                        <Text size="sm" fw={600} c="red">{a.attendance_pct}%</Text>
                        <Text size="xs" c="dimmed">({a.attended}/{a.total})</Text>
                      </Group>
                    </Table.Td>
                    <Table.Td><Badge color="red" variant="light">−{shortfall}%</Badge></Table.Td>
                    <Table.Td>
                      {sent ? (
                        <Badge color="mint" variant="light" leftSection={<CheckCircle2 size={11} />}>Warned</Badge>
                      ) : (
                        <Button size="compact-xs" variant="light" color="orange" leftSection={<BellRing size={12} />} loading={warn.isPending && warn.variables?.student_id === a.student_id} onClick={() => warn.mutate(a)} data-testid="warn-parent">
                          Warn parent
                        </Button>
                      )}
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        )}
      </Stack>
    </Container>
  );
}
