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
  Skeleton,
  Stack,
  Text,
  ThemeIcon,
  Title,
  Tooltip,
} from '@mantine/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, UserCheck, X } from 'lucide-react';
import type { SubjectWithAssignments, TeacherAssignment } from '../api/client';
import { assignTeacherSubject, removeTeacherSubject } from '../api/client';
import { useTeacherSubjects } from '../hooks/useTeacherSubjects';
import { useStaff } from '../hooks/useStaff';
import { useAuth } from '../stores/auth';

const PRIORITY_LABELS = ['Primary', 'Secondary', 'Tertiary'] as const;
const PRIORITY_COLORS = ['brand', 'lavender', 'gray'] as const;

function AssignmentRow({
  a,
  onRemove,
  removing,
}: {
  a: TeacherAssignment;
  onRemove: () => void;
  removing: boolean;
}) {
  const color = PRIORITY_COLORS[(a.priority - 1)] ?? 'gray';
  const label = PRIORITY_LABELS[(a.priority - 1)] ?? `P${a.priority}`;
  return (
    <Group
      justify="space-between"
      wrap="nowrap"
      px="xs"
      py={6}
      style={{ borderRadius: 6, background: 'var(--mantine-color-gray-0)' }}
    >
      <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
        <Badge size="xs" color={color} variant="light" style={{ flexShrink: 0 }}>
          {label}
        </Badge>
        <Text size="sm" truncate>
          {a.teacher ?? 'Unknown'}
        </Text>
      </Group>
      <Tooltip label="Remove assignment">
        <ActionIcon
          size="sm"
          variant="subtle"
          color="red"
          onClick={onRemove}
          loading={removing}
          aria-label="Remove"
        >
          <X size={12} />
        </ActionIcon>
      </Tooltip>
    </Group>
  );
}

function SubjectCard({ s }: { s: SubjectWithAssignments }) {
  const token = useAuth((st) => st.token)!;
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [staffId, setStaffId] = useState<string | null>(null);
  const [priority, setPriority] = useState<string>('1');
  const [removingId, setRemovingId] = useState<number | null>(null);

  const { data: staffData } = useStaff('');
  const assignedIds = new Set(s.assignments.map((a) => a.staff_id));
  const staffOptions = (staffData?.staff ?? [])
    .filter((m) => !assignedIds.has(m.id))
    .map((m) => ({
      value: String(m.id),
      label: [m.first_name, m.last_name].filter(Boolean).join(' '),
    }));

  const assign = useMutation({
    mutationFn: () =>
      assignTeacherSubject(token, {
        staff_id: Number(staffId),
        subject_id: s.id,
        priority: Number(priority),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['teacher-subjects'] });
      setModalOpen(false);
      setStaffId(null);
      setPriority('1');
    },
  });

  const remove = useMutation({
    mutationFn: (id: number) => {
      setRemovingId(id);
      return removeTeacherSubject(token, id);
    },
    onSuccess: () => {
      setRemovingId(null);
      qc.invalidateQueries({ queryKey: ['teacher-subjects'] });
    },
    onError: () => setRemovingId(null),
  });

  const canAdd = s.assignments.length < 3;

  return (
    <>
      <Modal
        opened={modalOpen}
        onClose={() => setModalOpen(false)}
        title={
          <Group gap="xs">
            <Text fw={600}>Assign Teacher</Text>
            <Text c="dimmed" size="sm">— {s.name}</Text>
          </Group>
        }
        centered
        size="sm"
      >
        <Stack gap="md">
          <Select
            label="Teacher"
            placeholder="Select a teacher…"
            data={staffOptions}
            value={staffId}
            onChange={setStaffId}
            searchable
            nothingFoundMessage="No available teachers"
          />
          <Select
            label="Priority"
            data={[
              { value: '1', label: 'Primary (1st teacher)' },
              { value: '2', label: 'Secondary (2nd teacher)' },
              { value: '3', label: 'Tertiary (3rd teacher)' },
            ]}
            value={priority}
            onChange={(v) => setPriority(v ?? '1')}
          />
          <Button
            onClick={() => assign.mutate()}
            loading={assign.isPending}
            disabled={!staffId}
            leftSection={<UserCheck size={14} />}
          >
            Assign
          </Button>
        </Stack>
      </Modal>

      <Card>
        <Group justify="space-between" mb="sm" wrap="nowrap">
          <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
            <ThemeIcon size={38} radius="md" variant="light" color="brand" style={{ flexShrink: 0 }}>
              <UserCheck size={20} strokeWidth={1.9} />
            </ThemeIcon>
            <div style={{ minWidth: 0 }}>
              <Group gap="xs" wrap="nowrap">
                <Text fw={650} truncate>
                  {s.name}
                </Text>
                {s.code && (
                  <Badge size="xs" color="gray" variant="outline" style={{ flexShrink: 0 }}>
                    {s.code}
                  </Badge>
                )}
              </Group>
              <Group gap={4} wrap="nowrap">
                {s.type && (
                  <Text size="xs" c="dimmed">
                    {s.type}
                  </Text>
                )}
                {s.weekly_periods > 0 && (
                  <Text size="xs" c="dimmed">
                    · {s.weekly_periods}×/wk
                  </Text>
                )}
              </Group>
            </div>
          </Group>
          <Badge
            color={s.assignments.length >= 3 ? 'gray' : s.assignments.length > 0 ? 'teal' : 'orange'}
            variant="light"
            style={{ flexShrink: 0 }}
          >
            {s.assignments.length}/3
          </Badge>
        </Group>

        <Stack gap={4}>
          {s.assignments.length > 0 ? (
            s.assignments.map((a) => (
              <AssignmentRow
                key={a.id}
                a={a}
                onRemove={() => remove.mutate(a.id)}
                removing={removingId === a.id}
              />
            ))
          ) : (
            <Text size="xs" c="dimmed" fs="italic">
              No teachers assigned yet.
            </Text>
          )}
        </Stack>

        {canAdd && (
          <Button
            variant="subtle"
            size="xs"
            leftSection={<Plus size={12} />}
            mt="sm"
            onClick={() => setModalOpen(true)}
          >
            Assign Teacher
          </Button>
        )}
      </Card>
    </>
  );
}

export function TeacherSubjectsScreen() {
  const { data, isLoading } = useTeacherSubjects();

  const totalAssignments =
    data?.subjects.reduce((sum, s) => sum + s.assignments.length, 0) ?? 0;

  return (
    <Container size="xl" px={0}>
      <Stack gap="lg">
        <div>
          <Title order={2}>Teacher–Subject Mapper</Title>
          <Text c="dimmed">
            {data
              ? `${data.total} subjects · ${totalAssignments} assignments`
              : 'Loading…'}
          </Text>
        </div>

        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
          {isLoading && !data
            ? Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} height={160} radius="lg" />
              ))
            : (data?.subjects ?? []).map((s) => <SubjectCard key={s.id} s={s} />)}
        </SimpleGrid>
      </Stack>
    </Container>
  );
}
