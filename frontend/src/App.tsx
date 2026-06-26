import { useState, type ReactNode } from 'react';
import type { SessionUser } from './types';
import { useAuth } from './stores/auth';
import { useSelection } from './stores/selection';
import { BackgroundLayer } from './components/BackgroundLayer';
import { LoginPage } from './components/LoginPage';
import { CockpitShell } from './components/cockpit/CockpitShell';
import { DashboardScreen } from './components/DashboardPage';
import { StudentsScreen } from './components/StudentsScreen';
import { StudentProfileScreen } from './components/StudentProfileScreen';
import { StaffScreen } from './components/StaffScreen';
import { CoursesScreen } from './components/CoursesScreen';
import { SubjectsScreen } from './components/SubjectsScreen';
import { ClassroomsScreen } from './components/ClassroomsScreen';
import { ClassesScreen } from './components/ClassesScreen';
import { TeacherSubjectsScreen } from './components/TeacherSubjectsScreen';
import { TimingsScreen } from './components/TimingsScreen';
import { TimetableScreen } from './components/TimetableScreen';
import { FloorPlanScreen } from './components/FloorPlanScreen';
import { InstitutionSettingsScreen } from './components/InstitutionSettingsScreen';
import { AcademicYearScreen } from './components/AcademicYearScreen';
import { SubstitutionScreen } from './components/SubstitutionScreen';
import { Placeholder } from './components/Placeholder';

// Auth gate + cockpit shell. Active module drives the workspace + ribbon;
// a selected student opens the profile within the Students module.
export function App() {
  const token = useAuth((s) => s.token);
  const user = useAuth((s) => s.user);
  const [active, setActive] = useState('dashboard');
  const [studentId, setStudentId] = useState<number | null>(null);

  if (!token || !user) {
    return (
      <>
        <BackgroundLayer />
        <LoginPage />
      </>
    );
  }

  const sessionUser: SessionUser = {
    name: user.name || user.username,
    role: user.profile,
  };

  const navigate = (key: string) => {
    setStudentId(null);
    useSelection.getState().clear();
    setActive(key);
  };

  let screen: ReactNode;
  if (active === 'dashboard') {
    screen = <DashboardScreen onNavigate={navigate} />;
  } else if (active === 'students') {
    screen =
      studentId != null ? (
        <StudentProfileScreen id={studentId} onBack={() => setStudentId(null)} />
      ) : (
        <StudentsScreen />
      );
  } else if (active === 'staff') {
    screen = <StaffScreen />;
  } else if (active === 'courses') {
    screen = <CoursesScreen />;
  } else if (active === 'subjects') {
    screen = <SubjectsScreen />;
  } else if (active === 'classrooms') {
    screen = <ClassroomsScreen />;
  } else if (active === 'classes') {
    screen = <ClassesScreen />;
  } else if (active === 'teacher-subjects') {
    screen = <TeacherSubjectsScreen />;
  } else if (active === 'timings') {
    screen = <TimingsScreen />;
  } else if (active === 'timetable') {
    screen = <TimetableScreen />;
  } else if (active === 'substitution') {
    screen = <SubstitutionScreen />;
  } else if (active === 'floorplan') {
    screen = <FloorPlanScreen />;
  } else if (active === 'academic-year') {
    screen = <AcademicYearScreen />;
  } else if (active === 'settings') {
    screen = <InstitutionSettingsScreen />;
  } else {
    screen = <Placeholder screenKey={active} />;
  }

  return (
    <>
      <BackgroundLayer />
      <CockpitShell
        user={sessionUser}
        active={active}
        onNavigate={navigate}
        onViewStudent={setStudentId}
      >
        {screen}
      </CockpitShell>
    </>
  );
}
