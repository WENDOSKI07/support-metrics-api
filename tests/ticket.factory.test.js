import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildTicket } from '../dist/tickets/ticket.factory.js';

const input = {
  title: 'No puedo generar un reporte',
  description: 'Al generar el reporte aparece un error y no se descarga.',
  category: 'functionality',
};

test('construye un ticket abierto con solicitante y datos del servidor', () => {
  const before = Date.now();
  const result = buildTicket(input, 'usuario-ficticio-01');
  const after = Date.now();

  assert.equal(result.success, true);
  const { id, createdAt, ...data } = result.ticket;
  assert.deepEqual(data, { ...input, requesterId: 'usuario-ficticio-01', status: 'open', priority: 'normal', assigneeId: null, version: 1 });
  assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  const timestamp = Date.parse(createdAt);
  assert.ok(timestamp >= before && timestamp <= after);
  assert.equal(new Date(timestamp).toISOString(), createdAt);
});

test('normaliza la entrada sin modificarla ni compartir el objeto resultante', () => {
  const original = Object.freeze({ ...input, title: `  ${input.title}  ` });
  const first = buildTicket(original, 'usuario-ficticio-01');
  const second = buildTicket(original, 'usuario-ficticio-01');

  assert.equal(first.success, true);
  assert.equal(second.success, true);
  assert.equal(first.ticket.title, input.title);
  assert.notEqual(first.ticket.id, second.ticket.id);
  first.ticket.title = 'Título modificado';
  assert.equal(second.ticket.title, input.title);
  assert.equal(original.title, `  ${input.title}  `);
});

test('una entrada inválida devuelve el error sin construir un ticket', () => {
  const result = buildTicket({ ...input, title: ' ' }, 'usuario-ficticio-01');
  assert.equal(result.success, false);
  assert.equal(result.error.field, 'title');
  assert.equal(Object.hasOwn(result, 'ticket'), false);
});

test('el formulario no puede elegir solicitante, identificador, estado ni fecha', () => {
  for (const field of ['requesterId', 'id', 'status', 'createdAt']) {
    const result = buildTicket({ ...input, [field]: 'valor-del-cliente' }, 'usuario-ficticio-01');
    assert.equal(result.success, false);
    assert.equal(result.error.field, field);
    assert.equal(Object.hasOwn(result, 'ticket'), false);
  }
});

test('detecta llamadas internas sin identificador de solicitante', () => {
  for (const requesterId of [undefined, null, '', ' \n ', 123]) {
    assert.throws(() => buildTicket(input, requesterId), TypeError);
  }
});
