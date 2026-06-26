import {
  ArrowRightLeft,
  ArrowUp,
  Banknote,
  Bell,
  BookDown,
  BookOpen,
  BookUp,
  Book,
  Bus,
  CalendarCheck,
  Layers,
  CalendarClock,
  CalendarOff,
  Check,
  ClipboardList,
  DoorOpen,
  Download,
  FileText,
  GraduationCap,
  LayoutDashboard,
  LayoutGrid,
  ListChecks,
  MessageSquare,
  Pencil,
  PenLine,
  Percent,
  Plus,
  Printer,
  Receipt,
  RotateCcw,
  Search,
  Send,
  Settings,
  TrendingUp,
  UserCheck,
  Users,
  Wallet,
  Map,
  Save,
  Upload,
} from 'lucide-react';
import type { IconComponent } from './icons';

export interface RibbonAction {
  key: string;
  label: string;
  icon: IconComponent;
  shortcut?: string;
}

export interface ModuleDef {
  key: string;
  label: string;
  icon: IconComponent;
  actions: RibbonAction[];
}

// Icon rail order. Modules without a screen yet fall back to a placeholder.
export const modules: ModuleDef[] = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, actions: [] },
  {
    key: 'students',
    label: 'Students',
    icon: GraduationCap,
    actions: [
      { key: 'add', label: 'Add Student', icon: Plus, shortcut: 'Ctrl N' },
      { key: 'edit', label: 'Edit', icon: Pencil },
      { key: 'promote', label: 'Promote', icon: ArrowUp },
      { key: 'transfer', label: 'Transfer', icon: ArrowRightLeft },
      { key: 'print', label: 'Print ID', icon: Printer, shortcut: 'Ctrl P' },
      { key: 'message', label: 'Message Parent', icon: MessageSquare },
    ],
  },
  {
    key: 'staff',
    label: 'Staff',
    icon: Users,
    actions: [
      { key: 'add', label: 'Add Staff', icon: Plus, shortcut: 'Ctrl N' },
      { key: 'edit', label: 'Edit', icon: Pencil },
      { key: 'assign', label: 'Assign', icon: ClipboardList },
      { key: 'message', label: 'Message', icon: MessageSquare },
    ],
  },
  {
    key: 'classes',
    label: 'Classes',
    icon: LayoutGrid,
    actions: [
      { key: 'add', label: 'Add Class', icon: Plus, shortcut: 'Ctrl N' },
      { key: 'section', label: 'Add Section', icon: Plus },
      { key: 'edit', label: 'Edit', icon: Pencil },
      { key: 'report', label: 'Report', icon: FileText },
    ],
  },
  {
    key: 'teacher-subjects',
    label: 'Teacher Map',
    icon: UserCheck,
    actions: [
      { key: 'assign', label: 'Assign Teacher', icon: UserCheck, shortcut: 'Ctrl N' },
      { key: 'remove', label: 'Remove', icon: Pencil },
      { key: 'report', label: 'Report', icon: FileText },
    ],
  },
  {
    key: 'courses',
    label: 'Courses',
    icon: Layers,
    actions: [
      { key: 'add', label: 'Add Course', icon: Plus, shortcut: 'Ctrl N' },
      { key: 'edit', label: 'Edit', icon: Pencil },
      { key: 'report', label: 'Report', icon: FileText },
    ],
  },
  {
    key: 'subjects',
    label: 'Subjects',
    icon: Book,
    actions: [
      { key: 'add', label: 'Add Subject', icon: Plus, shortcut: 'Ctrl N' },
      { key: 'edit', label: 'Edit', icon: Pencil },
      { key: 'teachers', label: 'Assign Teachers', icon: Users },
      { key: 'report', label: 'Report', icon: FileText },
    ],
  },
  {
    key: 'classrooms',
    label: 'Classrooms',
    icon: DoorOpen,
    actions: [
      { key: 'add', label: 'Add Room', icon: Plus, shortcut: 'Ctrl N' },
      { key: 'edit', label: 'Edit', icon: Pencil },
      { key: 'report', label: 'Report', icon: FileText },
    ],
  },
  {
    key: 'floorplan',
    label: 'Floor Plan',
    icon: Map,
    actions: [
      { key: 'import', label: 'Import PDF', icon: Upload },
      { key: 'add', label: 'Add Room', icon: Plus, shortcut: 'Ctrl N' },
      { key: 'save', label: 'Save', icon: Save, shortcut: 'Ctrl S' },
    ],
  },
  {
    key: 'attendance',
    label: 'Attendance',
    icon: CalendarCheck,
    actions: [
      { key: 'mark', label: 'Mark Attendance', icon: Check },
      { key: 'bulk', label: 'Bulk Mark', icon: ListChecks },
      { key: 'leave', label: 'Leave Approval', icon: CalendarClock },
      { key: 'holiday', label: 'Holiday', icon: CalendarOff },
      { key: 'export', label: 'Export', icon: Download },
      { key: 'report', label: 'Report', icon: FileText },
    ],
  },
  {
    key: 'fees',
    label: 'Fees',
    icon: Wallet,
    actions: [
      { key: 'collect', label: 'Collect Fee', icon: Banknote },
      { key: 'receipt', label: 'Generate Receipt', icon: Receipt },
      { key: 'reminder', label: 'Due Reminder', icon: Bell },
      { key: 'refund', label: 'Refund', icon: RotateCcw },
      { key: 'concession', label: 'Concession', icon: Percent },
      { key: 'report', label: 'Report', icon: FileText },
    ],
  },
  {
    key: 'exams',
    label: 'Exams',
    icon: ClipboardList,
    actions: [
      { key: 'create', label: 'Create Exam', icon: Plus },
      { key: 'marks', label: 'Enter Marks', icon: PenLine },
      { key: 'publish', label: 'Publish Result', icon: Send },
      { key: 'reportcard', label: 'Report Card', icon: FileText },
      { key: 'export', label: 'Export', icon: Download },
      { key: 'analytics', label: 'Analytics', icon: TrendingUp },
    ],
  },
  {
    key: 'library',
    label: 'Library',
    icon: BookOpen,
    actions: [
      { key: 'issue', label: 'Issue Book', icon: BookUp },
      { key: 'return', label: 'Return Book', icon: BookDown },
      { key: 'add', label: 'Add Book', icon: Plus },
      { key: 'fine', label: 'Fine', icon: Banknote },
      { key: 'search', label: 'Search', icon: Search },
      { key: 'report', label: 'Report', icon: FileText },
    ],
  },
  { key: 'transport', label: 'Transport', icon: Bus, actions: [] },
  { key: 'settings', label: 'Settings', icon: Settings, actions: [] },
];

export const moduleByKey: Record<string, ModuleDef> = Object.fromEntries(
  modules.map((m) => [m.key, m]),
);

// AutoCAD-style ribbon: modules grouped into labelled panels along the top.
export interface ModuleGroup {
  label: string;
  keys: string[];
}
export const moduleGroups: ModuleGroup[] = [
  { label: 'Overview', keys: ['dashboard'] },
  { label: 'People', keys: ['students', 'staff'] },
  { label: 'Academics', keys: ['classes', 'teacher-subjects', 'courses', 'subjects', 'classrooms', 'floorplan'] },
  { label: 'Operations', keys: ['attendance', 'fees', 'exams', 'library', 'transport'] },
  { label: 'System', keys: ['settings'] },
];
