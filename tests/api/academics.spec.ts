import { describe, it, expect, inject, beforeAll } from 'vitest';
import { authedApi, type ApiClient } from '../helpers/api';

describe('API · academics (marks + board registration)', () => {
  let client: ApiClient;
  let studentId: number;
  const stamp = Date.now();

  beforeAll(async () => {
    client = await authedApi(inject('baseUrl'));
    const s = await client.post<{ id: number }>('/students', { first_name: 'Acad', last_name: `Record-${stamp}` });
    studentId = s.body.id;
  });

  it('records a subject score and lists it', async () => {
    const add = await client.post<{ id: number }>('/student-marks', {
      student_id: studentId, term: 'Mid Term', subject: 'Maths', max_marks: 100, marks: 88, grade: 'A1',
    });
    expect(add.status).toBe(201);
    const list = await client.get<{ marks: { subject: string; marks: number; grade: string }[]; total: number }>(`/student-marks?student_id=${studentId}`);
    expect(list.body.total).toBe(1);
    expect(list.body.marks[0].subject).toBe('Maths');
    expect(list.body.marks[0].marks).toBe(88);
    expect(list.body.marks[0].grade).toBe('A1');
  });

  it('creates a board registration and advances its LOC status', async () => {
    const add = await client.post<{ id: number }>('/board-registrations', {
      student_id: studentId, exam_year: '2027', registration_no: 'CBSE-99', loc_status: 'Pending', admit_card_status: 'Not issued', board_subjects: 'Eng, Maths, Sci',
    });
    expect(add.status).toBe(201);
    const id = add.body.id;

    const upd = await client.post(`/board-registrations/${id}/update`, {
      exam_year: '2027', registration_no: 'CBSE-99', loc_status: 'Locked', admit_card_status: 'Issued', board_subjects: 'Eng, Maths, Sci',
    });
    expect(upd.status).toBe(200);

    const list = await client.get<{ registrations: { loc_status: string; admit_card_status: string }[] }>(`/board-registrations?student_id=${studentId}`);
    expect(list.body.registrations[0].loc_status).toBe('Locked');
    expect(list.body.registrations[0].admit_card_status).toBe('Issued');
  });
});
