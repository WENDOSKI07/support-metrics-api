import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateComment } from '../dist/tickets/ticket.comment.js';

test('comentarios: límites Unicode, normalización y campos controlados por el servidor', () => {
  assert.equal(validateComment({ body: '  Hola 🐘  ' }), 'Hola 🐘');
  assert.equal(validateComment({ body: '🐘'.repeat(5000) }), '🐘'.repeat(5000));
  for (const input of [null, [], {}, { body: 12 }, { body: ' ' }, { body: 'x'.repeat(5001) },
    { body: 'NUL\0' }, { body: 'Unicode\ud800' }, { body: 'Hola', authorId: 'admin' },
    { body: 'Hola', createdAt: 'ayer' }, { body: 'Hola', id: 'forzado' }]) {
    assert.equal(validateComment(input), undefined);
  }
});
