import { describe, it, expect, inject, beforeAll } from 'vitest';
import { authedApi, type ApiClient } from '../helpers/api';

describe('API · communication log', () => {
  let client: ApiClient;
  let studentId: number;
  const stamp = Date.now();

  beforeAll(async () => {
    client = await authedApi(inject('baseUrl'));
    const s = await client.post<{ id: number }>('/students', { first_name: 'Comm', last_name: `Log-${stamp}` });
    studentId = s.body.id;
  });

  it('logs a circular and lets the parent acknowledgement be recorded', async () => {
    const add = await client.post<{ id: number }>('/student-communications', {
      student_id: studentId, channel: 'Circular', direction: 'Outgoing', subject: 'Annual Day', body: 'On 12 Dec',
    });
    expect(add.status).toBe(201);
    const id = add.body.id;

    let list = await client.get<{ messages: { subject: string; acknowledged: boolean }[]; total: number }>(`/student-communications?student_id=${studentId}`);
    expect(list.body.total).toBe(1);
    expect(list.body.messages[0].subject).toBe('Annual Day');
    expect(list.body.messages[0].acknowledged).toBe(false);

    const acked = await client.post(`/student-communications/${id}/ack`, { acknowledged: true });
    expect(acked.status).toBe(200);
    list = await client.get<{ messages: { acknowledged: boolean }[] }>(`/student-communications?student_id=${studentId}`);
    expect(list.body.messages[0].acknowledged).toBe(true);
  });
});
