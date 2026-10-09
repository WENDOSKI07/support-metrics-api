import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildTestApp } from './helpers/app.js';

test('interfaz y guía disponibles; archivos privados no se sirven', async t => {
  const app = buildTestApp();
  t.after(() => app.close());
  for (const [path, type] of [['/', 'text/html'], ['/docs', 'text/html'], ['/app.js', 'text/javascript'], ['/style.css', 'text/css']]) {
    const response = await app.inject(path);
    assert.equal(response.statusCode, 200);
    assert.ok(response.headers['content-type'].startsWith(type));
    assert.match(response.headers['content-security-policy'], /script-src 'self'/);
  }
  for (const path of ['/.env', '/package.json', '/src/server.ts', '/docs/PLAN.md']) {
    assert.equal((await app.inject(path)).statusCode, 404);
  }
});
