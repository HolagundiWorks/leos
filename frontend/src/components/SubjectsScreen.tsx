import { useState } from 'react';
import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Checkbox,
  Container,
  Group,
  Modal,
  NumberInput,
  Select,
  Skeleton,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
  Title,
} from '@mantine/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Book, FlaskConical, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import type { Subject, SubjectFormData } from '../api/client';
import { createSubject, updateSubject, deleteSubject } from '../api/client';
import { useSubjects } from '../hooks/useSubjects';
import { useCourses } from '../hooks/useCourses';
import { useAuth } from '../stores/auth';
import type { AccentColor } from '../theme';

const SUBJECT_TYPES = ['Core', 'Language', 'Lab', 'Elective', 'Sports', 'Activity'];

const TYPE_COLOR: Record<string, AccentColor> = {
  Core: 'brand',
  Language: 'lavender',
  Lab: 'mint',
  Sports: 'peach',
  Activity: 'yellow',
  Elective: 'sky',
};

// ─── Subject form modal ───────────────────────────────────────────────────────
function SubjectFormModal({
  onClose,
  initial,
}: {
  onClose: () => void;
  initial?: Subject | null;
}) {
  const token = useAuth((s) => s.token)!;
  const qc = useQueryClient();
  const { data: coursesData } = useCourses();
  const isEdit = !!initial;

  const [name, setName] = useState(initial?.name ?? '');
  const [code, setCode] = useState(initial?.code ?? '');
  const [type, setType] = useState<string | null>(initial?.type ?? null);
  const [courseId, setCourseId] = useState<string | null>(initial?.course_id ? String(initial.course_id) : null);
  const [weeklyPeriods, setWeeklyPeriods] = useState<number | string>(initial?.weekly_periods ?? 0);
  const [isLab, setIsLab] = useState(initial?.is_lab === 1);
  const [mandatory, setMandatory] = useState(initial ? (initial as unknown as { mandatory?: number }).mandatory !== 0 : true);

  const courseOptions = (coursesData?.courses ?? []).map((c) => ({
    value: String(c.id),
    label: c.name ?? '',
  }));

  const payload = (): SubjectFormData => ({
    name,
    code: code || undefined,
    type: type || undefined,
    course_id: courseId ? Number(courseId) : null,
    weekly_periods: Number(weeklyPeriods) || 0,
    is_lab: isLab,
    mandatory,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['subjects'] });
    qc.invalidateQueries({ queryKey: ['teacher-subjects'] });
  };

  const create = useMutation({
    mutationFn: () => createSubject(token, payload()),
    onSuccess: () => { invalidate(); onClose(); },
  });
  const update = useMutation({
    mutationFn: () => updateSubject(token, initial!.id, payload()),
    onSuccess: () => { invalidate(); onClose(); },
  });

  const save = () => (isEdit ? update.mutate() : create.mutate());
  const busy = create.isPending || update.isPending;

  return (
    <Modal opened onClose={onClose} title={isEdit ? `Edit — ${initial?.name}` : 'New Subject'} centered size="sm">
      <Stack gap="md">
        <Group grow>
          <TextInput label="Subject name" placeholder="Mathematics" value={name} onChange={(e) => setName(e.currentTarget.value)} required />
          <TextInput label="Code" placeholder="MATH" value={code} onChange={(e) => setCode(e.currentTarget.value)} />
        </Group>

        <Group grow>
          <Select
            label="Type"
            placeholder="Select type…"
            data={SUBJECT_TYPES}
            value={type}
            onChange={setType}
            clearable
          />
          <Select
            label="Course / stream"
            placeholder="None"
            data={courseOptions}
            value={courseId}
            onChange={setCourseId}
            clearable
          />
        </Group>

        <Group grow align="flex-end">
          <NumberInput
            label="Periods per week"
            placeholder="5"
            value={weeklyPeriods}
            onChange={setWeeklyPeriods}
            min={0}
            max={40}
          />
          <Stack gap={8} pt={4}>
            <Checkbox label="Lab / practical subject" checked={isLab} onChange={(e) => { setIsLab(e.currentTarget.checked); if (e.currentTarget.checked) setType('Lab'); }} />
            <Checkbox label="Mandatory" checked={mandatory} onChange={(e) => setMandatory(e.currentTarget.checked)} />
          </Stack>
        </Group>

        <Group justify="flex-end">
          <Button variant="subtle" onClick={onClose}>Cancel</Button>
          <Button onClick={save} loading={busy} disabled={!name.trim()}>
            {isEdit ? 'Save changes' : 'Create subject'}
          </Button>
        </Group>

        {(create.isError || update.isError) && (
          <Text size="xs" c="red" ta="center">Save failed</Text>
        )}
      </Stack>
    </Modal>
  );
}

