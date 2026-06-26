/**
 * Role-based personal dashboards.
 * Each user level sees a different view optimised for their daily workflow.
 *
 * L1 (Principal)  → Full ops cockpit (stats + queue + meetings + alerts)
 * L2 Teacher      → Today's timetable + class attendance quick-mark
 * L2 Accountant   → Fee collection summary + outstanding
 * L2 Admin/Other  → Task inbox + announcements
 * L3 Class Teacher→ Their section snapshot + quick attendance
 * L4+             → Noticeboard
 */

import { Badge, Button, Card, Container, Group, SimpleGrid, Skeleton, Stack, Text, Title } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, Bell, CalendarCheck, ClipboardList, TrendingUp, Users, Wallet } from 'lucide-react';
import { ApiError } from '../api/client';
import { useAuth } from '../stores/auth';
import { profileToLevel } from '../ribbon.config';
import { DashboardScreen } from './DashboardPage';

const BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8787';
const authed = (token: string) => ({ Authorization: `Bearer ${token}` });

async function apiFetch<T>(url: string, token: string): Promise<T> {
  const r = await fetch(url, { headers: authed(token) });
  if (!r.ok) throw new ApiError(`HTTP ${r.status}`, r.status);
  return r.json() as Promise<T>;
}

// ─── Teacher dashboard (L2) ───────────────────────────────────────────────────
function TeacherDashboard({ token, onNavigate }: { token: string; onNavigate: (k: string) => void }) {
  const { data: stats } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: () => apiFetch(`${BASE}/dashboard/stats`, token),
    staleTime: 60_000,
  });

  const { data: queue } = useQuery({
    queryKey: ['dashboard-today'],
    queryFn: () => apiFetch(`${BASE}/dashboard/today`, token),
    staleTime: 30_000,
  });

  const items: Array<{ type: string; title: string; subtitle?: string }> = Array.isArray(queue) ? queue : [];
  const pendingSubs = items.filter((i) => i.type === 'substitution');
  const upcomingExams = items.filter((i) => i.type === 'exam');

  return (
    <Container size="lg" px={0}>
      <Stack gap="md">
        <Title order={3}>Good to see you</Title>

        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
          <Card p="sm" withBorder style={{ borderTop: '3px solid var(--mantine-color-brand-5)' }}>
            <Group gap="xs" mb={4}><CalendarCheck size={14} /><Text size="xs" c="dimmed">Attendance today</Text></Group>
            <Button variant="light" color="brand" size="xs" fullWidth onClick={() => onNavigate('attendance')}>
              Mark Attendance
            </Button>
          </Card>
          <Card p="sm" withBorder style={{ borderTop: '3px solid var(--mantine-color-orange-5)' }}>
            <Group gap="xs" mb={4}><ClipboardList size={14} /><Text size="xs" c="dimmed">Upcoming exams</Text></Group>
            <Text fw={700} size="xl">{upcomingExams.length}</Text>
            <Text size="xs" c="dimmed">this week</Text>
          </Card>
          <Card p="sm" withBorder style={{ borderTop: '3px solid var(--mantine-color-yellow-5)' }}>
            <Group gap="xs" mb={4}><AlertCircle size={14} /><Text size="xs" c="dimmed">Substitutions pending</Text></Group>
            <Text fw={700} size="xl">{pendingSubs.length}</Text>
            <Button variant="subtle" size="xs" mt={4} onClick={() => onNavigate('substitution')}>Resolve</Button>
          </Card>
        </SimpleGrid>

        <Card withBorder p="sm">
          <Group gap="xs" mb="sm"><ClipboardList size={14} /><Text size="sm" fw={600}>My Action Items</Text></Group>
          {items.length === 0 ? (
            <Text size="sm" c="dimmed">All clear — no pending items today.</Text>
          ) : (
            <Stack gap={6}>
              {items.slice(0, 8).map((item, i) => (
                <Group key={i} justify="space-between" style={{ padding: '4px 0', borderBottom: '1px solid var(--mantine-color-gray-1)' }}>
                  <Text size="sm">{item.title}</Text>
                  <Badge size="xs" variant="outline">{item.type}</Badge>
                </Group>
              ))}
            </Stack>
          )}
        </Card>

        {stats && (
          <Group gap="sm">
            <Text size="xs" c="dimmed">Total students: {stats.students}</Text>
            <Text size="xs" c="dimmed">·</Text>
            <Text size="xs" c="dimmed">Total sections: {stats.sections}</Text>
          </Group>
        )}
      </Stack>
    </Container>
  );
}

