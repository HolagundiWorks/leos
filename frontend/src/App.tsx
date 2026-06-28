import { useState, type ReactNode } from 'react';
import type { SessionUser } from './types';
import { useAuth } from './stores/auth';
import { useSelection } from './stores/selection';
import { BackgroundLayer } from './components/BackgroundLayer';
import { WelcomeScreen } from './components/WelcomeScreen';
import { LoginPage } from './components/LoginPage';
import { CockpitShell } from './components/cockpit/CockpitShell';
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
import { AttendanceScreen } from './components/AttendanceScreen';
import { AttendanceKiosk } from './components/AttendanceKiosk';
import { StaffOSScreen } from './components/StaffOSScreen';
import { PayrollScreen } from './components/PayrollScreen';
import { ExamScreen } from './components/ExamScreen';
import { FeeScreen } from './components/FeeScreen';
import { EventScreen } from './components/EventScreen';
import { RemindersScreen } from './components/RemindersScreen';
import { IdCardScreen } from './components/IdCardScreen';
import { TransportScreen } from './components/TransportScreen';
import { IssuedItemsScreen } from './components/IssuedItemsScreen';
import { VisitorScreen } from './components/VisitorScreen';
import { LibraryScreen } from './components/LibraryScreen';
import { FinanceReportScreen } from './components/FinanceReportScreen';
import { ScholarshipScreen } from './components/ScholarshipScreen';
import { ScheduleViewScreen } from './components/ScheduleViewScreen';
import { ActivityScreen } from './components/ActivityScreen';
import { BackupScreen } from './components/BackupScreen';
import { SecurityScreen } from './components/SecurityScreen';
import { ImportScreen } from './components/ImportScreen';
import { HardwareScreen } from './components/HardwareScreen';
import { DesignScreen } from './components/DesignScreen';
import { TechAdminScreen } from './components/TechAdminScreen';
import { ServerControlScreen } from './components/ServerControlScreen';
import { ServerControlFooter } from './components/ServerControlFooter';
import { LetterScreen } from './components/LetterScreen';
import { CertificateScreen } from './components/CertificateScreen';
import { SportsScreen } from './components/SportsScreen';
import { ClubsScreen } from './components/ClubsScreen';
import { ReceiptsScreen } from './components/ReceiptsScreen';
import { ComplianceCertsScreen } from './components/ComplianceCertsScreen';
import { BoardEligibilityScreen } from './components/BoardEligibilityScreen';
import { StatutoryReturnsScreen } from './components/StatutoryReturnsScreen';
import { RoleDashboard } from './components/RoleDashboard';
import { Placeholder } from './components/Placeholder';

// Auth gate + cockpit shell. Active module drives the workspace + ribbon;
// a selected student opens the profile within the Students module.
export function App() {
  const token = useAuth((s) => s.token);
  const user = useAuth((s) => s.user);
  const schoolOpened = useAuth((s) => s.schoolOpened);
  const [active, setActive] = useState('dashboard');
  const [studentId, setStudentId] = useState<number | null>(null);

  // Gate 1: open a school file. Gate 2: sign in.
  // The ServerControlFooter is rendered in BOTH gates too: if the backend hangs
  // you can't open a school file or sign in, so the recovery controls must be
  // reachable here (they talk to the Service Manager over Tauri IPC, not HTTP).
  if (!schoolOpened) {
    return (
      <>
        <BackgroundLayer />
        <WelcomeScreen />
        <ServerControlFooter />
      </>
    );
  }

  if (!token || !user) {
    return (
      <>
        <BackgroundLayer />
        <LoginPage />
        <ServerControlFooter />
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
  } else if (active === 'design') {
    screen = <DesignScreen />;
  } else if (active === 'tech-admin') {
    screen = <TechAdminScreen />;
  } else if (active === 'server-control') {
    screen = <ServerControlScreen />;
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
      <ServerControlFooter onOpenPanel={() => navigate('server-control')} />
    </>
  );
}
