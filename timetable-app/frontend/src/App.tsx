import { useState } from 'react';
import {
  AppShell,
  Badge,
  Group,
  NavLink,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import {
  BookOpen,
  Calendar,
  Clock,
  GraduationCap,
  LayoutGrid,
  Users,
  UserCheck,
} from 'lucide-react';
import { TimetablePage } from './pages/TimetablePage';
import { TimingsPage } from './pages/TimingsPage';
import { SubjectsPage } from './pages/SubjectsPage';
import { TeachersPage } from './pages/TeachersPage';
import { TeacherMapPage } from './pages/TeacherMapPage';
import { SetupPage } from './pages/SetupPage';

type Page = 'timetable' | 'timings' | 'subjects' | 'teachers' | 'teacher-map' | 'setup';

const NAV: { key: Page; label: string; icon: typeof Calendar }[] = [
  { key: 'timetable', label: 'Timetable', icon: LayoutGrid },
  { key: 'timings', label: 'School Timings', icon: Clock },
  { key: 'subjects', label: 'Subjects', icon: BookOpen },
  { key: 'teachers', label: 'Teachers', icon: Users },
  { key: 'teacher-map', label: 'Teacher Map', icon: UserCheck },
  { key: 'setup', label: 'Classes', icon: GraduationCap },
];

export function App() {
  const [page, setPage] = useState<Page>('timetable');

  const renderPage = () => {
    switch (page) {
      case 'timetable': return <TimetablePage />;
      case 'timings': return <TimingsPage />;
      case 'subjects': return <SubjectsPage />;
      case 'teachers': return <TeachersPage />;
      case 'teacher-map': return <TeacherMapPage />;
      case 'setup': return <SetupPage />;
    }
  };

  return (
    <AppShell
      navbar={{ width: 240, breakpoint: 'sm' }}
      padding="md"
      styles={{ main: { background: '#F5F7FA', minHeight: '100vh' } }}
    >
      <AppShell.Navbar p="md" style={{ borderRight: '1px solid #DDE3EC' }}>
        <Stack gap="lg" h="100%">
          <div>
            <Group gap="xs" mb={4}>
              <Calendar size={22} color="#3E7B7B" />
              <Title order={4}>Timetable Manager</Title>
            </Group>
            <Text size="xs" c="dimmed">Based on LEOS scheduling logic</Text>
            <Badge size="xs" color="brand" variant="light" mt="xs">Standalone</Badge>
          </div>
          <Stack gap={4} style={{ flex: 1 }}>
            {NAV.map(({ key, label, icon: Icon }) => (
              <NavLink
                key={key}
                label={label}
                leftSection={<Icon size={16} />}
                active={page === key}
                onClick={() => setPage(key)}
                variant="light"
                color="brand"
              />
            ))}
          </Stack>
          <Text size="xs" c="dimmed" ta="center">
            section × period × day → subject + teacher + room
          </Text>
        </Stack>
      </AppShell.Navbar>
      <AppShell.Main>{renderPage()}</AppShell.Main>
    </AppShell>
  );
}