// ─── Accountant dashboard (L2 accountant) ────────────────────────────────────
function AccountantDashboard({ token, onNavigate }: { token: string; onNavigate: (k: string) => void }) {
  const { data: stats } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: () => apiFetch(`${BASE}/dashboard/stats`, token),
    staleTime: 60_000,
  });

  const { data: queue } = useQuery({
    queryKey: ['dashboard-today'],
    queryFn: () => apiFetch(`${BASE}/dashboard/today`, token),
    staleTime: 30_000,
  });

  const items: Array<{ type: string; title: string }> = Array.isArray(queue) ? queue : [];
  const feeAlerts = items.filter((i) => i.type === 'fee');

  return (
    <Container size="lg" px={0}>
      <Stack gap="md">
        <Title order={3}>Finance Overview</Title>
        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
          <Card p="sm" withBorder style={{ borderTop: '3px solid var(--mantine-color-green-5)' }}>
            <Group gap="xs" mb={4}><Wallet size={14} /><Text size="xs" c="dimmed">Fee Outstanding</Text></Group>
            <Text fw={700} size="xl">{stats?.pending_fees ?? '—'}</Text>
            <Button variant="subtle" size="xs" mt={4} onClick={() => onNavigate('fees')}>View Dues</Button>
          </Card>
          <Card p="sm" withBorder style={{ borderTop: '3px solid var(--mantine-color-orange-5)' }}>
            <Group gap="xs" mb={4}><AlertCircle size={14} /><Text size="xs" c="dimmed">Overdue students</Text></Group>
            <Text fw={700} size="xl">{feeAlerts.length}</Text>
          </Card>
          <Card p="sm" withBorder style={{ borderTop: '3px solid var(--mantine-color-brand-5)' }}>
            <Group gap="xs" mb={4}><TrendingUp size={14} /><Text size="xs" c="dimmed">Actions</Text></Group>
            <Stack gap={4}>
              <Button variant="light" size="xs" onClick={() => onNavigate('fees')}>Collect Fee</Button>
              <Button variant="subtle" size="xs" onClick={() => onNavigate('payroll')}>Payroll</Button>
            </Stack>
          </Card>
        </SimpleGrid>
      </Stack>
    </Container>
  );
}

// ─── Class teacher dashboard (L3) ─────────────────────────────────────────────
function ClassTeacherDashboard({ token, onNavigate }: { token: string; onNavigate: (k: string) => void }) {
  const { data: queue } = useQuery({
    queryKey: ['dashboard-today'],
    queryFn: () => apiFetch(`${BASE}/dashboard/today`, token),
    staleTime: 30_000,
  });

  const items: Array<{ type: string; title: string }> = Array.isArray(queue) ? queue : [];

  return (
    <Container size="lg" px={0}>
      <Stack gap="md">
        <Title order={3}>Class Overview</Title>
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
          <Card p="sm" withBorder style={{ borderTop: '3px solid var(--mantine-color-brand-5)' }}>
            <Group gap="xs" mb={4}><CalendarCheck size={14} /><Text size="xs" c="dimmed">Today's attendance</Text></Group>
            <Button variant="light" color="brand" size="sm" fullWidth onClick={() => onNavigate('attendance')}>
              Mark Attendance
            </Button>
          </Card>
          <Card p="sm" withBorder style={{ borderTop: '3px solid var(--mantine-color-blue-5)' }}>
            <Group gap="xs" mb={4}><Users size={14} /><Text size="xs" c="dimmed">My students</Text></Group>
            <Button variant="subtle" size="sm" fullWidth onClick={() => onNavigate('students')}>
              View Students
            </Button>
          </Card>
        </SimpleGrid>

        <Card withBorder p="sm">
          <Group gap="xs" mb="sm"><Bell size={14} /><Text size="sm" fw={600}>Notices & Tasks</Text></Group>
          {items.length === 0 ? (
            <Text size="sm" c="dimmed">No pending items.</Text>
          ) : (
            <Stack gap={4}>
              {items.slice(0, 6).map((item, i) => (
                <Group key={i} gap="sm">
                  <Badge size="xs" variant="outline">{item.type}</Badge>
                  <Text size="sm">{item.title}</Text>
                </Group>
              ))}
            </Stack>
          )}
        </Card>
      </Stack>
    </Container>
  );
}

// ─── Basic noticeboard for L4/L5 ─────────────────────────────────────────────
function NoticeboardDashboard({ token }: { token: string }) {
  const { data: queue, isLoading } = useQuery({
    queryKey: ['dashboard-today'],
    queryFn: () => apiFetch(`${BASE}/dashboard/today`, token),
    staleTime: 60_000,
  });

  const items: Array<{ type: string; title: string }> = Array.isArray(queue) ? queue : [];

  return (
    <Container size="md" px={0}>
      <Stack gap="md">
        <Title order={3}>Noticeboard</Title>
        <Card withBorder p="sm">
          {isLoading ? <Skeleton height={100} /> : items.length === 0 ? (
            <Text size="sm" c="dimmed">No notices today.</Text>
          ) : (
            <Stack gap={6}>
              {items.map((item, i) => (
                <Group key={i} gap="sm" style={{ padding: '4px 0', borderBottom: '1px solid var(--mantine-color-gray-1)' }}>
                  <Badge size="xs" variant="outline">{item.type}</Badge>
                  <Text size="sm">{item.title}</Text>
                </Group>
              ))}
            </Stack>
          )}
        </Card>
      </Stack>
    </Container>
  );
}

// ─── Routing dispatcher ────────────────────────────────────────────────────────
export function RoleDashboard({ onNavigate }: { onNavigate: (key: string) => void }) {
  const user = useAuth((s) => s.user);
  const token = useAuth((s) => s.token)!;
  const profile = user?.profile ?? '';
  const level = profileToLevel(profile);

  // L1 — Principal gets the full principal dashboard
  if (level === 1) return <DashboardScreen onNavigate={onNavigate} />;

  // L2 — Accountant gets finance view
  if (level === 2 && (profile as string) === 'accountant') {
    return <AccountantDashboard token={token} onNavigate={onNavigate} />;
  }

  // L2 — Teachers get teaching view
  if (level === 2) {
    return <TeacherDashboard token={token} onNavigate={onNavigate} />;
  }

  // L3 — Class teacher gets class snapshot
  if (level === 3) {
    return <ClassTeacherDashboard token={token} onNavigate={onNavigate} />;
  }

  // L4/L5 — Noticeboard
  return <NoticeboardDashboard token={token} />;
}
