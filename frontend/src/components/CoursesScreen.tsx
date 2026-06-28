import { useState } from 'react';
import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Container,
  Group,
  Modal,
  Skeleton,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
  Title,
} from '@mantine/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Layers, Pencil, Plus, Trash2 } from 'lucide-react';
import type { Course } from '../api/client';
import { createCourse, updateCourse, deleteCourse } from '../api/client';
import { useCourses } from '../hooks/useCourses';
import { useAuth } from '../stores/auth';

function CourseFormModal({
  onClose,
  initial,
}: {
  onClose: () => void;
  initial?: Course | null;
}) {
  const token = useAuth((s) => s.token)!;
  const qc = useQueryClient();
  const isEdit = !!initial;
  const [name, setName] = useState(initial?.name ?? '');

  const invalidate = () => qc.invalidateQueries({ queryKey: ['courses'] });

  const create = useMutation({
    mutationFn: () => createCourse(token, { name }),
    onSuccess: () => { invalidate(); onClose(); },
  });
  const update = useMutation({
    mutationFn: () => updateCourse(token, initial!.id, { name }),
    onSuccess: () => { invalidate(); onClose(); },
  });

  const save = () => (isEdit ? update.mutate() : create.mutate());
  const busy = create.isPending || update.isPending;

  return (
    <Modal opened onClose={onClose} title={isEdit ? 'Edit Course' : 'New Course'} centered size="sm">
      <Stack gap="md">
        <TextInput
          label="Course / stream name"
          placeholder="e.g. CBSE — Class 8"
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          required
          data-testid="course-name-input"
          onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) save(); }}
        />
        <Group justify="flex-end">
          <Button variant="subtle" onClick={onClose} data-testid="course-form-cancel-button">Cancel</Button>
          <Button onClick={save} loading={busy} disabled={!name.trim()} data-testid="course-form-save-button">
            {isEdit ? 'Save' : 'Create course'}
          </Button>
        </Group>
        {(create.isError || update.isError) && (
          <Text size="xs" c="red" ta="center">Save failed</Text>
        )}
      </Stack>
    </Modal>
  );
}

export function CoursesScreen() {
  const token = useAuth((s) => s.token)!;
  const qc = useQueryClient();
  const { data, isLoading } = useCourses();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Course | null>(null);

  const doDelete = useMutation({
    mutationFn: (id: number) => deleteCourse(token, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['courses'] }),
  });

  return (
    <Container size="xl" px={0}>
      <Stack gap="lg">
        <Group justify="space-between" align="flex-end">
          <div>
            <Title order={2}>Courses</Title>
            <Text c="dimmed">{data ? `${data.total} courses` : 'Loading…'}</Text>
          </div>
          <Button leftSection={<Plus size={15} />} onClick={() => setCreating(true)} data-testid="course-new-button">
            New Course
          </Button>
        </Group>

        <Stack gap="xs">
          {isLoading && !data ? (
            Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} height={64} radius="lg" />
            ))
          ) : data && data.courses.length > 0 ? (
            data.courses.map((c) => (
              <Card key={c.id} data-testid="course-row" data-course-id={c.id}>
                <Group justify="space-between" wrap="nowrap">
                  <Group gap="md" wrap="nowrap" style={{ minWidth: 0 }}>
                    <ThemeIcon size={40} radius="md" variant="light" color="brand">
                      <Layers size={20} strokeWidth={1.9} />
                    </ThemeIcon>
                    <Text fw={600} truncate>
                      {c.name}
                    </Text>
                  </Group>
                  <Group gap="lg" wrap="nowrap">
                    <Badge variant="light" color="sky">
                      {c.subjects} subjects
                    </Badge>
                    <ActionIcon size="sm" variant="subtle" onClick={() => setEditing(c)} data-testid="course-edit-button">
                      <Pencil size={13} />
                    </ActionIcon>
                    <ActionIcon size="sm" variant="subtle" color="red" onClick={() => doDelete.mutate(c.id)} data-testid="course-delete-button">
                      <Trash2 size={13} />
                    </ActionIcon>
                  </Group>
                </Group>
              </Card>
            ))
          ) : (
            <Card data-testid="courses-empty">
              <Stack align="center" py="xl" gap="xs">
                <Layers size={36} strokeWidth={1.5} color="var(--mantine-color-gray-4)" />
                <Text fw={500}>No courses yet</Text>
                <Button mt="xs" leftSection={<Plus size={14} />} onClick={() => setCreating(true)}>
                  Create first course
                </Button>
              </Stack>
            </Card>
          )}
        </Stack>
      </Stack>

      {creating && <CourseFormModal onClose={() => setCreating(false)} />}
      {editing && <CourseFormModal initial={editing} onClose={() => setEditing(null)} />}
    </Container>
  );
}
