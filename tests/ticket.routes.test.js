import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildTestApp as buildApp } from './helpers/app.js';

const payload = {
  title: 'No puedo generar un reporte',
  description: 'Al pulsar Generar, aparece un error y no se descarga.',
  category: 'functionality',
};

test('POST crea un ticket y GET permite recuperarlo en la demo local', async (t) => {
  const app = buildApp();
  t.after(() => app.close());
  const response = await app.inject({ method: 'POST', url: '/tickets', payload });
  assert.equal(response.statusCode, 201);
  const ticket = response.json();
  assert.equal(ticket.requesterId, 'local-demo-user');
  assert.equal(ticket.status, 'open');
  assert.equal(response.headers.location, `/tickets/${ticket.id}`);
  const retrieved = await app.inject({ method: 'GET', url: response.headers.location });
  assert.equal(retrieved.statusCode, 200);
  assert.deepEqual(retrieved.json(), ticket);
});

test('POST rechaza entradas inválidas y campos controlados por el servidor', async (t) => {
  const app = buildApp();
  t.after(() => app.close());
  for (const invalid of [{ ...payload, title: ' ' }, { ...payload, requesterId: 'otro' }, { ...payload, id: 'forzado' }]) {
    const response = await app.inject({ method: 'POST', url: '/tickets', payload: invalid });
    assert.equal(response.statusCode, 400);
    assert.equal(typeof response.json().error.message, 'string');
    assert.equal(response.headers.location, undefined);
  }
  const missing = await app.inject({ method: 'GET', url: '/tickets/forzado' });
  assert.equal(missing.statusCode, 404);
});

test('GET devuelve 404 para un ticket inexistente', async (t) => {
  const app = buildApp();
  t.after(() => app.close());
  const response = await app.inject({ method: 'GET', url: '/tickets/no-existe' });
  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.json(), { error: 'Ticket no encontrado.' });
});

test('el almacenamiento de prueba se aísla entre aplicaciones', async (t) => {
  const first = buildApp();
  const second = buildApp();
  t.after(async () => { await first.close(); await second.close(); });
  const response = await first.inject({ method: 'POST', url: '/tickets', payload });
  const result = await second.inject({ method: 'GET', url: response.headers.location });
  assert.equal(result.statusCode, 404);
});
