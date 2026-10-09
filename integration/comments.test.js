import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import pg from 'pg';
import { buildApp } from '../dist/app.js';
import { postgresTicketRepository } from '../dist/tickets/ticket.repository.js';

test('comentarios persistentes: aislamiento, paginación y ticket resuelto', async () => {
  const pool = new pg.Pool({ connectionTimeoutMillis: 5000 });
  const repo = postgresTicketRepository(pool);
  const app = buildApp(repo);
  const ids = [];
  try {
    for (let i = 0; i < 2; i++) {
      const response = await app.inject({ method: 'POST', url: '/tickets', payload: {
        title: 'Prueba de conversación', description: 'Ticket ficticio para probar comentarios.', category: 'usage',
      } });
      assert.equal(response.statusCode, 201);
      ids.push(response.json().id);
    }
    const url = `/tickets/${ids[0]}/comments`;
    const post = (payload, target = url) => app.inject({ method: 'POST', url: target, payload });
    assert.deepEqual((await app.inject(url)).json().data, []);
    assert.equal((await post({ body: 'Hola' }, `/tickets/${randomUUID()}/comments`)).statusCode, 404);
    for (const payload of [{ body: '' }, { body: 'Hola', authorId: 'admin' }, { body: '\0' }, { body: '\ud800' }]) {
      assert.equal((await post(payload)).statusCode, 400);
    }
    const comments = [];
    for (const body of ["Texto con ' SQL; -- 🐘", 'Otro mensaje', 'Último mensaje']) {
      const response = await post({ body });
      assert.equal(response.statusCode, 201);
      assert.equal(response.json().body, body);
      assert.equal(response.json().authorId, 'local-demo-user');
      comments.push(response.json());
    }
    const page1 = (await app.inject(`${url}?limit=2`)).json();
    const page2 = (await app.inject(`${url}?limit=2&page=2`)).json();
    assert.deepEqual([...page1.data, ...page2.data], comments);
    assert.equal(page1.pagination.hasNext, true);
    assert.equal(page2.pagination.hasNext, false);
    assert.deepEqual((await app.inject(`/tickets/${ids[1]}/comments`)).json().data, []);
    assert.equal((await app.inject(`${url}?status=open`)).statusCode, 400);
    assert.equal((await app.inject(`${url}?limit=101`)).statusCode, 400);
    assert.equal((await repo.findById(ids[0])).status, 'open');
    assert.deepEqual(await repo.history(ids[0]), []);
    await repo.changeStatus(ids[0], { expectedStatus: 'open', status: 'in_progress', reason: 'Inicio de revisión de prueba.' });
    await repo.changeStatus(ids[0], { expectedStatus: 'in_progress', status: 'resolved', reason: 'Solución de prueba documentada.' });
    assert.equal((await post({ body: 'Gracias por la solución.' })).statusCode, 201);
    assert.equal((await repo.findById(ids[0])).status, 'resolved');
    // Una nueva aplicación y conexiones leen los comentarios guardados.
    const otherPool = new pg.Pool({ connectionTimeoutMillis: 5000 });
    const otherApp = buildApp(postgresTicketRepository(otherPool));
    try {
      assert.equal((await otherApp.inject(url)).json().data.length, 4);
    } finally { await otherApp.close(); await otherPool.end(); }
  } finally {
    for (const id of ids) {
      await pool.query('DELETE FROM ticket_comments WHERE ticket_id = $1', [id]);
      await pool.query('DELETE FROM ticket_history WHERE ticket_id = $1', [id]);
      await pool.query('DELETE FROM tickets WHERE id = $1', [id]);
    }
    await app.close();
    await pool.end();
  }
});
