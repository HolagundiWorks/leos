import { useState } from 'react';
import {
  Badge,
  Card,
  Container,
  Grid,
  Group,
  Skeleton,
  Stack,
  Text,
  ThemeIcon,
  UnstyledButton,
} from '@mantine/core';
import { Calendar } from '@mantine/dates';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ChevronRight, CircleAlert, GraduationCap, Info, Layers, PartyPopper, Users, Wallet } from 'lucide-react';
import dayjs from 'dayjs';
import type { IconComponent } from '../icons';
import type { AccentColor } from '../theme';
import { ApiError, type WorkItem } from '../api/client';
import { useDashboardToday } from '../hooks/useDashboardToday';
import { useAuth } from '../stores/auth';

const BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8787';

// ─── Stat card data ────────────────────────────────────────────────────────────
interface DashStats { students: number; staff: number; sections: number; pending_fees: number; }
interface MeetingToday { id: number; title: string; meeting_type: string | null; start_time: string | null; end_time: string | null; venue: string | null; status: string | null; }

const SEV: Record<WorkItem['severity'], { color: AccentColor; Icon: IconComponent }> = {
  danger: { color: 'peach', Icon: CircleAlert },
  warning: { color: 'yellow', Icon: AlertTriangle },
  info: { color: 'sky', Icon: Info },
};

function WorkRow({ item, onNavigate }: { item: WorkItem; onNavigate: (m: string) => void }) {
  const s = SEV[item.severity] ?? SEV.info;
  const Icon = s.Icon;
  return (
    <UnstyledButton
      onClick={() => onNavigate(item.module)}
      p="sm"
      style={{ borderRadius: 'var(--mantine-radius-md)', width: '100%' }}
    >
      <Group wrap="nowrap" gap="md">
        <ThemeIcon variant="light" color={s.color} radius="md" size={34}>
          <Icon size={18} strokeWidth={2} />
        </ThemeIcon>
        {item.count > 0 && (
          <Badge color={s.color} variant="light" radius="sm">{item.count}</Badge>
        )}
        <Text style={{ flex: 1 }} fw={500}>{item.label}</Text>
        <ChevronRight size={18} color="var(--mantine-color-gray-5)" />
      </Group>
    </UnstyledButton>
  );
}

// ─── Stat cards ────────────────────────────────────────────────────────────────
const STAT_DEFS = [
  { key: 'students', label: 'Students', Icon: GraduationCap, color: 'brand' as AccentColor, module: 'students' },
  { key: 'staff', label: 'Staff', Icon: Users, color: 'mint' as AccentColor, module: 'staff' },
  { key: 'sections', label: 'Sections', Icon: Layers, color: 'lavender' as AccentColor, module: 'classes' },
  { key: 'pending_fees', label: 'Fee Outstanding', Icon: Wallet, color: 'peach' as AccentColor, module: 'fees' },
];

function StatCards({ stats, onNavigate }: { stats: DashStats; onNavigate: (m: string) => void }) {
  return (
    <Grid gutter="sm">
      {STAT_DEFS.map((def) => (
        <Grid.Col key={def.key} span={{ base: 6, sm: 3 }}>
          <UnstyledButton onClick={() => onNavigate(def.module)} style={{ width: '100%' }}>
            <Card p="md" style={{ borderTop: `3px solid var(--mantine-color-${def.color}-5)` }}>
              <Group wrap="nowrap" justify="space-between">
                <Stack gap={0}>
                  <Text size="xl" fw={700}>{stats[def.key as keyof DashStats].toLocaleString()}</Text>
                  <Text size="xs" c="dimmed">{def.label}</Text>
                </Stack>
                <ThemeIcon variant="light" color={def.color} size={40} radius="md">
                  <def.Icon size={20} />
                </ThemeIcon>
              </Group>
            </Card>
          </UnstyledButton>
        </Grid.Col>
      ))}
    </Grid>
  );
}

