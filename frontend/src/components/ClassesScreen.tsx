import { useState } from 'react';
import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Collapse,
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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, DoorOpen, LayoutGrid, Pencil, Plus, Trash2, UserMinus, UserRound, Users } from 'lucide-react';
import type { ClassRow, Section } from '../api/client';
import {
  createClass, updateClass, deleteClass,
  createSection, updateSection, deleteSection,
  fetchSectionStudents, enrollSectionStudent, removeSectionStudent,
} from '../api/client';
import { useClasses } from '../hooks/useClasses';
import { useStaff } from '../hooks/useStaff';
import { useStudents } from '../hooks/useStudents';
import { useClassrooms } from '../hooks/useClassrooms';
import { useAuth } from '../stores/auth';

// ─── Section roster modal: map students into a class/section ──────────────────
function SectionRosterModal({
  section,
  classLabel,
  onClose,
}: {
  section: Section;
  classLabel: string;
  onClose: () => void;
}) {
  const token = useAuth((s) => s.token)!;
  const qc = useQueryClient();
  const [toAdd, setToAdd] = useState<string | null>(null);

  const roster = useQuery({
    queryKey: ['section-students', section.id],
    queryFn: () => fetchSectionStudents(token, section.id),
  });
  const { data: allStudents } = useStudents('');

  const enrolledIds = new Set((roster.data?.students ?? []).map((s) => s.id));
  const candidates = (allStudents?.students ?? [])
    .filter((s) => !enrolledIds.has(s.id))
    .map((s) => ({ value: String(s.id), label: `${s.first_name} ${s.last_name}` }));

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['section-students', section.id] });
    qc.invalidateQueries({ queryKey: ['students'] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const add = useMutation({
    mutationFn: (studentId: number) =>
      enrollSectionStudent(token, { section_id: section.id, student_id: studentId }),
    onSuccess: () => { invalidate(); setToAdd(null); },
  });
  const remove = useMutation({
    mutationFn: (studentId: number) =>
      removeSectionStudent(token, { section_id: section.id, student_id: studentId }),
    onSuccess: invalidate,
  });

  const enrolled = roster.data?.students ?? [];

  return (
    <Modal opened onClose={onClose} title={`Roster — ${classLabel} · ${section.name}`} centered size="md">
      <Stack gap="md">
        <Group gap="sm" align="flex-end" wrap="nowrap">
          <Select
            label="Add a student to this section"
            placeholder={candidates.length ? 'Search students…' : 'All students already enrolled'}
            data={candidates}
            value={toAdd}
            onChange={setToAdd}
            searchable
            clearable
            disabled={candidates.length === 0}
            style={{ flex: 1 }}
            data-testid="roster-add-select"
          />
          <Button
            leftSection={<Plus size={15} />}
            disabled={!toAdd}
            loading={add.isPending}
            onClick={() => toAdd && add.mutate(Number(toAdd))}
            data-testid="roster-add-button"
          >
            Add
          </Button>
        </Group>

        <Text size="sm" c="dimmed">{enrolled.length} enrolled</Text>

        <Stack gap={6} data-testid="roster-list">
          {roster.isLoading ? (
            <Skeleton height={40} radius="md" />
          ) : enrolled.length > 0 ? (
            enrolled.map((s) => (
              <Group
                key={s.id}
                data-testid="roster-student-row"
                justify="space-between"
                px="sm"
                py={6}
                style={{ borderRadius: 8, background: 'var(--mantine-color-gray-0)' }}
              >
                <Text size="sm" fw={500}>{s.first_name} {s.last_name}</Text>
                <ActionIcon
                  variant="subtle"
                  color="red"
                  onClick={() => remove.mutate(s.id)}
                  title="Remove from section"
                  data-testid="roster-remove-button"
                >
                  <UserMinus size={15} />
                </ActionIcon>
              </Group>
            ))
          ) : (
            <Text size="sm" c="dimmed" ta="center" py="md">No students in this section yet.</Text>
          )}
        </Stack>
      </Stack>
    </Modal>
  );
}

// ─── Class form modal ────────────────────────────────────────────────────────
function ClassFormModal({
  onClose,
  initial,
}: {
  onClose: () => void;
  initial?: { id: number; name: string | null; grade_level: string | null } | null;
}) {
  const token = useAuth((s) => s.token)!;
  const qc = useQueryClient();
  const [name, setName] = useState(initial?.name ?? '');
  const [grade, setGrade] = useState(initial?.grade_level ?? '');
  const isEdit = !!initial;

  const invalidate = () => qc.invalidateQueries({ queryKey: ['classes'] });

  const create = useMutation({
    mutationFn: () => createClass(token, { name, grade_level: grade || undefined }),
    onSuccess: () => { invalidate(); onClose(); },
  });
  const update = useMutation({
    mutationFn: () => updateClass(token, initial!.id, { name: name || undefined, grade_level: grade || undefined }),
    onSuccess: () => { invalidate(); onClose(); },
  });

  const save = () => (isEdit ? update.mutate() : create.mutate());
  const busy = create.isPending || update.isPending;

  return (
    <Modal opened onClose={onClose} title={isEdit ? 'Edit Class' : 'New Class'} centered size="sm">
      <Stack gap="md">
        <TextInput label="Class name" placeholder="e.g. Grade 8" value={name} onChange={(e) => setName(e.currentTarget.value)} required data-testid="class-name-input" />
        <TextInput label="Grade / level" placeholder="e.g. 8" value={grade} onChange={(e) => setGrade(e.currentTarget.value)} data-testid="class-grade-input" />
        <Group justify="flex-end">
          <Button variant="subtle" onClick={onClose} data-testid="class-form-cancel-button">Cancel</Button>
          <Button onClick={save} loading={busy} disabled={!name.trim()} data-testid="class-form-save-button">{isEdit ? 'Save' : 'Create class'}</Button>
        </Group>
      </Stack>
    </Modal>
  );
}

// ─── Section form modal ──────────────────────────────────────────────────────
function SectionFormModal({
  onClose,
  classId,
  initial,
}: {
  onClose: () => void;
  classId: number;
  initial?: Section | null;
}) {
  const token = useAuth((s) => s.token)!;
  const qc = useQueryClient();
  const { data: staffData } = useStaff('');
  const { data: roomsData } = useClassrooms();
  const isEdit = !!initial;

  const [name, setName] = useState(initial?.name ?? '');
  const [teacherId, setTeacherId] = useState<string | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [capacity, setCapacity] = useState<number | string>(initial?.capacity ?? '');

  const staffOptions = (staffData?.staff ?? []).map((s) => ({
    value: String(s.id),
    label: `${s.first_name ?? ''} ${s.last_name ?? ''}`.trim(),
  }));
  const roomOptions = (roomsData?.classrooms ?? []).map((r) => ({
    value: String(r.id),
    label: `${r.name ?? ''}${r.capacity ? ` (${r.capacity} seats)` : ''}`,
  }));

  const invalidate = () => qc.invalidateQueries({ queryKey: ['classes'] });

  const create = useMutation({
    mutationFn: () => createSection(token, {
      class_id: classId,
      name,
      teacher_id: teacherId ? Number(teacherId) : null,
      room_id: roomId ? Number(roomId) : null,
      capacity: capacity !== '' ? Number(capacity) : null,
    }),
    onSuccess: () => { invalidate(); onClose(); },
  });

  const update = useMutation({
    mutationFn: () => updateSection(token, initial!.id, {
      name: name || undefined,
      teacher_id: teacherId ? Number(teacherId) : null,
      room_id: roomId ? Number(roomId) : null,
      capacity: capacity !== '' ? Number(capacity) : null,
    }),
    onSuccess: () => { invalidate(); onClose(); },
  });

  const save = () => (isEdit ? update.mutate() : create.mutate());
  const busy = create.isPending || update.isPending;

  return (
    <Modal opened onClose={onClose} title={isEdit ? 'Edit Section' : 'Add Section'} centered size="sm">
      <Stack gap="md">
        <TextInput label="Section name" placeholder="e.g. A" value={name} onChange={(e) => setName(e.currentTarget.value)} required data-testid="section-name-input" />
        <Select label="Class teacher" placeholder="Assign teacher…" data={staffOptions} value={teacherId} onChange={setTeacherId} clearable searchable />
        <Select label="Classroom" placeholder="Assign room…" data={roomOptions} value={roomId} onChange={setRoomId} clearable searchable />
        <NumberInput label="Capacity" placeholder="40" value={capacity} onChange={setCapacity} min={1} max={999} />
        <Group justify="flex-end">
          <Button variant="subtle" onClick={onClose} data-testid="section-form-cancel-button">Cancel</Button>
          <Button onClick={save} loading={busy} disabled={!name.trim()} data-testid="section-form-save-button">{isEdit ? 'Save' : 'Add section'}</Button>
        </Group>
      </Stack>
    </Modal>
  );
}

// ─── Section row ─────────────────────────────────────────────────────────────
function SectionRow({
  grade,
  s,
  onEdit,
  onDelete,
  onRoster,
}: {
  grade: string | null;
  s: Section;
  onEdit: () => void;
  onDelete: () => void;
  onRoster: () => void;
}) {
  return (
    <Group
      data-testid="section-row"
      data-section-id={s.id}
      justify="space-between"
      wrap="nowrap"
      px="sm"
      py={8}
      style={{ borderRadius: 8, background: 'var(--mantine-color-gray-0)' }}
    >
      <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
        <Badge variant="light" color="brand" radius="sm">
          {grade ? `${grade}–${s.name}` : s.name}
        </Badge>
        <Group gap={4} wrap="nowrap" style={{ minWidth: 0 }}>
          <UserRound size={14} color="var(--mantine-color-gray-5)" />
          <Text size="sm" c="dimmed" truncate>{s.teacher ?? 'No class teacher'}</Text>
        </Group>
        {s.room && (
          <Group gap={4} wrap="nowrap">
            <DoorOpen size={14} color="var(--mantine-color-gray-5)" />
            <Text size="sm" c="dimmed">{s.room}</Text>
          </Group>
        )}
        {s.capacity && (
          <Badge variant="outline" color="gray" size="xs">{s.capacity} seats</Badge>
        )}
      </Group>
      <Group gap={4}>
        <ActionIcon size="sm" variant="subtle" onClick={onRoster} title="Manage students" data-testid="section-roster-button">
          <Users size={13} />
        </ActionIcon>
        <ActionIcon size="sm" variant="subtle" onClick={onEdit} title="Edit section" data-testid="section-edit-button">
          <Pencil size={13} />
        </ActionIcon>
        <ActionIcon size="sm" variant="subtle" color="red" onClick={onDelete} title="Delete section" data-testid="section-delete-button">
          <Trash2 size={13} />
        </ActionIcon>
      </Group>
    </Group>
  );
}

// ─── Class card ──────────────────────────────────────────────────────────────
function ClassCard({ cls }: { cls: ClassRow }) {
  const token = useAuth((s) => s.token)!;
  const qc = useQueryClient();
  const [open, setOpen] = useState(true);
  const [editingClass, setEditingClass] = useState(false);
  const [addingSection, setAddingSection] = useState(false);
  const [editingSection, setEditingSection] = useState<Section | null>(null);
  const [rosterSection, setRosterSection] = useState<Section | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: ['classes'] });

  const doDeleteClass = useMutation({
    mutationFn: () => deleteClass(token, cls.id),
    onSuccess: invalidate,
  });

  const doDeleteSection = useMutation({
    mutationFn: (id: number) => deleteSection(token, id),
    onSuccess: invalidate,
  });

  return (
    <>
      <Card withBorder data-testid="class-card" data-class-id={cls.id}>
        <Group justify="space-between" wrap="nowrap" mb={open && cls.sections.length > 0 ? 'sm' : 0}>
          <Group gap="sm" wrap="nowrap">
            <ThemeIcon size={32} radius="md" variant="light" color="brand">
              <LayoutGrid size={17} />
            </ThemeIcon>
            <div>
              <Text fw={700}>{cls.name}</Text>
              {cls.grade_level && <Text size="xs" c="dimmed">Grade {cls.grade_level}</Text>}
            </div>
            <Badge variant="light" color="gray" size="sm">{cls.sections.length} sections</Badge>
          </Group>
          <Group gap={4}>
            <Button size="xs" variant="subtle" leftSection={<Plus size={12} />} onClick={() => setAddingSection(true)} data-testid="class-add-section-button">
              Section
            </Button>
            <ActionIcon size="sm" variant="subtle" onClick={() => setEditingClass(true)} data-testid="class-edit-button">
              <Pencil size={13} />
            </ActionIcon>
            <ActionIcon
              size="sm"
              variant="subtle"
              color="red"
              onClick={() => doDeleteClass.mutate()}
              loading={doDeleteClass.isPending}
              title="Delete class (and all its sections)"
              data-testid="class-delete-button"
            >
              <Trash2 size={13} />
            </ActionIcon>
            <ActionIcon size="sm" variant="subtle" onClick={() => setOpen((o) => !o)}>
              {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </ActionIcon>
          </Group>
        </Group>

        <Collapse in={open}>
          <Stack gap={4}>
            {cls.sections.map((s) => (
              <SectionRow
                key={s.id}
                grade={cls.grade_level}
                s={s}
                onEdit={() => setEditingSection(s)}
                onDelete={() => doDeleteSection.mutate(s.id)}
                onRoster={() => setRosterSection(s)}
              />
            ))}
            {cls.sections.length === 0 && (
              <Text size="sm" c="dimmed" pl={4}>No sections yet.</Text>
            )}
          </Stack>
        </Collapse>
      </Card>

      {editingClass && (
        <ClassFormModal initial={cls} onClose={() => setEditingClass(false)} />
      )}
      {addingSection && (
        <SectionFormModal classId={cls.id} onClose={() => setAddingSection(false)} />
      )}
      {editingSection && (
        <SectionFormModal classId={cls.id} initial={editingSection} onClose={() => setEditingSection(null)} />
      )}
      {rosterSection && (
        <SectionRosterModal
          section={rosterSection}
          classLabel={cls.name ?? 'Class'}
          onClose={() => setRosterSection(null)}
        />
      )}
    </>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────
export function ClassesScreen() {
  const { data, isLoading } = useClasses();
  const [creating, setCreating] = useState(false);

  return (
    <Container size="xl" px={0}>
      <Stack gap="lg">
        <Group justify="space-between" align="flex-end">
          <div>
            <Title order={2}>Classes &amp; Sections</Title>
            <Text c="dimmed">
              {data ? `${data.total} classes · click pencil to edit, trash to delete` : 'Loading…'}
            </Text>
          </div>
          <Button leftSection={<Plus size={15} />} onClick={() => setCreating(true)} data-testid="class-new-button">
            New Class
          </Button>
        </Group>

        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} height={80} radius="md" />)
        ) : data && data.classes.length > 0 ? (
          data.classes.map((cls) => <ClassCard key={cls.id} cls={cls} />)
        ) : (
          <Card withBorder>
            <Stack align="center" py="xl" gap="xs">
              <LayoutGrid size={36} strokeWidth={1.5} color="var(--mantine-color-gray-4)" />
              <Text fw={500}>No classes configured</Text>
              <Button mt="xs" leftSection={<Plus size={14} />} onClick={() => setCreating(true)}>
                Create first class
              </Button>
            </Stack>
          </Card>
        )}
      </Stack>

      {creating && <ClassFormModal onClose={() => setCreating(false)} />}
    </Container>
  );
}
