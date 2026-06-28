import type { Role } from '../roles';

// Base URL of the local LEOS API (Rust + SQLite) on :8787. Overridable via
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
  enrolled: boolean;
  guardian_name: string | null;
  guardian_phone: string | null;
  guardian_relation: string | null;
  address: string | null;
  father_name: string | null;
  mother_name: string | null;
  blood_group: string | null;
  admission_date: string | null;
  nationality: string | null;
  category: string | null;
  emergency_contact: string | null;
  medical_notes: string | null;
  // CBSE-compliance core (Mandatory layer).
  apaar_id: string | null;
  pen: string | null;
  aadhaar: string | null;
  religion: string | null;
  mother_tongue: string | null;
  permanent_address: string | null;
  photo: string | null;
  father_occupation: string | null;
  father_employer: string | null;
  father_income: string | null;
  father_phone: string | null;
  father_email: string | null;
  father_aadhaar: string | null;
  mother_occupation: string | null;
  mother_employer: string | null;
  mother_income: string | null;
  mother_phone: string | null;
  mother_email: string | null;
  mother_aadhaar: string | null;
  guardian_email: string | null;
  guardian_aadhaar: string | null;
  admission_class: string | null;
  previous_school: string | null;
  previous_board: string | null;
  tc_number: string | null;
  migration_number: string | null;
  verification_status: string | null;
  status: string | null;
  cwsn: string | null;
  lock_state: string | null;
}

export interface StudentFormData {
  first_name: string;
  middle_name?: string;
  last_name: string;
  gender?: string;
  birthdate?: string;
  email?: string;
  phone?: string;
  alt_id?: string;
  enrolled?: boolean;
  guardian_name?: string;
  guardian_phone?: string;
  guardian_relation?: string;
  guardian_email?: string;
  guardian_aadhaar?: string;
  address?: string;
  father_name?: string;
  father_occupation?: string;
  father_employer?: string;
  father_income?: string;
  father_phone?: string;
  father_email?: string;
  father_aadhaar?: string;
  mother_name?: string;
  mother_occupation?: string;
  mother_employer?: string;
  mother_income?: string;
  mother_phone?: string;
  mother_email?: string;
  mother_aadhaar?: string;
  blood_group?: string;
  nationality?: string;
  religion?: string;
  category?: string;
  mother_tongue?: string;
  aadhaar?: string;
  apaar_id?: string;
  pen?: string;
  permanent_address?: string;
  photo?: string | null;
  emergency_contact?: string;
  medical_notes?: string;
  admission_date?: string;
  admission_class?: string;
  previous_school?: string;
  previous_board?: string;
  tc_number?: string;
  migration_number?: string;
  verification_status?: string;
  status?: string;
  cwsn?: string;
  // Override path for editing CBSE-locked fields on a Locked record.
  override?: boolean;
  reason?: string;
}

export function createStudent(token: string, data: StudentFormData) {
  return req<{ ok: boolean; id: number }>('/students', { method: 'POST', token, body: data });
}

export function updateStudent(token: string, id: number, data: Partial<StudentFormData>) {
  return req<{ ok: boolean }>(`/students/${id}/update`, { method: 'POST', token, body: data });
}

export async function fetchStudent(token: string, id: number) {
  const { student } = await req<{ student: StudentDetail }>(`/students/${id}`, { token });
  return student;
}

export interface StaffFormData {
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  profile?: string;
  title?: string;
  department?: string;
  join_date?: string;
  employee_id?: string;
}

export function createStaff(token: string, data: StaffFormData) {
  return req<{ ok: boolean; id: number }>('/staff', { method: 'POST', token, body: data });
}

