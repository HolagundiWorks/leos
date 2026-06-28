import { useMemo, useState } from 'react';
import {
  ActionIcon,
  Autocomplete,
  Avatar,
  Badge,
  Button,
  Card,
  Container,
  Group,
  Modal,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Textarea,
  Title,
} from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, Pencil, Plus, Trash2, UserMinus, Users } from 'lucide-react';
import { useAuth } from '../stores/auth';
import {
  addClubMember, createClub, deleteClub, fetchClubMembers, fetchClubs, fetchStudents,
  removeClubMember, updateClub, type Club,
} from '../api/client';
import { ImageUpload } from './ImageUpload';

function ClubFormModal({ token, initial, onClose }: { token: string; initial?: Club | null; onClose: () => void }) {
  const qc = useQueryClient();
  const isEdit = !!initial;
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [logo, setLogo] = useState<string | null>(initial?.logo ?? null);
  const [lead, setLead] = useState(initial?.lead_staff ?? '');
  const [day, setDay] = useState(initial?.meeting_day ?? '');

  const data = { name, description, logo, lead_staff: lead, meeting_day: day };
  const save = useMutation({
    mutationFn: () => (isEdit ? updateClub(token, initial!.id, data) : createClub(token, data)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['clubs'] }); onClose(); },
  });

  return (
    <Modal opened onClose={onClose} title={isEdit ? 'Edit Club' : 'New Club'} centered size="md">
      <Stack gap="sm">
        <TextInput label="Club name" placeholder="Robotics Club" value={name} onChange={(e) => setName(e.currentTarget.value)} required data-testid="club-name" />
        <Textarea label="Description" autosize minRows={2} value={description} onChange={(e) => setDescription(e.currentTarget.value)} />
        <Group grow>
          <TextInput label="Faculty lead" placeholder="Ms. Priya" value={lead} onChange={(e) => setLead(e.currentTarget.value)} />
          <TextInput label="Meeting day" placeholder="Friday 3pm" value={day} onChange={(e) => setDay(e.currentTarget.value)} />
        </Group>
        <ImageUpload label="Club logo" guideline="Square, PNG with transparent background, ~300×300 px" value={logo} onChange={setLogo} maxDim={300} output="png" height={72} />
        <Group justify="flex-end">
          <Button variant="subtle" onClick={onClose}>Cancel</Button>
          <Button loading={save.isPending} disabled={!name.trim()} onClick={() => save.mutate()} data-testid="club-save">{isEdit ? 'Save' : 'Create club'}</Button>
        </Group>
      </Stack>
    </Modal>
  );
}

function RosterModal({ token, club, onClose }: { token: string; club: Club; onClose: () => void }) {
  const qc = useQueryClient();
  const [toAdd, setToAdd] = useState('');
  const [role, setRole] = useState('');
  const { data: roster } = useQuery({ queryKey: ['club-members', club.id], queryFn: () => fetchClubMembers(token, club.id) });
  const { data: students } = useQuery({ queryKey: ['students', ''], queryFn: () => fetchStudents(token, {}) });
  const studentNames = useMemo(() => (students?.students ?? []).map((s) => `${s.first_name} ${s.last_name}`.trim()), [students]);
  const matchedId = (students?.students ?? []).find((s) => `${s.first_name} ${s.last_name}`.trim() === toAdd.trim())?.id ?? null;

  const invalidate = () => { qc.invalidateQueries({ queryKey: ['club-members', club.id] }); qc.invalidateQueries({ queryKey: ['clubs'] }); };
  const add = useMutation({
    mutationFn: () => addClubMember(token, { club_id: club.id, student_name: toAdd, student_id: matchedId, role: role || 'Member' }),
    onSuccess: () => { invalidate(); setToAdd(''); setRole(''); },
  });
  const remove = useMutation({ mutationFn: (id: number) => removeClubMember(token, id), onSuccess: invalidate });

  const members = roster?.members ?? [];
  return (
    <Modal opened onClose={onClose} title={`Members — ${club.name}`} centered size="md">
      <Stack gap="md">
        <Group gap="sm" align="flex-end" wrap="nowrap">
          <Autocomplete label="Add student" placeholder="Type or pick" data={studentNames} value={toAdd} onChange={setToAdd} style={{ flex: 1 }} data-testid="club-member-name" />
          <TextInput label="Role" placeholder="Member" value={role} onChange={(e) => setRole(e.currentTarget.value)} w={120} />
          <Button leftSection={<Plus size={15} />} disabled={!toAdd.trim()} loading={add.isPending} onClick={() => add.mutate()} data-testid="club-member-add">Add</Button>
        </Group>
        <Text size="sm" c="dimmed">{members.length} members</Text>
        <Stack gap={6}>
          {members.length > 0 ? members.map((m) => (
            <Group key={m.id} justify="space-between" px="sm" py={6} style={{ borderRadius: 8, background: 'var(--mantine-color-gray-0)' }}>
              <Group gap="sm"><Text size="sm" fw={500}>{m.student_name}</Text>{m.role && <Badge size="xs" variant="light">{m.role}</Badge>}</Group>
              <ActionIcon variant="subtle" color="red" onClick={() => remove.mutate(m.id)}><UserMinus size={15} /></ActionIcon>
            </Group>
          )) : <Text size="sm" c="dimmed" ta="center" py="md">No members yet.</Text>}
        </Stack>
      </Stack>
    </Modal>
  );
}

