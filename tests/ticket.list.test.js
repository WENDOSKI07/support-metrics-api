import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildTestApp } from './helpers/app.js';

test('listado vacío con valores por defecto', async t => {
  const app = buildTestApp();
  t.after(() => app.close());
  const response = await app.inject('/tickets');
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { data: [], pagination: { page: 1, limit: 20, hasNext: false } });
});

test('páginas sin repetición, última página y página fuera de resultados', async t => {
  const app = buildTestApp();
  t.after(() => app.close());
  const created = [];
  for (let i = 0; i < 3; i++) {
    const response = await app.inject({ method: 'POST', url: '/tickets', payload: {
      title: `Reporte número ${i}`, description: 'Descripción del problema de prueba.', category: 'data',
    } });
    assert.equal(response.statusCode, 201);
    created.push(response.json());
  }
  created.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
  const first = (await app.inject('/tickets?page=1&limit=2')).json();
  const second = (await app.inject('/tickets?page=2&limit=2')).json();
  assert.deepEqual(first.data, created.slice(0, 2));
  assert.deepEqual(second.data, created.slice(2));
  assert.equal(first.pagination.hasNext, true);
  assert.equal(second.pagination.hasNext, false);
  assert.deepEqual((await app.inject('/tickets?page=3&limit=2')).json().data, []);
});

test('rechaza paginación inválida, parámetros duplicados y desconocidos', async t => {
  const app = buildTestApp();
  t.after(() => app.close());
  for (const query of ['page=0', 'page=-1', 'page=1.5', 'page=10001', 'limit=101', 'limit=0',
    'limit=', 'limit=abc', 'limit=1e2', 'page=1&page=2', 'limit=2&limit=3', 'sort=title',
    'status=unknown', 'status=', 'status=open&status=resolved', 'category=invalid', 'category=data&category=usage']) {
    const response = await app.inject(`/tickets?${query}`);
    assert.equal(response.statusCode, 400, query);
  }
  assert.equal((await app.inject('/tickets?page=10000&limit=100')).statusCode, 200);
});
