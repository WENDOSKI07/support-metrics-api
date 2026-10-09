import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import pg from 'pg';
import { buildApp } from '../dist/app.js';
import { postgresTicketRepository } from '../dist/tickets/ticket.repository.js';

test('búsqueda SQL literal por título y descripción con filtros y paginación', async () => {
  const client = new pg.Client({ connectionTimeoutMillis: 5000 });
  await client.connect();
  const app = buildApp(postgresTicketRepository(client));
  try {
    await client.query('BEGIN');
    await client.query('CREATE TEMP TABLE tickets (LIKE public.tickets INCLUDING ALL) ON COMMIT DROP');
    const fixtures = [
      ['Error en REPORTE', 'La descarga falla al terminar.', 'data'],
      ['Otro problema', 'No se puede generar el reporte.', 'usage'],
      ['Avance 50%_!', "Texto con O'Brien y SQL: ' OR 1=1 --", 'data'],
    ];
    const ids = [];
    for (const [title, description, category] of fixtures) {
      const id = randomUUID();
      ids.push(id);
      await client.query(`INSERT INTO tickets (id,title,description,category,requester_id,created_at)
        VALUES ($1,$2,$3,$4,'local-demo-user',$5)`, [id,title,description,category,`2026-01-0${ids.length}T00:00:00Z`]);
    }
    const search = async (q, extra = '') => {
      const response = await app.inject(`/tickets?q=${encodeURIComponent(q)}${extra}`);
      assert.equal(response.statusCode, 200);
      return response.json();
    };
    const first = await search('reporte', '&limit=1');
    assert.deepEqual(first.data.map(t => t.id), [ids[1]]);
    assert.equal(first.pagination.hasNext, true);
    const second = await search('reporte', '&limit=1&page=2');
    assert.deepEqual(second.data.map(t => t.id), [ids[0]]);
    assert.equal(second.pagination.hasNext, false);
    assert.deepEqual((await search('REPORTE', '&status=open&category=data&createdFrom=2026-01-01&createdBefore=2026-02-01')).data.map(t => t.id), [ids[0]]);
    for (const term of ['50%_!', "O'Brien", "' OR 1=1 --"]) {
      assert.deepEqual((await search(term)).data.map(t => t.id), [ids[2]]);
    }
    assert.deepEqual((await search('%_')).data.map(t => t.id), [ids[2]]);
    assert.deepEqual((await search('inexistente')).data, []);
    assert.equal((await app.inject('/tickets?q=uno&q=dos')).statusCode, 400);
    assert.equal((await app.inject('/metrics/tickets?q=reporte')).statusCode, 400);
  } finally {
    await client.query('ROLLBACK');
    await app.close();
    await client.end();
  }
});
