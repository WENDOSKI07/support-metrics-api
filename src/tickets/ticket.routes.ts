import { type FastifyInstance } from 'fastify';
import { buildTicket } from './ticket.factory.js';
import { type TicketRepository } from './ticket.repository.js';
import { validateStatusChange } from './ticket.status.js';

const isTicketId = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

export async function ticketRoutes(app: FastifyInstance, options: { repository: TicketRepository }) {
  const tickets = options.repository;
  const demoRequesterId = 'local-demo-user';

  app.patch<{ Params: { id: string } }>('/tickets/:id/status', async (request, reply) => {
    if (!isTicketId(request.params.id)) return reply.code(404).send({ error: 'Ticket no encontrado.' });
    const change = validateStatusChange(request.body);
    if (!change) return reply.code(400).send({ error: 'Enviar expectedStatus, status y un motivo de 10 a 2000 caracteres.' });
    const result = await tickets.changeStatus(request.params.id, change);
    if (result === 'not_found') return reply.code(404).send({ error: 'Ticket no encontrado.' });
    if (result === 'conflict') return reply.code(409).send({ error: 'El estado cambió o la transición no está permitida. Consulta el ticket de nuevo.' });
    return reply.code(204).send();
  });

  app.get<{ Params: { id: string } }>('/tickets/:id/history', async (request, reply) => {
    if (!isTicketId(request.params.id) || !await tickets.findById(request.params.id)) {
      return reply.code(404).send({ error: 'Ticket no encontrado.' });
    }
    return { data: await tickets.history(request.params.id) };
  });

  app.get<{ Querystring: Record<string, unknown> }>('/tickets', async (request, reply) => {
    const query = request.query;
    for (const field of Object.keys(query)) {
      if (field !== 'page' && field !== 'limit') {
        return reply.code(400).send({ error: { field, message: 'Parámetro no permitido.' } });
      }
    }
    const values = { page: 1, limit: 20 };
    for (const field of ['page', 'limit'] as const) {
      const value = query[field];
      if (value === undefined) continue;
      const maximum = field === 'page' ? 10000 : 100;
      if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value) || Number(value) > maximum) {
        return reply.code(400).send({ error: { field, message: `Debe ser un entero entre 1 y ${maximum}.` } });
      }
      values[field] = Number(value);
    }
    const { page, limit } = values;
    // Un registro adicional permite saber si hay otra página sin contar toda la tabla.
    const rows = await tickets.list(limit + 1, (page - 1) * limit);
    return { data: rows.slice(0, limit), pagination: { page, limit, hasNext: rows.length > limit } };
  });

  app.post('/tickets', async (request, reply) => {
    const result = buildTicket(request.body, demoRequesterId);
    if (!result.success) {
      return reply.code(400).send({ error: result.error });
    }

    await tickets.save(result.ticket);
    return reply.code(201)
      .header('Location', `/tickets/${result.ticket.id}`)
      .send(result.ticket);
  });

  app.get<{ Params: { id: string } }>('/tickets/:id', async (request, reply) => {
    // Los identificadores mal formados tampoco corresponden a un ticket.
    const validId = isTicketId(request.params.id);
    const ticket = validId ? await tickets.findById(request.params.id) : undefined;
    if (!ticket) {
      return reply.code(404).send({ error: 'Ticket no encontrado.' });
    }
    return ticket;
  });
}