// ─── Meetings today widget ─────────────────────────────────────────────────────
function MeetingsTodayCard({ meetings }: { meetings: MeetingToday[] }) {
  if (meetings.length === 0) return null;
  return (
    <Card>
      <Text fw={650} mb="sm">Today's Meetings</Text>
      <Stack gap="xs">
        {meetings.map((m) => (
          <Group key={m.id} gap="md" p="xs" style={{ borderLeft: '3px solid var(--mantine-color-brand-5)', background: 'var(--mantine-color-gray-0)', borderRadius: 6 }}>
            <Text fw={700} c="brand" w={48} style={{ flexShrink: 0, fontSize: '0.8rem' }}>{m.start_time ?? '—'}</Text>
            <div style={{ minWidth: 0 }}>
              <Text fw={600} truncate size="sm">{m.title}</Text>
              <Text size="xs" c="dimmed">{m.venue ?? m.meeting_type}</Text>
            </div>
            <Badge size="xs" ml="auto" variant="outline">{m.meeting_type}</Badge>
          </Group>
        ))}
      </Stack>
    </Card>
  );
}

// ─── Main dashboard ────────────────────────────────────────────────────────────
export function DashboardScreen({ onNavigate }: { onNavigate: (module: string) => void }) {
  const token = useAuth((s) => s.token);
  const [selected, setSelected] = useState<Date>(new Date());
  const { data: todayData, isLoading: loadingToday } = useDashboardToday();
  const items = todayData ?? [];

  const { data: statsData } = useQuery<DashStats>({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      const r = await fetch(`${BASE}/dashboard/stats`, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) throw new ApiError(`HTTP ${r.status}`, r.status);
      return r.json() as Promise<DashStats>;
    },
    enabled: !!token,
    staleTime: 120_000,
  });

  const { data: meetingsData } = useQuery<{ meetings: MeetingToday[] }>({
    queryKey: ['dashboard-meetings-today'],
    queryFn: async () => {
      const r = await fetch(`${BASE}/dashboard/meetings-today`, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) throw new ApiError(`HTTP ${r.status}`, r.status);
      return r.json() as Promise<{ meetings: MeetingToday[] }>;
    },
    enabled: !!token,
    staleTime: 60_000,
  });

  return (
    <Container size="xl" px={0}>
      <Stack gap="lg">
        {/* Stat cards */}
        {statsData && typeof statsData.students === 'number' ? (
          <StatCards stats={statsData} onNavigate={onNavigate} />
        ) : (
          <Grid gutter="sm">
            {Array.from({ length: 4 }).map((_, i) => <Grid.Col key={i} span={{ base: 6, sm: 3 }}><Skeleton height={76} radius="md" /></Grid.Col>)}
          </Grid>
        )}

        {/* Needs-attention work queue */}
        <Card>
          <Group justify="space-between" mb="xs">
            <Text fw={650}>Today</Text>
            {items.length > 0 && <Badge variant="light" color="yellow">{items.length} to act on</Badge>}
          </Group>
          {loadingToday ? (
            <Stack gap={6}>
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} height={50} radius="md" />)}
            </Stack>
          ) : items.length === 0 ? (
            <Group justify="center" py="lg" gap="xs" c="dimmed">
              <PartyPopper size={18} />
              <Text>You're all caught up.</Text>
            </Group>
          ) : (
            <Stack gap={2}>
              {items.map((it) => <WorkRow key={it.key} item={it} onNavigate={onNavigate} />)}
            </Stack>
          )}
        </Card>

        {/* Meetings today */}
        {meetingsData && (meetingsData.meetings?.length ?? 0) > 0 && (
          <MeetingsTodayCard meetings={meetingsData.meetings} />
        )}

        {/* Calendar */}
        <Card>
          <Group justify="space-between" mb="sm">
            <Text fw={650}>Calendar</Text>
            <Badge variant="light" color="brand">{dayjs(selected).format('MMM D')}</Badge>
          </Group>
          <Calendar
            size="md"
            getDayProps={(date) => ({
              selected: dayjs(date).isSame(selected, 'day'),
              onClick: () => setSelected(date),
            })}
          />
        </Card>
      </Stack>
    </Container>
  );
}
