import { type FastifyInstance } from 'fastify';

const projectInfo = {
  name: 'support-metrics-api',
  version: '0.1.0',
};

export async function infoRoutes(app: FastifyInstance) {
  app.get('/info', async () => ({ ...projectInfo }));

  app.get('/info/health', async () => ({
    ...projectInfo,
    status: 'ok',
  }));
}
