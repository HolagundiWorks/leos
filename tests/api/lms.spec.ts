import { beforeAll, describe, expect, inject, it } from 'vitest';
import { api, authedApi, type ApiClient } from '../helpers/api';
import { ADMIN_PASS } from '../helpers/env';

describe('API · LMS role isolation and learning workflow', () => {
  let admin: ApiClient;
  let teacher: ApiClient;
  let student: ApiClient;
  let parent: ApiClient;
  let unrelatedParent: ApiClient;
  let spaceId: number;
  let assignmentId: number;
  let submissionId: number;
  const stamp = Date.now();
  const password = `${ADMIN_PASS}-portal`;

  beforeAll(async () => {
    const url = inject('baseUrl');
    admin = await authedApi(url);
    const second = await admin.post<{ id: number }>('/students', { first_name: 'Other', last_name: `Learner-${stamp}` });
    const accounts = [
      { username: `teacher.${stamp}`, role: 'teacher', name: 'LMS Teacher', staff_id: 1 },
      { username: `student.${stamp}`, role: 'student', name: 'LMS Student', student_ids: [1] },
      { username: `parent.${stamp}`, role: 'parent', name: 'LMS Parent', student_ids: [1] },
      { username: `other.parent.${stamp}`, role: 'parent', name: 'Other Parent', student_ids: [second.body.id] },
    ];
    for (const account of accounts) {
      const response = await admin.post('/portal/accounts', { ...account, password });
      if (!response.ok) throw new Error(JSON.stringify(response.body));
    }
    const login = async (username: string) => {
      const client = api(url);
      const response = await client.login(username, password);
      if (!response.ok) throw new Error(`login failed for ${username}`);
      return client;
    };
    teacher = await login(accounts[0].username);
    student = await login(accounts[1].username);
    parent = await login(accounts[2].username);
    unrelatedParent = await login(accounts[3].username);
  });

  it('lets the linked teacher publish a space, module, lesson, and assignment', async () => {
    const space = await teacher.post<{ id: number }>('/lms/spaces', {
      title: `Mathematics ${stamp}`, section_id: 1, subject_id: 1, is_published: true,
    });
    expect(space.status).toBe(201);
    spaceId = space.body.id;
    const module = await teacher.post<{ id: number }>('/lms/modules', {
      space_id: spaceId, title: 'Fractions', is_published: true,
    });
    expect(module.status).toBe(201);
    expect((await teacher.post('/lms/lessons', {
      module_id: module.body.id, title: 'Equivalent fractions', content: 'Lesson content', is_published: true,
    })).status).toBe(201);
    const assignment = await teacher.post<{ id: number }>('/lms/assignments', {
      space_id: spaceId, module_id: module.body.id, title: 'Worksheet', max_points: 20, is_published: true,
    });
    expect(assignment.status).toBe(201);
    assignmentId = assignment.body.id;
  });

  it('shows published learning only to linked learners', async () => {
    const visible = await student.get<{ spaces: { id: number }[] }>('/lms/spaces');
    expect(visible.body.spaces.some((space) => space.id === spaceId)).toBe(true);
    const parentView = await parent.get<{ space: { assignments: unknown[] } }>(`/lms/spaces/${spaceId}`);
    expect(parentView.status).toBe(200);
    expect(parentView.body.space.assignments).toHaveLength(1);
    const unrelated = await unrelatedParent.get<{ spaces: { id: number }[] }>('/lms/spaces');
    expect(unrelated.body.spaces.some((space) => space.id === spaceId)).toBe(false);
    expect((await unrelatedParent.get(`/lms/spaces/${spaceId}`)).status).toBe(403);
  });

  it('allows student submission, denies parent submission, and validates grading', async () => {
    const submitted = await student.post<{ id: number }>('/lms/submissions', {
      assignment_id: assignmentId, student_id: 1, content: 'My answers',
    });
    expect(submitted.status).toBe(200);
    submissionId = submitted.body.id;
    expect((await parent.post('/lms/submissions', {
      assignment_id: assignmentId, student_id: 1, content: 'Parent answer',
    })).status).toBe(403);
    expect((await teacher.post(`/lms/submissions/${submissionId}/grade`, { score: 21 })).status).toBe(422);
    expect((await teacher.post(`/lms/submissions/${submissionId}/grade`, { score: 18, feedback: 'Good work' })).status).toBe(200);
    const submissions = await teacher.get<{ submissions: { score: number; feedback: string }[] }>(`/lms/assignments/${assignmentId}/submissions`);
    expect(submissions.body.submissions[0]).toMatchObject({ score: 18, feedback: 'Good work' });
  });
});
