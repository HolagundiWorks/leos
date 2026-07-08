import { useState } from 'react';
import {
  Badge,
  Card,
  Container,
  Grid,
  Group,
  ScrollArea,
  Skeleton,
  Stack,
  Text,
  ThemeIcon,
  UnstyledButton,
} from '@mantine/core';
import { Calendar } from '@mantine/dates';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Building2, CalendarClock, CalendarHeart, ChevronRight, CircleAlert, ClipboardList, Flame, GraduationCap, Info, Layers, PartyPopper, UserCheck, Users, Wallet } from 'lucide-react';
import dayjs from 'dayjs';
import type { LucideIcon } from 'lucide-react';
import type { AccentColor } from '../theme';
import { ApiError, type WorkItem } from '../api/client';
import { useDashboardToday } from '../hooks/useDashboardToday';
import { useAuth } from '../stores/auth';
import { EventFab } from './EventFab';

const BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8787';

// ─── Stat card data ────────────────────────────────────────────────────────────
interface DashStats { students: number; staff: number; sections: number; pending_fees: number; }

// ─── Agenda (categorised upcoming meetings + events) ────────────────────────────
interface AgendaItem { id: number; title: string; date: string | null; start_time?: string | null; venue: string | null; }
interface AgendaData { department: AgendaItem[]; staff: AgendaItem[]; parent: AgendaItem[]; events: AgendaItem[]; }

// ─── Focus (tag-driven: critical items + due dates) ─────────────────────────────
interface FocusItem { kind: string; id: number; title: string; tag: string | null; due_date: string | null; }
interface FocusData { critical: FocusItem[]; due: FocusItem[]; }

const TAG_COLOR: Record<string, AccentColor> = {
  critical: 'peach',
  urgent: 'yellow',
  normal: 'sky',
  high: 'yellow',
  low: 'sky',
};
const tagColor = (t: string | null): AccentColor => TAG_COLOR[t ?? 'normal'] ?? 'sky';

const SEV: Record<WorkItem['severity'], { color: AccentColor; Icon: LucideIcon }> = {
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
            <Card p="sm" style={{ borderTop: `3px solid var(--mantine-color-${def.color}-5)` }}>
              <Group wrap="nowrap" justify="space-between">
                <Stack gap={0}>
                  <Text size="lg" fw={700} lh={1.1}>{stats[def.key as keyof DashStats].toLocaleString()}</Text>
                  <Text size="xs" c="dimmed">{def.label}</Text>
                </Stack>
                <ThemeIcon variant="light" color={def.color} size={34} radius="md">
                  <def.Icon size={18} />
                </ThemeIcon>
              </Group>
            </Card>
          </UnstyledButton>
        </Grid.Col>
      ))}
    </Grid>
  );
}

// ─── Agenda card (one category) ─────────────────────────────────────────────────
function AgendaCard({
  label, Icon, color, items, onNavigate,
}: { label: string; Icon: LucideIcon; color: AccentColor; items: AgendaItem[]; onNavigate: (m: string) => void }) {
  return (
    <Card p="sm" style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <Group justify="space-between" mb={6} wrap="nowrap">
        <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
          <ThemeIcon variant="light" color={color} radius="md" size={26}>
            <Icon size={14} strokeWidth={2} />
          </ThemeIcon>
          <Text fw={650} size="xs" truncate>{label}</Text>
        </Group>
        {items.length > 0 && <Badge variant="light" color={color} radius="sm" size="sm">{items.length}</Badge>}
      </Group>
      <ScrollArea style={{ flex: 1 }} type="auto" scrollbarSize={5}>
        {items.length === 0 ? (
          <Text size="xs" c="dimmed">None scheduled.</Text>
        ) : (
          <Stack gap={5}>
            {items.slice(0, 4).map((it) => (
              <Group key={it.id} gap={6} wrap="nowrap" align="flex-start">
                <Text fw={700} c={color} style={{ fontSize: '0.68rem', flexShrink: 0, width: 46 }}>
                  {it.date ? dayjs(it.date).format('MMM D') : '—'}
                </Text>
                <div style={{ minWidth: 0 }}>
                  <Text size="xs" fw={500} truncate>{it.title}</Text>
                  <Text size="xs" c="dimmed" truncate>
                    {[it.start_time, it.venue].filter(Boolean).join(' · ') || '—'}
                  </Text>
                </div>
              </Group>
            ))}
          </Stack>
        )}
      </ScrollArea>
      <UnstyledButton onClick={() => onNavigate('events')} mt={4}>
        <Group gap={2}><Text size="xs" c={color} fw={500}>Open</Text><ChevronRight size={12} /></Group>
      </UnstyledButton>
    </Card>
  );
}

