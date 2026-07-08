import { useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Divider,
  Group,
  Radio,
  ScrollArea,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
} from '@mantine/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle, GitMerge, UserPlus } from 'lucide-react';
import { isTauri } from '../lib/tauriDialog';

const BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8787';

interface MergeRow {
  action: 'new' | 'duplicate' | 'conflict';
  incoming: Record<string, unknown>;
  existing: ({ id: number } & Record<string, unknown>) | null;
  diffs: string[];
}
interface Counts { new: number; conflict: number; duplicate: number; total: number }
interface Preview {
  students: MergeRow[];
  staff: MergeRow[];
  summary: { students: Counts; staff: Counts };
}

async function postJSON(token: string, path: string, body: object) {
  const r = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${r.status}`);
  return data;
}

const name = (r: Record<string, unknown>) =>
  `${(r.first_name as string) ?? ''} ${(r.last_name as string) ?? ''}`.trim() || '(unnamed)';

function ConflictRow({
  entity, idx, row, useIncoming, toggle,
}: {
  entity: string; idx: number; row: MergeRow;
  useIncoming: boolean; toggle: (key: string, v: boolean) => void;
}) {
  const key = `${entity}:${idx}`;
  return (
    <Stack gap={4} p="xs" style={{ borderRadius: 8, background: 'var(--mantine-color-gray-0)' }} data-testid="merge-conflict-row">
      <Group justify="space-between">
        <Text fw={600} size="sm">{name(row.incoming)}</Text>
        <Badge size="xs" color="yellow" variant="light">{row.diffs.length} field(s) differ</Badge>
      </Group>
      {row.diffs.map((f) => (
        <Text key={f} size="xs" c="dimmed">
          <b>{f}:</b> {String(row.existing?.[f] ?? '—')} <span style={{ color: 'var(--mantine-color-gray-5)' }}>→</span> {String(row.incoming[f] ?? '—')}
        </Text>
      ))}
      <Radio.Group
        value={useIncoming ? 'incoming' : 'current'}
        onChange={(v) => toggle(key, v === 'incoming')}
        size="xs"
      >
        <Group gap="lg" mt={2}>
          <Radio value="current" label="Keep current" data-testid="merge-keep-current" />
          <Radio value="incoming" label="Use incoming" data-testid="merge-use-incoming" />
        </Group>
      </Radio.Group>
    </Stack>
  );
}

export function MergePanel({ token }: { token: string }) {
  const qc = useQueryClient();
  const [path, setPath] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [importNew, setImportNew] = useState(true);
  const [useIncoming, setUseIncoming] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ inserted: number; updated: number } | null>(null);

  const toggle = (key: string, v: boolean) =>
    setUseIncoming((prev) => {
      const next = new Set(prev);
      if (v) next.add(key); else next.delete(key);
      return next;
    });

  const browse = async () => {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const sel = await open({ multiple: false, filters: [{ name: 'LEOS school file', extensions: ['leosdb', 'sqlite'] }] });
      if (typeof sel === 'string') setPath(sel);
    } catch {
      setError('File picker is only available in the desktop app.');
    }
  };

  const previewMut = useMutation({
    mutationFn: () => postJSON(token, '/import/merge/preview', { path }) as Promise<Preview>,
    onSuccess: (data) => { setPreview(data); setUseIncoming(new Set()); setDone(null); setError(null); },
    onError: (e) => { setError(String(e instanceof Error ? e.message : e)); setPreview(null); },
  });

  const buildOps = (rows: MergeRow[], entity: string) =>
    rows.flatMap((r, i) => {
      if (r.action === 'new') return importNew ? [{ action: 'insert', data: r.incoming }] : [];
      if (r.action === 'conflict' && useIncoming.has(`${entity}:${i}`)) {
        return [{ action: 'update', id: r.existing!.id, data: r.incoming }];
      }
      return [];
    });

  const applyMut = useMutation({
    mutationFn: () =>
      postJSON(token, '/import/merge/apply', {
        students: buildOps(preview!.students, 'students'),
        staff: buildOps(preview!.staff, 'staff'),
      }) as Promise<{ inserted: number; updated: number }>,
    onSuccess: (data) => {
      setDone(data);
      setPreview(null);
      qc.invalidateQueries({ queryKey: ['students'] });
      qc.invalidateQueries({ queryKey: ['staff'] });
      qc.invalidateQueries({ queryKey: ['import-jobs'] });
    },
    onError: (e) => setError(String(e instanceof Error ? e.message : e)),
  });

  const sumCard = (label: string, c: Counts) => (
    <Group gap="xs">
      <Text size="sm" fw={600}>{label}:</Text>
      <Badge color="teal" variant="light">{c.new} new</Badge>
      <Badge color="yellow" variant="light">{c.conflict} conflict</Badge>
      <Badge color="gray" variant="light">{c.duplicate} identical</Badge>
    </Group>
  );

  const conflicts = (rows: MergeRow[], entity: string) =>
    rows.map((r, i) => ({ r, i })).filter(({ r }) => r.action === 'conflict')
      .map(({ r, i }) => (
        <ConflictRow key={`${entity}-${i}`} entity={entity} idx={i} row={r} useIncoming={useIncoming.has(`${entity}:${i}`)} toggle={toggle} />
      ));

  return (
    <Stack gap="md">
      <Text size="sm" c="dimmed">
        Merge another school file (a <code>.leosdb</code> someone edited separately) into this one. LEOS matches
        students by <b>name + date of birth</b> (or Admission No / email when present) and staff by name/email, then
        shows new records, identical rows, and conflicts to reconcile before anything is written.
      </Text>

      <Group align="flex-end" gap="sm" wrap="nowrap">
        <TextInput
          label="Other school file"
          placeholder="C:\path\to\other.leosdb"
          value={path}
          onChange={(e) => setPath(e.currentTarget.value)}
          style={{ flex: 1 }}
          rightSectionWidth={isTauri ? 84 : undefined}
          rightSection={isTauri ? <Button size="compact-xs" variant="light" onClick={browse}>Browse…</Button> : undefined}
          data-testid="merge-path-input"
        />
        <Button
          leftSection={<GitMerge size={15} />}
          loading={previewMut.isPending}
          disabled={!path.trim()}
          onClick={() => previewMut.mutate()}
          data-testid="merge-preview-button"
        >
          Preview
        </Button>
      </Group>

      {error && <Alert color="red" icon={<AlertTriangle size={15} />}>{error}</Alert>}

      {done && (
        <Alert color="green" icon={<CheckCircle size={15} />} title="Merge complete" data-testid="merge-done">
          {done.inserted} record(s) imported, {done.updated} reconciled. The change is in the audit log.
        </Alert>
      )}

      {preview && (
        <Stack gap="sm" data-testid="merge-preview">
          <Group gap="xl">
            {sumCard('Students', preview.summary.students)}
            {sumCard('Staff', preview.summary.staff)}
          </Group>

          <Checkbox
            label={`Import ${preview.summary.students.new + preview.summary.staff.new} new record(s)`}
            checked={importNew}
            onChange={(e) => setImportNew(e.currentTarget.checked)}
            data-testid="merge-import-new"
          />

          {(preview.summary.students.conflict + preview.summary.staff.conflict) > 0 && (
            <>
              <Divider label="Conflicts to reconcile" labelPosition="left" />
              <Text size="xs" c="dimmed">Default is to keep your current data. Switch to “Use incoming” to take the other file’s values.</Text>
              <ScrollArea.Autosize mah={320}>
                <Stack gap="xs">
                  {conflicts(preview.students, 'students')}
                  {conflicts(preview.staff, 'staff')}
                </Stack>
              </ScrollArea.Autosize>
            </>
          )}

          <Group>
            <Button
              leftSection={<UserPlus size={15} />}
              color="teal"
              loading={applyMut.isPending}
              onClick={() => applyMut.mutate()}
              data-testid="merge-apply-button"
            >
              Apply merge
            </Button>
            <Button variant="subtle" onClick={() => setPreview(null)}>Cancel</Button>
          </Group>
        </Stack>
      )}

      {!preview && !done && (
        <Group gap="xs" c="dimmed">
          <ThemeIcon variant="light" color="gray" size="sm"><GitMerge size={13} /></ThemeIcon>
          <Text size="xs" c="dimmed">Pick a file and Preview to see what would change. Nothing is written until you Apply.</Text>
        </Group>
      )}
    </Stack>
  );
}
