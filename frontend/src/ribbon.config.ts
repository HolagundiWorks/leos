/**
 * LEOS Ribbon Configuration
 * MS Word-style two-level navigation: tabs → groups → actions.
 *
 * accessLevel: the maximum user level (L1–L5) that can SEE this item.
 *   L1 = Principal (most privileged), L5 = Parent (least privileged).
 *   e.g. accessLevel: 2 → visible to L1 and L2 only.
 *   Default: 5 (everyone).
 */

import {
  LayoutDashboard,
  GraduationCap,
  Users,
  Building2,
  Banknote,
  CalendarDays,
  CalendarCheck,
  ClipboardList,
  Wallet,
  Bell,
  Bus,
  Settings,
  Shield,
  ShieldCheck,
  Download,
  ArrowDownToLine,
  Cpu,
  Palette,
  Map,
  DoorOpen,
  LayoutGrid,
  Book,
  UserCheck,
  Clock,
  UserX,
  Layers,
  CalendarRange,
  BookOpen,
  FileText,
  Receipt,
  TrendingUp,
  Wrench,
  CreditCard,
  PenLine,
  Home,
  AlarmClock,
  PackageCheck,
  Server,
  Mail,
  Award,
  Trophy,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type UserLevel = 1 | 2 | 3 | 4 | 5;

export interface RibbonAction {
  key: string;              // route key used in App.tsx navigate()
  label: string;
  icon: LucideIcon;
  accessLevel?: UserLevel;  // max level that can access (lower = more restricted)
  placeholder?: boolean;    // coming soon — shown greyed, non-clickable
  shortcut?: string;
  badge?: string;
}

export interface RibbonGroup {
  id: string;
  label: string;
  actions: RibbonAction[];
}

export interface RibbonTab {
  id: string;
  label: string;
  icon?: LucideIcon;
  accessLevel?: UserLevel;  // max level that can see this tab; default 5
  groups: RibbonGroup[];
}

// ─── Tab definitions ──────────────────────────────────────────────────────────

export const ribbonTabs: RibbonTab[] = [
  // ── Dashboard ──────────────────────────────────────────────────────────────
  {
    id: 'home',
    label: 'Dashboard',
    icon: Home,
    groups: [
      {
        id: 'overview',
        label: 'Overview',
        actions: [
          { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
        ],
      },
    ],
  },

  // ── People ─────────────────────────────────────────────────────────────────
  {
    id: 'people',
    label: 'People',
    groups: [
      {
        id: 'student-mgmt',
        label: 'Student Management',
        actions: [
          { key: 'students', label: 'Students', icon: GraduationCap, accessLevel: 3 },
          { key: 'admissions', label: 'Admissions', icon: GraduationCap, accessLevel: 2 },
          { key: 'id-cards', label: 'ID Cards', icon: CreditCard, accessLevel: 2 },
        ],
      },
      {
        id: 'staff-mgmt',
        label: 'Staff Management',
        actions: [
          { key: 'staff', label: 'Staff', icon: Users, accessLevel: 2 },
          { key: 'staff-os', label: 'HR & Leave', icon: Building2, accessLevel: 2 },
          { key: 'payroll', label: 'Payroll', icon: Banknote, accessLevel: 2 },
        ],
      },
    ],
  },

  // ── Academics ──────────────────────────────────────────────────────────────
  {
    id: 'academics',
    label: 'Academics',
    groups: [
      {
        id: 'curriculum',
        label: 'Curriculum',
        actions: [
          { key: 'courses', label: 'Courses', icon: Layers, accessLevel: 2 },
          { key: 'subjects', label: 'Subjects', icon: Book, accessLevel: 2 },
          { key: 'academic-year', label: 'Academic Year', icon: CalendarRange, accessLevel: 2 },
        ],
      },
      {
        id: 'class-setup',
        label: 'Class Setup',
        actions: [
          { key: 'classes', label: 'Classes', icon: LayoutGrid, accessLevel: 2 },
          { key: 'classrooms', label: 'Classrooms', icon: DoorOpen, accessLevel: 2 },
          { key: 'floorplan', label: 'Floor Plan', icon: Map, accessLevel: 2 },
        ],
      },
      {
        id: 'resource-planning',
        label: 'Resource Planning',
        actions: [
          { key: 'teacher-subjects', label: 'Teacher Map', icon: UserCheck, accessLevel: 2 },
          { key: 'library', label: 'Library', icon: BookOpen, accessLevel: 2 },
        ],
      },
    ],
  },

  // ── Schedule ───────────────────────────────────────────────────────────────
  {
    id: 'schedule',
    label: 'Schedule',
    groups: [
      {
        id: 'timetable-engine',
        label: 'Timetable Engine',
        actions: [
          { key: 'timetable', label: 'Timetable', icon: CalendarDays, accessLevel: 3 },
        ],
      },
      {
        id: 'live-ops',
        label: 'Live Operations',
        actions: [
          { key: 'substitution', label: 'Substitution', icon: UserX, accessLevel: 2 },
          { key: 'timings', label: 'Timings', icon: Clock, accessLevel: 2 },
        ],
      },
      {
        id: 'monitoring',
        label: 'Monitoring',
        actions: [
          { key: 'daily-sched', label: 'Daily Schedule', icon: CalendarCheck, accessLevel: 3 },
          { key: 'room-occ', label: 'Room Status', icon: DoorOpen, accessLevel: 2 },
        ],
      },
    ],
  },

  // ── Operations ─────────────────────────────────────────────────────────────
  {
    id: 'operations',
    label: 'Operations',
    groups: [
      {
        id: 'daily-ops',
        label: 'Daily Operations',
        actions: [
          { key: 'attendance', label: 'Attendance', icon: CalendarCheck, accessLevel: 3 },
          { key: 'exams', label: 'Exams', icon: ClipboardList, accessLevel: 2 },
          { key: 'transport', label: 'Transport', icon: Bus, accessLevel: 3 },
          { key: 'library', label: 'Library', icon: BookOpen, accessLevel: 3 },
        ],
      },
      {
        id: 'admin-ctrl',
        label: 'Admin Control',
        actions: [
          { key: 'visitor', label: 'Visitor Log', icon: UserCheck, accessLevel: 2 },
          { key: 'issued', label: 'Issued Items', icon: PackageCheck, accessLevel: 2 },
        ],
      },
    ],
  },

  // ── Finance ────────────────────────────────────────────────────────────────
  {
    id: 'finance',
    label: 'Finance',
    accessLevel: 2,
    groups: [
      {
        id: 'fee-mgmt',
        label: 'Fee Management',
        actions: [
          { key: 'fees', label: 'Fees', icon: Wallet, accessLevel: 2 },
        ],
      },
      {
        id: 'fin-reporting',
        label: 'Reporting',
        actions: [
          { key: 'receipts', label: 'Receipts', icon: Receipt, accessLevel: 2 },
          { key: 'scholarships', label: 'Scholarships', icon: GraduationCap, accessLevel: 2 },
          { key: 'fin-reports', label: 'Reports', icon: TrendingUp, accessLevel: 2 },
        ],
      },
    ],
  },

  // ── Events ─────────────────────────────────────────────────────────────────
  {
    id: 'events',
    label: 'Events',
    groups: [
      {
        id: 'events-comm',
        label: 'Communication',
        actions: [
          { key: 'events', label: 'Announcements', icon: Bell, accessLevel: 3 },
          { key: 'reminders', label: 'Reminders', icon: AlarmClock, accessLevel: 3 },
        ],
      },
      {
        id: 'activities',
        label: 'Activities',
        actions: [
          { key: 'activities', label: 'Field Visits', icon: Bus, accessLevel: 2 },
          { key: 'sports', label: 'Sports', icon: Trophy, accessLevel: 2 },
          { key: 'clubs', label: 'Clubs', icon: Users, accessLevel: 2 },
        ],
      },
      {
        id: 'event-docs',
        label: 'Documents',
        actions: [
          { key: 'certificates', label: 'Certificates', icon: Award, accessLevel: 2 },
          { key: 'letters', label: 'Letters', icon: Mail, accessLevel: 2 },
          { key: 'parent-guide', label: 'Parent Guide', icon: FileText, accessLevel: 2 },
          { key: 'itinerary', label: 'Itinerary', icon: PenLine, accessLevel: 2 },
        ],
      },
    ],
  },

  // ── System ─────────────────────────────────────────────────────────────────
  {
    id: 'system',
    label: 'System',
    accessLevel: 2,
    groups: [
      {
        id: 'institution-cfg',
        label: 'Institution',
        actions: [
          { key: 'settings', label: 'Settings', icon: Settings, accessLevel: 2 },
        ],
      },
      {
        id: 'data-ops',
        label: 'Data',
        actions: [
          { key: 'backup', label: 'Backup', icon: Download, accessLevel: 1 },
          { key: 'import', label: 'DB Connector', icon: ArrowDownToLine, accessLevel: 1 },
        ],
      },
      {
        id: 'hardware-devices',
        label: 'Hardware',
        actions: [
          { key: 'hardware', label: 'NFC / Biometric', icon: Cpu, accessLevel: 2 },
        ],
      },
      {
        id: 'design-connect',
        label: 'Design Connect',
        actions: [
          { key: 'design', label: 'Canva', icon: Palette, accessLevel: 2 },
        ],
      },
      {
        id: 'compliance',
        label: 'Compliance',
        actions: [
          { key: 'compliance-certs', label: 'Certificates & Safety', icon: ShieldCheck, accessLevel: 2 },
          { key: 'board-eligibility', label: 'Board Eligibility', icon: GraduationCap, accessLevel: 2 },
        ],
      },
      {
        id: 'access-ctrl',
        label: 'Security & Admin',
        actions: [
          { key: 'security', label: 'Audit & Roles', icon: Shield, accessLevel: 1 },
          { key: 'tech-admin', label: 'Tech Admin', icon: Wrench, accessLevel: 1 },
          { key: 'server-control', label: 'Server', icon: Server, accessLevel: 1 },
        ],
      },
    ],
  },
];

// ─── Reverse map: module key → canonical tab id ───────────────────────────────
// When a module appears in multiple tabs, the FIRST occurrence wins.
export const moduleToTab: Record<string, string> = {};
for (const tab of ribbonTabs) {
  for (const group of tab.groups) {
    for (const action of group.actions) {
      if (!(action.key in moduleToTab)) {
        moduleToTab[action.key] = tab.id;
      }
    }
  }
}

export function tabForModule(moduleKey: string): string {
  return moduleToTab[moduleKey] ?? 'home';
}

// ─── Role → user level mapping ────────────────────────────────────────────────
// Used by ribbon to show/hide tabs and actions based on the logged-in user.
export function profileToLevel(profile: string): UserLevel {
  const profileLower = profile?.toLowerCase() ?? '';
  if (profileLower === 'principal' || profileLower === 'admin') return 1;
  if (
    profileLower === 'teacher' ||
    profileLower === 'timetable_coord' ||
    profileLower === 'exam_coord' ||
    profileLower === 'accountant' ||
    profileLower === 'front_office'
  ) return 2;
  if (profileLower === 'class_teacher') return 3;
  if (profileLower === 'staff') return 4;
  if (profileLower === 'parent' || profileLower === 'read_only' || profileLower === 'student') return 5;
  return 3; // safe default
}
