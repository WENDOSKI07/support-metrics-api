import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildTestApp as buildApp } from './helpers/app.js';

test('GET /info devuelve el nombre y la versión del proyecto', async (t) => {
  const app = buildApp();
  t.after(() => app.close());

  const response = await app.inject({ method: 'GET', url: '/info' });

  assert.equal(response.statusCode, 200);
  assert.match(response.headers['content-type'], /^application\/json/);
  assert.deepEqual(response.json(), {
    name: 'support-metrics-api',
    version: '0.1.0',
  });
});

test('GET /info/health incluye la información y el estado', async (t) => {
  const app = buildApp();
  t.after(() => app.close());

  const response = await app.inject({ method: 'GET', url: '/info/health' });

  assert.equal(response.statusCode, 200);
  assert.match(response.headers['content-type'], /^application\/json/);
  assert.deepEqual(response.json(), {
    name: 'support-metrics-api',
    version: '0.1.0',
    status: 'ok',
  });
});
