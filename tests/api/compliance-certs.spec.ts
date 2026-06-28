import { describe, it, expect, inject, beforeAll } from 'vitest';
import { authedApi, type ApiClient } from '../helpers/api';

const iso = (offsetDays: number) => new Date(Date.now() + offsetDays * 86400_000).toISOString().slice(0, 10);

describe('API · compliance certificates + expiry status', () => {
  let client: ApiClient;

  beforeAll(async () => {
    client = await authedApi(inject('baseUrl'));
  });

  it('computes Valid / Expiring / Expired from the expiry date', async () => {
    await client.post('/compliance-certs', { scope: 'school', cert_type: 'Fire Safety', authority: 'Fire Dept', expiry_date: iso(400) });
    await client.post('/compliance-certs', { scope: 'school', cert_type: 'Water Testing', authority: 'Lab', expiry_date: iso(10) });
    await client.post('/compliance-certs', { scope: 'school', cert_type: 'CCTV Audit', authority: 'Vendor', expiry_date: iso(-5) });

    const res = await client.get<{ certificates: { cert_type: string; status: string; days_left: number | null }[]; expired: number; expiring: number }>(`/compliance-certs?scope=school`);
    expect(res.status).toBe(200);
    const by = (t: string) => res.body.certificates.find((c) => c.cert_type === t)!;
    expect(by('Fire Safety').status).toBe('Valid');
    expect(by('Water Testing').status).toBe('Expiring');
    expect(by('CCTV Audit').status).toBe('Expired');
    expect(by('CCTV Audit').days_left).toBeLessThan(0);
    expect(res.body.expired).toBeGreaterThanOrEqual(1);
    expect(res.body.expiring).toBeGreaterThanOrEqual(1);
  });

  it('updates an expiry date (renewal) and reflects the new status', async () => {
    const add = await client.post<{ id: number }>('/compliance-certs', { scope: 'school', cert_type: 'Sanitation', expiry_date: iso(-1) });
    const id = add.body.id;
    let list = await client.get<{ certificates: { id: number; status: string }[] }>(`/compliance-certs`);
    expect(list.body.certificates.find((c) => c.id === id)!.status).toBe('Expired');

    await client.post(`/compliance-certs/${id}/update`, { scope: 'school', cert_type: 'Sanitation', expiry_date: iso(365) });
    list = await client.get<{ certificates: { id: number; status: string }[] }>(`/compliance-certs`);
    expect(list.body.certificates.find((c) => c.id === id)!.status).toBe('Valid');
  });
});
