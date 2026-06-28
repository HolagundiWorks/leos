import { describe, it, expect, inject, beforeAll } from 'vitest';
import { authedApi, type ApiClient } from '../helpers/api';

describe('API · statutory return (OASIS / UDISE aggregate)', () => {
  let client: ApiClient;
  const stamp = Date.now();

  beforeAll(async () => {
    client = await authedApi(inject('baseUrl'));
  });

  it('aggregates enrolment, category, staff and infrastructure counts', async () => {
    // Seed an EWS + a CWSN student so the RTE / CWSN buckets are non-zero.
    await client.post('/students', { first_name: 'Rte', last_name: `Ews-${stamp}`, category: 'EWS', gender: 'Female' });
    await client.post('/students', { first_name: 'Spec', last_name: `Needs-${stamp}`, category: 'General', cwsn: 'Yes', gender: 'Male' });

    const res = await client.get<{
      students: { total: number; by_category: { EWS: number }; by_gender: { Female: number }; cwsn: number };
      staff: { total: number };
      infrastructure: { classes: number };
      generated_at: string;
    }>('/compliance/statutory-report');

    expect(res.status).toBe(200);
    expect(res.body.students.total).toBeGreaterThan(0);
    expect(res.body.students.by_category.EWS).toBeGreaterThanOrEqual(1);
    expect(res.body.students.cwsn).toBeGreaterThanOrEqual(1);
    expect(res.body.students.by_gender.Female).toBeGreaterThanOrEqual(1);
    expect(typeof res.body.staff.total).toBe('number');
    expect(res.body.generated_at).toBeTruthy();
  });

  it('round-trips the statutory school identifiers', async () => {
    const school = await client.get<{ school: { name: string; academic_year: string; type: string } }>('/school');
    await client.post('/school', { ...school.body.school, affiliation_no: 'AFF-12345', udise_code: 'UDISE-99', school_code: 'SC-7' });
    const after = await client.get<{ school: { affiliation_no: string; udise_code: string } }>('/school');
    expect(after.body.school.affiliation_no).toBe('AFF-12345');
    expect(after.body.school.udise_code).toBe('UDISE-99');
  });
});
