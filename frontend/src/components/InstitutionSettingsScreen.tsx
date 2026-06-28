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
import { ImageUpload } from './ImageUpload';

export function InstitutionSettingsScreen() {
  const token = useAuth((s) => s.token) as string;
  const qc = useQueryClient();
  const { data } = useSchool();

  const [name, setName] = useState('');
  const [type, setType] = useState('school');
  const [ay, setAy] = useState('');
  const [address, setAddress] = useState('');
  const [principal, setPrincipal] = useState('');
  const [logo, setLogo] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [certBg, setCertBg] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  useEffect(() => {
    if (data) {
      setName(data.name ?? '');
      setType(data.type ?? 'school');
      setAy(data.academic_year ?? '');
      setAddress(data.address ?? '');
      setPrincipal(data.principal_name ?? '');
      setLogo(data.logo ?? null);
      setSignature(data.signature ?? null);
      setCertBg(data.cert_bg ?? null);
    }
  }, [data]);

  const terms = termsFor(type);

  const save = async () => {
    setStatus('saving');
    try {
      await saveSchool(token, { name, academic_year: ay, type, address, principal_name: principal, logo, signature, cert_bg: certBg });
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

            <Text size="sm" fw={600} mt="xs">Branding &amp; letterhead</Text>
            <ImageUpload
              label="School logo"
              guideline="Recommended: square, PNG with transparent background, ~400×400 px"
              value={logo}
              onChange={setLogo}
              maxDim={400}
              output="png"
            />
            <ImageUpload
              label="Principal's signature"
              guideline="Recommended: PNG with transparent background, ~600×200 px"
              value={signature}
              onChange={setSignature}
              maxDim={600}
              output="png"
              height={60}
            />
            <ImageUpload
              label="Certificate background"
              guideline="Recommended: landscape A4, JPEG/PNG, ~1600×1100 px (kept subtle behind text)"
              value={certBg}
              onChange={setCertBg}
              maxDim={1600}
              output="jpeg"
              height={110}
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
