import type { Role } from '../roles';

// Base URL of the local HCW-SMS API (Rust + SQLite) on :8787. Overridable via
// VITE_API_BASE — e.g. a LAN server at http://192.168.1.10:8787.
const BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8787';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export interface ApiUser {
  id: number;
  username: string;
  profile: Role;
  name: string;
}

export interface DashboardSummary {
  students: number;
  staff: number;
  schools: number;
  courses: number;
}

interface ReqOpts {
  method?: string;
  token?: string | null;
  body?: unknown;
}

async function req<T>(path: string, opts: ReqOpts = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: opts.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* empty / non-JSON body */
  }
  if (!res.ok) {
    const message =
      (data as { error?: string } | null)?.error ?? `HTTP ${res.status}`;
    throw new ApiError(message, res.status);
  }
  return data as T;
}

export function login(username: string, password: string) {
  return req<{ token: string; user: ApiUser }>('/auth/login', {
    method: 'POST',
    body: { username, password },
  });
}

export async function fetchMe(token: string) {
  const { user } = await req<{ user: ApiUser }>('/auth/me', { token });
  return user;
}

export async function fetchDashboardSummary(token: string) {
  const { summary } = await req<{ summary: DashboardSummary }>(
    '/dashboard/summary',
    { token },
  );
  return summary;
}

export interface WorkItem {
  key: string;
  count: number;
  label: string;
  severity: 'info' | 'warning' | 'danger';
  module: string;
}

export async function fetchDashboardToday(token: string) {
  const { items } = await req<{ items: WorkItem[] }>('/dashboard/today', { token });
  return items;
}

export interface Student {
  id: number;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  gender: string | null;
  birthdate: string | null;
}

export interface StudentsResponse {
  students: Student[];
  total: number;
}

export function fetchStudents(
  token: string,
  params: { q?: string; limit?: number; offset?: number } = {},
) {
  const qs = new URLSearchParams();
  if (params.q) qs.set('q', params.q);
  if (params.limit != null) qs.set('limit', String(params.limit));
  if (params.offset != null) qs.set('offset', String(params.offset));
  const suffix = qs.toString() ? `?${qs}` : '';
  return req<StudentsResponse>(`/students${suffix}`, { token });
}

export interface StudentDetail extends Student {
  middle_name: string | null;
  alt_id: string | null;
}

export async function fetchStudent(token: string, id: number) {
  const { student } = await req<{ student: StudentDetail }>(`/students/${id}`, { token });
  return student;
}

export interface Staff {
  id: number;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  profile: string | null;
  title: string | null;
}

export interface StaffResponse {
  staff: Staff[];
  total: number;
}

export function fetchStaff(
  token: string,
  params: { q?: string; limit?: number; offset?: number } = {},
) {
  const qs = new URLSearchParams();
  if (params.q) qs.set('q', params.q);
  if (params.limit != null) qs.set('limit', String(params.limit));
  if (params.offset != null) qs.set('offset', String(params.offset));
  const suffix = qs.toString() ? `?${qs}` : '';
  return req<StaffResponse>(`/staff${suffix}`, { token });
}

export interface Course {
  id: number;
  name: string | null;
  subjects: number;
}
export interface CoursesResponse {
  courses: Course[];
  total: number;
}
export function fetchCourses(token: string) {
  return req<CoursesResponse>('/courses', { token });
}

export interface Subject {
  id: number;
  course_id: number | null;
  name: string | null;
  code: string | null;
  type: string | null;
  weekly_periods: number;
  is_lab: number;
}
export interface SubjectsResponse {
  subjects: Subject[];
  total: number;
}
export function fetchSubjects(token: string, params: { q?: string } = {}) {
  const qs = new URLSearchParams();
  if (params.q) qs.set('q', params.q);
  const suffix = qs.toString() ? `?${qs}` : '';
  return req<SubjectsResponse>(`/subjects${suffix}`, { token });
}

export interface Classroom {
  id: number;
  name: string | null;
  code: string | null;
  capacity: number | null;
  room_type: string | null;
}
export interface ClassroomsResponse {
  classrooms: Classroom[];
  total: number;
}
export function fetchClassrooms(token: string) {
  return req<ClassroomsResponse>('/classrooms', { token });
}

export interface School {
  name: string | null;
  academic_year: string | null;
  type: string | null;
}
export async function fetchSchool(token: string): Promise<School | null> {
  const res = await req<{ school: School | null }>('/school', { token });
  return res.school;
}
export function saveSchool(
  token: string,
  data: { name: string; academic_year: string; type: string },
) {
  return req<{ ok: boolean }>('/school', { method: 'POST', token, body: data });
}

export interface Section {
  id: number;
  name: string | null;
  capacity: number | null;
  teacher: string | null;
  room: string | null;
}
export interface ClassRow {
  id: number;
  name: string | null;
  grade_level: string | null;
  sections: Section[];
}
export interface ClassesResponse {
  classes: ClassRow[];
  total: number;
}
export function fetchClasses(token: string) {
  return req<ClassesResponse>('/classes', { token });
}

export interface TeacherAssignment {
  id: number;
  staff_id: number;
  priority: number;
  teacher: string | null;
}

export interface SubjectWithAssignments {
  id: number;
  name: string | null;
  code: string | null;
  type: string | null;
  weekly_periods: number;
  assignments: TeacherAssignment[];
}

export interface TeacherSubjectsResponse {
  subjects: SubjectWithAssignments[];
  total: number;
}

export function fetchTeacherSubjects(token: string) {
  return req<TeacherSubjectsResponse>('/teacher-subjects', { token });
}

export function assignTeacherSubject(
  token: string,
  data: { staff_id: number; subject_id: number; priority: number },
) {
  return req<{ ok: boolean; id: number }>('/teacher-subjects', {
    method: 'POST',
    token,
    body: data,
  });
}

export function removeTeacherSubject(token: string, id: number) {
  return req<{ ok: boolean }>('/teacher-subjects/remove', {
    method: 'POST',
    token,
    body: { id },
  });
}

export interface RoomShape {
  id: string;
  type: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  classroomId?: number | null;
}
export interface FloorPlanData {
  bg?: string | null;
  bgWidth?: number;
  bgHeight?: number;
  rooms: RoomShape[];
}
export interface FloorPlan {
  id: number;
  name: string | null;
  data: FloorPlanData | null;
}
export async function fetchFloorPlan(token: string): Promise<FloorPlan | null> {
  const res = await req<{ plan: FloorPlan | null }>('/floorplan', { token });
  return res.plan;
}
export function saveFloorPlan(token: string, data: FloorPlanData) {
  return req<{ ok: boolean; id: number }>('/floorplan', {
    method: 'POST',
    token,
    body: { name: 'Floor Plan', data },
  });
}
