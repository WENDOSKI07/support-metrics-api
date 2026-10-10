import { buildApp } from './app.js';
import pg from 'pg';
import { postgresTicketRepository } from './tickets/ticket.repository.js';

const pool = new pg.Pool({ connectionTimeoutMillis: 5000, max: 10 });
const repository = postgresTicketRepository(pool);
const app = buildApp(repository, { logger: true });
pool.on('error', error => app.log.error(error, 'Error en una conexión inactiva de PostgreSQL'));
app.addHook('onClose', async () => { await pool.end(); });

try {
  // Comprueba también que se aplicaron las migraciones antes de atender peticiones.
  await repository.checkReady();
  await app.listen({ port: 3000, host: '127.0.0.1' });
} catch (error) {
  app.log.error(error);
  await app.close();
  process.exitCode = 1;
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, async () => {
    await app.close();
  });
}
