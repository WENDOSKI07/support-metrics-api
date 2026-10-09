import assert from 'node:assert/strict';
import { test } from 'node:test';
import pg from 'pg';
import { buildApp } from '../dist/app.js';
import { postgresTicketRepository } from '../dist/tickets/ticket.repository.js';

test('texto incompatible con PostgreSQL se rechaza sin guardar ni alterar contenido', async t => {
  const client = new pg.Client({ connectionTimeoutMillis: 5000 });
  await client.connect();
  const app = buildApp(postgresTicketRepository(client));
  try {
    await client.query('BEGIN');
    await client.query('CREATE TEMP TABLE tickets (LIKE public.tickets INCLUDING ALL) ON COMMIT DROP');
    for (const [name, text] of [['nulo', 'Texto con \0 inválido'], ['surrogate', 'Texto con \ud800 inválido']]) {
      await t.test(name, async () => {
        await client.query('SAVEPOINT input_case');
        try {
        const response = await app.inject({ method: 'POST', url: '/tickets', payload: {
          title: text, description: 'Descripción suficiente para la prueba.', category: 'data',
        } });
        assert.equal(response.statusCode, 400);
        } finally {
          await client.query('ROLLBACK TO SAVEPOINT input_case');
        }
      });
    }
  } finally {
    await client.query('ROLLBACK');
    await app.close();
    await client.end();
  }
});
