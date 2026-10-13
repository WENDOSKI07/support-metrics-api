import { configureAuth } from './auth/auth.js';
import type { AuthStore } from './auth/auth.repository.js';
import { incidentRoutes } from './incidents/incident.routes.js';
import Fastify, { type FastifyError, type FastifyServerOptions } from 'fastify';
import { healthRoutes } from './routes/health.routes.js';
import { infoRoutes } from './routes/info.routes.js';
import { ticketRoutes } from './tickets/ticket.routes.js';
import { type TicketRepository } from './tickets/ticket.repository.js';
import { webRoutes } from './routes/web.routes.js';

export function buildApp(repository: TicketRepository, options: FastifyServerOptions = {}, auth?: AuthStore, origin?: string) {
  const app = Fastify({ bodyLimit: 32768, ...options });
  configureAuth(app, repository, auth, origin);

  app.register(healthRoutes, { checkReady: () => repository.checkReady() });
  app.register(webRoutes);
  app.register(infoRoutes);
  app.register(ticketRoutes, { repository });
  if (repository.incidents) app.register(incidentRoutes, { incidents: repository.incidents, tickets: repository });
  app.setErrorHandler<FastifyError>((error, request, reply) => {
    const statusCode = error.statusCode ?? 500;
    if (statusCode >= 500) {
      request.log.error(error);
      return reply.code(500).send({ error: 'No se pudo completar la solicitud.' });
    }
    return reply.code(statusCode).send({ error: error.message });
  });

  return app;
}
