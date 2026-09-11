/** Translate legacy localhost API fetches to Electron IPC during migration. */
export function installDesktopTransport(): void {
  const bridge = window.leosDesktop;
  const nativeFetch = window.fetch.bind(window);
  const lanBrowser =
    !bridge && window.location.protocol.startsWith('http') &&
    window.location.pathname.startsWith('/app');
  if (!bridge && !lanBrowser) return;

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = input instanceof Request ? input : null;
    const url = new URL(request?.url ?? String(input), window.location.href);
    if (url.origin !== 'http://localhost:8787') return nativeFetch(input, init);

    if (!bridge) {
      const rewritten = new URL(`${url.pathname}${url.search}`, window.location.origin);
      return nativeFetch(request ? new Request(rewritten, request) : rewritten, init);
    }

    const headers = new Headers(init?.headers ?? request?.headers);
    const authorization = headers.get('Authorization');
    const token = authorization?.replace(/^Bearer\s+/i, '') ?? null;
    const rawBody = init?.body ?? (request ? await request.clone().text() : undefined);
    let body: unknown;
    if (typeof rawBody === 'string' && rawBody.length > 0) {
      try { body = JSON.parse(rawBody); } catch { body = rawBody; }
    }
    const method = (init?.method ?? request?.method ?? 'GET').toUpperCase();
    if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      return new Response(JSON.stringify({ error: `Unsupported method: ${method}` }), {
        status: 405, headers: { 'Content-Type': 'application/json' },
      });
    }

    const result = await bridge.request({
      method: method as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
      path: `${url.pathname}${url.search}`,
      token,
      body,
    });
    return new Response(JSON.stringify(result.body), {
      status: result.status,
      headers: { 'Content-Type': 'application/json' },
    });
  };
}
