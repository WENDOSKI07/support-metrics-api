import { type FastifyInstance } from 'fastify';
import { buildTicket } from './ticket.factory.js';
import { type TicketRepository } from './ticket.repository.js';
import { validateStatusChange } from './ticket.status.js';
import { validateListQuery } from './ticket.query.js';
import { demoAgents, validateManagement } from './ticket.management.js';
import { validateComment } from './ticket.comment.js';

const isTicketId = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

export async function ticketRoutes(app: FastifyInstance, options: { repository: TicketRepository }) {
  const tickets = options.repository;
  const demoRequesterId = 'local-demo-user';

  app.post<{ Params: { id: string } }>('/tickets/:id/comments', async (request, reply) => {
    if (!isTicketId(request.params.id)) return reply.code(404).send({ error: 'Ticket no encontrado.' });
    const body = validateComment(request.body);
    if (body === undefined) return reply.code(400).send({ error: 'Enviar solo body: texto válido de 1 a 5000 caracteres.' });
    const comment = await tickets.addComment(request.params.id, body);
    if (comment === 'closed') return reply.code(409).send({ error: 'El ticket está cerrado y no admite comentarios.' });
    if (!comment) return reply.code(404).send({ error: 'Ticket no encontrado.' });
    return reply.code(201).send(comment);
  });

  app.get<{ Params: { id: string }; Querystring: Record<string, unknown> }>('/tickets/:id/comments', async (request, reply) => {
    for (const field of Object.keys(request.query)) {
      if (!['page', 'limit'].includes(field)) return reply.code(400).send({ error: 'Solo se permiten page y limit.' });
    }
    const result = validateListQuery(request.query);
    if (!result.success) return reply.code(400).send({ error: result.error });
    if (!isTicketId(request.params.id) || !await tickets.findById(request.params.id)) {
      return reply.code(404).send({ error: 'Ticket no encontrado.' });
    }
    const { page, limit } = result;
    const rows = await tickets.comments(request.params.id, limit + 1, (page - 1) * limit);
    return { data: rows.slice(0, limit), pagination: { page, limit, hasNext: rows.length > limit } };
  });

  app.get<{ Querystring: Record<string, unknown> }>('/metrics/tickets', async (request, reply) => {
    for (const field of Object.keys(request.query)) {
      if (!['category', 'createdFrom', 'createdBefore'].includes(field)) {
        return reply.code(400).send({ error: { field, message: 'Parámetro no permitido en métricas.' } });
      }
    }
    const result = validateListQuery(request.query);
    if (!result.success) return reply.code(400).send({ error: result.error });
    const { filters } = result;
    const counts = await tickets.counts(filters);
    return {
      ...counts,
      scope: {
        dateField: 'createdAt', timeZone: 'UTC', statusBasis: 'current',
        createdFrom: filters.createdFrom ?? null,
        createdBefore: filters.createdBefore ?? null,
        category: filters.category ?? null,
      },
    };
  });

  app.patch<{ Params: { id: string } }>('/tickets/:id/status', async (request, reply) => {
    if (!isTicketId(request.params.id)) return reply.code(404).send({ error: 'Ticket no encontrado.' });
    const change = validateStatusChange(request.body);
    if (!change) return reply.code(400).send({ error: 'Enviar expectedVersion, expectedStatus, status y un motivo de 10 a 2000 caracteres.' });
    const result = await tickets.changeStatus(request.params.id, change);
    if (result === 'not_found') return reply.code(404).send({ error: 'Ticket no encontrado.' });
    if (result === 'conflict') return reply.code(409).send({ error: 'El estado cambió o la transición no está permitida. Consulta el ticket de nuevo.' });
    return reply.code(204).send();
  });

  app.get('/agents', async () => ({ data: demoAgents }));
  app.patch<{ Params: { id: string } }>('/tickets/:id/management', async (request, reply) => {
    if (!isTicketId(request.params.id)) return reply.code(404).send({ error: 'Ticket no encontrado.' });
    const change = validateManagement(request.body);
    if (!change) return reply.code(400).send({ error: 'Enviar expectedVersion, kind, value y un motivo de 10 a 2000 caracteres. Usa un agente o prioridad válidos.' });
    const result = await tickets.changeManagement(request.params.id, change);
    if (result === 'not_found') return reply.code(404).send({ error: 'Ticket no encontrado.' });
    if (result === 'conflict') return reply.code(409).send({ error: 'Ticket cerrado, versión desactualizada o valor sin cambios. Consulta el ticket de nuevo.' });
    return reply.code(204).send();
  });

  for (const kind of ['history', 'management-history'] as const) {
    app.get<{ Params: { id: string }; Querystring: Record<string, unknown> }>(`/tickets/:id/${kind}`, async (request, reply) => {
      if (Object.keys(request.query).some(key => !['page','limit'].includes(key))) return reply.code(400).send({error:'Solo se permiten page y limit.'});
      const result = validateListQuery(request.query);
      if (!result.success) return reply.code(400).send({ error: result.error });
      if (!isTicketId(request.params.id) || !await tickets.findById(request.params.id)) return reply.code(404).send({ error: 'Ticket no encontrado.' });
      const { page, limit } = result;
      const rows = kind === 'history' ? await tickets.history(request.params.id, limit+1, (page-1)*limit)
        : await tickets.managementHistory(request.params.id, limit+1, (page-1)*limit);
      return { data: rows.slice(0,limit), pagination: { page, limit, hasNext: rows.length > limit } };
    });
  }

  app.get<{ Querystring: Record<string, unknown> }>('/tickets', async (request, reply) => {
    const result = validateListQuery(request.query);
    if (!result.success) return reply.code(400).send({ error: result.error });
    const { page, limit, filters } = result;
    // Un registro adicional permite saber si hay otra página sin contar toda la tabla.
    const rows = await tickets.list(limit + 1, (page - 1) * limit, filters);
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
