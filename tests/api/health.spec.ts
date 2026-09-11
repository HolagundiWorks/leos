import { describe, it, expect, inject } from 'vitest';
import { api } from '../helpers/api';

// Health / liveness — no auth required.
describe('API · health', () => {
  const client = api(inject('baseUrl'));

  it('GET /health reports the service is up', async () => {
    const res = await client.get<{ ok: boolean; service: string }>('/health');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.service).toBe('leos-typescript');
  });

  it('GET / also answers as a health check', async () => {
    const res = await client.get<{ ok: boolean }>('/');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});
