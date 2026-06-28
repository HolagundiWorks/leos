import { describe, it, expect, inject, beforeAll } from 'vitest';
import { authedApi, type ApiClient } from '../helpers/api';

// Letters + Certificates: issue (with a serial) and list (the register).
describe('API · letters & certificates', () => {
  let client: ApiClient;
  beforeAll(async () => { client = await authedApi(inject('baseUrl')); });

  it('issues a letter with a ref number and lists it', async () => {
    const res = await client.post<{ ok: boolean; id: number; ref_no: string }>('/letters', {
      recipient: 'The District Education Officer',
      subject: 'Annual Day Invitation',
      body: 'You are cordially invited to our Annual Day.',
    });
    expect(res.status).toBe(201);
    expect(res.body.ref_no).toMatch(/^LTR-\d{4}$/);

    const list = await client.get<{ letters: { id: number; subject: string }[] }>('/letters');
    expect(list.body.letters.some((l) => l.id === res.body.id && l.subject === 'Annual Day Invitation')).toBe(true);
  });

  it('rejects a letter without a subject (422)', async () => {
    expect((await client.post('/letters', { body: 'no subject' })).status).toBe(422);
  });

  it('issues a certificate with a serial and lists it (the register)', async () => {
    const res = await client.post<{ ok: boolean; id: number; serial: string }>('/certificates', {
      cert_type: 'participation',
      student_name: 'Aarav Sharma',
      title: 'Certificate of Participation',
      body: 'for participating in the Inter-School Science Fair 2026',
    });
    expect(res.status).toBe(201);
    expect(res.body.serial).toMatch(/^CERT-\d{4}$/);

    const list = await client.get<{ certificates: { id: number; cert_type: string }[] }>('/certificates');
    expect(list.body.certificates.some((c) => c.id === res.body.id && c.cert_type === 'participation')).toBe(true);
  });

  it('rejects a certificate without type or student (422)', async () => {
    expect((await client.post('/certificates', { student_name: 'X' })).status).toBe(422);
    expect((await client.post('/certificates', { cert_type: 'rank' })).status).toBe(422);
  });

  it('persists letterhead fields + branding images (logo, signature, cert bg)', async () => {
    const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const save = await client.post('/school', {
      name: 'School Of Architecture',
      academic_year: '2026-27',
      type: 'school',
      address: '12 Lake Road, Bengaluru',
      principal_name: 'Dr. A. Rao',
      logo: dataUrl,
      signature: dataUrl,
      cert_bg: dataUrl,
    });
    expect(save.ok).toBe(true);
    const got = await client.get<{ school: { address: string; principal_name: string; logo: string; signature: string; cert_bg: string } }>('/school');
    expect(got.body.school.address).toBe('12 Lake Road, Bengaluru');
    expect(got.body.school.principal_name).toBe('Dr. A. Rao');
    expect(got.body.school.logo).toBe(dataUrl);
    expect(got.body.school.signature).toBe(dataUrl);
    expect(got.body.school.cert_bg).toBe(dataUrl);
  });
});
