import { lazy, Suspense, useState, type ReactNode } from 'react';
import { Center, Container, Loader } from '@mantine/core';
import type { SessionUser } from './types';
import { useAuth } from './stores/auth';
import { useSelection } from './stores/selection';
import { WelcomeScreen } from './components/WelcomeScreen';
import { LoginPage } from './components/LoginPage';
import { CockpitShell } from './components/cockpit/CockpitShell';
import { StaffScreen } from './components/StaffScreen';
import { CoursesScreen } from './components/CoursesScreen';
import { SubjectsScreen } from './components/SubjectsScreen';
import { ClassroomsScreen } from './components/ClassroomsScreen';
import { ClassesScreen } from './components/ClassesScreen';
import { TeacherSubjectsScreen } from './components/TeacherSubjectsScreen';
import { TimingsScreen } from './components/TimingsScreen';
import { InstitutionSettingsScreen } from './components/InstitutionSettingsScreen';
import { AcademicYearScreen } from './components/AcademicYearScreen';
import { SubstitutionScreen } from './components/SubstitutionScreen';
import { AttendanceKiosk } from './components/AttendanceKiosk';
import { RemindersScreen } from './components/RemindersScreen';
import { IdCardScreen } from './components/IdCardScreen';
import { IssuedItemsScreen } from './components/IssuedItemsScreen';
import { VisitorScreen } from './components/VisitorScreen';
import { FinanceReportScreen } from './components/FinanceReportScreen';
import { ScholarshipScreen } from './components/ScholarshipScreen';
import { ScheduleViewScreen } from './components/ScheduleViewScreen';
import { ActivityScreen } from './components/ActivityScreen';
import { SecurityScreen } from './components/SecurityScreen';
import { TechAdminScreen } from './components/TechAdminScreen';
import { SportsScreen } from './components/SportsScreen';
import { ClubsScreen } from './components/ClubsScreen';
import { ReceiptsScreen } from './components/ReceiptsScreen';
import { ComplianceCertsScreen } from './components/ComplianceCertsScreen';
import { BoardEligibilityScreen } from './components/BoardEligibilityScreen';
import { StatutoryReturnsScreen } from './components/StatutoryReturnsScreen';
import { ExamArchiveScreen } from './components/ExamArchiveScreen';
import { PublicDisclosureScreen } from './components/PublicDisclosureScreen';
import { PracticalExamScreen } from './components/PracticalExamScreen';
import { RoleDashboard } from './components/RoleDashboard';
import { FacultyPlannerScreen } from './components/FacultyPlannerScreen';
import { PortalAccountsScreen } from './components/PortalAccountsScreen';
import { PortalProfileScreen } from './components/PortalProfileScreen';
import { LanConnectionManager } from './components/LanConnectionManager';
import { moduleAvailable } from './clientMode';

// Keep the large PDF/canvas/QR toolchains out of the startup bundle. These
// screens are fetched only when their ribbon action is opened.
const FloorPlanScreen = lazy(() =>
  import('./components/FloorPlanScreen').then((module) => ({
    default: module.FloorPlanScreen,
  })),
);
const LetterScreen = lazy(() =>
  import('./components/LetterScreen').then((module) => ({
    default: module.LetterScreen,
  })),
);
const CertificateScreen = lazy(() =>
  import('./components/CertificateScreen').then((module) => ({
    default: module.CertificateScreen,
  })),
);
const StudentsScreen = lazy(() =>
  import('./components/StudentsScreen').then((module) => ({ default: module.StudentsScreen })),
);
const StudentProfileScreen = lazy(() =>
  import('./components/StudentProfileScreen').then((module) => ({ default: module.StudentProfileScreen })),
);
const TimetableScreen = lazy(() =>
  import('./components/TimetableScreen').then((module) => ({ default: module.TimetableScreen })),
);
const AttendanceScreen = lazy(() =>
  import('./components/AttendanceScreen').then((module) => ({ default: module.AttendanceScreen })),
);
const ExamScreen = lazy(() =>
  import('./components/ExamScreen').then((module) => ({ default: module.ExamScreen })),
);
const FeeScreen = lazy(() =>
  import('./components/FeeScreen').then((module) => ({ default: module.FeeScreen })),
);
const BackupScreen = lazy(() =>
  import('./components/BackupScreen').then((module) => ({ default: module.BackupScreen })),
);
const ImportScreen = lazy(() =>
  import('./components/ImportScreen').then((module) => ({ default: module.ImportScreen })),
);
const HardwareScreen = lazy(() =>
  import('./components/HardwareScreen').then((module) => ({ default: module.HardwareScreen })),
);
const LmsScreen = lazy(() =>
  import('./components/LmsScreen').then((module) => ({ default: module.LmsScreen })),
);
const StaffOSScreen = lazy(() =>
  import('./components/StaffOSScreen').then((module) => ({ default: module.StaffOSScreen })),
);
const PayrollScreen = lazy(() =>
  import('./components/PayrollScreen').then((module) => ({ default: module.PayrollScreen })),
);
const EventScreen = lazy(() =>
  import('./components/EventScreen').then((module) => ({ default: module.EventScreen })),
);
const TransportScreen = lazy(() =>
  import('./components/TransportScreen').then((module) => ({ default: module.TransportScreen })),
);
const LibraryScreen = lazy(() =>
  import('./components/LibraryScreen').then((module) => ({ default: module.LibraryScreen })),
);

