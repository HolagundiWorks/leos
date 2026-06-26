import { useState } from 'react';
import {
  Avatar,
  Badge,
  Card,
  Container,
  Grid,
  Group,
  Skeleton,
  Stack,
  Text,
  ThemeIcon,
  Title,
  UnstyledButton,
} from '@mantine/core';
import { Calendar } from '@mantine/dates';
import { AlertTriangle, ChevronRight, CircleAlert, Info, PartyPopper } from 'lucide-react';
import dayjs from 'dayjs';
import type { IconComponent } from '../icons';
import type { AccentColor } from '../theme';
import type { WorkItem } from '../api/client';
import type { SessionUser } from '../types';
import { useDashboardToday } from '../hooks/useDashboardToday';

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
      className="hcw-workrow"
      p="sm"
      style={{ borderRadius: 'var(--mantine-radius-md)', width: '100%' }}
    >
      <Group wrap="nowrap" gap="md">
        <ThemeIcon variant="light" color={s.color} radius="md" size={34}>
          <Icon size={18} strokeWidth={2} />
        </ThemeIcon>
        {item.count > 0 && (
          <Badge color={s.color} variant="light" radius="sm">
            {item.count}
          </Badge>
        )}
        <Text style={{ flex: 1 }} fw={500}>
          {item.label}
        </Text>
        <ChevronRight size={18} color="var(--mantine-color-gray-5)" />
      </Group>
    </UnstyledButton>
  );
}

interface AgendaItem {
  time: string;
  title: string;
  who: string;
  color: AccentColor;
}

const agenda: AgendaItem[] = [
  { time: '08:30', title: 'Grade 9 — Mathematics', who: 'Ms. Anika Rao', color: 'brand' },
  { time: '10:00', title: 'Grade 10 — Biology', who: 'Mr. David Lee', color: 'mint' },
  { time: '11:30', title: 'Staff sync', who: 'Faculty room', color: 'peach' },
  { time: '14:00', title: 'Parent meeting — Sharma', who: 'Office 2', color: 'lavender' },
];

function AgendaRow({ item }: { item: AgendaItem }) {
  return (
    <Group
      wrap="nowrap"
      gap="md"
      p="sm"
      style={{
        borderRadius: 'var(--mantine-radius-md)',
        borderLeft: `4px solid var(--mantine-color-${item.color}-5)`,
        background: 'var(--mantine-color-gray-0)',
      }}
    >
      <Text fw={700} c={item.color} w={48} style={{ flexShrink: 0 }}>
        {item.time}
      </Text>
      <Avatar radius="xl" color={item.color} variant="light" size="md">
        {item.who.split(' ').map((p) => p[0]).slice(0, 2).join('')}
      </Avatar>
      <div style={{ minWidth: 0 }}>
        <Text fw={600} truncate>
          {item.title}
        </Text>
        <Text size="sm" c="dimmed" truncate>
          {item.who}
        </Text>
      </div>
    </Group>
  );
}

/** Active work-queue dashboard: "Today" needs-attention list, then context. */
export function DashboardScreen({
  user,
  onNavigate,
}: {
  user: SessionUser;
  onNavigate: (module: string) => void;
}) {
  const [selected, setSelected] = useState<Date>(new Date());
  const { data, isLoading } = useDashboardToday();
  const items = data ?? [];

  return (
    <Container size="xl" px={0}>
      <Stack gap="lg">
        <div>
          <Title order={2}>Good morning, {user.name.split(' ')[0]} 👋</Title>
          <Text c="dimmed">
            {dayjs().format('dddd, D MMMM YYYY')} · here's what needs your attention.
          </Text>
        </div>

        <Card>
          <Group justify="space-between" mb="xs">
            <Text fw={650}>Today</Text>
            {items.length > 0 && (
              <Badge variant="light" color="yellow">
                {items.length} to act on
              </Badge>
            )}
          </Group>
          {isLoading ? (
            <Stack gap={6}>
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} height={50} radius="md" />
              ))}
            </Stack>
          ) : items.length === 0 ? (
            <Group justify="center" py="lg" gap="xs" c="dimmed">
              <PartyPopper size={18} />
              <Text>You're all caught up.</Text>
            </Group>
          ) : (
            <Stack gap={2}>
              {items.map((it) => (
                <WorkRow key={it.key} item={it} onNavigate={onNavigate} />
              ))}
            </Stack>
          )}
        </Card>

        <Grid gutter="md">
          <Grid.Col span={{ base: 12, md: 5 }}>
            <Card h="100%">
              <Group justify="space-between" mb="sm">
                <Text fw={650}>Calendar</Text>
                <Badge variant="light" color="brand">
                  {dayjs(selected).format('MMM D')}
                </Badge>
              </Group>
              <Calendar
                size="md"
                getDayProps={(date) => ({
                  selected: dayjs(date).isSame(selected, 'day'),
                  onClick: () => setSelected(date),
                })}
              />
            </Card>
          </Grid.Col>

          <Grid.Col span={{ base: 12, md: 7 }}>
            <Card h="100%">
              <Group justify="space-between" mb="md">
                <Text fw={650}>Today's schedule</Text>
                <Badge variant="light" color="mint">
                  {agenda.length} events
                </Badge>
              </Group>
              <Stack gap="xs">
                {agenda.map((item) => (
                  <AgendaRow key={item.time} item={item} />
                ))}
              </Stack>
            </Card>
          </Grid.Col>
        </Grid>
      </Stack>
    </Container>
  );
}
