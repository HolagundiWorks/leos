import { describe, it, expect, inject } from 'vitest';
import { api } from '../helpers/api';
import { ADMIN_PASS, ADMIN_USER } from '../helpers/env';

describe('API · auth', () => {
  const baseUrl = inject('baseUrl');

  it('rejects login with a wrong password', async () => {
    const res = await api(baseUrl).post('/auth/login', {
      username: ADMIN_USER,
      password: 'definitely-not-the-password',
    });
    expect(res.status).toBe(401);
  });

  it('rejects login for an unknown user', async () => {
    const res = await api(baseUrl).post('/auth/login', {
      username: 'nobody',
      password: ADMIN_PASS,
    });
    expect(res.status).toBe(401);
  });

  it('accepts the seeded admin and returns a token', async () => {
    const res = await api(baseUrl).post<{ token: string; user: { username: string } }>(
      '/auth/login',
      { username: ADMIN_USER, password: ADMIN_PASS },
    );
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.username).toBe(ADMIN_USER);
  });

  it('requires a token for protected routes', async () => {
    const res = await api(baseUrl).get('/students');
    expect(res.status).toBe(401);
  });

  it('GET /auth/me returns the current user when authenticated', async () => {
    const client = api(baseUrl);
    await client.login();
    const res = await client.get<{ user: { username: string } }>('/auth/me');
    expect(res.status).toBe(200);
    expect(res.body.user.username).toBe(ADMIN_USER);
  });

  it('revokes the server session on logout', async () => {
    const client = api(baseUrl);
    await client.login();

    const logout = await client.post('/auth/logout');
    expect(logout.status).toBe(200);

    const after = await client.get('/auth/me');
    expect(after.status).toBe(401);
  });
});
