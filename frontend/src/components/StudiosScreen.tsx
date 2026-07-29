import { useMemo, useState } from 'react';
import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Container,
  Group,
  Modal,
  NumberInput,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { LayoutGrid, Pencil, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '../stores/auth';
import { useStudios } from '../hooks/useStudios';
import { useSubjects } from '../hooks/useSubjects';
import { useStaff } from '../hooks/useStaff';
import { createStudio, deleteStudio, updateStudio, type Studio } from '../api/client';

const YEAR_LABEL = ['', '1st Year', '2nd Year', '3rd Year', '4th Year', '5th Year'];

function StudioFormModal({ token, initial, onClose }: { token: string; initial?: Studio | null; onClose: () => void }) {
  const qc = useQueryClient();
  const isEdit = !!initial;
  const { data: subjectsData } = useSubjects('');
  const { data: staffData } = useStaff('');

  const [name, setName] = useState(initial?.name ?? '');
  const [year, setYear] = useState<number | null>(initial?.year ?? null);
  const [semester, setSemester] = useState<number | null>(initial?.semester ?? null);
  const [credits, setCredits] = useState<number>(initial?.credits ?? 0);
  const [subjectId, setSubjectId] = useState<string | null>(initial?.subject_id ? String(initial.subject_id) : null);
  const [coordId, setCoordId] = useState<string | null>(initial?.coordinator_staff_id ? String(initial.coordinator_staff_id) : null);

  // Studio subjects float to the top, but any subject can back a studio.
  const subjectOptions = useMemo(() => {
    const list = subjectsData?.subjects ?? [];
    return [...list]
      .sort((a, b) => (b.is_studio ?? 0) - (a.is_studio ?? 0))
      .map((s) => ({ value: String(s.id), label: `${s.name ?? 'Untitled'}${s.is_studio ? ' · studio' : ''}` }));
  }, [subjectsData]);
  const staffOptions = useMemo(
    () => (staffData?.staff ?? []).map((s) => ({ value: String(s.id), label: `${s.first_name ?? ''} ${s.last_name ?? ''}`.trim() || 'Unnamed' })),
    [staffData],
  );

  const data = {
    name,
    year,
    semester,
    credits,
    subject_id: subjectId ? Number(subjectId) : null,
    coordinator_staff_id: coordId ? Number(coordId) : null,
  };
  const save = useMutation({
    mutationFn: () => (isEdit ? updateStudio(token, initial!.id, data) : createStudio(token, data)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['studios'] }); onClose(); },
  });

  return (
    <Modal opened onClose={onClose} title={isEdit ? 'Edit Studio' : 'New Design Studio'} centered size="md">
      <Stack gap="sm">
        <TextInput label="Studio name" placeholder="Design Studio IV — Housing" value={name} onChange={(e) => setName(e.currentTarget.value)} required data-testid="studio-name" />
        <Group grow>
          <Select label="Year" placeholder="Year" clearable data={[1, 2, 3, 4, 5].map((y) => ({ value: String(y), label: YEAR_LABEL[y] }))} value={year ? String(year) : null} onChange={(v) => setYear(v ? Number(v) : null)} />
          <NumberInput label="Semester" placeholder="1–10" min={1} max={10} value={semester ?? undefined} onChange={(v) => setSemester(typeof v === 'number' ? v : null)} />
          <NumberInput label="Credits" min={0} max={30} value={credits} onChange={(v) => setCredits(typeof v === 'number' ? v : 0)} />
        </Group>
        <Select label="Backing subject" placeholder="Link the studio subject" data={subjectOptions} value={subjectId} onChange={setSubjectId} searchable clearable />
        <Select label="Studio coordinator" placeholder="Faculty in charge" data={staffOptions} value={coordId} onChange={setCoordId} searchable clearable />
        <Group justify="flex-end">
          <Button variant="subtle" onClick={onClose}>Cancel</Button>
          <Button loading={save.isPending} disabled={!name.trim()} onClick={() => save.mutate()} data-testid="studio-save">{isEdit ? 'Save' : 'Create studio'}</Button>
        </Group>
      </Stack>
    </Modal>
  );
}

export function StudiosScreen() {
  const token = useAuth((s) => s.token)!;
  const qc = useQueryClient();
  const { data } = useStudios();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Studio | null>(null);
  const del = useMutation({ mutationFn: (id: number) => deleteStudio(token, id), onSuccess: () => qc.invalidateQueries({ queryKey: ['studios'] }) });

  const studios = data?.studios ?? [];

  return (
    <Container size="xl" px={0}>
      <Stack gap="lg">
        <Group justify="space-between" align="flex-end">
          <Group gap="sm">
            <LayoutGrid size={20} color="var(--mantine-color-brand-6)" />
            <div>
              <Title order={2}>Design Studios</Title>
              <Text size="sm" c="dimmed">The credit-bearing spine of each semester — jury-assessed.</Text>
            </div>
          </Group>
          <Button leftSection={<Plus size={15} />} onClick={() => setCreating(true)} data-testid="studio-new">New Studio</Button>
        </Group>

        {studios.length > 0 ? (
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
            {studios.map((s) => (
              <Card key={s.id} withBorder data-testid="studio-card">
                <Group justify="space-between" wrap="nowrap" mb="xs">
                  <Text fw={700} truncate>{s.name}</Text>
                  <Group gap={2}>
                    <ActionIcon variant="subtle" onClick={() => setEditing(s)}><Pencil size={14} /></ActionIcon>
                    <ActionIcon variant="subtle" color="red" onClick={() => del.mutate(s.id)}><Trash2 size={14} /></ActionIcon>
                  </Group>
                </Group>
                <Group gap="xs" mb="xs">
                  {s.year ? <Badge size="xs" variant="light">{YEAR_LABEL[s.year] ?? `Year ${s.year}`}</Badge> : null}
                  {s.semester ? <Badge size="xs" variant="light" color="gray">Sem {s.semester}</Badge> : null}
                  <Badge size="xs" variant="light" color="teal">{s.credits} credits</Badge>
                </Group>
                {s.subject_name && <Text size="sm" c="dimmed" truncate>Subject: {s.subject_name}</Text>}
                {s.coordinator_name && s.coordinator_name.trim() && <Text size="xs" c="dimmed">Coordinator: {s.coordinator_name}</Text>}
              </Card>
            ))}
          </SimpleGrid>
        ) : (
          <Card withBorder>
            <Stack align="center" py="xl" gap="xs">
              <LayoutGrid size={36} strokeWidth={1.5} color="var(--mantine-color-gray-4)" />
              <Text fw={500}>No studios yet</Text>
              <Text size="sm" c="dimmed">Create a design studio for a year/semester and link its subject.</Text>
              <Button mt="xs" leftSection={<Plus size={14} />} onClick={() => setCreating(true)}>Create first studio</Button>
            </Stack>
          </Card>
        )}
      </Stack>

      {creating && <StudioFormModal token={token} onClose={() => setCreating(false)} />}
      {editing && <StudioFormModal token={token} initial={editing} onClose={() => setEditing(null)} />}
    </Container>
  );
}
