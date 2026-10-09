import { readFile } from 'node:fs/promises';
import { type FastifyInstance } from 'fastify';

export async function webRoutes(app: FastifyInstance) {
  app.get('/favicon.ico', async (_request, reply) => reply.code(204).send());
  // Lista cerrada: la URL nunca se convierte en una ruta de archivos arbitraria.
  const files = [
    ['/', 'index.html', 'text/html; charset=utf-8'],
    ['/app.js', 'app.js', 'text/javascript; charset=utf-8'],
    ['/style.css', 'style.css', 'text/css; charset=utf-8'],
    ['/docs', 'docs.html', 'text/html; charset=utf-8'],
  ];
  for (const [url, file, type] of files) {
    app.get(url, async (_request, reply) => {
      reply.header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
      reply.header('X-Content-Type-Options', 'nosniff');
      reply.header('Cache-Control', 'no-cache');
      return reply.type(type).send(await readFile(new URL(`../../public/${file}`, import.meta.url), 'utf8'));
    });
  }
}
