// Vitest global setup — starts one isolated TypeScript API adapter for API+DB
// run and shares its base URL + DB path with every test via `provide`.
import type { TestProject } from 'vitest/node';
import { startTestServer, type TestServer } from '../helpers/server';
import { API_SERVER_PORT } from '../helpers/env';

let server: TestServer;

export default async function setup({ provide }: TestProject) {
  server = await startTestServer(API_SERVER_PORT);
  provide('baseUrl', server.baseUrl);
  provide('dbPath', server.dbPath);

  return async () => {
    await server.stop();
  };
}
