import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildTestApp as buildApp } from './helpers/app.js';

test('GET /health devuelve 200 y el estado de la API en JSON', async (t) => {
  const app = buildApp();
  t.after(() => app.close());

  const response = await app.inject({ method: 'GET', url: '/health' });

  assert.equal(response.statusCode, 200);
  assert.match(response.headers['content-type'], /^application\/json/);
  assert.deepEqual(response.json(), { status: 'ok' });
});
