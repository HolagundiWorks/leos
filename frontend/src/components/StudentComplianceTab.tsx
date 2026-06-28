import {
  Badge, Button, Card, Group, Stack, Stepper, Text, ThemeIcon, Timeline,
} from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { GraduationCap, History, Lock, ShieldCheck } from 'lucide-react';
import { useAuth } from '../stores/auth';
import { advanceLock, fetchStudentAudit, fetchStudent, fetchStudentAttendance, LOCK_STAGES, type AuditEntry } from '../api/client';

const ACTION_LABEL: Record<string, { label: string; color: string }> = {
  'student.update': { label: 'Field edited', color: 'sky' },
  'student.locked_override': { label: 'Locked-field override', color: 'orange' },
  'student.lock': { label: 'Lock advanced', color: 'grape' },
  'mark.add': { label: 'Score recorded', color: 'mint' },
  'mark.delete': { label: 'Score removed', color: 'red' },
};

function describe(e: AuditEntry): string {
  const d = e.detail ?? {};
  if (e.action === 'student.lock') return `${d.old ?? '—'} → ${d.new ?? '—'}`;
  if (e.action === 'mark.add' || e.action === 'mark.delete') return `${(d as { subject?: string }).subject ?? ''} ${(d as { term?: string }).term ?? ''}`.trim();
  if (d.field) return `${d.field}: ${d.old ?? '∅'} → ${d.new ?? '∅'}${d.reason ? `  ·  reason: ${d.reason}` : ''}`;
  return '';
}

export function StudentComplianceTab({ studentId }: { studentId: number }) {
  const token = useAuth((s) => s.token)!;
  const qc = useQueryClient();
  const { data: student } = useQuery({ queryKey: ['student', studentId], queryFn: () => fetchStudent(token, studentId) });
  const { data: audit } = useQuery({ queryKey: ['student-audit', studentId], queryFn: () => fetchStudentAudit(token, studentId) });
  const { data: att } = useQuery({ queryKey: ['student-attendance', studentId], queryFn: () => fetchStudentAttendance(token, studentId) });

  const lockState = student?.lock_state || 'Draft';
  const activeIdx = Math.max(0, LOCK_STAGES.indexOf(lockState as (typeof LOCK_STAGES)[number]));
  const locked = lockState === 'Locked';

  const advance = useMutation({
    mutationFn: () => advanceLock(token, studentId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['student', studentId] });
      qc.invalidateQueries({ queryKey: ['student-audit', studentId] });
    },
  });

  const history = audit?.history ?? [];

  const attColor = att?.status === 'Eligible' ? 'mint' : att?.status === 'At risk' ? 'red' : 'gray';

  return (
    <Stack gap="xl">
      {att && (
        <Card withBorder padding="md">
          <Group justify="space-between">
            <Group gap="sm">
              <ThemeIcon variant="light" color={attColor} radius="xl"><GraduationCap size={16} /></ThemeIcon>
              <div>
                <Text fw={600} size="sm">Board-exam eligibility (CBSE 75% rule)</Text>
                <Text size="xs" c="dimmed">{att.total > 0 ? `${att.attended} of ${att.total} periods attended` : 'No attendance recorded yet'}</Text>
              </div>
            </Group>
            <Group gap="sm">
              {att.total > 0 && <Text fw={700} size="lg" c={attColor}>{att.attendance_pct}%</Text>}
              <Badge color={attColor} variant="light">{att.status}</Badge>
            </Group>
          </Group>
        </Card>
      )}

      <Card withBorder padding="lg">
        <Group justify="space-between" mb="md">
          <Group gap="sm">
            <ThemeIcon variant="light" color={locked ? 'red' : 'brand'} radius="xl">{locked ? <Lock size={16} /> : <ShieldCheck size={16} />}</ThemeIcon>
            <div>
              <Text fw={600}>CBSE record-lock workflow</Text>
              <Text size="xs" c="dimmed">Draft → Parent → Principal → CBSE submission → Locked</Text>
            </div>
          </Group>
          <Badge size="lg" color={locked ? 'red' : 'sky'} variant="light" data-testid="lock-state">{lockState}</Badge>
        </Group>

        <Stepper active={activeIdx} size="sm" iconSize={28}>
          {LOCK_STAGES.map((s) => <Stepper.Step key={s} label={s} />)}
        </Stepper>

        <Group justify="flex-end" mt="lg">
          {locked ? (
            <Text size="sm" c="dimmed">Record is locked. CBSE-locked fields (name, parents, DOB, gender, category, CWSN) now require an audited override to edit.</Text>
          ) : (
            <Button variant="light" leftSection={<ShieldCheck size={15} />} loading={advance.isPending} onClick={() => advance.mutate()} data-testid="lock-advance">
              Advance to “{LOCK_STAGES[Math.min(activeIdx + 1, LOCK_STAGES.length - 1)]}”
            </Button>
          )}
        </Group>
      </Card>

      <div>
        <Group gap="xs" mb="sm"><History size={16} /><Text fw={600} size="sm">Audit trail</Text><Badge size="sm" variant="light" color="gray">{history.length}</Badge></Group>
        {history.length > 0 ? (
          <Timeline active={history.length} bulletSize={20} lineWidth={2} data-testid="audit-timeline">
            {history.map((e) => {
              const meta = ACTION_LABEL[e.action] ?? { label: e.action, color: 'gray' };
              return (
                <Timeline.Item key={e.id} title={
                  <Group gap="xs">
                    <Badge size="xs" variant="light" color={meta.color}>{meta.label}</Badge>
                    <Text size="xs" c="dimmed">{e.username ?? 'system'} · {e.created_at.slice(0, 16).replace('T', ' ')}</Text>
                  </Group>
                }>
                  <Text size="sm">{describe(e)}</Text>
                </Timeline.Item>
              );
            })}
          </Timeline>
        ) : <Text c="dimmed" ta="center" py="md">No changes recorded yet.</Text>}
      </div>
    </Stack>
  );
}
