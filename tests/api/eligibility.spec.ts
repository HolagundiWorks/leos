import { describe, it, expect, inject, beforeAll } from 'vitest';
import { authedApi, type ApiClient } from '../helpers/api';

describe('API · board eligibility (attendance 75% rule)', () => {
  let client: ApiClient;
  let studentId: number;
  const stamp = Date.now();

  beforeAll(async () => {
    client = await authedApi(inject('baseUrl'));
    const s = await client.post<{ id: number }>('/students', { first_name: 'Elig', last_name: `Check-${stamp}` });
    studentId = s.body.id;
  });

  it('reports Insufficient data before enough records', async () => {
    const res = await client.get<{ status: string; total: number }>(`/students/${studentId}/attendance`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('Insufficient data');
    expect(res.body.total).toBe(0);
  });

  it('logs an audited shortage warning to the communication log', async () => {
    const warn = await client.post(`/attendance/warn`, { student_id: studentId, attendance_pct: 61.5 });
    expect(warn.status).toBe(200);

    // It lands in the student's communication log…
    const comms = await client.get<{ messages: { subject: string; channel: string }[] }>(`/student-communications?student_id=${studentId}`);
    const msg = comms.body.messages.find((m) => m.subject.includes('Attendance shortage'));
    expect(msg).toBeTruthy();
    expect(msg!.channel).toBe('Circular');

    // …and into the audit trail.
    const audit = await client.get<{ history: { action: string }[] }>(`/students/${studentId}/audit`);
    expect(audit.body.history.some((h) => h.action === 'attendance.warn')).toBe(true);
  });

  it('returns the alerts list shape', async () => {
    const res = await client.get<{ alerts: unknown[]; total: number }>(`/attendance/alerts`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.alerts)).toBe(true);
  });
});
