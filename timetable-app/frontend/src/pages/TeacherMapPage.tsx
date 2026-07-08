import { useState } from 'react';
import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Container,
  Group,
  Modal,
  Select,
  SimpleGrid,
  Stack,
  Text,
  Title,
  Tooltip,
} from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, X } from 'lucide-react';
import { api, type SubjectWithAssignments } from '../api/client';

const PRIORITY_LABELS = ['Primary', 'Secondary', 'Tertiary'] as const;
const PRIORITY_COLORS = ['brand', 'lavender', 'gray'] as const;

function SubjectCard({ s }: { s: SubjectWithAssignments }) {
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [staffId, setStaffId] = useState<string | null>(null);
  const [priority, setPriority] = useState('1');
  const [removingId, setRemovingId] = useState<number | null>(null);

  const { data: staffData } = useQuery({ queryKey: ['staff'], queryFn: () => api.fetchStaff() });
  const assignedIds = new Set(s.assignments.map((a) => a.staff_id));
  const staffOptions = (staffData?.staff ?? [])
    .filter((m) => !assignedIds.has(m.id))
    .map((m) => ({ value: String(m.id), label: [m.first_name, m.last_name].filter(Boolean).join(' ') }));

  const assign = useMutation({
    mutationFn: () => api.assignTeacherSubject({ staff_id: Number(staffId), subject_id: s.id, priority: Number(priority) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['teacher-subjects'] }); setModalOpen(false); setStaffId(null); },
  });

  const remove = useMutation({
    mutationFn: (id: number) => { setRemovingId(id); return api.removeTeacherSubject(id); },
    onSuccess: () => { setRemovingId(null); qc.invalidateQueries({ queryKey: ['teacher-subjects'] }); },
    onError: () => setRemovingId(null),
  });

  return (
    <>
      <Card>
        <Group justify="space-between" mb="sm">
          <div>
            <Text fw={600}>{s.name}</Text>
            {s.code && <Text size="xs" c="dimmed">{s.code}</Text>}
          </div>
          {s.assignments.length < 3 && (
            <Button size="xs" variant="light" leftSection={<Plus size={12} />} onClick={() => setModalOpen(true)}>Assign</Button>
          )}
        </Group>
        <Stack gap={6}>
          {s.assignments.length === 0 && <Text size="xs" c="dimmed">No teachers mapped</Text>}
          {s.assignments.map((a) => (
            <Group key={a.id} justify="space-between" p="xs" style={{ background: '#F5F7FA', borderRadius: 6 }}>
              <Group gap="xs">
                <Badge size="xs" color={PRIORITY_COLORS[(a.priority - 1)] ?? 'gray'} variant="light">
                  {PRIORITY_LABELS[(a.priority - 1)] ?? `P${a.priority}`}
                </Badge>
                <Text size="sm">{a.teacher}</Text>
              </Group>
              <Tooltip label="Remove">
                <ActionIcon size="sm" variant="subtle" color="red" onClick={() => remove.mutate(a.id)} loading={removingId === a.id}>
                  <X size={12} />
                </ActionIcon>
              </Tooltip>
            </Group>
          ))}
        </Stack>
      </Card>

      <Modal opened={modalOpen} onClose={() => setModalOpen(false)} title={`Assign Teacher — ${s.name}`} centered size="sm">
        <Stack gap="md">
          <Select label="Teacher" data={staffOptions} value={staffId} onChange={setStaffId} searchable />
          <Select label="Priority" data={[
            { value: '1', label: 'Primary (1st teacher)' },
            { value: '2', label: 'Secondary (2nd teacher)' },
            { value: '3', label: 'Tertiary (3rd teacher)' },
          ]} value={priority} onChange={(v) => setPriority(v ?? '1')} />
          <Button onClick={() => assign.mutate()} loading={assign.isPending} disabled={!staffId}>Assign</Button>
        </Stack>
      </Modal>
    </>
  );
}

export function TeacherMapPage() {
  const { data, isLoading } = useQuery({ queryKey: ['teacher-subjects'], queryFn: () => api.fetchTeacherSubjects() });

  return (
    <Container size="lg" px={0}>
      <Stack gap="lg">
        <div>
          <Title order={2}>Teacher Map</Title>
          <Text c="dimmed">Map up to 3 teachers per subject — timetable assignment filters by this mapping</Text>
        </div>
        {isLoading ? <Text c="dimmed">Loading…</Text> : (
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
            {(data?.subjects ?? []).map((s) => <SubjectCard key={s.id} s={s} />)}
          </SimpleGrid>
        )}
      </Stack>
    </Container>
  );
}
