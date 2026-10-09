import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import pg from 'pg';
import { buildApp } from '../dist/app.js';
import { postgresTicketRepository } from '../dist/tickets/ticket.repository.js';

test('listado SQL pagina y desempata por UUID cuando las fechas coinciden', async () => {
  const client = new pg.Client({ connectionTimeoutMillis: 5000 });
  await client.connect();
  const app = buildApp(postgresTicketRepository(client));
  try {
    await client.query('BEGIN');
    // Tabla temporal de esta conexión: no modifica los tickets del usuario.
    await client.query('CREATE TEMP TABLE tickets (LIKE public.tickets INCLUDING ALL) ON COMMIT DROP');
    const repository = postgresTicketRepository(client);
    const ids = [1, 2, 3].map(n => `00000000-0000-4000-8000-00000000000${n}`);
    for (const id of ids) {
      await repository.save({ id, title: 'Ticket de prueba', description: 'Descripción para comprobar el orden.',
        category: 'usage', requesterId: 'local-demo-user', status: 'open', createdAt: '2026-01-01T00:00:00.000Z' });
    }
    const first = await app.inject('/tickets?limit=2');
    const second = await app.inject('/tickets?limit=2&page=2');
    assert.equal(first.statusCode, 200);
    assert.equal(second.statusCode, 200);
    assert.deepEqual(first.json().data.map(ticket => ticket.id), [ids[2], ids[1]]);
    assert.deepEqual(second.json().data.map(ticket => ticket.id), [ids[0]]);
    assert.equal(first.json().pagination.hasNext, true);
    assert.equal(second.json().pagination.hasNext, false);
    assert.deepEqual((await app.inject('/tickets?limit=2&page=3')).json().data, []);
    await client.query('UPDATE tickets SET category = $1, status = $2 WHERE id = $3', ['data', 'resolved', ids[2]]);
    const filtered = (await app.inject('/tickets?category=usage&status=open&limit=1')).json();
    assert.deepEqual(filtered.data.map(ticket => ticket.id), [ids[1]]);
    assert.equal(filtered.pagination.hasNext, true);
    const next = (await app.inject('/tickets?category=usage&status=open&limit=1&page=2')).json();
    assert.deepEqual(next.data.map(ticket => ticket.id), [ids[0]]);
    assert.equal(next.pagination.hasNext, false);
    assert.deepEqual((await app.inject('/tickets?category=usage&status=resolved')).json().data, []);
    assert.deepEqual((await app.inject('/tickets?status=resolved')).json().data.map(ticket => ticket.id), [ids[2]]);
    assert.deepEqual((await app.inject('/tickets?category=data')).json().data.map(ticket => ticket.id), [ids[2]]);
    await client.query("SET LOCAL TIME ZONE 'America/Bogota'");
    await client.query('UPDATE tickets SET created_at = $1 WHERE id = $2', ['2026-01-31T23:59:59.999Z', ids[0]]);
    await client.query('UPDATE tickets SET created_at = $1 WHERE id = $2', ['2026-02-01T00:00:00.000Z', ids[2]]);
    const dates = '/tickets?createdFrom=2026-01-01&createdBefore=2026-02-01&status=open&category=usage&limit=1';
    const january = (await app.inject(dates)).json();
    assert.deepEqual(january.data.map(ticket => ticket.id), [ids[0]]);
    assert.equal(january.pagination.hasNext, true);
    const januaryNext = (await app.inject(`${dates}&page=2`)).json();
    assert.deepEqual(januaryNext.data.map(ticket => ticket.id), [ids[1]]);
    assert.equal(januaryNext.pagination.hasNext, false);
    assert.deepEqual((await app.inject('/tickets?createdFrom=2026-02-01')).json().data.map(ticket => ticket.id), [ids[2]]);
    assert.deepEqual((await app.inject('/tickets?createdBefore=2026-01-01')).json().data, []);
  } finally {
    await client.query('ROLLBACK');
    await app.close();
    await client.end();
  }
});

test('PostgreSQL conserva un ticket tras cerrar y recrear la API y sus conexiones', async () => {
  const pool = new pg.Pool({ connectionTimeoutMillis: 5000 });
  const app = buildApp(postgresTicketRepository(pool));
  let id;
  try {
    const payload = {
      title: "Reporte de prueba: O'Brien",
      description: "Texto literal: '; DROP TABLE tickets; -- y caracteres 🐘",
      category: 'data',
    };
    const created = await app.inject({ method: 'POST', url: '/tickets', payload });
    assert.equal(created.statusCode, 201);
    const ticket = created.json();
    id = ticket.id;
    await app.close();
    await pool.end();

    const newPool = new pg.Pool({ connectionTimeoutMillis: 5000 });
    const restarted = buildApp(postgresTicketRepository(newPool));
    try {
      const retrieved = await restarted.inject({ method: 'GET', url: `/tickets/${id}` });
      assert.equal(retrieved.statusCode, 200);
      assert.deepEqual(retrieved.json(), ticket);
      for (const missing of [randomUUID(), 'no-es-uuid']) {
        const response = await restarted.inject({ method: 'GET', url: `/tickets/${missing}` });
        assert.equal(response.statusCode, 404);
      }
      await assert.rejects(newPool.query('UPDATE tickets SET category = $1 WHERE id = $2', ['invalid', id]), { code: '23514' });
      await assert.rejects(newPool.query('UPDATE tickets SET status = $1 WHERE id = $2', ['invalid', id]), { code: '23514' });
      await assert.rejects(newPool.query('INSERT INTO tickets SELECT * FROM tickets WHERE id = $1', [id]), { code: '23505' });
    } finally {
      // Solo elimina el registro creado por esta prueba, nunca datos ajenos.
      await newPool.query('DELETE FROM tickets WHERE id = $1', [id]);
      await restarted.close();
      await newPool.end();
    }
  } finally {
    await app.close();
    if (!pool.ended) {
      if (id) await pool.query('DELETE FROM tickets WHERE id = $1', [id]);
      await pool.end();
    }
  }
});
