import { useState } from 'react';
import {
  Badge,
  Button,
  Card,
  Container,
  Group,
  Select,
  Skeleton,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, UserX } from 'lucide-react';
import { useStaff } from '../hooks/useStaff';
import { useAuth } from '../stores/auth';

const BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8787';

// DOW: 0=Mon…6=Sun (matches timetable_entries day_of_week)
function dateToDoW(dateStr: string): number {
  const d = new Date(`${dateStr}T00:00:00`);
  return (d.getDay() + 6) % 7; // JS: 0=Sun → 0=Mon conversion
}

function formatDow(dow: number) {
  return ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][dow] ?? '?';
}

// ─── API helpers ──────────────────────────────────────────────────────────────
interface SubstitutionRecord {
  id: number;
  original_entry_id: number;
  original_staff_id: number;
  substitute_staff_id: number | null;
  date: string;
  reason: string | null;
  status: 'pending' | 'assigned' | 'resolved';
  created_at: string;
  period_id: number;
  day_of_week: number;
  section_id: number;
  subject_name: string | null;
  subject_code: string | null;
  original_teacher: string | null;
  substitute_teacher: string | null;
  section_name: string | null;
  class_name: string | null;
}

interface SuggestionResult {
  staff_id: number;
  name: string;
  profile: string | null;
}

async function fetchSubstitutions(token: string, status?: string): Promise<{ substitutions: SubstitutionRecord[]; total: number }> {
  const qs = status ? `?status=${status}` : '';
  const r = await fetch(`${BASE}/substitutions${qs}`, { headers: { Authorization: `Bearer ${token}` } });
  return r.json();
}

async function markAbsent(token: string, data: { staff_id: number; date: string; day_of_week: number; reason?: string }) {
  const r = await fetch(`${BASE}/substitutions/mark-absent`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return r.json();
}

async function fetchSuggestions(token: string, substitution_id: number): Promise<{ suggestions: SuggestionResult[]; total: number }> {
  const r = await fetch(`${BASE}/substitutions/suggestions?substitution_id=${substitution_id}`, { headers: { Authorization: `Bearer ${token}` } });
  return r.json();
}

async function assignSubstitute(token: string, substitution_id: number, substitute_staff_id: number) {
  const r = await fetch(`${BASE}/substitutions/assign`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ substitution_id, substitute_staff_id }),
  });
  return r.json();
}

async function resolveSubstitution(token: string, substitution_id: number) {
  const r = await fetch(`${BASE}/substitutions/resolve`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ substitution_id }),
  });
  return r.json();
}

// ─── Substitution row ──────────────────────────────────────────────────────────
function SubstitutionRow({ sub, token, onRefresh }: { sub: SubstitutionRecord; token: string; onRefresh: () => void }) {
  const { data: suggestionsData, isLoading: sugsLoading } = useQuery({
    queryKey: ['substitution-suggestions', sub.id],
    queryFn: () => fetchSuggestions(token, sub.id),
    enabled: sub.status === 'pending',
    staleTime: 60_000,
  });

  const [selectedSub, setSelectedSub] = useState<string | null>(null);

  const assignMut = useMutation({
    mutationFn: () => assignSubstitute(token, sub.id, Number(selectedSub)),
    onSuccess: () => { onRefresh(); setSelectedSub(null); },
  });

  const resolveMut = useMutation({
    mutationFn: () => resolveSubstitution(token, sub.id),
    onSuccess: onRefresh,
  });

  const statusColor = sub.status === 'pending' ? 'yellow' : sub.status === 'assigned' ? 'mint' : 'gray';
  const suggestions = suggestionsData?.suggestions ?? [];

  return (
    <Card>
      <Group justify="space-between" wrap="nowrap" gap="md">
        <Stack gap={4} style={{ minWidth: 0 }}>
          <Group gap="sm" wrap="nowrap">
            <Badge color={statusColor} size="sm">{sub.status}</Badge>
            <Text fw={600} size="sm" truncate>
              {sub.class_name} · {sub.section_name} — {sub.subject_code ?? sub.subject_name ?? 'Unknown subject'}
            </Text>
          </Group>
          <Text size="xs" c="dimmed">
            {sub.date} · {formatDow(sub.day_of_week)} · Period {sub.period_id} · Absent: {sub.original_teacher ?? '—'}
          </Text>
          {sub.substitute_teacher && (
            <Text size="xs" c="mint.7">Sub: {sub.substitute_teacher}</Text>
          )}
          {sub.reason && <Text size="xs" c="dimmed" fs="italic">{sub.reason}</Text>}
        </Stack>

        <Group gap="sm" wrap="nowrap" style={{ flexShrink: 0 }}>
          {sub.status === 'pending' && (
            <>
              {sugsLoading ? (
                <Skeleton height={32} width={160} radius="md" />
              ) : suggestions.length > 0 ? (
                <Select
                  size="xs"
                  placeholder="Assign substitute…"
                  data={suggestions.map((s) => ({ value: String(s.staff_id), label: s.name }))}
                  value={selectedSub}
                  onChange={setSelectedSub}
                  w={180}
                />
              ) : (
                <Text size="xs" c="dimmed">No substitutes available</Text>
              )}
              <Button
                size="xs"
                onClick={() => assignMut.mutate()}
                loading={assignMut.isPending}
                disabled={!selectedSub}
              >
                Assign
              </Button>
            </>
          )}
          {sub.status !== 'resolved' && (
            <Button
              size="xs"
              variant="subtle"
              color="gray"
              leftSection={<Check size={12} />}
              onClick={() => resolveMut.mutate()}
              loading={resolveMut.isPending}
            >
              Resolve
            </Button>
          )}
        </Group>
      </Group>
    </Card>
  );
}