// Auth gate + cockpit shell. Active module drives the workspace + ribbon;
// a selected student opens the profile within the Students module.
export function App() {
  const token = useAuth((s) => s.token);
  const user = useAuth((s) => s.user);
  const schoolOpened = useAuth((s) => s.schoolOpened);
  const [active, setActive] = useState('dashboard');
  const [studentId, setStudentId] = useState<number | null>(null);

  // Gate 1: open a school file. Gate 2: sign in.
  if (!schoolOpened) {
    return <WelcomeScreen />;
  }

  if (!token || !user) {
    return <LoginPage />;
  }

  const sessionUser: SessionUser = {
    name: user.name || user.username,
    role: user.profile,
  };

  const navigate = (key: string) => {
    setStudentId(null);
    useSelection.getState().clear();
    setActive(moduleAvailable(key) ? key : 'dashboard');
  };

  let screen: ReactNode;
  if (active === 'dashboard') {
    screen = <RoleDashboard onNavigate={navigate} />;
  } else if (active === 'students') {
    screen =
      studentId != null ? (
        <StudentProfileScreen id={studentId} onBack={() => setStudentId(null)} />
      ) : (
        <StudentsScreen key="students" onView={setStudentId} />
      );
  } else if (active === 'admissions') {
    // Admissions = admit a new student; opens the Students list with the
    // admit form already open. Viewing a student still drills into the profile.
    screen =
      studentId != null ? (
        <StudentProfileScreen id={studentId} onBack={() => setStudentId(null)} />
      ) : (
        <StudentsScreen key="admissions" openAdmit onView={setStudentId} />
      );
  } else if (active === 'staff') {
    screen = <StaffScreen />;
  } else if (active === 'portal-accounts') {
    screen = <PortalAccountsScreen />;
  } else if (active === 'my-profile') {
    screen = <PortalProfileScreen />;
  } else if (active === 'lms') {
    screen = <LmsScreen />;
  } else if (active === 'lan-manager') {
    screen = <Container size="lg" py="md"><LanConnectionManager /></Container>;
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
  } else if (active === 'faculty-planner') {
    screen = <FacultyPlannerScreen />;
  } else if (active === 'substitution') {
    screen = <SubstitutionScreen />;
  } else if (active === 'attendance') {
    screen = <AttendanceScreen onKiosk={() => navigate('attendance-kiosk')} />;
  } else if (active === 'attendance-kiosk') {
    screen = <AttendanceKiosk onExit={() => navigate('attendance')} />;
  } else if (active === 'staff-os') {
    screen = <StaffOSScreen />;
  } else if (active === 'payroll') {
    screen = <PayrollScreen />;
  } else if (active === 'exams') {
    screen = <ExamScreen />;
  } else if (active === 'fees') {
    screen = <FeeScreen />;
  } else if (active === 'events') {
    screen = <EventScreen />;
  } else if (active === 'reminders') {
    screen = <RemindersScreen />;
  } else if (active === 'id-cards') {
    screen = <IdCardScreen />;
  } else if (active === 'transport') {
    screen = <TransportScreen />;
  } else if (active === 'issued') {
    screen = <IssuedItemsScreen />;
  } else if (active === 'visitor') {
    screen = <VisitorScreen />;
  } else if (active === 'library') {
    screen = <LibraryScreen />;
  } else if (active === 'fin-reports') {
    screen = <FinanceReportScreen />;
  } else if (active === 'scholarships') {
    screen = <ScholarshipScreen />;
  } else if (active === 'daily-sched') {
    screen = <ScheduleViewScreen defaultTab="daily" />;
  } else if (active === 'room-occ') {
    screen = <ScheduleViewScreen defaultTab="rooms" />;
  } else if (active === 'parent-guide' || active === 'itinerary') {
    screen = <ActivityScreen />;
  } else if (active === 'activities') {
    screen = <ActivityScreen />;
  } else if (active === 'backup') {
    screen = <BackupScreen />;
  } else if (active === 'security') {
    screen = <SecurityScreen />;
  } else if (active === 'import') {
    screen = <ImportScreen />;
  } else if (active === 'hardware') {
    screen = <HardwareScreen />;
  } else if (active === 'tech-admin') {
    screen = <TechAdminScreen />;
  } else if (active === 'letters') {
    screen = <LetterScreen />;
  } else if (active === 'certificates') {
    screen = <CertificateScreen />;
  } else if (active === 'sports') {
    screen = <SportsScreen />;
  } else if (active === 'clubs') {
    screen = <ClubsScreen />;
  } else if (active === 'receipts') {
    screen = <ReceiptsScreen />;
  } else if (active === 'compliance-certs') {
    screen = <ComplianceCertsScreen />;
  } else if (active === 'board-eligibility') {
    screen = <BoardEligibilityScreen onViewStudent={setStudentId} />;
  } else if (active === 'statutory-returns') {
    screen = <StatutoryReturnsScreen />;
  } else if (active === 'exam-archive') {
    screen = <ExamArchiveScreen />;
  } else if (active === 'public-disclosure') {
    screen = <PublicDisclosureScreen />;
  } else if (active === 'practical-exams') {
    screen = <PracticalExamScreen />;
  } else if (active === 'floorplan') {
    screen = <FloorPlanScreen />;
  } else if (active === 'academic-year') {
    screen = <AcademicYearScreen />;
  } else if (active === 'settings') {
    screen = <InstitutionSettingsScreen />;
  } else {
    screen = <RoleDashboard onNavigate={navigate} />;
  }

  return (
    <CockpitShell
        user={sessionUser}
        active={active}
        onNavigate={navigate}
      >
        <Suspense
          fallback={
            <Center mih={240}>
              <Loader aria-label="Loading module" />
            </Center>
          }
        >
          {screen}
        </Suspense>
    </CockpitShell>
  );
}