// ─── Agenda section (4 category cards) ──────────────────────────────────────────
function AgendaSection({ token, onNavigate }: { token: string; onNavigate: (m: string) => void }) {
  const { data } = useQuery<AgendaData>({
    queryKey: ['dashboard-agenda'],
    queryFn: async () => {
      const r = await fetch(`${BASE}/dashboard/agenda`, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) throw new ApiError(`HTTP ${r.status}`, r.status);
      return r.json() as Promise<AgendaData>;
    },
    enabled: !!token,
    staleTime: 60_000,
  });

  const agenda: AgendaData = data && Array.isArray(data.staff)
    ? data
    : { department: [], staff: [], parent: [], events: [] };

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gridTemplateRows: '1fr 1fr',
        gap: 'var(--mantine-spacing-sm)',
        height: '100%',
      }}
    >
      <AgendaCard label="Department Meetings" Icon={Building2} color="lavender" items={agenda.department} onNavigate={onNavigate} />
      <AgendaCard label="Staff Meetings" Icon={Users} color="brand" items={agenda.staff} onNavigate={onNavigate} />
      <AgendaCard label="Parent Meetings" Icon={UserCheck} color="mint" items={agenda.parent} onNavigate={onNavigate} />
      <AgendaCard label="Upcoming Events" Icon={CalendarHeart} color="peach" items={agenda.events} onNavigate={onNavigate} />
    </div>
  );
}

