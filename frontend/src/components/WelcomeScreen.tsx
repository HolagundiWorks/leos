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
  Title,
  Modal,
} from '@mantine/core';
import { CircleAlert, FilePlus2, FolderOpen, KeyRound, Wifi } from 'lucide-react';
import { useAuth } from '../stores/auth';
import { BrandWatermark } from './brand/BrandWatermark';
import { LanConnectionManager } from './LanConnectionManager';
import { BrandMark } from './brand/BrandMark';

const DEFAULT_FILE = 'school.leosdb';

const INSTITUTION_TYPES = [
  { value: 'school', label: 'School' },
  { value: 'pre-school', label: 'Pre-School' },
  { value: 'college', label: 'College' },
  { value: 'puc', label: 'PUC' },
];

/**
 * Pre-login gate: open an existing school file (path + master key) or create a
 * brand-new empty one. Either way the server's active DB is swapped so login
 * validates against that file.
 */
export function WelcomeScreen() {
  const setSchoolOpened = useAuth((s) => s.setSchoolOpened);
  const [mode, setMode] = useState<'open' | 'create'>('open');
  const [lanOpen,setLanOpen]=useState(false);

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
  const [cAdminPassword, setCAdminPassword] = useState('');
  const [cAdminPassword2, setCAdminPassword2] = useState('');
  const [cAcademicYear, setCAcademicYear] = useState('2026-27');
  const hasNativeDialog = !!window.leosDesktop;

  const browseOpen = async () => {
    try {
      if (window.leosDesktop) {
        const selected = await window.leosDesktop.chooseSchoolFile();
        if (selected) setPath(selected);
        return;
      }
      setError('File picker is only available in the Electron desktop app.');
    } catch {
      setError('File picker is only available in the desktop app.');
    }
  };

  const browseSave = async () => {
    try {
      const suggested = `${(cName.trim() || 'My School').replace(/[^\w\- ]/g, '')}.leosdb`;
      if (window.leosDesktop) {
        const selected = await window.leosDesktop.chooseNewSchoolFile(suggested);
        if (selected) setCPath(selected);
        return;
      }
      setError('File picker is only available in the Electron desktop app.');
    } catch {
      setError('File picker is only available in the desktop app.');
    }
  };

  const openSchool = async (p: string, key: string) => {
    setError(null);
    setBusy(true);
    try {
      if (window.leosDesktop) {
        await window.leosDesktop.openSchoolArchive({ path: p.trim(), masterKey: key });
        setSchoolOpened(true);
        return;
      }
      throw new Error('Opening a school file requires the Electron desktop app.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open school file');
    } finally {
      setBusy(false);
    }
  };

  const createSchool = async () => {
    setError(null);
    if (cKey !== cKey2) { setError('Master keys do not match.'); return; }
    if (cAdminPassword !== cAdminPassword2) { setError('Admin passwords do not match.'); return; }
    if (cKey.length < 8 || cAdminPassword.length < 8) { setError('Master key and admin password must be at least 8 characters.'); return; }
    const fileName = cPath.trim() || `${(cName.trim() || 'My School').replace(/[^\w\- ]/g, '')}.leosdb`;
    setBusy(true);
    try {
      if (window.leosDesktop) {
        await window.leosDesktop.createSchoolArchive({
          path: fileName,
          masterKey: cKey,
          schoolName: cName.trim() || 'My School',
          institutionType: cType as 'school' | 'pre-school' | 'college' | 'puc',
          academicYear: cAcademicYear,
          adminPassword: cAdminPassword,
        });
        setSchoolOpened(true);
        return;
      }
      throw new Error('Creating a school file requires the Electron desktop app.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create school file');
      setBusy(false);
    }
  };

  return (
    <Center mih="100vh" p="md" style={{ background: 'var(--mantine-color-body)' }}>
      <BrandWatermark bottom={20} />
      <Card w={430} withBorder shadow="sm" radius="lg" p="xl">
        <Stack gap="lg">
          <Stack gap={6} align="center">
            <BrandMark size={64} />
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
                  rightSectionWidth={hasNativeDialog ? 84 : undefined}
                  rightSection={hasNativeDialog ? (
                    <Button size="compact-xs" variant="light" onClick={browseOpen}>Browse…</Button>
                  ) : undefined}
                  autoFocus
                  data-testid="school-file-input"
                />
                <Button data-testid="open-school-file-button" disabled={!path.trim()} onClick={() => { setError(null); setStep('key'); }}>Open School File</Button>
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
                  data-testid="master-key-input"
                />
                <Group grow>
                  <Button variant="subtle" color="gray" onClick={() => { setError(null); setStep('file'); }}>Back</Button>
                  <Button data-testid="unlock-continue-button" onClick={() => openSchool(path, masterKey)} loading={busy} disabled={!masterKey}>Unlock &amp; Continue</Button>
                </Group>
              </Stack>
            )
          ) : (
            <Stack gap="sm">
              <TextInput label="School name" placeholder="e.g. Springfield High" value={cName} onChange={(e) => setCName(e.currentTarget.value)} autoFocus />
              <Select label="Institution type" data={INSTITUTION_TYPES} value={cType} onChange={(v) => setCType(v ?? 'school')} allowDeselect={false} />
              <TextInput label="Academic year" placeholder="2026-27" value={cAcademicYear} onChange={(e) => setCAcademicYear(e.currentTarget.value)} />
              <TextInput
                label="Save to"
                placeholder={hasNativeDialog ? 'Choose a location…' : 'auto from name (server folder)'}
                value={cPath}
                onChange={(e) => setCPath(e.currentTarget.value)}
                leftSection={<FolderOpen size={15} />}
                rightSectionWidth={hasNativeDialog ? 96 : undefined}
                rightSection={hasNativeDialog ? (
                  <Button size="compact-xs" variant="light" onClick={browseSave}>Choose…</Button>
                ) : undefined}
              />
              <PasswordInput label="Master key" description="Set a database password" value={cKey} onChange={(e) => setCKey(e.currentTarget.value)} leftSection={<KeyRound size={15} />} />
              <PasswordInput label="Confirm master key" value={cKey2} onChange={(e) => setCKey2(e.currentTarget.value)} leftSection={<KeyRound size={15} />} />
              <PasswordInput label="Admin password" description="Initial password for the admin account" value={cAdminPassword} onChange={(e) => setCAdminPassword(e.currentTarget.value)} />
              <PasswordInput label="Confirm admin password" value={cAdminPassword2} onChange={(e) => setCAdminPassword2(e.currentTarget.value)} />
              <Group grow>
                <Button variant="subtle" color="gray" onClick={() => { setError(null); setMode('open'); }}>Back</Button>
                <Button onClick={createSchool} loading={busy} disabled={!cKey || !cKey2 || !cAdminPassword || !cAdminPassword2}>Create &amp; Open</Button>
              </Group>
              <Text size="xs" c="dimmed" ta="center">Sign in afterwards as <Text span fw={600}>admin</Text> with the password set above.</Text>
            </Stack>
          )}

          <Text size="xs" c="dimmed" ta="center">
            A school's entire data lives in one portable <Text span fw={600}>.leosdb</Text> file.
          </Text>
          {window.leosDesktop&&<Button variant="subtle" leftSection={<Wifi size={15}/>} onClick={()=>setLanOpen(true)}>Connect over school LAN</Button>}
        </Stack>
      </Card>
      <Modal opened={lanOpen} onClose={()=>setLanOpen(false)} size="lg" title="School LAN connection"><LanConnectionManager compact onConnected={()=>{setSchoolOpened(true);setLanOpen(false);}}/></Modal>
    </Center>
  );
}