export function updateStaff(token: string, id: number, data: Partial<StaffFormData>) {
  return req<{ ok: boolean }>(`/staff/${id}/update`, { method: 'POST', token, body: data });
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
export function createCourse(token: string, data: { name: string }) {
  return req<{ ok: boolean; id: number }>('/courses', { method: 'POST', token, body: data });
}
export function updateCourse(token: string, id: number, data: { name: string }) {
  return req<{ ok: boolean }>(`/courses/${id}/update`, { method: 'POST', token, body: data });
}
export function deleteCourse(token: string, id: number) {
  return req<{ ok: boolean }>(`/courses/${id}/delete`, { method: 'POST', token, body: {} });
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

export interface SubjectFormData {
  name: string;
  code?: string;
  type?: string;
  course_id?: number | null;
  weekly_periods?: number;
  is_lab?: boolean;
  mandatory?: boolean;
}
export function createSubject(token: string, data: SubjectFormData) {
  return req<{ ok: boolean; id: number }>('/subjects', { method: 'POST', token, body: data });
}
export function updateSubject(token: string, id: number, data: Partial<SubjectFormData>) {
  return req<{ ok: boolean }>(`/subjects/${id}/update`, { method: 'POST', token, body: data });
}
export function deleteSubject(token: string, id: number) {
  return req<{ ok: boolean }>(`/subjects/${id}/delete`, { method: 'POST', token, body: {} });
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
  address?: string | null;
  principal_name?: string | null;
  logo?: string | null;
  signature?: string | null;
  cert_bg?: string | null;
}
export async function fetchSchool(token: string): Promise<School | null> {
  const res = await req<{ school: School | null }>('/school', { token });
  return res.school;
}
export function saveSchool(
  token: string,
  data: {
    name: string; academic_year: string; type: string;
    address?: string; principal_name?: string;
    logo?: string | null; signature?: string | null; cert_bg?: string | null;
  },
) {
  return req<{ ok: boolean }>('/school', { method: 'POST', token, body: data });
}

// ─── Letters & Certificates (document generation) ───────────────────────────
export interface Letter {
  id: number;
  ref_no: string | null;
  letter_date: string | null;
  recipient: string | null;
  subject: string | null;
  body: string | null;
  created_at: string | null;
}
export function fetchLetters(token: string) {
  return req<{ letters: Letter[]; total: number }>('/letters', { token });
}
export function createLetter(
  token: string,
  data: { recipient?: string; subject: string; body: string; letter_date?: string },
) {
  return req<{ ok: boolean; id: number; ref_no: string }>('/letters', { method: 'POST', token, body: data });
}

export interface Certificate {
  id: number;
  serial: string | null;
  cert_type: string | null;
  student_id: number | null;
  student_name: string | null;
  title: string | null;
  body: string | null;
  issued_date: string | null;
  created_at: string | null;
}
export function fetchCertificates(token: string) {
  return req<{ certificates: Certificate[]; total: number }>('/certificates', { token });
}
export function createCertificate(
  token: string,
  data: {
    cert_type: string;
    student_name: string;
    student_id?: number | null;
    title?: string;
    body?: string;
    issued_date?: string;
  },
) {
  return req<{ ok: boolean; id: number; serial: string }>('/certificates', { method: 'POST', token, body: data });
}

// ─── Sports OS: scheduling, records, leaderboard ────────────────────────────
export interface SportsEvent {
  id: number;
  name: string | null;
  sport: string | null;
  event_date: string | null;
  event_time: string | null;
  venue: string | null;
  notes: string | null;
  result_count: number;
  home_club_id: number | null;
  home_club: string | null;
  away_club_id: number | null;
  away_club: string | null;
}
export interface SportsResult {
  id: number;
  participant: string | null;
  house: string | null;
  position: number | null;
  points: number | null;
  note: string | null;
  club_id: number | null;
  club: string | null;
}
export interface LeaderRow {
  club_id?: number;
  club?: string;
  logo?: string | null;
  participant?: string;
  points: number;
  entries: number;
}
export function fetchSportsEvents(token: string) {
  return req<{ events: SportsEvent[]; total: number }>('/sports/events', { token });
}
export function createSportsEvent(
  token: string,
  data: {
    name: string; sport?: string; event_date?: string; event_time?: string; venue?: string; notes?: string;
    home_club_id?: number | null; away_club_id?: number | null;
  },
) {
  return req<{ ok: boolean; id: number }>('/sports/events', { method: 'POST', token, body: data });
}
export function deleteSportsEvent(token: string, id: number) {
  return req<{ ok: boolean }>(`/sports/events/${id}/delete`, { method: 'POST', token, body: {} });
}
export function fetchSportsResults(token: string, eventId: number) {
  return req<{ results: SportsResult[]; total: number }>(`/sports/results?event_id=${eventId}`, { token });
}
export function createSportsResult(
  token: string,
  data: { event_id: number; participant: string; club_id?: number | null; position?: number | null; points?: number; note?: string },
) {
  return req<{ ok: boolean; id: number }>('/sports/results', { method: 'POST', token, body: data });
}
export function deleteSportsResult(token: string, id: number) {
  return req<{ ok: boolean }>(`/sports/results/${id}/delete`, { method: 'POST', token, body: {} });
}
export function fetchLeaderboard(token: string) {
  return req<{ clubs: LeaderRow[]; participants: LeaderRow[] }>('/sports/leaderboard', { token });
}

// ─── Clubs OS: clubs + member roster ────────────────────────────────────────
export interface Club {
  id: number;
  name: string | null;
  description: string | null;
  logo: string | null;
  lead_staff: string | null;
  meeting_day: string | null;
  member_count: number;
}
export interface ClubMember {
  id: number;
  student_id: number | null;
  student_name: string | null;
  role: string | null;
}
export interface ClubFormData {
  name: string;
  description?: string;
  logo?: string | null;
  lead_staff?: string;
  meeting_day?: string;
}
export function fetchClubs(token: string) {
  return req<{ clubs: Club[]; total: number }>('/clubs', { token });
}
export function createClub(token: string, data: ClubFormData) {
  return req<{ ok: boolean; id: number }>('/clubs', { method: 'POST', token, body: data });
}
export function updateClub(token: string, id: number, data: ClubFormData) {
  return req<{ ok: boolean }>(`/clubs/${id}/update`, { method: 'POST', token, body: data });
}
export function deleteClub(token: string, id: number) {
  return req<{ ok: boolean }>(`/clubs/${id}/delete`, { method: 'POST', token, body: {} });
}
export function fetchClubMembers(token: string, clubId: number) {
  return req<{ members: ClubMember[]; total: number }>(`/club-members?club_id=${clubId}`, { token });
}
export function addClubMember(
  token: string,
  data: { club_id: number; student_name: string; student_id?: number | null; role?: string },
) {
  return req<{ ok: boolean; id: number }>('/club-members', { method: 'POST', token, body: data });
}
export function removeClubMember(token: string, id: number) {
  return req<{ ok: boolean }>(`/club-members/${id}/delete`, { method: 'POST', token, body: {} });
}

// ─── Fee receipts (register of all payments) ────────────────────────────────
export interface Receipt {
  id: number;
  student_id: number;
  first_name: string | null;
  last_name: string | null;
  fee_head_name: string;
  amount_paid: number;
  payment_date: string | null;
  payment_mode: string | null;
  reference: string | null;
  receipt_no: string | null;
}
export function fetchReceipts(token: string) {
  return req<{ payments: Receipt[]; total: number }>('/fee-payments', { token });
}

// ─── Student documents repository ───────────────────────────────────────────
export interface StudentDocument {
  id: number;
  doc_type: string | null;
  file_name: string | null;
  mime: string | null;
  verified: boolean;
  uploaded_at: string | null;
}
export interface StudentDocumentFull extends StudentDocument {
  data: string | null;
}
export function fetchStudentDocuments(token: string, studentId: number) {
  return req<{ documents: StudentDocument[]; total: number }>(`/student-documents?student_id=${studentId}`, { token });
}
export async function fetchStudentDocument(token: string, id: number) {
  const { document } = await req<{ document: StudentDocumentFull }>(`/student-documents/${id}`, { token });
  return document;
}
export function addStudentDocument(
  token: string,
  data: { student_id: number; doc_type: string; file_name: string; mime: string; data: string },
) {
  return req<{ ok: boolean; id: number }>('/student-documents', { method: 'POST', token, body: data });
}
export function verifyStudentDocument(token: string, id: number, verified: boolean) {
  return req<{ ok: boolean }>(`/student-documents/${id}/verify`, { method: 'POST', token, body: { verified } });
}
export function deleteStudentDocument(token: string, id: number) {
  return req<{ ok: boolean }>(`/student-documents/${id}/delete`, { method: 'POST', token, body: {} });
}

// ─── Academic marks ─────────────────────────────────────────────────────────
export interface StudentMark {
  id: number;
  term: string | null;
  subject: string | null;
  max_marks: number | null;
  marks: number | null;
  grade: string | null;
  remarks: string | null;
}
export function fetchStudentMarks(token: string, studentId: number) {
  return req<{ marks: StudentMark[]; total: number }>(`/student-marks?student_id=${studentId}`, { token });
}
export function addStudentMark(token: string, data: { student_id: number; term: string; subject: string; max_marks?: number; marks?: number; grade?: string; remarks?: string }) {
  return req<{ ok: boolean; id: number }>('/student-marks', { method: 'POST', token, body: data });
}
export function deleteStudentMark(token: string, id: number) {
  return req<{ ok: boolean }>(`/student-marks/${id}/delete`, { method: 'POST', token, body: {} });
}

// ─── CBSE board-exam registration ───────────────────────────────────────────
export interface BoardRegistration {
  id: number;
  exam_year: string | null;
  registration_no: string | null;
  loc_status: string | null;
  admit_card_status: string | null;
  board_subjects: string | null;
  notes: string | null;
}
export function fetchBoardRegistrations(token: string, studentId: number) {
  return req<{ registrations: BoardRegistration[]; total: number }>(`/board-registrations?student_id=${studentId}`, { token });
}
export function saveBoardRegistration(
  token: string,
  data: { student_id?: number; exam_year?: string; registration_no?: string; loc_status?: string; admit_card_status?: string; board_subjects?: string; notes?: string },
  id?: number,
) {
  return req<{ ok: boolean; id: number }>(id ? `/board-registrations/${id}/update` : '/board-registrations', { method: 'POST', token, body: data });
}
export function deleteBoardRegistration(token: string, id: number) {
  return req<{ ok: boolean }>(`/board-registrations/${id}/delete`, { method: 'POST', token, body: {} });
}

// ─── Communication log ──────────────────────────────────────────────────────
export interface StudentMessage {
  id: number;
  channel: string | null;
  direction: string | null;
  subject: string | null;
  body: string | null;
  acknowledged: boolean;
  created_at: string | null;
}
export function fetchStudentMessages(token: string, studentId: number) {
  return req<{ messages: StudentMessage[]; total: number }>(`/student-communications?student_id=${studentId}`, { token });
}
export function addStudentMessage(token: string, data: { student_id: number; channel: string; direction: string; subject: string; body?: string }) {
  return req<{ ok: boolean; id: number }>('/student-communications', { method: 'POST', token, body: data });
}
export function ackStudentMessage(token: string, id: number, acknowledged: boolean) {
  return req<{ ok: boolean }>(`/student-communications/${id}/ack`, { method: 'POST', token, body: { acknowledged } });
}
export function deleteStudentMessage(token: string, id: number) {
  return req<{ ok: boolean }>(`/student-communications/${id}/delete`, { method: 'POST', token, body: {} });
}

// ─── Learning analytics (derived from recorded scores) ──────────────────────
export interface StudentAnalytics {
  name: string;
  overall_pct: number | null;
  subjects: { subject: string; avg_pct: number; count: number; trend: 'improving' | 'declining' | 'steady'; delta: number }[];
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
  summary: string;
}
export function fetchStudentAnalytics(token: string, studentId: number) {
  return req<StudentAnalytics>(`/students/${studentId}/analytics`, { token });
}

// ─── Record-lock workflow + audit trail ─────────────────────────────────────
export const LOCK_STAGES = ['Draft', 'Parent Verified', 'Principal Verified', 'Submitted', 'Locked'] as const;
export interface AuditEntry {
  id: number;
  username: string | null;
  action: string;
  detail: { field?: string; old?: string | null; new?: string | null; reason?: string | null } | null;
  created_at: string;
}
export function advanceLock(token: string, studentId: number, opts: { to?: string; reason?: string } = {}) {
  return req<{ ok: boolean; lock_state: string }>(`/students/${studentId}/advance-lock`, { method: 'POST', token, body: opts });
}
export function fetchStudentAudit(token: string, studentId: number) {
  return req<{ history: AuditEntry[]; total: number }>(`/students/${studentId}/audit`, { token });
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
export function createClass(token: string, data: { name: string; grade_level?: string }) {
  return req<{ ok: boolean; id: number }>('/classes', { method: 'POST', token, body: data });
}
export function updateClass(token: string, id: number, data: { name?: string; grade_level?: string }) {
  return req<{ ok: boolean }>(`/classes/${id}/update`, { method: 'POST', token, body: data });
}
export function deleteClass(token: string, id: number) {
  return req<{ ok: boolean }>(`/classes/${id}/delete`, { method: 'POST', token, body: {} });
}
export function createSection(token: string, data: { class_id: number; name: string; teacher_id?: number | null; room_id?: number | null; capacity?: number | null }) {
  return req<{ ok: boolean; id: number }>('/sections', { method: 'POST', token, body: data });
}
export function updateSection(token: string, id: number, data: { name?: string; teacher_id?: number | null; room_id?: number | null; capacity?: number | null }) {
  return req<{ ok: boolean }>(`/sections/${id}/update`, { method: 'POST', token, body: data });
}
export function deleteSection(token: string, id: number) {
  return req<{ ok: boolean }>(`/sections/${id}/delete`, { method: 'POST', token, body: {} });
}

// ─── Section roster: map students into a class/section ───────────────────────
export interface SectionStudent {
  id: number;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  gender: string | null;
  enrolled_date: string | null;
}
export interface SectionStudentsResponse {
  students: SectionStudent[];
  total: number;
}
export function fetchSectionStudents(token: string, sectionId: number) {
  return req<SectionStudentsResponse>(`/section-students?section_id=${sectionId}`, { token });
}
export function enrollSectionStudent(
  token: string,
  data: { section_id: number; student_id: number },
) {
  return req<{ ok: boolean }>('/section-students', { method: 'POST', token, body: data });
}
export function removeSectionStudent(
  token: string,
  data: { section_id: number; student_id: number },
) {
  return req<{ ok: boolean }>('/section-students/remove', { method: 'POST', token, body: data });
}

export interface Term {
  id: number;
  year_id: number;
  label: string;
  start_date: string | null;
  end_date: string | null;
  is_active: boolean;
}
export interface AcademicYear {
  id: number;
  label: string;
  start_date: string | null;
  end_date: string | null;
  is_active: boolean;
  is_closed: boolean;
  terms: Term[];
}
export interface AcademicYearsResponse {
  years: AcademicYear[];
  total: number;
}
export function fetchAcademicYears(token: string) {
  return req<AcademicYearsResponse>('/academic-years', { token });
}
export function fetchActiveYear(token: string) {
  return req<{ year: AcademicYear | null }>('/academic-years/active', { token });
}
export function createAcademicYear(token: string, data: { label: string; start_date?: string; end_date?: string }) {
  return req<{ ok: boolean; id: number }>('/academic-years', { method: 'POST', token, body: data });
}
export function activateAcademicYear(token: string, id: number) {
  return req<{ ok: boolean }>('/academic-years/activate', { method: 'POST', token, body: { id } });
}
export function closeAcademicYear(token: string, id: number) {
  return req<{ ok: boolean }>('/academic-years/close', { method: 'POST', token, body: { id } });
}
export function createTerm(token: string, data: { year_id: number; label: string; start_date?: string; end_date?: string }) {
  return req<{ ok: boolean; id: number }>('/terms', { method: 'POST', token, body: data });
}
export function deleteTerm(token: string, id: number) {
  return req<{ ok: boolean }>('/terms/delete', { method: 'POST', token, body: { id } });
}
export function activateTerm(token: string, id: number) {
  return req<{ ok: boolean }>('/terms/activate', { method: 'POST', token, body: { id } });
}

export interface SubjectQuota {
  id: number;
  name: string | null;
  code: string | null;
  target: number;
  scheduled: number;
  status: 'met' | 'under' | 'over';
}
export interface QuotaResponse {
  subjects: SubjectQuota[];
  total: number;
}
export function fetchTimetableQuota(token: string, sectionId: number) {
  return req<QuotaResponse>(`/timetable/quota?section_id=${sectionId}`, { token });
}

export interface TeacherLoadSection {
  section: string | null;
  periods: number;
}
export interface TeacherLoad {
  staff_id: number;
  teacher_name: string | null;
  total_periods: number;
  sections: TeacherLoadSection[];
}
export interface TeacherLoadResponse {
  teachers: TeacherLoad[];
  total: number;
}
export function fetchTeacherLoad(token: string) {
  return req<TeacherLoadResponse>('/timetable/teacher-load', { token });
}

export interface TimetableEntry {
  id: number;
  section_id: number;
  period_id: number;
  day_of_week: number;
  subject_id: number | null;
  subject_name: string | null;
  subject_code: string | null;
  subject_type: string | null;
  staff_id: number | null;
  teacher_name: string | null;
  room_id: number | null;
  room_name: string | null;
}

export interface TimetableResponse {
  entries: TimetableEntry[];
  total: number;
}

export function fetchTimetable(token: string, sectionId: number) {
  return req<TimetableResponse>(`/timetable?section_id=${sectionId}`, { token });
}

export function setTimetableEntry(
  token: string,
  data: {
    section_id: number;
    period_id: number;
    day_of_week: number;
    subject_id: number | null;
    staff_id: number | null;
    room_id: number | null;
  },
) {
  return req<{ ok: boolean }>('/timetable', { method: 'POST', token, body: data });
}

export function clearTimetableEntry(
  token: string,
  data: { section_id: number; period_id: number; day_of_week: number },
) {
  return req<{ ok: boolean }>('/timetable/clear', { method: 'POST', token, body: data });
}

export interface Period {
  id?: number;
  label: string;
  period_type: 'period' | 'break';
  start_time: string;
  end_time: string;
  sort_order?: number;
}

export interface PeriodsResponse {
  periods: Period[];
  total: number;
}

export function fetchPeriods(token: string) {
  return req<PeriodsResponse>('/periods', { token });
}

export function savePeriods(token: string, periods: Omit<Period, 'id' | 'sort_order'>[]) {
  return req<{ ok: boolean }>('/periods', { method: 'POST', token, body: { periods } });
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
