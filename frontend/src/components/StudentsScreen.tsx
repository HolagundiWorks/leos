import { useState } from 'react';
import {
  Avatar,
  Badge,
  Card,
  Container,
  Group,
  Skeleton,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { Search } from 'lucide-react';
import type { Student } from '../api/client';
import { useStudents } from '../hooks/useStudents';
import { initials } from '../types';
import { accentColors, type AccentColor } from '../theme';

function colorFor(id: number): AccentColor {
  return accentColors[id % accentColors.length];
}

function StudentRow({ s, onOpen }: { s: Student; onOpen: (id: number) => void }) {
  const name = `${s.first_name} ${s.last_name}`;
  return (
    <Card onClick={() => onOpen(s.id)} style={{ cursor: 'pointer' }}>
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

export function StudentsScreen({
  onOpenStudent,
}: {
  onOpenStudent: (id: number) => void;
}) {
  const [q, setQ] = useState('');
  const { data, isLoading } = useStudents(q);

  return (
    <Container size="xl" px={0}>
      <Stack gap="lg">
        <Group justify="space-between" align="flex-end" wrap="nowrap">
          <div>
            <Title order={2}>Students</Title>
            <Text c="dimmed">{data ? `${data.total} enrolled` : 'Loading…'}</Text>
          </div>
          <TextInput
            w={260}
            leftSection={<Search size={16} />}
            placeholder="Search students"
            value={q}
            onChange={(e) => setQ(e.currentTarget.value)}
          />
        </Group>

        <Stack gap="xs">
          {isLoading && !data ? (
            Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} height={68} radius="lg" />
            ))
          ) : data && data.students.length > 0 ? (
            data.students.map((s) => (
              <StudentRow key={s.id} s={s} onOpen={onOpenStudent} />
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
    </Container>
  );
}
