import { useState } from 'react';
import {
  Badge,
  Button,
  Card,
  Container,
  Group,
  Modal,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { GraduationCap, Plus } from 'lucide-react';
import { api } from '../api/client';

function AddClassModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [grade, setGrade] = useState('');

  const create = useMutation({
    mutationFn: () => api.createClass({ name, grade_level: grade || undefined }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['classes'] }); onClose(); },
  });

  return (
    <Modal opened onClose={onClose} title="Add Class" centered size="sm">
      <Stack gap="md">
        <TextInput label="Class name" placeholder="Class 9" value={name} onChange={(e) => setName(e.target.value)} required />
        <TextInput label="Grade level" placeholder="9" value={grade} onChange={(e) => setGrade(e.target.value)} />
        <Button onClick={() => create.mutate()} loading={create.isPending} disabled={!name.trim()}>Create</Button>
      </Stack>
    </Modal>
  );
}

function AddSectionModal({ classId, className, onClose }: { classId: number; className: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [capacity, setCapacity] = useState('40');

  const create = useMutation({
    mutationFn: () => api.createSection({ class_id: classId, name, capacity: Number(capacity) || undefined }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['classes'] }); onClose(); },
  });

  return (
    <Modal opened onClose={onClose} title={`Add Section — ${className}`} centered size="sm">
      <Stack gap="md">
        <TextInput label="Section name" placeholder="A" value={name} onChange={(e) => setName(e.target.value)} required />
        <TextInput label="Capacity" value={capacity} onChange={(e) => setCapacity(e.target.value)} />
        <Button onClick={() => create.mutate()} loading={create.isPending} disabled={!name.trim()}>Create</Button>
      </Stack>
    </Modal>
  );
}

export function SetupPage() {
  const [showClass, setShowClass] = useState(false);
  const [addSection, setAddSection] = useState<{ id: number; name: string } | null>(null);
  const { data, isLoading } = useQuery({ queryKey: ['classes'], queryFn: () => api.fetchClasses() });

  return (
    <Container size="lg" px={0}>
      <Stack gap="lg">
        <Group justify="space-between">
          <div>
            <Title order={2}>Classes & Sections</Title>
            <Text c="dimmed">Timetables are built per section (e.g. Class 8 — Section A)</Text>
          </div>
          <Button leftSection={<Plus size={14} />} onClick={() => setShowClass(true)}>Add Class</Button>
        </Group>

        {isLoading ? <Text c="dimmed">Loading…</Text> : (
          <Stack gap="md">
            {(data?.classes ?? []).map((cls) => (
              <Card key={cls.id}>
                <Group justify="space-between" mb="md">
                  <Group gap="xs">
                    <GraduationCap size={18} color="#3E7B7B" />
                    <Text fw={600}>{cls.name}</Text>
                    {cls.grade_level && <Badge variant="light" color="sky" size="sm">Grade {cls.grade_level}</Badge>}
                  </Group>
                  <Button size="xs" variant="light" leftSection={<Plus size={12} />}
                    onClick={() => setAddSection({ id: cls.id, name: cls.name ?? '' })}>
                    Add Section
                  </Button>
                </Group>
                <Group gap="sm">
                  {cls.sections.map((sec) => (
                    <Badge key={sec.id} size="lg" variant="outline" color="brand">
                      Section {sec.name}
                      {sec.capacity ? ` · ${sec.capacity}` : ''}
                    </Badge>
                  ))}
                  {cls.sections.length === 0 && <Text size="sm" c="dimmed">No sections yet</Text>}
                </Group>
              </Card>
            ))}
          </Stack>
        )}
      </Stack>
      {showClass && <AddClassModal onClose={() => setShowClass(false)} />}
      {addSection && <AddSectionModal classId={addSection.id} className={addSection.name} onClose={() => setAddSection(null)} />}
    </Container>
  );
}
