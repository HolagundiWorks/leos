import { describe, it, expect, inject, beforeAll } from 'vitest';
import { authedApi, type ApiClient } from '../helpers/api';

describe('API · clubs (CRUD + members)', () => {
  let client: ApiClient;
  let clubId: number;
  let memberId: number;

  beforeAll(async () => { client = await authedApi(inject('baseUrl')); });

  it('creates a club (201) and lists it with a member count', async () => {
    const res = await client.post<{ ok: boolean; id: number }>('/clubs', {
      name: `Robotics ${Date.now()}`, description: 'Build robots', lead_staff: 'Ms. Priya', meeting_day: 'Friday 3pm',
    });
    expect(res.status).toBe(201);
    clubId = res.body.id;
    const list = await client.get<{ clubs: { id: number; member_count: number }[] }>('/clubs');
    const club = list.body.clubs.find((c) => c.id === clubId);
    expect(club?.member_count).toBe(0);
  });

  it('rejects a club with no name (422)', async () => {
    expect((await client.post('/clubs', { description: 'x' })).status).toBe(422);
  });

  it('adds a member and the club member count reflects it', async () => {
    const res = await client.post<{ ok: boolean; id: number }>('/club-members', {
      club_id: clubId, student_name: 'Aarav Sharma', role: 'President',
    });
    expect(res.status).toBe(201);
    memberId = res.body.id;

    const members = await client.get<{ members: { student_name: string; role: string }[] }>(`/club-members?club_id=${clubId}`);
    expect(members.body.members.some((m) => m.student_name === 'Aarav Sharma' && m.role === 'President')).toBe(true);

    const list = await client.get<{ clubs: { id: number; member_count: number }[] }>('/clubs');
    expect(list.body.clubs.find((c) => c.id === clubId)?.member_count).toBe(1);
  });

  it('removes a member and deletes the club', async () => {
    expect((await client.post(`/club-members/${memberId}/delete`, {})).status).toBe(200);
    const members = await client.get<{ members: unknown[] }>(`/club-members?club_id=${clubId}`);
    expect(members.body.members).toHaveLength(0);

    expect((await client.post(`/clubs/${clubId}/delete`, {})).status).toBe(200);
    const list = await client.get<{ clubs: { id: number }[] }>('/clubs');
    expect(list.body.clubs.some((c) => c.id === clubId)).toBe(false);
  });
});
