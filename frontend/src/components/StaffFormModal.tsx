import { useEffect, useState } from 'react';
import {
  Button,
  Group,
  Modal,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Staff, StaffFormData } from '../api/client';
import { createStaff, updateStaff } from '../api/client';
import { useAuth } from '../stores/auth';
import { useTerms } from '../hooks/useTerms';

interface Props {
  onClose: () => void;
  initial?: Staff | null;
}

const TITLES = ['Mr.', 'Mrs.', 'Ms.', 'Dr.', 'Prof.'];

export function StaffFormModal({ onClose, initial }: Props) {
  const token = useAuth((s) => s.token)!;
  const qc = useQueryClient();
  const terms = useTerms();
  const isEdit = !!initial;

  const [firstName, setFirstName] = useState(initial?.first_name ?? '');
  const [lastName, setLastName] = useState(initial?.last_name ?? '');
  const [email, setEmail] = useState(initial?.email ?? '');
  const [phone, setPhone] = useState(initial?.phone ?? '');
  const [profile, setProfile] = useState<string | null>(initial?.profile ?? 'teacher');
  const [title, setTitle] = useState<string | null>(initial?.title ?? null);
  const [department, setDepartment] = useState('');
  const [joinDate, setJoinDate] = useState('');
  const [employeeId, setEmployeeId] = useState('');

  useEffect(() => {
    if (initial) {
      setFirstName(initial.first_name ?? '');
      setLastName(initial.last_name ?? '');
      setEmail(initial.email ?? '');
      setPhone(initial.phone ?? '');
      setProfile(initial.profile ?? 'teacher');
      setTitle(initial.title ?? null);
    }
  }, [initial]);

  const payload = (): StaffFormData => ({
    first_name: firstName,
    last_name: lastName,
    email: email || undefined,
    phone: phone || undefined,
    profile: profile || 'teacher',
    title: title || undefined,
    department: department || undefined,
    join_date: joinDate || undefined,
    employee_id: employeeId || undefined,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['staff'] });
  };

  const create = useMutation({
    mutationFn: () => createStaff(token, payload()),
    onSuccess: () => { invalidate(); onClose(); },
  });

  const update = useMutation({
    mutationFn: () => updateStaff(token, initial!.id, payload()),
    onSuccess: () => { invalidate(); onClose(); },
  });

  const save = () => (isEdit ? update.mutate() : create.mutate());
  const busy = create.isPending || update.isPending;
  const canSave = firstName.trim() !== '' && lastName.trim() !== '';

  const ROLES = [
    { value: 'teacher', label: terms.educator },
    { value: 'admin', label: 'Admin / Management' },
    { value: 'principal', label: 'Principal' },
    { value: 'accountant', label: 'Accountant' },
    { value: 'front-office', label: 'Front Office' },
  ];

  return (
    <Modal
      opened
      onClose={onClose}
      title={isEdit ? `Edit — ${initial?.first_name} ${initial?.last_name}` : `Add ${terms.educator}`}
      centered
      size="md"
    >
      <Stack gap="md">
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
          <Select
            label="Title"
            placeholder="Select…"
            data={TITLES}
            value={title}
            onChange={setTitle}
            clearable
          />
          <Select
            label="Role"
            data={ROLES}
            value={profile}
            onChange={setProfile}
            required
          />
        </SimpleGrid>

        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
          <TextInput
            label="First name"
            placeholder="First"
            value={firstName}
            onChange={(e) => setFirstName(e.currentTarget.value)}
            required
          />
          <TextInput
            label="Last name"
            placeholder="Last"
            value={lastName}
            onChange={(e) => setLastName(e.currentTarget.value)}
            required
          />
        </SimpleGrid>

        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
          <TextInput
            label="Email"
            type="email"
            placeholder="staff@school.edu"
            value={email}
            onChange={(e) => setEmail(e.currentTarget.value)}
          />
          <TextInput
            label="Phone"
            placeholder="+91 90000 XXXXX"
            value={phone}
            onChange={(e) => setPhone(e.currentTarget.value)}
          />
        </SimpleGrid>

        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
          <TextInput
            label="Department"
            placeholder="Science"
            value={department}
            onChange={(e) => setDepartment(e.currentTarget.value)}
          />
          <TextInput
            label="Employee ID"
            placeholder="EMP-001"
            value={employeeId}
            onChange={(e) => setEmployeeId(e.currentTarget.value)}
          />
          <TextInput
            type="date"
            label="Join date"
            value={joinDate}
            onChange={(e) => setJoinDate(e.currentTarget.value)}
          />
        </SimpleGrid>

        <Group justify="flex-end" mt="sm">
          <Button variant="subtle" onClick={onClose}>Cancel</Button>
          <Button onClick={save} loading={busy} disabled={!canSave}>
            {isEdit ? 'Save changes' : `Add ${terms.educator}`}
          </Button>
        </Group>

        {(create.isError || update.isError) && (
          <Text size="xs" c="red" ta="center">
            {(create.error as Error)?.message ?? (update.error as Error)?.message ?? 'Save failed'}
          </Text>
        )}
      </Stack>
    </Modal>
  );
}
