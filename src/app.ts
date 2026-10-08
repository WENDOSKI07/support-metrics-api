import Fastify, { type FastifyServerOptions } from 'fastify';
import { healthRoutes } from './routes/health.routes.js';
import { infoRoutes } from './routes/info.routes.js';

export function buildApp(options: FastifyServerOptions = {}) {
  const app = Fastify(options);

  app.register(healthRoutes);
  app.register(infoRoutes);

  return app;
}
