import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildApp } from '../dist/app.js';

test('un fallo al guardar no devuelve 201 ni expone detalles internos', async (t) => {
  const app = buildApp({
    async save() { throw new Error('database connection with sensitive details'); },
    async findById() { return undefined; },
  });
  t.after(() => app.close());
  const response = await app.inject({ method: 'POST', url: '/tickets', payload: {
    title: 'Error en reporte', description: 'No se puede descargar el reporte.', category: 'functionality',
  } });
  assert.equal(response.statusCode, 500);
  assert.equal(response.headers.location, undefined);
  assert.deepEqual(response.json(), { error: 'No se pudo completar la solicitud.' });
});