// ─── Focus card (critical items, or items with due dates) ───────────────────────
function FocusCard({
  label, Icon, color, items, mode, onNavigate,
}: {
  label: string; Icon: LucideIcon; color: AccentColor; items: FocusItem[];
  mode: 'tag' | 'due'; onNavigate: (m: string) => void;
}) {
  const today = dayjs().startOf('day');
  return (
    <Card p="md" style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <Group justify="space-between" mb="xs" wrap="nowrap">
        <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
          <ThemeIcon variant="light" color={color} radius="md" size={28}>
            <Icon size={15} strokeWidth={2} />
          </ThemeIcon>
          <Text fw={650} size="sm" truncate>{label}</Text>
        </Group>
        {items.length > 0 && <Badge variant="light" color={color} radius="sm" size="sm">{items.length}</Badge>}
      </Group>
      <ScrollArea style={{ flex: 1 }} type="auto">
        {items.length === 0 ? (
          <Text size="xs" c="dimmed">{mode === 'tag' ? 'Nothing critical.' : 'No due dates.'}</Text>
        ) : (
          <Stack gap={6}>
            {items.map((it) => {
              const overdue = it.due_date ? dayjs(it.due_date).isBefore(today) : false;
              return (
                <Group key={`${it.kind}-${it.id}`} gap={8} wrap="nowrap" align="flex-start">
                  {mode === 'due' && (
                    <Text fw={700} c={overdue ? 'red' : color} style={{ fontSize: '0.68rem', flexShrink: 0, width: 46 }}>
                      {it.due_date ? dayjs(it.due_date).format('MMM D') : '—'}
                    </Text>
                  )}
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <Text size="xs" fw={500} truncate>{it.title}</Text>
                    <Group gap={6} wrap="nowrap">
                      <Badge size="xs" variant="dot" color={tagColor(it.tag)}>{it.tag ?? 'normal'}</Badge>
                      <Text size="xs" c="dimmed" tt="capitalize">{it.kind}</Text>
                      {mode === 'tag' && it.due_date && (
                        <Text size="xs" c={overdue ? 'red' : 'dimmed'}>· {dayjs(it.due_date).format('MMM D')}</Text>
                      )}
                    </Group>
                  </div>
                </Group>
              );
            })}
          </Stack>
        )}
      </ScrollArea>
      <UnstyledButton onClick={() => onNavigate('reminders')} mt={4}>
        <Group gap={2}><Text size="xs" c={color} fw={500}>Open</Text><ChevronRight size={12} /></Group>
      </UnstyledButton>
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

  const { data: focusRaw } = useQuery<FocusData>({
    queryKey: ['dashboard-focus'],
    queryFn: async () => {
      const r = await fetch(`${BASE}/dashboard/focus`, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) throw new ApiError(`HTTP ${r.status}`, r.status);
      return r.json() as Promise<FocusData>;
    },
    enabled: !!token,
    staleTime: 60_000,
  });
  const focus: FocusData = focusRaw && Array.isArray(focusRaw.critical) ? focusRaw : { critical: [], due: [] };

  // Fits a single screen: header (80px) collapsed on the Dashboard tab, then a
  // fixed stat row + a flex grid (focus cards · agenda · calendar/queue) below.
  return (
    <Container
      fluid
      px={0}
      style={{ height: 'calc(100dvh - 112px)', display: 'flex', flexDirection: 'column' }}
    >
      <Stack gap="sm" style={{ flex: 1, minHeight: 0 }}>
        {/* Stat cards */}
        {statsData && typeof statsData.students === 'number' ? (
          <StatCards stats={statsData} onNavigate={onNavigate} />
        ) : (
          <Grid gutter="sm">
            {Array.from({ length: 4 }).map((_, i) => <Grid.Col key={i} span={{ base: 6, sm: 3 }}><Skeleton height={60} radius="md" /></Grid.Col>)}
          </Grid>
        )}

        {/* Main area: focus cards · agenda · calendar+queue — fills remaining height */}
        <Grid gutter="sm" style={{ flex: 1, minHeight: 0 }}>
          {/* Critical + Due Date (tag-driven) */}
          <Grid.Col span={{ base: 12, md: 4 }} style={{ height: '100%' }}>
            <div style={{ display: 'grid', gridTemplateRows: '1fr 1fr', gap: 'var(--mantine-spacing-sm)', height: '100%' }}>
              <FocusCard label="Critical" Icon={Flame} color="peach" items={focus.critical} mode="tag" onNavigate={onNavigate} />
              <FocusCard label="Due Dates" Icon={CalendarClock} color="brand" items={focus.due} mode="due" onNavigate={onNavigate} />
            </div>
          </Grid.Col>

          {/* Categorised agenda: department / staff / parent meetings + events */}
          <Grid.Col span={{ base: 12, md: 5 }} style={{ height: '100%' }}>
            {token && <AgendaSection token={token} onNavigate={onNavigate} />}
          </Grid.Col>

          {/* Calendar + Today work queue */}
          <Grid.Col span={{ base: 12, md: 3 }} style={{ height: '100%' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--mantine-spacing-sm)', height: '100%' }}>
              <Card p="md" style={{ flexShrink: 0, overflow: 'hidden' }}>
                <Group justify="space-between" mb="xs" wrap="nowrap">
                  <Text fw={650} size="sm">Calendar</Text>
                  <Badge variant="light" color="brand" size="sm">{dayjs(selected).format('MMM D')}</Badge>
                </Group>
                <Calendar
                  size="sm"
                  getDayProps={(date) => ({
                    selected: dayjs(date).isSame(selected, 'day'),
                    onClick: () => setSelected(date),
                  })}
                />
              </Card>
              <Card p="md" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <Group justify="space-between" mb="xs" wrap="nowrap">
                  <Group gap={6}>
                    <ClipboardList size={15} color="var(--mantine-color-brand-6)" />
                    <Text fw={650} size="sm">Today</Text>
                  </Group>
                  {items.length > 0 && <Badge variant="light" color="yellow" size="sm">{items.length}</Badge>}
                </Group>
                <ScrollArea style={{ flex: 1 }} type="auto">
                  {loadingToday ? (
                    <Stack gap={6}>
                      {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} height={40} radius="md" />)}
                    </Stack>
                  ) : items.length === 0 ? (
                    <Group gap="xs" c="dimmed" py="xs">
                      <PartyPopper size={16} />
                      <Text size="xs">All caught up.</Text>
                    </Group>
                  ) : (
                    <Stack gap={2}>
                      {items.map((it) => <WorkRow key={it.key} item={it} onNavigate={onNavigate} />)}
                    </Stack>
                  )}
                </ScrollArea>
              </Card>
            </div>
          </Grid.Col>
        </Grid>
      </Stack>

      {/* Floating create button (bottom-right) */}
      <EventFab />
    </Container>
  );
}
