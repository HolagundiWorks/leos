const BASE = import.meta.env.VITE_API_BASE ?? '/api';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function req<T>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: opts.method ?? 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  let data: unknown = null;
  try { data = await res.json(); } catch { /* empty */ }
  if (!res.ok) {
    const msg = (data as { message?: string; error?: string } | null)?.message
      ?? (data as { error?: string } | null)?.error
      ?? `HTTP ${res.status}`;
    throw new ApiError(msg, res.status);
  }
  return data as T;
}

export interface TimetableEntry {
  id: number;
  section_id: number;
  period_id: number;
  day_of_week: number;
  subject_id: number | null;
  subject_name?: string | null;
  subject_code?: string | null;
  subject_type?: string | null;
  staff_id: number | null;
  teacher_name?: string | null;
  room_id: number | null;
  room_name?: string | null;
}

export interface Period {
  id?: number;
  label: string;
  period_type: 'period' | 'break';
  start_time: string;
  end_time: string;
  sort_order?: number;
}

export interface Subject {
  id: number;
  name: string | null;
  code: string | null;
  type: string | null;
  course_id: number | null;
  weekly_periods: number;
  is_lab: number;
  mandatory?: number;
}

export interface Staff {
  id: number;
  first_name: string;
  last_name: string | null;
  email: string | null;
}

export interface TeacherAssignment {
  id: number;
  staff_id: number;
  priority: number;
  teacher?: string;
}

export interface SubjectWithAssignments extends Subject {
  assignments: TeacherAssignment[];
}

export interface Section {
  id: number;
  name: string | null;
  capacity?: number | null;
  teacher?: string | null;
  room_name?: string | null;
}

export interface ClassItem {
  id: number;
  name: string | null;
  grade_level: string | null;
  course_id: number | null;
  sections: Section[];
}

export interface Classroom {
  id: number;
  name: string | null;
  capacity: number | null;
}

export const api = {
  fetchPeriods: () => req<{ periods: Period[]; total: number }>('/periods'),
  savePeriods: (periods: Omit<Period, 'id' | 'sort_order'>[]) =>
    req<{ ok: boolean }>('/periods', { method: 'POST', body: { periods } }),

  fetchSubjects: (q = '') => {
    const suffix = q ? `?q=${encodeURIComponent(q)}` : '';
    return req<{ subjects: Subject[]; total: number }>(`/subjects${suffix}`);
  },
  createSubject: (data: Partial<Subject> & { name: string }) =>
    req<{ ok: boolean; id: number }>('/subjects', { method: 'POST', body: data }),
  updateSubject: (id: number, data: Partial<Subject>) =>
    req<{ ok: boolean }>(`/subjects/${id}/update`, { method: 'POST', body: data }),
  deleteSubject: (id: number) =>
    req<{ ok: boolean }>(`/subjects/${id}/delete`, { method: 'POST' }),

  fetchCourses: () => req<{ courses: { id: number; name: string }[] }>('/courses'),

  fetchStaff: (q = '') => {
    const suffix = q ? `?q=${encodeURIComponent(q)}` : '';
    return req<{ staff: Staff[]; total: number }>(`/staff${suffix}`);
  },
  createStaff: (data: { first_name: string; last_name?: string; email?: string }) =>
    req<{ ok: boolean; id: number }>('/staff', { method: 'POST', body: data }),
  deleteStaff: (id: number) => req<{ ok: boolean }>(`/staff/${id}/delete`, { method: 'POST' }),

  fetchTeacherSubjects: () =>
    req<{ subjects: SubjectWithAssignments[]; total: number }>('/teacher-subjects'),
  assignTeacherSubject: (data: { staff_id: number; subject_id: number; priority: number }) =>
    req<{ ok: boolean }>('/teacher-subjects', { method: 'POST', body: data }),
  removeTeacherSubject: (id: number) =>
    req<{ ok: boolean }>('/teacher-subjects/remove', { method: 'POST', body: { id } }),

  fetchClassrooms: () => req<{ classrooms: Classroom[] }>('/classrooms'),
  fetchClasses: () => req<{ classes: ClassItem[] }>('/classes'),
  createClass: (data: { name: string; grade_level?: string }) =>
    req<{ ok: boolean; id: number }>('/classes', { method: 'POST', body: data }),
  createSection: (data: { class_id: number; name: string; capacity?: number }) =>
    req<{ ok: boolean; id: number }>('/sections', { method: 'POST', body: data }),

  fetchTimetable: (sectionId: number) =>
    req<{ entries: TimetableEntry[]; total: number }>(`/timetable?section_id=${sectionId}`),
  fetchTimetableAll: () =>
    req<{ sections: TimetableSection[]; entries: AllTimetableEntry[] }>('/timetable/all'),
  fetchTimetableQuota: (sectionId: number) =>
    req<{ subjects: QuotaItem[]; total: number }>(`/timetable/quota?section_id=${sectionId}`),
  fetchTeacherLoad: () =>
    req<{ teachers: TeacherLoad[]; total: number }>('/timetable/teacher-load'),
  setTimetableEntry: (data: {
    section_id: number;
    period_id: number;
    day_of_week: number;
    subject_id: number | null;
    staff_id: number | null;
    room_id: number | null;
  }) => req<{ ok: boolean }>('/timetable', { method: 'POST', body: data }),
  clearTimetableEntry: (data: { section_id: number; period_id: number; day_of_week: number }) =>
    req<{ ok: boolean }>('/timetable/clear', { method: 'POST', body: data }),
};

export interface TimetableSection {
  id: number;
  name: string | null;
  class_id: number;
  class_name: string | null;
  grade_level: string | null;
}

export interface AllTimetableEntry extends TimetableEntry {}

export interface QuotaItem {
  id: number;
  name: string;
  code: string;
  target: number;
  scheduled: number;
  status: 'met' | 'under' | 'over';
}

export interface TeacherLoad {
  staff_id: number;
  teacher_name: string;
  total_periods: number;
  sections: { section: string; periods: number }[];
}
