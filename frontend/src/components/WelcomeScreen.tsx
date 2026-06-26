import { useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Center,
  Divider,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
  Title,
} from '@mantine/core';
import { CircleAlert, FolderOpen, Layers, School } from 'lucide-react';
import { useAuth } from '../stores/auth';
import { BrandWatermark } from './brand/BrandWatermark';

const BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8787';
const DEMO_PATH = 'demo-school.leosdb';

/**
 * Pre-login gate (Tally-style): choose a school file before signing in.
 * Opening swaps the server's active database so login validates against that
 * file's users.
 */
export function WelcomeScreen() {
  const setSchoolOpened = useAuth((s) => s.setSchoolOpened);
  const [path, setPath] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'demo' | 'file' | null>(null);

  const openSchool = async (p: string, which: 'demo' | 'file') => {
    setError(null);
    setBusy(which);
    try {
      const r = await fetch(`${BASE}/school/open`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: p }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((data as { error?: string }).error ?? `Could not open (${r.status})`);
      setSchoolOpened(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open school file');
    } finally {
      setBusy(null);
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
            <Text size="xs" c="dimmed" ta="center" lh={1.4}>Open a school file to begin</Text>
          </Stack>

          {error && (
            <Alert color="peach" radius="md" icon={<CircleAlert size={16} />}>{error}</Alert>
          )}

          <Button
            size="md"
            leftSection={<School size={18} />}
            loading={busy === 'demo'}
            onClick={() => openSchool(DEMO_PATH, 'demo')}
          >
            Open Demo School
          </Button>

          <Divider label="or open a school file" labelPosition="center" />

          <Stack gap="xs">
            <TextInput
              label="School file path"
              placeholder="C:\path\to\My School.leosdb"
              value={path}
              onChange={(e) => setPath(e.currentTarget.value)}
              leftSection={<FolderOpen size={15} />}
            />
            <Button
              variant="light"
              disabled={!path.trim()}
              loading={busy === 'file'}
              onClick={() => openSchool(path.trim(), 'file')}
            >
              Open File
            </Button>
          </Stack>

          <Text size="xs" c="dimmed" ta="center">
            A school's entire data lives in one portable <Text span fw={600}>.leosdb</Text> file.
          </Text>
        </Stack>
      </Card>
    </Center>
  );
}