// ─── Subject row ──────────────────────────────────────────────────────────────
function SubjectRow({
  s,
  onEdit,
  onDelete,
}: {
  s: Subject;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const color: AccentColor = (s.type && TYPE_COLOR[s.type]) || 'sky';
  return (
    <Card>
      <Group justify="space-between" wrap="nowrap">
        <Group gap="md" wrap="nowrap" style={{ minWidth: 0 }}>
          <ThemeIcon size={40} radius="md" variant="light" color={color}>
            {s.is_lab ? <FlaskConical size={18} strokeWidth={1.9} /> : <Book size={18} strokeWidth={1.9} />}
          </ThemeIcon>
          <div style={{ minWidth: 0 }}>
            <Text fw={600} truncate>{s.name}</Text>
            <Text size="sm" c="dimmed">{s.code ?? '—'}</Text>
          </div>
        </Group>
        <Group gap="lg" wrap="nowrap" visibleFrom="sm">
          {s.type && <Badge variant="light" color={color}>{s.type}</Badge>}
          <Text size="sm" c="dimmed">{s.weekly_periods}/week</Text>
          <ActionIcon size="sm" variant="subtle" onClick={onEdit}><Pencil size={13} /></ActionIcon>
          <ActionIcon size="sm" variant="subtle" color="red" onClick={onDelete}><Trash2 size={13} /></ActionIcon>
        </Group>
      </Group>
    </Card>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────
export function SubjectsScreen() {
  const token = useAuth((s) => s.token)!;
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Subject | null>(null);
  const { data, isLoading } = useSubjects(q);

  const doDelete = useMutation({
    mutationFn: (id: number) => deleteSubject(token, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['subjects'] });
      qc.invalidateQueries({ queryKey: ['teacher-subjects'] });
    },
  });

  return (
    <Container size="xl" px={0}>
      <Stack gap="lg">
        <Group justify="space-between" align="flex-end" wrap="nowrap">
          <div>
            <Title order={2}>Subjects</Title>
            <Text c="dimmed">{data ? `${data.total} subjects` : 'Loading…'}</Text>
          </div>
          <Group gap="sm" wrap="nowrap">
            <TextInput
              w={220}
              leftSection={<Search size={16} />}
              placeholder="Search subjects"
              value={q}
              onChange={(e) => setQ(e.currentTarget.value)}
            />
            <Button leftSection={<Plus size={15} />} onClick={() => setCreating(true)}>
              New Subject
            </Button>
          </Group>
        </Group>

        <Stack gap="xs">
          {isLoading && !data ? (
            Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} height={68} radius="lg" />)
          ) : data && data.subjects.length > 0 ? (
            data.subjects.map((s) => (
              <SubjectRow
                key={s.id}
                s={s}
                onEdit={() => setEditing(s)}
                onDelete={() => doDelete.mutate(s.id)}
              />
            ))
          ) : (
            <Card>
              <Stack align="center" py="xl" gap="xs">
                <Book size={36} strokeWidth={1.5} color="var(--mantine-color-gray-4)" />
                <Text fw={500}>No subjects found</Text>
                <Button mt="xs" leftSection={<Plus size={14} />} onClick={() => setCreating(true)}>
                  Create first subject
                </Button>
              </Stack>
            </Card>
          )}
        </Stack>
      </Stack>

      {creating && <SubjectFormModal onClose={() => setCreating(false)} />}
      {editing && <SubjectFormModal initial={editing} onClose={() => setEditing(null)} />}
    </Container>
  );
}
