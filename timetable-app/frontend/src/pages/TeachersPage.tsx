import { useState } from 'react';
import {
  ActionIcon,
  Button,
  Card,
  Container,
  Group,
  Modal,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, User } from 'lucide-react';
import { api } from '../api/client';

function AddTeacherModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');

  const create = useMutation({
    mutationFn: () => api.createStaff({ first_name: firstName, last_name: lastName || undefined, email: email || undefined }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['staff'] }); onClose(); },
  });

  return (
    <Modal opened onClose={onClose} title="Add Teacher" centered size="sm">
      <Stack gap="md">
        <TextInput label="First name" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
        <TextInput label="Last name" value={lastName} onChange={(e) => setLastName(e.target.value)} />
        <TextInput label="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Button onClick={() => create.mutate()} loading={create.isPending} disabled={!firstName.trim()}>Add</Button>
      </Stack>
    </Modal>
  );
}

export function TeachersPage() {
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const { data, isLoading } = useQuery({ queryKey: ['staff'], queryFn: () => api.fetchStaff() });

  const remove = useMutation({
    mutationFn: (id: number) => api.deleteStaff(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['staff'] });
      qc.invalidateQueries({ queryKey: ['teacher-subjects'] });
    },
  });

  const teachers = data?.staff ?? [];

  return (
    <Container size="lg" px={0}>
      <Stack gap="lg">
        <Group justify="space-between">
          <div>
            <Title order={2}>Teachers</Title>
            <Text c="dimmed">{teachers.length} staff members</Text>
          </div>
          <Button leftSection={<Plus size={14} />} onClick={() => setShowAdd(true)}>Add Teacher</Button>
        </Group>

        {isLoading ? <Text c="dimmed">Loading…</Text> : (
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
            {teachers.map((t) => (
              <Card key={t.id}>
                <Group justify="space-between">
                  <Group gap="xs">
                    <User size={16} color="#3E7B7B" />
                    <div>
                      <Text fw={600} size="sm">{t.first_name} {t.last_name ?? ''}</Text>
                      {t.email && <Text size="xs" c="dimmed">{t.email}</Text>}
                    </div>
                  </Group>
                  <ActionIcon size="sm" variant="subtle" color="red" onClick={() => remove.mutate(t.id)} loading={remove.isPending}>
                    <Trash2 size={14} />
                  </ActionIcon>
                </Group>
              </Card>
            ))}
          </SimpleGrid>
        )}
      </Stack>
      {showAdd && <AddTeacherModal onClose={() => setShowAdd(false)} />}
    </Container>
  );
}
