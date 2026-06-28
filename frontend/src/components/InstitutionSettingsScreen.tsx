import { useEffect, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  Container,
  Group,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core';
import { Save } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../stores/auth';
import { useSchool } from '../hooks/useSchool';
import { saveSchool } from '../api/client';
import { INSTITUTION_TYPES, termsFor } from '../lib/institution';

export function InstitutionSettingsScreen() {
  const token = useAuth((s) => s.token) as string;
  const qc = useQueryClient();
  const { data } = useSchool();

  const [name, setName] = useState('');
  const [type, setType] = useState('school');
  const [ay, setAy] = useState('');
  const [address, setAddress] = useState('');
  const [principal, setPrincipal] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  useEffect(() => {
    if (data) {
      setName(data.name ?? '');
      setType(data.type ?? 'school');
      setAy(data.academic_year ?? '');
      setAddress(data.address ?? '');
      setPrincipal(data.principal_name ?? '');
    }
  }, [data]);

  const terms = termsFor(type);

  const save = async () => {
    setStatus('saving');
    try {
      await saveSchool(token, { name, academic_year: ay, type, address, principal_name: principal });
      await qc.invalidateQueries({ queryKey: ['school'] });
      setStatus('saved');
      setTimeout(() => setStatus('idle'), 1800);
    } catch {
      setStatus('idle');
    }
  };

  return (
    <Container size="sm" px={0}>
      <Stack gap="lg">
        <div>
          <Title order={2}>Institution</Title>
          <Text c="dimmed">Configure your institution and how the app names people.</Text>
        </div>

        <Card>
          <Stack gap="md">
            <TextInput
              label="Institution name"
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
            />
            <Select
              label="Institution type"
              description="Drives the app's terminology (e.g. Teacher vs Lecturer)."
              data={INSTITUTION_TYPES}
              value={type}
              onChange={(v) => setType(v ?? 'school')}
              allowDeselect={false}
              comboboxProps={{ withinPortal: true }}
            />
            <TextInput
              label="Academic year"
              placeholder="2026-27"
              value={ay}
              onChange={(e) => setAy(e.currentTarget.value)}
            />
            <Textarea
              label="Address"
              description="Shown on the letterhead and certificates."
              placeholder="12 Lake Road, Bengaluru 560001"
              value={address}
              onChange={(e) => setAddress(e.currentTarget.value)}
              autosize
              minRows={2}
            />
            <TextInput
              label="Principal's name"
              description="Signs letters and certificates."
              placeholder="Dr. A. Rao"
              value={principal}
              onChange={(e) => setPrincipal(e.currentTarget.value)}
            />

            <div>
              <Text size="sm" fw={600} mb={6}>
                Nomenclature preview
              </Text>
              <Group gap="xs">
                <Badge variant="light" color="brand">
                  Educator: {terms.educator}
                </Badge>
                <Badge variant="light" color="sky">
                  Plural: {terms.educatorPlural}
                </Badge>
                <Badge variant="light" color="mint">
                  Learner: {terms.student}
                </Badge>
              </Group>
            </div>

            <Group justify="flex-end" gap="sm">
              {status === 'saved' && (
                <Badge color="mint" variant="light">
                  Saved
                </Badge>
              )}
              <Button leftSection={<Save size={16} />} onClick={save} loading={status === 'saving'}>
                Save
              </Button>
            </Group>
          </Stack>
        </Card>
      </Stack>
    </Container>
  );
}