// ─── Mark absent panel ─────────────────────────────────────────────────────────
function MarkAbsentPanel({ token, onRefresh }: { token: string; onRefresh: () => void }) {
  const { data: staffData } = useStaff('');
  const [staffId, setStaffId] = useState<string | null>(null);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState('');

  const staffOptions = (staffData?.staff ?? [])
    .filter((s) => s.profile === 'teacher' || !s.profile)
    .map((s) => ({
      value: String(s.id),
      label: `${s.first_name ?? ''} ${s.last_name ?? ''}`.trim() || s.email || `Staff #${s.id}`,
    }));

  const markMut = useMutation({
    mutationFn: () =>
      markAbsent(token, {
        staff_id: Number(staffId),
        date,
        day_of_week: dateToDoW(date),
        reason: reason || undefined,
      }),
    onSuccess: () => { setStaffId(null); setReason(''); onRefresh(); },
  });

  return (
    <Card>
      <Text fw={600} size="sm" mb="md">Mark Teacher Absent</Text>
      <Group align="flex-end" gap="sm" wrap="wrap">
        <Select
          label="Teacher"
          placeholder="Select teacher…"
          data={staffOptions}
          value={staffId}
          onChange={setStaffId}
          searchable
          w={220}
        />
        <TextInput
          type="date"
          label="Date"
          value={date}
          onChange={(e) => setDate(e.currentTarget.value)}
          w={150}
        />
        <TextInput
          label="Reason (optional)"
          placeholder="Sick leave, etc."
          value={reason}
          onChange={(e) => setReason(e.currentTarget.value)}
          style={{ flex: 1, minWidth: 160 }}
        />
        <Button
          leftSection={<UserX size={14} />}
          onClick={() => markMut.mutate()}
          loading={markMut.isPending}
          disabled={!staffId || !date}
        >
          Mark Absent
        </Button>
      </Group>
      {markMut.isSuccess && (
        <Text size="xs" c="mint.7" mt="xs">
          Substitution slots created.
        </Text>
      )}
    </Card>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────
export function SubstitutionScreen() {
  const token = useAuth((s) => s.token)!;
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['substitutions', statusFilter],
    queryFn: () => fetchSubstitutions(token, statusFilter ?? undefined),
    enabled: !!token,
    staleTime: 30_000,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['substitutions'] });
    qc.invalidateQueries({ queryKey: ['substitution-suggestions'] });
  };

  const subs = data?.substitutions ?? [];
  const pendingCount = subs.filter((s) => s.status === 'pending').length;

  return (
    <Container size="xl" px={0}>
      <Stack gap="lg">
        <Group justify="space-between" align="flex-end" wrap="nowrap">
          <div>
            <Title order={2}>Substitution</Title>
            <Text c="dimmed" size="sm">
              {pendingCount > 0 ? `${pendingCount} slots need a substitute` : 'All slots covered'}
            </Text>
          </div>
          <Select
            size="xs"
            placeholder="All statuses"
            data={[
              { value: 'pending', label: 'Pending' },
              { value: 'assigned', label: 'Assigned' },
              { value: 'resolved', label: 'Resolved' },
            ]}
            value={statusFilter}
            onChange={setStatusFilter}
            clearable
            w={160}
          />
        </Group>

        <MarkAbsentPanel token={token} onRefresh={refresh} />

        <Stack gap="xs">
          {isLoading ? (
            Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} height={80} radius="md" />)
          ) : subs.length > 0 ? (
            subs.map((sub) => (
              <SubstitutionRow key={sub.id} sub={sub} token={token} onRefresh={refresh} />
            ))
          ) : (
            <Card>
              <Stack align="center" py="xl" gap="xs">
                <Check size={36} strokeWidth={1.5} color="var(--mantine-color-gray-4)" />
                <Text fw={500} c="dimmed">No substitutions found</Text>
                <Text size="xs" c="dimmed" ta="center">
                  When a teacher is marked absent, their timetable slots appear here for reassignment.
                </Text>
              </Stack>
            </Card>
          )}
        </Stack>
      </Stack>
    </Container>
  );
}
