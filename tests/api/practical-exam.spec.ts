import { describe, it, expect, inject, beforeAll } from 'vitest';
import { authedApi, type ApiClient } from '../helpers/api';

describe('API · practical-exam SOP + mark locking', () => {
  let client: ApiClient;
  let examId: number;

  beforeAll(async () => {
    client = await authedApi(inject('baseUrl'));
  });

  it('schedules a practical with examiner mapping', async () => {
    const add = await client.post<{ id: number }>('/practical-exams', {
      subject: 'Physics', class_name: 'XII', exam_date: '2027-02-10', batch: 'A',
      internal_examiner: 'Mr Rao', external_examiner: 'Dr Iyer', lab: 'Physics Lab 1', max_marks: 30, geo: '12.97,77.59',
    });
    expect(add.status).toBe(201);
    examId = add.body.id;

    const list = await client.get<{ exams: { id: number; status: string; external_examiner: string }[] }>('/practical-exams');
    const row = list.body.exams.find((e) => e.id === examId)!;
    expect(row.status).toBe('Scheduled');
    expect(row.external_examiner).toBe('Dr Iyer');
  });

  it('uploads marks then locks them irreversibly', async () => {
    await client.post(`/practical-exams/${examId}/marks`, { student_name: 'Aarav', marks: 27 });
    let detail = await client.get<{ exam: { status: string }; marks: { student_name: string }[] }>(`/practical-exams/${examId}`);
    expect(detail.body.marks).toHaveLength(1);
    expect(detail.body.exam.status).toBe('Marks uploaded');

    const lock = await client.post<{ marks_locked: boolean }>(`/practical-exams/${examId}/lock`, {});
    expect(lock.status).toBe(200);
    expect(lock.body.marks_locked).toBe(true);

    detail = await client.get<{ exam: { status: string } }>(`/practical-exams/${examId}`);
    expect(detail.body.exam.status).toBe('Locked');
  });

  it('rejects mark changes after locking (423)', async () => {
    const res = await client.post(`/practical-exams/${examId}/marks`, { student_name: 'Late', marks: 10 });
    expect(res.status).toBe(423);
    const detail = await client.get<{ marks: unknown[] }>(`/practical-exams/${examId}`);
    expect(detail.body.marks).toHaveLength(1); // unchanged
  });
});
