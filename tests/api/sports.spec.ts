import { describe, it, expect, inject, beforeAll } from 'vitest';
import { authedApi, type ApiClient } from '../helpers/api';

// Sports: schedule an event, record results with houses/points, and check the
// leaderboard aggregates points per house (highest first).
describe('API · sports (schedule, results, leaderboard)', () => {
  let client: ApiClient;
  let eventId: number;
  const house = `H-${Date.now()}`; // unique houses so the leaderboard assertion is isolated
  const houseA = `${house}-A`;
  const houseB = `${house}-B`;

  beforeAll(async () => { client = await authedApi(inject('baseUrl')); });

  it('schedules an event (201) and lists it', async () => {
    const res = await client.post<{ ok: boolean; id: number }>('/sports/events', {
      name: `100m Final ${Date.now()}`, sport: 'Athletics', event_date: '2026-08-01', venue: 'Main Ground',
    });
    expect(res.status).toBe(201);
    eventId = res.body.id;
    const list = await client.get<{ events: { id: number }[] }>('/sports/events');
    expect(list.body.events.some((e) => e.id === eventId)).toBe(true);
  });

  it('rejects an event with no name (422)', async () => {
    expect((await client.post('/sports/events', { sport: 'x' })).status).toBe(422);
  });

  it('records results and lists them for the event', async () => {
    await client.post('/sports/results', { event_id: eventId, participant: 'Aarav', house: houseA, position: 1, points: 10 });
    await client.post('/sports/results', { event_id: eventId, participant: 'Diya', house: houseB, position: 2, points: 5 });
    const r = await client.get<{ results: { participant: string }[] }>(`/sports/results?event_id=${eventId}`);
    expect(r.body.results).toHaveLength(2);
  });

  it('rejects a result without participant or event_id (422)', async () => {
    expect((await client.post('/sports/results', { event_id: eventId })).status).toBe(422);
    expect((await client.post('/sports/results', { participant: 'X' })).status).toBe(422);
  });

  it('leaderboard aggregates points per house, highest first', async () => {
    const lb = await client.get<{ houses: { house: string; points: number }[] }>('/sports/leaderboard');
    const a = lb.body.houses.find((h) => h.house === houseA);
    const b = lb.body.houses.find((h) => h.house === houseB);
    expect(a?.points).toBe(10);
    expect(b?.points).toBe(5);
    // A (10) must rank above B (5) in the ordered list.
    expect(lb.body.houses.findIndex((h) => h.house === houseA))
      .toBeLessThan(lb.body.houses.findIndex((h) => h.house === houseB));
  });
});
