import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readdir } from 'node:fs/promises';
import { test } from 'node:test';
import pg from 'pg';

const execute = promisify(execFile);

test('las migraciones crean una base vacía y repetirlas conserva los datos', async () => {
  // Nombre generado internamente: nunca se elimina la base configurada por el usuario.
  const database = `support_migration_test_${randomUUID().replaceAll('-', '')}`;
  const admin = new pg.Client({ connectionTimeoutMillis: 5000 });
  const client = new pg.Client({ database, connectionTimeoutMillis: 5000 });
  let created = false;
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE "${database}"`);
    created = true;
    const migrate = () => execute(process.execPath, ['scripts/migrate.mjs'], {
      env: { ...process.env, PGDATABASE: database }, timeout: 30000,
    });
    await migrate();
    await client.connect();
    const names = (await readdir(new URL('../migrations/', import.meta.url)))
      .filter(name => name.endsWith('.sql')).sort();
    const before = await client.query('SELECT name, applied_at FROM schema_migrations ORDER BY name');
    assert.deepEqual(before.rows.map(row => row.name), names);
    const id = randomUUID();
    await client.query(`INSERT INTO tickets (id, title, description, category, requester_id)
      VALUES ($1, 'Prueba migración', 'Registro que debe conservarse.', 'data', 'local-demo-user')`, [id]);
    const ticketBefore = await client.query('SELECT * FROM tickets WHERE id = $1', [id]);
    await migrate();
    assert.deepEqual((await client.query('SELECT * FROM tickets WHERE id = $1', [id])).rows, ticketBefore.rows);
    assert.deepEqual((await client.query('SELECT name, applied_at FROM schema_migrations ORDER BY name')).rows, before.rows);
    assert.equal((await client.query('SELECT count(*)::int AS count FROM ticket_history')).rows[0].count, 0);
    const index = await client.query("SELECT indexname FROM pg_indexes WHERE tablename = 'tickets' AND indexname = 'tickets_created_at_id_idx'");
    assert.equal(index.rowCount, 1);
  } finally {
    await client.end();
    try {
      if (created) await admin.query(`DROP DATABASE "${database}"`);
    } finally {
      await admin.end();
    }
  }
});
