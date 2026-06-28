import { describe, it, expect, inject, beforeAll } from 'vitest';
import { authedApi, type ApiClient } from '../helpers/api';

// Mapping students into a class/section via /section-students, and the side
// effect that keeps students.enrolled (the dashboard's "not enrolled" metric)
// consistent with section membership.
describe('API · section enrollment', () => {
  let client: ApiClient;
  let classId: number;
  let sectionId: number;
  let studentId: number;
  const last = `Enrollee-${Date.now()}`;

  beforeAll(async () => {
    client = await authedApi(inject('baseUrl'));
    const cls = await client.post<{ id: number }>('/classes', { name: `EnrollClass-${Date.now()}` });
    classId = cls.body.id;
    const sec = await client.post<{ id: number }>('/sections', { class_id: classId, name: 'A' });
    sectionId = sec.body.id;
    const stu = await client.post<{ id: number }>('/students', { first_name: 'En', last_name: last });
    studentId = stu.body.id;
  });

  const rosterIds = async () => {
    const res = await client.get<{ students: { id: number }[] }>(
      `/section-students?section_id=${sectionId}`,
    );
    return res.body.students.map((s) => s.id);
  };
  const isEnrolled = async () => {
    const res = await client.get<{ student: { enrolled: boolean } }>(`/students/${studentId}`);
    return res.body.student.enrolled;
  };

  it('a new student starts not enrolled and not in the section', async () => {
    expect(await isEnrolled()).toBe(false);
    expect(await rosterIds()).not.toContain(studentId);
  });

  it('enrolling adds the student to the section and flips enrolled=true', async () => {
    const res = await client.post<{ ok: boolean }>('/section-students', {
      section_id: sectionId,
      student_id: studentId,
    });
    expect(res.status).toBe(200);
    expect(await rosterIds()).toContain(studentId);
    expect(await isEnrolled()).toBe(true);
  });

  it('enrolling is idempotent (no duplicate roster rows)', async () => {
    await client.post('/section-students', { section_id: sectionId, student_id: studentId });
    const ids = await rosterIds();
    expect(ids.filter((id) => id === studentId)).toHaveLength(1);
  });

  it('requires section_id and student_id (422)', async () => {
    expect((await client.post('/section-students', { section_id: sectionId })).status).toBe(422);
    expect((await client.post('/section-students', { student_id: studentId })).status).toBe(422);
  });

  it('removing takes the student out and clears enrolled when in no section', async () => {
    const res = await client.post<{ ok: boolean }>('/section-students/remove', {
      section_id: sectionId,
      student_id: studentId,
    });
    expect(res.status).toBe(200);
    expect(await rosterIds()).not.toContain(studentId);
    expect(await isEnrolled()).toBe(false);
  });
});
