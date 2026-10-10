import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import pg from 'pg';
import { buildApp } from '../dist/app.js';
import { postgresTicketRepository } from '../dist/tickets/ticket.repository.js';

test('estados, historial, concurrencia y rollback con PostgreSQL', async () => {
  const pool = new pg.Pool({ connectionTimeoutMillis: 5000 });
  const repo = postgresTicketRepository(pool);
  const app = buildApp(repo);
  let id;
  try {
    const response = await app.inject({ method: 'POST', url: '/tickets', payload: {
      title: 'Prueba del ciclo', description: 'Verificar cambios de estado e historial.', category: 'usage',
    } });
    assert.equal(response.statusCode, 201);
    id = response.json().id;
    const patch = (payload, ticketId = id) => app.inject({ method: 'PATCH', url: `/tickets/${ticketId}/status`, payload });
    const change = { expectedVersion: 1, expectedStatus: 'open', status: 'in_progress', reason: 'Se inicia la revisión del problema.' };
    assert.deepEqual((await app.inject(`/tickets/${id}/history`)).json().data, []);
    assert.equal((await patch(change, randomUUID())).statusCode, 404);
    assert.equal((await app.inject(`/tickets/${randomUUID()}/history`)).statusCode, 404);
    for (const invalid of [{ ...change, reason: ' ' }, { ...change, status: 'unknown' }, { ...change, actor: 'admin' }, null]) {
      assert.equal((await patch(invalid)).statusCode, 400);
    }
    assert.equal((await patch({ ...change, status: 'resolved' })).statusCode, 409);

    // El UPDATE se ejecuta, pero falla el INSERT por su restricción SQL: ambos se deshacen.
    await assert.rejects(repo.changeStatus(id, { ...change, reason: 'corto' }), { code: '23514' });
    assert.equal((await repo.findById(id)).status, 'open');
    assert.deepEqual(await repo.history(id), []);

    const results = await Promise.all([patch(change), patch(change)]);
    assert.deepEqual(results.map(r => r.statusCode).sort(), [204, 409]);
    assert.equal((await repo.history(id)).length, 1);
    assert.equal((await patch({ ...change, status: 'resolved' })).statusCode, 409);
    assert.equal((await patch({ expectedVersion: 2, expectedStatus: 'in_progress', status: 'resolved', reason: '' })).statusCode, 400);
    const solution = 'Se corrigió la configuración y se verificó el resultado.';
    assert.equal((await patch({ expectedVersion: 2, expectedStatus: 'in_progress', status: 'resolved', reason: solution })).statusCode, 204);
    assert.equal((await repo.findById(id)).status, 'resolved');
    const history = (await app.inject(`/tickets/${id}/history`)).json().data;
    assert.equal(history.length, 2);
    assert.equal(history[0].previousStatus, 'open');
    assert.equal(history[1].previousStatus, 'in_progress');
    assert.equal(history[1].status, 'resolved');
    assert.equal(history[1].reason, solution);
    assert.ok(Number.isFinite(Date.parse(history[1].changedAt)));
    assert.equal((await patch({ expectedVersion: 3, expectedStatus: 'resolved', status: 'open', reason: 'Intento de reapertura del ticket.' })).statusCode, 409);
    assert.equal((await repo.history(id)).length, 2);
  } finally {
    if (id) {
      await pool.query('DELETE FROM ticket_history WHERE ticket_id = $1', [id]);
      await pool.query('DELETE FROM tickets WHERE id = $1', [id]);
    }
    await app.close();
    await pool.end();
  }
});
