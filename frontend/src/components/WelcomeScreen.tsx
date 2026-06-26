import { useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Center,
  Group,
  PasswordInput,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
  Title,
} from '@mantine/core';
import { CircleAlert, FolderOpen, KeyRound, Layers } from 'lucide-react';
import { useAuth } from '../stores/auth';
import { BrandWatermark } from './brand/BrandWatermark';

const BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8787';
// Starter file the server generates on first run; prefilled for convenience.
const DEFAULT_FILE = 'school.leosdb';

/**
 * Pre-login gate (Tally-style): pick a school file, unlock it with the master
 * key (database password), then proceed to sign-in. Opening swaps the server's
 * active database so login validates against that file's users.
 */
export function WelcomeScreen() {
  const setSchoolOpened = useAuth((s) => s.setSchoolOpened);
  const [step, setStep] = useState<'file' | 'key'>('file');
  const [path, setPath] = useState(DEFAULT_FILE);
  const [masterKey, setMasterKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const openSchool = async () => {
    setError(null);
    setBusy(true);
    try {
      const r = await fetch(`${BASE}/school/open`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: path.trim(), master_key: masterKey }),
      });
      const data = await r.json().catch(() => ({}));
      if (r.status === 401) throw new Error('Invalid master key for this school file.');
      if (!r.ok) throw new Error((data as { error?: string }).error ?? `Could not open file (${r.status})`);
      setSchoolOpened(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open school file');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Center mih="100vh" p="md" style={{ background: 'var(--mantine-color-gray-0)' }}>
      <BrandWatermark bottom={20} />
      <Card w={420} withBorder shadow="sm" radius="lg" p="xl">
        <Stack gap="lg">
          <Stack gap={6} align="center">
            <ThemeIcon size={52} radius="lg" variant="light" color="brand">
              <Layers size={26} strokeWidth={1.6} />
            </ThemeIcon>
            <Title order={3} ta="center" c="gray.9">LEOS</Title>
            <Text size="xs" c="dimmed" ta="center" lh={1.4}>
              {step === 'file' ? 'Open a school file to begin' : 'Enter the master key to unlock'}
            </Text>
          </Stack>

          {error && (
            <Alert color="peach" radius="md" icon={<CircleAlert size={16} />}>{error}</Alert>
          )}

          {step === 'file' ? (
            <Stack gap="sm">
              <TextInput
                label="School file"
                placeholder="C:\path\to\My School.leosdb"
                value={path}
                onChange={(e) => setPath(e.currentTarget.value)}
                leftSection={<FolderOpen size={15} />}
                autoFocus
              />
              <Button disabled={!path.trim()} onClick={() => { setError(null); setStep('key'); }}>
                Open School File
              </Button>
            </Stack>
          ) : (
            <Stack gap="sm">
              <Text size="xs" c="dimmed" style={{ wordBreak: 'break-all' }}>{path}</Text>
              <PasswordInput
                label="Master key"
                description="Database password for this school file"
                placeholder="Master key"
                value={masterKey}
                onChange={(e) => setMasterKey(e.currentTarget.value)}
                leftSection={<KeyRound size={15} />}
                autoFocus
                onKeyDown={(e) => { if (e.key === 'Enter' && masterKey) openSchool(); }}
              />
              <Group grow>
                <Button variant="subtle" color="gray" onClick={() => { setError(null); setStep('file'); }}>Back</Button>
                <Button onClick={openSchool} loading={busy} disabled={!masterKey}>Unlock &amp; Continue</Button>
              </Group>
            </Stack>
          )}

          <Text size="xs" c="dimmed" ta="center">
            A school's entire data lives in one portable <Text span fw={600}>.leosdb</Text> file.
          </Text>
        </Stack>
      </Card>
    </Center>
  );
}
