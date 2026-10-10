import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import pg from 'pg';
import { buildApp } from '../dist/app.js';
import { postgresTicketRepository } from '../dist/tickets/ticket.repository.js';

test('métricas: conteos conocidos, filtros, límites UTC y conjunto vacío', async () => {
  const client = new pg.Client({ connectionTimeoutMillis: 5000 });
  await client.connect();
  const app = buildApp(postgresTicketRepository(client));
  try {
    await client.query('BEGIN');
    await client.query('CREATE TEMP TABLE tickets (LIKE public.tickets INCLUDING ALL) ON COMMIT DROP');
    await client.query('CREATE TEMP TABLE ticket_history (LIKE public.ticket_history INCLUDING ALL) ON COMMIT DROP');
    await client.query("SET LOCAL TIME ZONE 'America/Bogota'");
    const empty = await app.inject('/metrics/tickets');
    assert.equal(empty.statusCode, 200);
    assert.deepEqual(empty.json().byStatus, { open: 0, in_progress: 0, resolved: 0, closed: 0 });
    assert.equal(empty.json().total, 0);
    assert.deepEqual(empty.json().resolution, { averageSeconds: null, sampleSize: 0, excludedCount: 0 });
    const fixtures = [
      ['open', 'data', '2026-01-01T00:00:00.000Z'],
      ['open', 'usage', '2026-01-12T12:00:00.000Z'],
      ['in_progress', 'data', '2026-01-20T00:00:00.000Z'],
      ['resolved', 'data', '2026-01-31T23:59:59.999Z'],
      ['resolved', 'data', '2026-02-01T00:00:00.000Z'],
    ];
    const ids = [];
    for (const [status, category, createdAt] of fixtures) {
      const id = randomUUID();
      ids.push(id);
      await client.query(`INSERT INTO tickets (id, title, description, category, requester_id, status, created_at)
        VALUES ($1, 'Prueba métrica', 'Datos ficticios de prueba.', $2, 'local-demo-user', $3, $4)`,
      [id, category, status, createdAt]);
    }
    const all = (await app.inject('/metrics/tickets')).json();
    assert.equal(all.total, 5);
    assert.deepEqual(all.byStatus, { open: 2, in_progress: 1, resolved: 2, closed: 0 });
    assert.deepEqual(all.resolution, { averageSeconds: null, sampleSize: 0, excludedCount: 2 });
    // Dos duraciones conocidas: 60 y 180 segundos, promedio 120.
    for (const [index, seconds] of [[3, 60], [4, 180]]) {
      await client.query(`INSERT INTO ticket_history (id, ticket_id, previous_status, status, reason, changed_at)
        VALUES ($1, $2, 'in_progress', 'resolved', 'Solución de prueba documentada.', $3)`,
      [randomUUID(), ids[index], new Date(Date.parse(fixtures[index][2]) + seconds * 1000)]);
    }
    // Otra fila de historial no debe duplicar el ticket en las métricas.
    await client.query(`INSERT INTO ticket_history (id, ticket_id, previous_status, status, reason, changed_at)
      VALUES ($1, $2, 'open', 'in_progress', 'Inicio de atención de prueba.', $3)`,
    [randomUUID(), ids[3], fixtures[3][2]]);
    assert.deepEqual((await app.inject('/metrics/tickets')).json().resolution,
      { averageSeconds: 120, sampleSize: 2, excludedCount: 0 });
    const period = 'createdFrom=2026-01-01&createdBefore=2026-02-01';
    const january = (await app.inject(`/metrics/tickets?${period}`)).json();
    assert.equal(january.total, 4);
    assert.deepEqual(january.byStatus, { open: 2, in_progress: 1, resolved: 1, closed: 0 });
    // Cuenta la resolución de febrero del ticket creado al terminar enero.
    assert.deepEqual(january.resolution, { averageSeconds: 60, sampleSize: 1, excludedCount: 0 });
    const data = (await app.inject(`/metrics/tickets?${period}&category=data`)).json();
    assert.equal(data.total, 3);
    assert.deepEqual(data.byStatus, { open: 1, in_progress: 1, resolved: 1, closed: 0 });
    assert.deepEqual(data.scope, { dateField: 'createdAt', timeZone: 'UTC', statusBasis: 'current',
      createdFrom: '2026-01-01', createdBefore: '2026-02-01', category: 'data' });
    const listed = (await app.inject(`/tickets?${period}&category=data`)).json().data;
    assert.equal(data.total, listed.length);
    assert.equal(data.total, Object.values(data.byStatus).reduce((sum, n) => sum + n, 0));
    await client.query('UPDATE ticket_history SET changed_at = $1 WHERE ticket_id = $2 AND status = $3',
      ['2025-01-01T00:00:00Z', ids[4], 'resolved']);
    assert.deepEqual((await app.inject('/metrics/tickets')).json().resolution,
      { averageSeconds: 60, sampleSize: 1, excludedCount: 1 });
    assert.equal((await app.inject('/metrics/tickets?createdBefore=2026-01-01')).json().total, 0);
    for (const query of ['page=1', 'limit=1', 'status=open', 'category=invalid', 'createdFrom=2026-02-30',
      'category=data&category=usage', 'createdFrom=2026-02-01&createdBefore=2026-01-01']) {
      assert.equal((await app.inject(`/metrics/tickets?${query}`)).statusCode, 400, query);
    }
    // Resueltos y cerrados se ponderan por número de tickets, no por grupos de estado.
    await client.query("UPDATE tickets SET status='closed' WHERE id=$1",[ids[4]]);
    await client.query("UPDATE ticket_history SET changed_at=$1 WHERE ticket_id=$2 AND status='resolved'",['2026-02-01T00:03:00Z',ids[4]]);
    assert.deepEqual((await app.inject('/metrics/tickets')).json().resolution,
      { averageSeconds:120, sampleSize:2, excludedCount:0 });
    await client.query("UPDATE tickets SET status='in_progress' WHERE id=$1",[ids[3]]);
    assert.deepEqual((await app.inject('/metrics/tickets')).json().resolution,
      { averageSeconds:180, sampleSize:1, excludedCount:0 });
  } finally {
    await client.query('ROLLBACK');
    await app.close();
    await client.end();
  }
});
