import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateListQuery } from '../dist/tickets/ticket.query.js';
import { buildTestApp } from './helpers/app.js';

test('fechas reales, años bisiestos y rango ascendente', () => {
  assert.equal(validateListQuery({ createdFrom: '2024-02-29' }).success, true);
  assert.equal(validateListQuery({ createdBefore: '2026-11-01' }).success, true);
  for (const value of ['2026-02-29', '2026-04-31', '2026-13-01', '0000-01-01', '2026-1-01', '', 'hoy', '2026-01-01T00:00:00Z', ['2026-01-01'], 1]) {
    assert.equal(validateListQuery({ createdFrom: value }).success, false, String(value));
  }
  for (const before of ['2026-01-01', '2025-12-31']) {
    assert.equal(validateListQuery({ createdFrom: '2026-01-01', createdBefore: before }).success, false);
  }
});

test('HTTP rechaza fechas inválidas, duplicadas y rangos invertidos', async t => {
  const app = buildTestApp();
  t.after(() => app.close());
  for (const query of ['createdFrom=2026-02-30', 'createdBefore=', 'createdFrom=2026-01-01&createdFrom=2026-02-01',
    'createdFrom=2026-02-01&createdBefore=2026-01-01']) {
    assert.equal((await app.inject(`/tickets?${query}`)).statusCode, 400);
  }
  assert.equal((await app.inject('/tickets?createdFrom=2026-01-01&createdBefore=2026-02-01&status=open&category=data')).statusCode, 200);
});
