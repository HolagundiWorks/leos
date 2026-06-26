import { useState } from 'react';
import {
  Alert,
  Anchor,
  Button,
  Card,
  Center,
  Group,
  PasswordInput,
  Select,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
  Title,
} from '@mantine/core';
import { CircleAlert, FilePlus2, FolderOpen, KeyRound, Layers } from 'lucide-react';
import { useAuth } from '../stores/auth';
import { BrandWatermark } from './brand/BrandWatermark';

const BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8787';
const DEFAULT_FILE = 'school.leosdb';

const INSTITUTION_TYPES = [
  { value: 'school', label: 'School' },
  { value: 'pre-school', label: 'Pre-School' },
  { value: 'college', label: 'College' },
  { value: 'puc', label: 'PUC' },
];

async function postJSON(path: string, body: object) {
  const r = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, data } as { ok: boolean; status: number; data: { error?: string } };
}

/**
 * Pre-login gate: open an existing school file (path + master key) or create a
 * brand-new empty one. Either way the server's active DB is swapped so login
 * validates against that file.
 */
// Native file dialogs only exist inside the Tauri desktop app; in a plain
// browser we fall back to the text input.
const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
const LEOSDB_FILTER = [{ name: 'LEOS school file', extensions: ['leosdb'] }];

export function WelcomeScreen() {
  const setSchoolOpened = useAuth((s) => s.setSchoolOpened);
  const [mode, setMode] = useState<'open' | 'create'>('open');

  // shared
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // open mode
  const [step, setStep] = useState<'file' | 'key'>('file');
  const [path, setPath] = useState(DEFAULT_FILE);
  const [masterKey, setMasterKey] = useState('');

  // create mode
  const [cName, setCName] = useState('');
  const [cType, setCType] = useState('school');
  const [cPath, setCPath] = useState('');
  const [cKey, setCKey] = useState('');
  const [cKey2, setCKey2] = useState('');

  const browseOpen = async () => {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const sel = await open({ multiple: false, filters: LEOSDB_FILTER });
      if (typeof sel === 'string') setPath(sel);
    } catch {
      setError('File picker is only available in the desktop app.');
    }
  };

  const browseSave = async () => {
    try {
      const { save } = await import('@tauri-apps/plugin-dialog');
      const suggested = `${(cName.trim() || 'My School').replace(/[^\w\- ]/g, '')}.leosdb`;
      const sel = await save({ defaultPath: cPath || suggested, filters: LEOSDB_FILTER });
      if (typeof sel === 'string') setCPath(sel);
    } catch {
      setError('File picker is only available in the desktop app.');
    }
  };

  const openSchool = async (p: string, key: string) => {
    setError(null);
    setBusy(true);
    try {
      const { ok, status, data } = await postJSON('/school/open', { path: p.trim(), master_key: key });
      if (status === 401) throw new Error('Invalid master key for this school file.');
      if (!ok) throw new Error(data.error ?? `Could not open file (${status})`);
      setSchoolOpened(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open school file');
    } finally {
      setBusy(false);
    }
  };

  const createSchool = async () => {
    setError(null);
    if (cKey !== cKey2) { setError('Master keys do not match.'); return; }
    const fileName = cPath.trim() || `${(cName.trim() || 'My School').replace(/[^\w\- ]/g, '')}.leosdb`;
    setBusy(true);
    try {
      const made = await postJSON('/school/new', {
        path: fileName, master_key: cKey, school_name: cName.trim() || 'My School', institution_type: cType,
      });
      if (!made.ok) throw new Error(made.data.error ?? 'Could not create school file');
      // Open the freshly created file straight away.
      await openSchool(fileName, cKey);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create school file');
      setBusy(false);
    }
  };

  return (
    <Center mih="100vh" p="md" style={{ background: 'var(--mantine-color-gray-0)' }}>
      <BrandWatermark bottom={20} />
      <Card w={430} withBorder shadow="sm" radius="lg" p="xl">
        <Stack gap="lg">
          <Stack gap={6} align="center">
            <ThemeIcon size={52} radius="lg" variant="light" color="brand">
              <Layers size={26} strokeWidth={1.6} />
            </ThemeIcon>
            <Title order={3} ta="center" c="gray.9">LEOS</Title>
            <Text size="xs" c="dimmed" ta="center" lh={1.4}>
              {mode === 'create' ? 'Set up a new school' : step === 'file' ? 'Open a school file to begin' : 'Enter the master key to unlock'}
            </Text>
          </Stack>

          {error && <Alert color="peach" radius="md" icon={<CircleAlert size={16} />}>{error}</Alert>}

          {mode === 'open' ? (
            step === 'file' ? (
              <Stack gap="sm">
                <TextInput
                  label="School file"
                  placeholder="C:\path\to\My School.leosdb"
                  value={path}
                  onChange={(e) => setPath(e.currentTarget.value)}
                  leftSection={<FolderOpen size={15} />}
                  rightSectionWidth={isTauri ? 84 : undefined}
                  rightSection={isTauri ? (
                    <Button size="compact-xs" variant="light" onClick={browseOpen}>Browse…</Button>
                  ) : undefined}
                  autoFocus
                />
                <Button disabled={!path.trim()} onClick={() => { setError(null); setStep('key'); }}>Open School File</Button>
                <Anchor size="xs" ta="center" onClick={() => { setError(null); setMode('create'); }}>
                  <Group gap={4} justify="center"><FilePlus2 size={12} /> Set up a new school instead</Group>
                </Anchor>
              </Stack>
            ) : (
              <Stack gap="sm">
                <Text size="xs" c="dimmed" style={{ wordBreak: 'break-all' }}>{path}</Text>
                <PasswordInput
                  label="Master key" description="Database password for this school file" placeholder="Master key"
                  value={masterKey} onChange={(e) => setMasterKey(e.currentTarget.value)} leftSection={<KeyRound size={15} />}
                  autoFocus onKeyDown={(e) => { if (e.key === 'Enter' && masterKey) openSchool(path, masterKey); }}
                />
                <Group grow>
                  <Button variant="subtle" color="gray" onClick={() => { setError(null); setStep('file'); }}>Back</Button>
                  <Button onClick={() => openSchool(path, masterKey)} loading={busy} disabled={!masterKey}>Unlock &amp; Continue</Button>
                </Group>
              </Stack>
            )
          ) : (
            <Stack gap="sm">
              <TextInput label="School name" placeholder="e.g. Springfield High" value={cName} onChange={(e) => setCName(e.currentTarget.value)} autoFocus />
              <Select label="Institution type" data={INSTITUTION_TYPES} value={cType} onChange={(v) => setCType(v ?? 'school')} allowDeselect={false} />
              <TextInput
                label="Save to"
                placeholder={isTauri ? 'Choose a location…' : 'auto from name (server folder)'}
                value={cPath}
                onChange={(e) => setCPath(e.currentTarget.value)}
                leftSection={<FolderOpen size={15} />}
                rightSectionWidth={isTauri ? 96 : undefined}
                rightSection={isTauri ? (
                  <Button size="compact-xs" variant="light" onClick={browseSave}>Choose…</Button>
                ) : undefined}
              />
              <PasswordInput label="Master key" description="Set a database password" value={cKey} onChange={(e) => setCKey(e.currentTarget.value)} leftSection={<KeyRound size={15} />} />
              <PasswordInput label="Confirm master key" value={cKey2} onChange={(e) => setCKey2(e.currentTarget.value)} leftSection={<KeyRound size={15} />} />
              <Group grow>
                <Button variant="subtle" color="gray" onClick={() => { setError(null); setMode('open'); }}>Back</Button>
                <Button onClick={createSchool} loading={busy} disabled={!cKey || !cKey2}>Create &amp; Open</Button>
              </Group>
              <Text size="xs" c="dimmed" ta="center">Sign in afterwards with <Text span fw={600}>admin / ChangeMe@3201</Text>.</Text>
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
