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
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Book, Pencil, Plus, Trash2 } from 'lucide-react';
import { api, type Subject } from '../api/client';

const SUBJECT_TYPES = ['Core', 'Language', 'Lab', 'Elective', 'Sports', 'Activity'];
const TYPE_COLOR: Record<string, string> = {
  Core: 'brand', Language: 'lavender', Lab: 'mint', Sports: 'peach', Activity: 'yellow', Elective: 'sky',
};

function SubjectFormModal({ onClose, initial }: { onClose: () => void; initial?: Subject | null }) {
  const qc = useQueryClient();
  const isEdit = !!initial;
  const [name, setName] = useState(initial?.name ?? '');
  const [code, setCode] = useState(initial?.code ?? '');
  const [type, setType] = useState<string | null>(initial?.type ?? null);
  const [weeklyPeriods, setWeeklyPeriods] = useState<number | string>(initial?.weekly_periods ?? 0);
  const [isLab, setIsLab] = useState(initial?.is_lab === 1);

  const save = useMutation({
    mutationFn: () => isEdit
      ? api.updateSubject(initial!.id, { name, code: code || undefined, type: type || undefined, weekly_periods: Number(weeklyPeriods) || 0, is_lab: isLab ? 1 : 0 })
      : api.createSubject({ name, code: code || undefined, type: type || undefined, weekly_periods: Number(weeklyPeriods) || 0, is_lab: isLab ? 1 : 0 }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['subjects'] }); qc.invalidateQueries({ queryKey: ['teacher-subjects'] }); onClose(); },
  });

  return (
    <Modal opened onClose={onClose} title={isEdit ? `Edit — ${initial?.name}` : 'New Subject'} centered size="sm">
      <Stack gap="md">
        <Group grow>
          <TextInput label="Subject name" value={name} onChange={(e) => setName(e.target.value)} required />
          <TextInput label="Code" placeholder="MATH" value={code} onChange={(e) => setCode(e.target.value)} />
        </Group>
        <Select label="Type" placeholder="Select type…" data={SUBJECT_TYPES} value={type} onChange={setType} clearable />
        <NumberInput label="Weekly periods (quota target)" value={weeklyPeriods} onChange={setWeeklyPeriods} min={0} max={40} />
        <Checkbox label="Lab subject" checked={isLab} onChange={(e) => setIsLab(e.currentTarget.checked)} />
        <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!name.trim()}>{isEdit ? 'Save' : 'Create'}</Button>
      </Stack>
    </Modal>
  );
}

export function SubjectsPage() {
  const qc = useQueryClient();
  const [modal, setModal] = useState<Subject | null | 'new'>(null);
  const { data, isLoading } = useQuery({ queryKey: ['subjects'], queryFn: () => api.fetchSubjects() });

  const remove = useMutation({
    mutationFn: (id: number) => api.deleteSubject(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['subjects'] }),
  });

  const subjects = data?.subjects ?? [];

  return (
    <Container size="lg" px={0}>
      <Stack gap="lg">
        <Group justify="space-between">
          <div>
            <Title order={2}>Subjects</Title>
            <Text c="dimmed">{subjects.length} subjects · weekly period targets drive quota tracking</Text>
          </div>
          <Button leftSection={<Plus size={14} />} onClick={() => setModal('new')}>Add Subject</Button>
        </Group>

        {isLoading ? <Text c="dimmed">Loading…</Text> : (
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
            {subjects.map((s) => (
              <Card key={s.id}>
                <Group justify="space-between" mb="xs">
                  <Group gap="xs">
                    <Book size={16} color="#3E7B7B" />
                    <Text fw={600} size="sm">{s.name}</Text>
                  </Group>
                  <Group gap={4}>
                    <ActionIcon size="sm" variant="subtle" onClick={() => setModal(s)}><Pencil size={14} /></ActionIcon>
                    <ActionIcon size="sm" variant="subtle" color="red" onClick={() => remove.mutate(s.id)} loading={remove.isPending}><Trash2 size={14} /></ActionIcon>
                  </Group>
                </Group>
                <Group gap="xs">
                  {s.code && <Badge variant="outline" color="gray" size="sm">{s.code}</Badge>}
                  {s.type && <Badge color={TYPE_COLOR[s.type] ?? 'gray'} size="sm">{s.type}</Badge>}
                  {s.is_lab === 1 && <Badge color="mint" size="sm">Lab</Badge>}
                </Group>
                {(s.weekly_periods ?? 0) > 0 && (
                  <Text size="xs" c="dimmed" mt="sm">{s.weekly_periods} periods/week target</Text>
                )}
              </Card>
            ))}
          </SimpleGrid>
        )}
      </Stack>
      {modal && <SubjectFormModal onClose={() => setModal(null)} initial={modal === 'new' ? null : modal} />}
    </Container>
  );
}
