import { describe, it, expect, inject, beforeAll } from 'vitest';
import { authedApi, type ApiClient } from '../helpers/api';

// Full CRUD round-trip against the live API. Uses a unique name so assertions
// hold regardless of the demo seed already present.
describe('API · students CRUD', () => {
  let client: ApiClient;
  const stamp = Date.now();
  const first = 'Testy';
  const last = `Persist-${stamp}`;
  let createdId: number;

  beforeAll(async () => {
    client = await authedApi(inject('baseUrl'));
  });

  it('lists seeded students', async () => {
    const res = await client.get<{ students: unknown[]; total: number }>('/students');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.students)).toBe(true);
    expect(res.body.total).toBeGreaterThan(0);
  });

  it('creates a student (POST /students)', async () => {
    const res = await client.post<{ ok: boolean; id: number }>('/students', {
      first_name: first,
      last_name: last,
      email: `testy.${stamp}@example.test`,
      gender: 'Other',
    });
    expect(res.status).toBe(201); // server returns 201 Created
    expect(res.body.ok).toBe(true);
    expect(res.body.id).toBeGreaterThan(0);
    createdId = res.body.id;
  });

  it('reads the created student (GET /students/:id)', async () => {
    const res = await client.get<{ student: { first_name: string; last_name: string } }>(
      `/students/${createdId}`,
    );
    expect(res.status).toBe(200);
    expect(res.body.student.first_name).toBe(first);
    expect(res.body.student.last_name).toBe(last);
  });

  it('finds the student via search (?q=)', async () => {
    const res = await client.get<{ students: { id: number }[] }>(
      `/students?q=${encodeURIComponent(last)}`,
    );
    expect(res.status).toBe(200);
    expect(res.body.students.some((s) => s.id === createdId)).toBe(true);
  });

  it('updates the student and persists the change', async () => {
    const upd = await client.post<{ ok: boolean }>(`/students/${createdId}/update`, {
      first_name: first,
      last_name: last,
      phone: '+91 90000 99999',
      enrolled: true,
    });
    expect(upd.status).toBe(200);

    const res = await client.get<{ student: { phone: string } }>(`/students/${createdId}`);
    expect(res.status).toBe(200);
    expect(res.body.student.phone).toBe('+91 90000 99999');
  });

  it('stores and returns the richer profile fields', async () => {
    const create = await client.post<{ id: number }>('/students', {
      first_name: 'Rich', last_name: `Fields-${stamp}`,
      father_name: 'Mr Field', mother_name: 'Mrs Field', blood_group: 'O+',
      admission_date: '2026-06-01', nationality: 'Indian', category: 'General',
      emergency_contact: '+91 90000 00000', medical_notes: 'None',
    });
    const res = await client.get<{ student: Record<string, string | boolean> }>(`/students/${create.body.id}`);
    expect(res.body.student.father_name).toBe('Mr Field');
    expect(res.body.student.blood_group).toBe('O+');
    expect(res.body.student.admission_date).toBe('2026-06-01');
    expect(res.body.student.emergency_contact).toBe('+91 90000 00000');
  });

  // Regression for BUG-20260627-01: a partial update must NOT null `enrolled`
  // or break the detail read. (Pre-fix this returned 404.)
  it('a partial update preserves untouched fields and still reads back', async () => {
    // Set enrolled = true via a full-ish update first.
    await client.post(`/students/${createdId}/update`, {
      first_name: first,
      last_name: last,
      enrolled: true,
    });

    // Now a partial update touching only phone.
    const upd = await client.post<{ ok: boolean }>(`/students/${createdId}/update`, {
      phone: '+91 90000 88888',
    });
    expect(upd.status).toBe(200);

    const res = await client.get<{ student: { phone: string; enrolled: boolean } }>(
      `/students/${createdId}`,
    );
    expect(res.status).toBe(200); // no longer 404
    expect(res.body.student.phone).toBe('+91 90000 88888');
    expect(res.body.student.enrolled).toBe(true); // preserved, not nulled
  });
});
