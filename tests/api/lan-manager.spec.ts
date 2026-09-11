import { afterEach, describe, expect, it } from 'vitest';
import { LanManager } from '../../desktop/src/lan-manager';
import type { ApiRequest } from '../../desktop/src/contracts';
import { resolve } from 'node:path';

describe('LAN manager transport', () => {
  const managers: LanManager[] = [];

  afterEach(async () => {
    for (const manager of managers) {
      await manager.stop().catch(() => undefined);
      manager.disconnect();
    }
    managers.length = 0;
  });

  it('requires the pairing code and forwards the bearer token', async () => {
    const received: ApiRequest[] = [];
    const host = new LanManager(async (request) => {
      received.push(request);
      return { status: 200, body: { path: request.path, token: request.token } };
    });
    const client = new LanManager(async () => ({ status: 503, body: {} }));
    managers.push(host, client);

    const hosted = await host.start(0);
    const url = `http://127.0.0.1:${hosted.port}`;
    const rejected = await fetch(`${url}/health`, {
      headers: { 'X-LEOS-Pairing-Code': 'WRONG-CODE' },
    });
    expect(rejected.status).toBe(401);

    await client.connect(url, hosted.pairingCode!);
    const response = await client.forward({
      method: 'POST',
      path: '/auth/logout',
      token: '00000000-0000-4000-8000-000000000000',
    });

    expect(response.status).toBe(200);
    expect(received.at(-1)).toMatchObject({
      path: '/auth/logout',
      token: '00000000-0000-4000-8000-000000000000',
      source: 'lan-web',
    });
  });

  it('handles concurrent forwarded requests and disconnects cleanly', async () => {
    let count = 0;
    const host = new LanManager(async () => ({
      status: 200,
      body: { sequence: ++count },
    }));
    const client = new LanManager(async (request) => ({
      status: 200,
      body: { local: true, path: request.path },
    }));
    managers.push(host, client);

    const hosted = await host.start(0);
    await client.connect(
      `http://127.0.0.1:${hosted.port}`,
      hosted.pairingCode!,
    );

    const responses = await Promise.all(
      Array.from({ length: 12 }, (_, index) =>
        client.forward({ method: 'GET', path: `/concurrent/${index}` }),
      ),
    );
    expect(responses).toHaveLength(12);
    expect(count).toBe(13); // health probe plus twelve forwarded requests

    client.disconnect();
    const local = await client.forward({ method: 'GET', path: '/after-disconnect' });
    expect(local.body).toEqual({ local: true, path: '/after-disconnect' });
  });

  it('opens the React application in a paired LAN browser', async () => {
    const host = new LanManager(
      async () => ({ status: 200, body: { ok: true } }),
      resolve('frontend/dist'),
    );
    managers.push(host);
    const hosted = await host.start(0);
    const url = `http://127.0.0.1:${hosted.port}`;

    const landing = await fetch(url);
    expect(landing.status).toBe(200);
    expect(await landing.text()).toContain('LEOS School Access');

    const paired = await fetch(`${url}/__pair`, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code: hosted.pairingCode! }),
    });
    expect(paired.status).toBe(303);
    expect(paired.headers.get('location')).toBe('/app/');
    const cookie = paired.headers.get('set-cookie')?.split(';')[0];
    expect(cookie).toContain('leos_pair=');

    const app = await fetch(`${url}/app/`, { headers: { Cookie: cookie! } });
    expect(app.status).toBe(200);
    expect(await app.text()).toContain('id="leos-app"');

    const blocked = await fetch(`${url}/app/`);
    expect(blocked.status).toBe(401);
  });

  it('identifies Android WebView requests for mobile policy enforcement', async () => {
    const host = new LanManager(async (request) => ({ status: 200, body: { source: request.source } }));
    managers.push(host);
    const hosted = await host.start(0);
    const response = await fetch(`http://127.0.0.1:${hosted.port}/dashboard/stats`, {
      headers: {
        'X-LEOS-Pairing-Code': hosted.pairingCode!,
        'User-Agent': 'Android WebView LEOS-Android/0.1',
      },
    });
    expect(await response.json()).toEqual({ source: 'lan-android' });
  });
});
