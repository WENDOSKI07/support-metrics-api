import { type FastifyInstance } from 'fastify';

export async function healthRoutes(app: FastifyInstance, options: { checkReady: () => Promise<void> }) {
  app.get('/health', async () => ({ status: 'ok' }));
  app.get('/ready', async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    try {
      await options.checkReady();
      return { status: 'ok', database: 'available' };
    } catch (error) {
      request.log.error(error, 'PostgreSQL no está disponible para la API');
      return reply.code(503).send({ status: 'unavailable', database: 'unavailable' });
    }
  });
}
