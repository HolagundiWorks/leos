import { useState } from 'react';
import type { SessionUser } from './types';
import { useAuth } from './stores/auth';
import { LoginPage } from './components/LoginPage';
import { CockpitShell } from './components/cockpit/CockpitShell';
import { DashboardScreen } from './components/DashboardPage';
import { StudentsScreen } from './components/StudentsScreen';
import { StudentProfileScreen } from './components/StudentProfileScreen';
import { StaffScreen } from './components/StaffScreen';
import { Placeholder } from './components/Placeholder';

// Auth gate + cockpit shell. Active module drives the workspace + ribbon;
// a selected student opens the profile within the Students module.
export function App() {
  const token = useAuth((s) => s.token);
  const user = useAuth((s) => s.user);
  const [active, setActive] = useState('dashboard');
  const [studentId, setStudentId] = useState<number | null>(null);

  if (!token || !user) {
    return <LoginPage />;
  }

  const sessionUser: SessionUser = {
    name: user.name || user.username,
    role: user.profile,
  };

  const navigate = (key: string) => {
    setStudentId(null);
    setActive(key);
  };

  let screen;
  if (active === 'dashboard') {
    screen = <DashboardScreen user={sessionUser} />;
  } else if (active === 'students') {
    screen =
      studentId != null ? (
        <StudentProfileScreen id={studentId} onBack={() => setStudentId(null)} />
      ) : (
        <StudentsScreen onOpenStudent={setStudentId} />
      );
  } else if (active === 'staff') {
    screen = <StaffScreen />;
  } else {
    screen = <Placeholder screenKey={active} />;
  }

  return (
    <CockpitShell user={sessionUser} active={active} onNavigate={navigate}>
      {screen}
    </CockpitShell>
  );
}
