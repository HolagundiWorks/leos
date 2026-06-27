import { describe, it, expect, inject, beforeAll } from 'vitest';
import { authedApi, type ApiClient } from '../helpers/api';

// Classes own Sections (nested). GET /classes returns the full tree:
//   { classes: [{ id, name, grade_level, sections: [{ id, name, ... }] }], total }
interface Section { id: number; name: string | null; capacity: number | null }
interface ClassRow { id: number; name: string | null; sections: Section[] }

describe('API · classes & sections CRUD', () => {
  let client: ApiClient;
  const className = `Class-${Date.now()}`;
  let classId: number;
  let sectionId: number;

  beforeAll(async () => {
    client = await authedApi(inject('baseUrl'));
  });

  const classes = () => client.get<{ classes: ClassRow[] }>('/classes');
  const findClass = async (id: number) => (await classes()).body.classes.find((c) => c.id === id);

  it('lists classes', async () => {
    const res = await classes();
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.classes)).toBe(true);
  });

  it('creates a class (201)', async () => {
    const res = await client.post<{ ok: boolean; id: number }>('/classes', {
      name: className,
      grade_level: '8',
    });
    expect(res.status).toBe(201);
    classId = res.body.id;
    const cls = await findClass(classId);
    expect(cls).toBeDefined();
    expect(cls!.sections).toHaveLength(0);
  });

  it('rejects a class with no name (422)', async () => {
    expect((await client.post('/classes', {})).status).toBe(422);
  });

  it('adds a section nested under the class (201)', async () => {
    const res = await client.post<{ ok: boolean; id: number }>('/sections', {
      class_id: classId,
      name: 'A',
      capacity: 40,
    });
    expect(res.status).toBe(201);
    sectionId = res.body.id;

    const cls = await findClass(classId);
    expect(cls!.sections.map((s) => s.id)).toContain(sectionId);
  });

  it('rejects a section with no class_id (422)', async () => {
    expect((await client.post('/sections', { name: 'B' })).status).toBe(422);
  });

  it('updates the section capacity', async () => {
    const upd = await client.post<{ ok: boolean }>(`/sections/${sectionId}/update`, {
      name: 'A',
      capacity: 35,
    });
    expect(upd.status).toBe(200);
    const cls = await findClass(classId);
    expect(cls!.sections.find((s) => s.id === sectionId)?.capacity).toBe(35);
  });

  it('deletes the section', async () => {
    expect((await client.post(`/sections/${sectionId}/delete`, {})).status).toBe(200);
    const cls = await findClass(classId);
    expect(cls!.sections.map((s) => s.id)).not.toContain(sectionId);
  });

  it('deletes the class', async () => {
    expect((await client.post(`/classes/${classId}/delete`, {})).status).toBe(200);
    expect(await findClass(classId)).toBeUndefined();
  });
});
