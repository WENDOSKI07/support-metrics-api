import { createHash, randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { AuthStore, Identity } from './auth.repository.js';
import type { TicketRepository } from '../tickets/ticket.repository.js';
import { validPassword, verifyPassword } from './password.js';

declare module 'fastify' { interface FastifyRequest { identity: Identity | null } }
export const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
const publicGets = new Set(['/', '/login', '/login.js', '/app.js', '/style.css', '/favicon.ico', '/health', '/info', '/info/health']);

export function configureAuth(app: FastifyInstance, tickets: TicketRepository, store?: AuthStore, origin = 'http://127.0.0.1:3000') {
  const url = new URL(origin);
  if (url.origin !== origin || (url.protocol !== 'https:' && !['http://127.0.0.1:3000', 'http://localhost:3000'].includes(origin))) {
    throw new Error('APP_ORIGIN debe ser un origen HTTPS o el origen local de desarrollo.');
  }
  const cookieName = url.protocol === 'https:' ? '__Host-session' : 'session';
  const cookie = (value: string, age: number) => `${cookieName}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${url.protocol === 'https:' ? '; Secure' : ''}`;
  const readToken = (raw?: string) => {
    const values = (raw ?? '').split(';').map(s => s.trim()).filter(s => s.startsWith(`${cookieName}=`));
    const token = values.length === 1 ? values[0].slice(cookieName.length + 1) : '';
    return /^[a-f0-9]{64}$/.test(token) ? token : undefined;
  };
  const attempts = new Map<string, { count: number; until: number }>();
  let activeChecks = 0;
  const allowAttempt = (key: string, limit: number) => {
    const now = Date.now();
    for (const [id, value] of attempts) if (value.until <= now) attempts.delete(id);
    if (!attempts.has(key) && attempts.size >= 10000) return false;
    const record = attempts.get(key) ?? { count: 0, until: now + 15 * 60_000 };
    record.count++; attempts.set(key, record);
    return record.count <= limit;
  };
  app.decorateRequest('identity', null);
  app.addHook('onRequest', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'no-referrer');
  });
  app.addHook('preHandler', async (request, reply) => {
    const route = request.routeOptions.url ?? '';
    if ((request.method === 'GET' || request.method === 'HEAD') && publicGets.has(route)) return;
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)
      && (request.headers.origin !== origin || request.headers['x-requested-with'] !== 'support-metrics')) {
      return reply.code(403).send({ error: 'Origen de la solicitud no permitido.' });
    }
    if (route === '/auth/login' && request.method === 'POST') return;
    const token = readToken(request.headers.cookie);
    const identity = token && store ? await store.session(tokenHash(token)) : undefined;
    if (!identity) return reply.code(401).send({ error: 'Inicia sesión para continuar.' });
    request.identity = identity;
    if (route === '/auth/me' || route === '/auth/logout') return;
    if (identity.role === 'support') return;
    if (route === '/tickets' && ['GET', 'HEAD', 'POST'].includes(request.method)) return;
    const ownRead = ['/tickets/:id', '/tickets/:id/comments', '/tickets/:id/history', '/tickets/:id/management-history'].includes(route)
      && ['GET', 'HEAD'].includes(request.method);
    const ownComment = route === '/tickets/:id/comments' && request.method === 'POST';
    if (ownRead || ownComment) {
      const id = (request.params as { id: string }).id;
      const ticket = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id) ? await tickets.findById(id) : undefined;
      if (ticket?.requesterId === identity.id) return;
      return reply.code(404).send({ error: 'Ticket no encontrado.' });
    }
    return reply.code(403).send({ error: 'Esta operación requiere un agente de soporte.' });
  });
  app.post('/auth/login', { bodyLimit: 2048 }, async (request, reply) => {
    if (!allowAttempt(`ip:${request.ip}`, 20)) return reply.header('Retry-After', '900').code(429).send({ error: 'Demasiados intentos. Espera 15 minutos.' });
    const body = request.body as Record<string, unknown> | null;
    if (!body || typeof body !== 'object' || Object.keys(body).some(k => !['username','password'].includes(k))
      || typeof body.username !== 'string' || !/^[a-z0-9._-]{3,64}$/.test(body.username)
      || !validPassword(body.password)) return reply.code(400).send({ error: 'Revisa el usuario y la contraseña (mínimo 15 caracteres).' });
    if (!allowAttempt(`user:${body.username}`, 10) || activeChecks >= 2) return reply.header('Retry-After', '900').code(429).send({ error: 'Demasiados intentos. Espera 15 minutos.' });
    activeChecks++;
    try {
      const user = await store?.credentials(body.username);
      if (!await verifyPassword(body.password, user?.passwordHash) || !user) return reply.code(401).send({ error: 'Usuario o contraseña incorrectos.' });
      const previous = readToken(request.headers.cookie);
      if (previous) await store!.revoke(tokenHash(previous));
      const token = randomBytes(32).toString('hex');
      await store!.createSession(tokenHash(token), user.id);
      return reply.header('Set-Cookie', cookie(token, 8 * 3600)).send({ user: { id: user.id, username: user.username, role: user.role } });
    } finally { activeChecks--; }
  });
  app.get('/auth/me', async request => ({ user: request.identity }));
  app.post('/auth/logout', async (request, reply) => {
    await store!.revoke(tokenHash(readToken(request.headers.cookie)!));
    return reply.header('Set-Cookie', cookie('', 0)).code(204).send();
  });
}
