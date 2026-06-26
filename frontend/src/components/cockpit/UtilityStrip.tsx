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
  UnstyledButton,
} from '@mantine/core';
import { spotlight } from '@mantine/spotlight';
import { Bell, LogOut, Search, UserCircle, Wifi } from 'lucide-react';
import { roleLabel } from '../../roles';
import { initials, type SessionUser } from '../../types';
import { useAuth } from '../../stores/auth';
import { useSchool } from '../../hooks/useSchool';
import { useActiveYear } from '../../hooks/useAcademicYears';
import { institutionTypeLabel } from '../../lib/institution';

const FALLBACK_AY = '2026–27';
// Translucent white chip for badges on the purple bar.
const chip = { root: { background: 'rgba(255,255,255,0.18)' }, label: { color: '#fff' } };

export function UtilityStrip({ user }: { user: SessionUser }) {
  const signOut = useAuth((s) => s.signOut);
  const { data: school } = useSchool();
  const { data: activeYearData } = useActiveYear();
  const schoolName = school?.name ?? 'School';
  const academicYear = activeYearData?.year?.label ?? school?.academic_year ?? FALLBACK_AY;

  return (
    <Group h="100%" px="sm" justify="space-between" wrap="nowrap" gap="sm">
      {/* School brand — logo + school name. */}
      <Group gap={8} wrap="nowrap" style={{ minWidth: 0 }}>
        <SchoolMark />
        <Text fw={700} size="sm" lh={1.15} c="white" truncate maw={260}>
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
          border: '1px solid rgba(255,255,255,0.25)',
          background: 'rgba(255,255,255,0.12)',
          padding: '0 10px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          color: 'rgba(255,255,255,0.85)',
        }}
      >
        <Search size={15} strokeWidth={1.9} />
        <Text size="xs" style={{ color: 'rgba(255,255,255,0.8)' }}>
          Search students, staff, actions…
        </Text>
        <Badge ml="auto" size="xs" radius="sm" styles={chip}>
          Ctrl K
        </Badge>
      </UnstyledButton>

      <Group gap="xs" wrap="nowrap">
        <Badge size="sm" radius="sm" styles={chip} visibleFrom="md">
          {institutionTypeLabel(school?.type)}
        </Badge>
        <Badge size="sm" radius="sm" styles={chip} visibleFrom="sm">
          AY {academicYear}
        </Badge>
        <LanStatus />
        <Indicator color="peach" size={7} offset={4}>
          <ActionIcon variant="subtle" color="gray" aria-label="Alerts">
            <Bell size={18} strokeWidth={1.9} color="rgba(255,255,255,0.85)" />
          </ActionIcon>
        </Indicator>

        <Menu position="bottom-end" width={200} radius="md" shadow="md">
          <Menu.Target>
            <UnstyledButton>
              <Group gap={8} wrap="nowrap">
                <Avatar
                  size={28}
                  radius="xl"
                  styles={{
                    root: { background: '#fff' },
                    placeholder: { color: 'var(--mantine-color-brand-6)', fontWeight: 600 },
                  }}
                >
                  {initials(user.name)}
                </Avatar>
                <Box style={{ lineHeight: 1.1 }} visibleFrom="sm">
                  <Text size="xs" fw={600} c="white">
                    {user.name}
                  </Text>
                  <Text fz={10} style={{ color: 'rgba(255,255,255,0.7)' }}>
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

// Institution logo — tries /leos-logo.svg then /leos-logo.png.
// If neither exists, renders nothing (school name is shown beside it).
function SchoolMark() {
  const [stage, setStage] = useState<'svg' | 'png' | 'hidden'>('svg');
  if (stage === 'hidden') return null;
  return (
    <img
      src={stage === 'svg' ? '/leos-logo.svg' : '/leos-logo.png'}
      alt=""
      aria-hidden
      style={{ display: 'block', width: 'auto', height: 28, maxHeight: 28 }}
      onError={() => setStage((s) => (s === 'svg' ? 'png' : 'hidden'))}
    />
  );
}

/** LAN/server status indicator. */
function LanStatus() {
  return (
    <Group gap={4} wrap="nowrap" visibleFrom="md" style={{ color: 'rgba(255,255,255,0.8)' }}>
      <Wifi size={15} strokeWidth={1.9} color="rgba(255,255,255,0.85)" />
      <Text fz={10}>LAN</Text>
    </Group>
  );
}
