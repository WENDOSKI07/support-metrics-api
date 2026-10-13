import { buildApp as createApp } from '../../dist/app.js';
export function buildApp(repository, options) {
  const app = createApp(repository, options, {
    async session() { return { id: 'local-demo-user', username: 'test-support', role: 'support' }; },
  });
  app.addHook('onRequest', async request => {
    request.headers.cookie = `session=${'a'.repeat(64)}`;
    request.headers.origin = 'http://127.0.0.1:3000';
    request.headers['x-requested-with'] = 'support-metrics';
  });
  return app;
}
