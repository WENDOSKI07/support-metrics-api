import pg from 'pg';
import { buildApp } from '../dist/app.js';
import { postgresTicketRepository } from '../dist/tickets/ticket.repository.js';
import { postgresAuthStore } from '../dist/auth/auth.repository.js';

const pool = new pg.Pool({ connectionTimeoutMillis: 5000, max: 5 });
const repository = postgresTicketRepository(pool);
await repository.checkReady();
const app = buildApp(repository, { logger: false }, postgresAuthStore(pool), 'http://127.0.0.1:3000');
app.addHook('onClose', () => pool.end());
await app.listen({ host: '127.0.0.1', port: 3000 });
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await app.close(); });
