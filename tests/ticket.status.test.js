import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canTransition, validateStatusChange } from '../dist/tickets/ticket.status.js';

test('solo permite avanzar abierto, en atención y resuelto', () => {
  for (const from of ['open', 'in_progress', 'resolved']) {
    for (const to of ['open', 'in_progress', 'resolved']) {
      assert.equal(canTransition(from, to), `${from}:${to}` === 'open:in_progress' || `${from}:${to}` === 'in_progress:resolved');
    }
  }
});

test('valida motivo, campos exactos y límites sin modificar la entrada', () => {
  const change = { expectedStatus: 'in_progress', status: 'resolved', reason: '  Solución documentada.  ' };
  assert.equal(validateStatusChange(change).reason, 'Solución documentada.');
  assert.equal(change.reason, '  Solución documentada.  ');
  for (const reason of ['', 'x'.repeat(9), 'x'.repeat(2001), 'texto con \0 nulo', 'motivo con \ud800 roto', 'motivo con \udfff roto', 42]) {
    assert.equal(validateStatusChange({ ...change, reason }), undefined);
  }
  for (const reason of ['x'.repeat(10), '🐘'.repeat(2000)]) assert.ok(validateStatusChange({ ...change, reason }));
  for (const value of [null, [], {}, { ...change, status: 'closed' }, { ...change, actor: 'admin' }]) {
    assert.equal(validateStatusChange(value), undefined);
  }
});
