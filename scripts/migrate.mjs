import { readdir, readFile } from 'node:fs/promises';
import pg from 'pg';

const client = new pg.Client({ connectionTimeoutMillis: 5000 });
try {
  await client.connect();
  await client.query('BEGIN');
  // Evita que dos ejecuciones apliquen la misma migración simultáneamente.
  await client.query('SELECT pg_advisory_xact_lock(742031)');
  await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now()
  )`);
  const directory = new URL('../migrations/', import.meta.url);
  const files = (await readdir(directory)).filter(name => name.endsWith('.sql')).sort();
  for (const name of files) {
    const applied = await client.query('SELECT 1 FROM schema_migrations WHERE name = $1', [name]);
    if (applied.rowCount) continue;
    await client.query(await readFile(new URL(name, directory), 'utf8'));
    await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
    console.log(`Aplicada: ${name}`);
  }
  await client.query('COMMIT');
  console.log('Base de datos al día.');
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  console.error('No se pudieron aplicar las migraciones:', error.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
