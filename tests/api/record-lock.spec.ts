import { describe, it, expect, inject, beforeAll } from 'vitest';
import { authedApi, type ApiClient } from '../helpers/api';

// Audit trail + CBSE record-locking workflow.
describe('API · record locking + audit trail', () => {
  let client: ApiClient;
  let studentId: number;
  const stamp = Date.now();

  beforeAll(async () => {
    client = await authedApi(inject('baseUrl'));
    const s = await client.post<{ id: number }>('/students', { first_name: 'Lock', last_name: `Subject-${stamp}`, gender: 'Male' });
    studentId = s.body.id;
  });

  it('audits a field change with old → new', async () => {
    await client.post(`/students/${studentId}/update`, { phone: '+91 90000 12345' });
    const audit = await client.get<{ history: { action: string; detail: { field: string; old: string | null; new: string } }[] }>(`/students/${studentId}/audit`);
    const entry = audit.body.history.find((h) => h.detail?.field === 'phone');
    expect(entry).toBeTruthy();
    expect(entry!.action).toBe('student.update');
    expect(entry!.detail.new).toBe('+91 90000 12345');
  });

  it('advances the lock lifecycle Draft → … → Locked', async () => {
    let r = await client.post<{ lock_state: string }>(`/students/${studentId}/advance-lock`, {});
    expect(r.body.lock_state).toBe('Parent Verified');
    r = await client.post<{ lock_state: string }>(`/students/${studentId}/advance-lock`, {});
    expect(r.body.lock_state).toBe('Principal Verified');
    r = await client.post<{ lock_state: string }>(`/students/${studentId}/advance-lock`, { to: 'Locked' });
    expect(r.body.lock_state).toBe('Locked');
    const detail = await client.get<{ student: { lock_state: string } }>(`/students/${studentId}`);
    expect(detail.body.student.lock_state).toBe('Locked');
  });

  it('rejects edits to CBSE-locked fields once Locked', async () => {
    const res = await client.post<{ error: string; locked_fields: string[] }>(`/students/${studentId}/update`, { gender: 'Female' });
    expect(res.status).toBe(423);
    expect(res.body.locked_fields).toContain('gender');
    // The value must NOT have changed.
    const detail = await client.get<{ student: { gender: string } }>(`/students/${studentId}`);
    expect(detail.body.student.gender).toBe('Male');
  });

  it('allows a non-locked field even when Locked', async () => {
    const res = await client.post(`/students/${studentId}/update`, { phone: '+91 98765 00000' });
    expect(res.status).toBe(200);
  });

  it('permits an audited override with a reason', async () => {
    const res = await client.post(`/students/${studentId}/update`, { gender: 'Female', override: true, reason: 'CBSE correction approval #123' });
    expect(res.status).toBe(200);
    const audit = await client.get<{ history: { action: string; detail: { field: string; reason: string | null } }[] }>(`/students/${studentId}/audit`);
    const override = audit.body.history.find((h) => h.action === 'student.locked_override' && h.detail?.field === 'gender');
    expect(override).toBeTruthy();
    expect(override!.detail.reason).toBe('CBSE correction approval #123');
  });
});
