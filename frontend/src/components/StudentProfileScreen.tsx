import { useState } from 'react';
import {
  Avatar,
  Badge,
  Button,
  Card,
  Container,
  Group,
  SimpleGrid,
  Stack,
  Tabs,
  Text,
  Title,
} from '@mantine/core';
import { ArrowLeft, Pencil } from 'lucide-react';
import dayjs from 'dayjs';
import { useStudent } from '../hooks/useStudent';
import { initials } from '../types';
import { StudentFormModal } from './StudentFormModal';

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <Text size="xs" c="dimmed" fw={600} tt="uppercase">
        {label}
      </Text>
      <Text>{value || '—'}</Text>
    </div>
  );
}

const SECONDARY_TABS = ['attendance', 'fees', 'academics', 'documents'] as const;

export function StudentProfileScreen({ id, onBack }: { id: number; onBack: () => void }) {
  const { data: s, isLoading } = useStudent(id);
  const [editing, setEditing] = useState(false);
  const name = s
    ? `${s.first_name} ${s.middle_name ? s.middle_name + ' ' : ''}${s.last_name}`
        .replace(/\s+/g, ' ')
        .trim()
    : '';
  const admission = s?.alt_id || `ID ${id}`;

  return (
    <Container size="xl" px={0}>
      <Stack gap="md">
        <Button
          variant="subtle"
          color="gray"
          size="compact-sm"
          leftSection={<ArrowLeft size={16} />}
          onClick={onBack}
          w="fit-content"
        >
          Back to students
        </Button>

        {/* Top-left context + top-right alert chips (guide §7). */}
        <Card>
          <Group justify="space-between" align="flex-start" wrap="nowrap">
            <Group wrap="nowrap" gap="md">
              <Avatar size={56} radius="xl" color="brand" variant="light">
                {initials(name || 'S')}
              </Avatar>
              <div>
                <Title order={3}>{isLoading ? 'Loading…' : name}</Title>
                <Text c="dimmed" size="sm">
                  {(s?.gender ?? '—') + ' · Admission ' + admission}
                </Text>
              </div>
            </Group>
            <Group gap="xs">
              {s && !s.email && (
                <Badge color="peach" variant="light">
                  Missing email
                </Badge>
              )}
              {s && !s.phone && (
                <Badge color="yellow" variant="light">
                  Missing phone
                </Badge>
              )}
              <Badge color="mint" variant="light">
                Active
              </Badge>
              <Button
                size="xs"
                variant="light"
                leftSection={<Pencil size={13} />}
                onClick={() => setEditing(true)}
                disabled={!s}
              >
                Edit
              </Button>
            </Group>
          </Group>
        </Card>

        <Card p={0}>
          <Tabs defaultValue="profile">
            <Tabs.List>
              <Tabs.Tab value="profile">Profile</Tabs.Tab>
              <Tabs.Tab value="attendance">Attendance</Tabs.Tab>
              <Tabs.Tab value="fees">Fees</Tabs.Tab>
              <Tabs.Tab value="academics">Academics</Tabs.Tab>
              <Tabs.Tab value="documents">Documents</Tabs.Tab>
            </Tabs.List>

            <Tabs.Panel value="profile" p="lg">
              <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="lg">
                <Field label="Full name" value={name} />
                <Field label="Email" value={s?.email} />
                <Field label="Phone" value={s?.phone} />
                <Field label="Gender" value={s?.gender} />
                <Field
                  label="Date of birth"
                  value={s?.birthdate ? dayjs(s.birthdate).format('D MMM YYYY') : null}
                />
                <Field label="Admission ID" value={admission} />
                <Field label="Guardian" value={s?.guardian_name} />
                <Field label="Guardian phone" value={s?.guardian_phone} />
                <Field label="Relation" value={s?.guardian_relation} />
                {s?.address && <Field label="Address" value={s.address} />}
              </SimpleGrid>
            </Tabs.Panel>

            {SECONDARY_TABS.map((t) => (
              <Tabs.Panel key={t} value={t} p="lg">
                <Text c="dimmed" ta="center" py="xl">
                  No {t} records yet.
                </Text>
              </Tabs.Panel>
            ))}
          </Tabs>
        </Card>
      </Stack>

      {editing && s && (
        <StudentFormModal initial={s} onClose={() => setEditing(false)} />
      )}
    </Container>
  );
}
