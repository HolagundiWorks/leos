import type { Role } from '../roles';

// Base URL of the PHP API wrapper. Overridable via VITE_API_BASE (and later the
// Tauri build). Defaults to the local Podman PHP stack.
const BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8080/api/v1';

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
