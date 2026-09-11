export type ClientMode = 'desktop' | 'web' | 'android';

export function clientMode(): ClientMode {
  if (window.leosDesktop) return 'desktop';
  if (/LEOS-Android/i.test(navigator.userAgent)) return 'android';
  return 'web';
}

const desktopOnly = new Set([
  'settings', 'backup', 'import', 'hardware', 'security', 'tech-admin',
  'lan-manager', 'portal-accounts',
]);

const androidModules = new Set([
  'dashboard', 'my-profile', 'students', 'lms', 'timetable',
  'faculty-planner', 'attendance', 'attendance-kiosk', 'daily-sched',
  'room-occ', 'substitution', 'events', 'reminders', 'activities',
  'transport', 'library',
]);

export function moduleAvailable(moduleKey: string): boolean {
  const mode = clientMode();
  if (mode === 'desktop') return true;
  if (desktopOnly.has(moduleKey)) return false;
  return mode === 'web' || androidModules.has(moduleKey);
}