export function ClubsScreen() {
  const token = useAuth((s) => s.token)!;
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['clubs'], queryFn: () => fetchClubs(token) });
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Club | null>(null);
  const [roster, setRoster] = useState<Club | null>(null);
  const del = useMutation({ mutationFn: (id: number) => deleteClub(token, id), onSuccess: () => qc.invalidateQueries({ queryKey: ['clubs'] }) });

  return (
    <Container size="xl" px={0}>
      <Stack gap="lg">
        <Group justify="space-between" align="flex-end">
          <Group gap="sm"><Users size={20} color="var(--mantine-color-brand-6)" /><Title order={2}>Clubs</Title></Group>
          <Button leftSection={<Plus size={15} />} onClick={() => setCreating(true)} data-testid="club-new">New Club</Button>
        </Group>

        {data && data.clubs.length > 0 ? (
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
            {data.clubs.map((c) => (
              <Card key={c.id} withBorder data-testid="club-card">
                <Group justify="space-between" wrap="nowrap" mb="xs">
                  <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
                    <Avatar src={c.logo ?? undefined} radius="md" color="brand">{(c.name ?? '?').slice(0, 2)}</Avatar>
                    <div style={{ minWidth: 0 }}>
                      <Text fw={700} truncate>{c.name}</Text>
                      <Badge size="xs" variant="light">{c.member_count} members</Badge>
                    </div>
                  </Group>
                  <Group gap={2}>
                    <ActionIcon variant="subtle" onClick={() => setEditing(c)}><Pencil size={14} /></ActionIcon>
                    <ActionIcon variant="subtle" color="red" onClick={() => del.mutate(c.id)}><Trash2 size={14} /></ActionIcon>
                  </Group>
                </Group>
                {c.description && <Text size="sm" c="dimmed" lineClamp={2}>{c.description}</Text>}
                <Group gap="lg" mt="sm">
                  {c.lead_staff && <Text size="xs" c="dimmed">Lead: {c.lead_staff}</Text>}
                  {c.meeting_day && <Group gap={4}><CalendarClock size={12} /><Text size="xs" c="dimmed">{c.meeting_day}</Text></Group>}
                </Group>
                <Button mt="sm" size="compact-sm" variant="light" leftSection={<Users size={14} />} onClick={() => setRoster(c)} data-testid="club-roster">Manage members</Button>
              </Card>
            ))}
          </SimpleGrid>
        ) : (
          <Card withBorder><Stack align="center" py="xl" gap="xs"><Users size={36} strokeWidth={1.5} color="var(--mantine-color-gray-4)" /><Text fw={500}>No clubs yet</Text><Button mt="xs" leftSection={<Plus size={14} />} onClick={() => setCreating(true)}>Create first club</Button></Stack></Card>
        )}
      </Stack>

      {creating && <ClubFormModal token={token} onClose={() => setCreating(false)} />}
      {editing && <ClubFormModal token={token} initial={editing} onClose={() => setEditing(null)} />}
      {roster && <RosterModal token={token} club={roster} onClose={() => setRoster(null)} />}
    </Container>
  );
}
