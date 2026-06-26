import { useState } from 'react';
import {
  Avatar,
  Badge,
  Button,
  Card,
  Container,
  Group,
  Skeleton,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { Plus, Search } from 'lucide-react';
import type { Student } from '../api/client';
import { useStudents } from '../hooks/useStudents';
import { useSelection } from '../stores/selection';
import { initials } from '../types';
import { accentColors, type AccentColor } from '../theme';
import { StudentFormModal } from './StudentFormModal';

function colorFor(id: number): AccentColor {
  return accentColors[id % accentColors.length];
}

function StudentRow({
  s,
  selected,
  onSelect,
}: {
  s: Student;
  selected: boolean;
  onSelect: (id: number, name: string) => void;
}) {
  const name = `${s.first_name} ${s.last_name}`;
  return (
    <Card
      onClick={() => onSelect(s.id, name)}
      style={{
        cursor: 'pointer',
        borderColor: selected ? 'var(--mantine-color-brand-4)' : undefined,
        background: selected ? 'var(--mantine-color-brand-0)' : undefined,
      }}
    >
      <Group justify="space-between" wrap="nowrap">
        <Group wrap="nowrap" gap="md" style={{ minWidth: 0 }}>
          <Avatar radius="xl" color={colorFor(s.id)} variant="light">
            {initials(name)}
          </Avatar>
          <div style={{ minWidth: 0 }}>
            <Text fw={600} truncate>
              {name}
            </Text>
            <Text size="sm" c="dimmed" truncate>
              {s.email ?? '—'}
            </Text>
          </div>
        </Group>
        <Group gap="lg" wrap="nowrap" visibleFrom="sm">
          {s.gender && (
            <Badge color={s.gender === 'Female' ? 'rose' : 'sky'} variant="light">
              {s.gender}
            </Badge>
          )}
          <Text size="sm" c="dimmed">
            {s.phone ?? ''}
          </Text>
        </Group>
      </Group>
    </Card>
  );
}

export function StudentsScreen() {
  const [q, setQ] = useState('');
  const [admitting, setAdmitting] = useState(false);
  const { data, isLoading } = useStudents(q);
  const selected = useSelection((s) => s.student);
  const selectStudent = useSelection((s) => s.selectStudent);

  return (
    <Container size="xl" px={0}>
      <Stack gap="lg">
        <Group justify="space-between" align="flex-end" wrap="nowrap">
          <div>
            <Title order={2}>Students</Title>
            <Text c="dimmed">
              {data ? `${data.total} students · select a row for actions` : 'Loading…'}
            </Text>
          </div>
          <Group gap="sm" wrap="nowrap">
            <TextInput
              w={240}
              leftSection={<Search size={16} />}
              placeholder="Search students"
              value={q}
              onChange={(e) => setQ(e.currentTarget.value)}
            />
            <Button leftSection={<Plus size={15} />} onClick={() => setAdmitting(true)}>
              Admit
            </Button>
          </Group>
        </Group>

        <Stack gap="xs">
          {isLoading && !data ? (
            Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} height={68} radius="lg" />
            ))
          ) : data && data.students.length > 0 ? (
            data.students.map((s) => (
              <StudentRow
                key={s.id}
                s={s}
                selected={selected?.id === s.id}
                onSelect={selectStudent}
              />
            ))
          ) : (
            <Card>
              <Text c="dimmed" ta="center" py="xl">
                No students found.
              </Text>
            </Card>
          )}
        </Stack>
      </Stack>

      {admitting && <StudentFormModal onClose={() => setAdmitting(false)} />}
    </Container>
  );
}
