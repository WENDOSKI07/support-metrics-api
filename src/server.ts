import { postgresAuthStore } from './auth/auth.repository.js';
import { buildApp } from './app.js';
import pg from 'pg';
import { postgresTicketRepository } from './tickets/ticket.repository.js';

const pool = new pg.Pool({ connectionTimeoutMillis: 5000, max: 10 });
const repository = postgresTicketRepository(pool);
const app = buildApp(repository, { logger: { redact: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]'] } }, postgresAuthStore(pool), process.env.APP_ORIGIN);
pool.on('error', error => app.log.error(error, 'Error en una conexión inactiva de PostgreSQL'));
app.addHook('onClose', async () => { await pool.end(); });

try {
  // Comprueba también que se aplicaron las migraciones antes de atender peticiones.
  await repository.checkReady();
  await pool.query('SELECT u.password_hash,s.expires_at FROM app_users u CROSS JOIN auth_sessions s LIMIT 0');
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
