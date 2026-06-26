import { useState } from 'react';
import {
  ActionIcon,
  Avatar,
  Badge,
  Box,
  Group,
  Indicator,
  Menu,
  Text,
  ThemeIcon,
  UnstyledButton,
} from '@mantine/core';
import { spotlight } from '@mantine/spotlight';
import { Bell, LogOut, School, Search, UserCircle, Wifi } from 'lucide-react';
import { roleLabel } from '../../roles';
import { initials, type SessionUser } from '../../types';
import { useAuth } from '../../stores/auth';
import { useSchool } from '../../hooks/useSchool';

const FALLBACK_AY = '2026–27';

export function UtilityStrip({ user }: { user: SessionUser }) {
  const signOut = useAuth((s) => s.signOut);
  const { data: school } = useSchool();
  const schoolName = school?.name ?? 'School';
  const academicYear = school?.academic_year ?? FALLBACK_AY;

  return (
    <Group h="100%" px="sm" justify="space-between" wrap="nowrap" gap="sm">
      {/* School brand — logo + school name (no product/SMS branding). */}
      <Group gap={8} wrap="nowrap" style={{ minWidth: 0 }}>
        <SchoolMark />
        <Text fw={700} size="sm" lh={1.15} truncate maw={260}>
          {schoolName}
        </Text>
      </Group>

      {/* Global search opens the command palette (Ctrl K). */}
      <UnstyledButton
        onClick={() => spotlight.open()}
        style={{
          flex: 1,
          maxWidth: 460,
          height: 28,
          borderRadius: 'var(--mantine-radius-md)',
          border: '1px solid var(--mantine-color-gray-2)',
          background: 'var(--mantine-color-gray-0)',
          padding: '0 10px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          color: 'var(--mantine-color-gray-5)',
        }}
      >
        <Search size={15} strokeWidth={1.9} />
        <Text size="xs" c="dimmed">
          Search students, staff, actions…
        </Text>
        <Badge ml="auto" size="xs" variant="default" radius="sm">
          Ctrl K
        </Badge>
      </UnstyledButton>

      <Group gap="xs" wrap="nowrap">
        <Badge variant="light" color="gray" radius="sm" visibleFrom="sm">
          AY {academicYear}
        </Badge>
        <LanStatus />
        <Indicator color="peach" size={7} offset={4}>
          <ActionIcon variant="subtle" color="gray" aria-label="Alerts">
            <Bell size={18} strokeWidth={1.9} />
          </ActionIcon>
        </Indicator>

        <Menu position="bottom-end" width={200} radius="md" shadow="md">
          <Menu.Target>
            <UnstyledButton>
              <Group gap={8} wrap="nowrap">
                <Avatar size={28} radius="xl" color="brand" variant="light">
                  {initials(user.name)}
                </Avatar>
                <Box style={{ lineHeight: 1.1 }} visibleFrom="sm">
                  <Text size="xs" fw={600}>
                    {user.name}
                  </Text>
                  <Text fz={10} c="dimmed">
                    {roleLabel[user.role]}
                  </Text>
                </Box>
              </Group>
            </UnstyledButton>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item leftSection={<UserCircle size={16} />}>My profile</Menu.Item>
            <Menu.Divider />
            <Menu.Item color="rose" onClick={signOut} leftSection={<LogOut size={16} />}>
              Sign out
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </Group>
    </Group>
  );
}

// School logo — the real HCW emblem from public/, falling back to a school icon.
function SchoolMark() {
  const [stage, setStage] = useState<'svg' | 'png' | 'icon'>('svg');
  if (stage === 'icon') {
    return (
      <ThemeIcon size={28} radius="md" variant="light" color="brand">
        <School size={17} strokeWidth={2} />
      </ThemeIcon>
    );
  }
  return (
    <img
      src={stage === 'svg' ? '/hcw-logo.svg' : '/hcw-logo.png'}
      alt=""
      style={{ display: 'block', width: 'auto', height: 28, maxHeight: 28 }}
      onError={() => setStage((s) => (s === 'svg' ? 'png' : 'icon'))}
    />
  );
}

/** LAN/server status indicator. */
function LanStatus() {
  return (
    <Group gap={4} wrap="nowrap" visibleFrom="md" c="dimmed">
      <Wifi size={15} strokeWidth={1.9} color="var(--mantine-color-mint-6)" />
      <Text fz={10}>LAN</Text>
    </Group>
  );
}
