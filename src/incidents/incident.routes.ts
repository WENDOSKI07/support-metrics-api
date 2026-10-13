import { type FastifyInstance } from 'fastify';
import { type IncidentRepository } from './incident.repository.js';
import { type TicketRepository } from '../tickets/ticket.repository.js';
import { isStorableText } from '../tickets/ticket.text.js';
import { validateListQuery } from '../tickets/ticket.query.js';
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const text = (v: unknown, min: number, max: number): v is string => typeof v === 'string' && isStorableText(v) && [...v.trim()].length >= min && [...v.trim()].length <= max;
const body = (v: unknown, fields: string[]): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === fields.length && Object.keys(v).every(k=>fields.includes(k));
const version = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v > 0 && v < 2147483647;
type Params = { id: string };
export async function incidentRoutes(app: FastifyInstance, options: { incidents: IncidentRepository; tickets: TicketRepository }) {
  const { incidents, tickets } = options;
  app.post('/incidents', async (request, reply) => {
    const b=request.body;
    if (!body(b,['title','description']) || !text(b.title,5,120) || !text(b.description,10,5000)) return reply.code(400).send({error:'Enviar título de 5 a 120 y descripción de 10 a 5000 caracteres.'});
    const result=await incidents.create(b.title.trim(),b.description.trim());
    return reply.code(201).header('Location',`/incidents/${result.id}`).send(result);
  });
  app.get<{Params:Params}>('/incidents/:id',async(request,reply)=> {
    const result=uuid(request.params.id)?await incidents.find(request.params.id):undefined;
    return result ?? reply.code(404).send({error:'Incidente no encontrado.'});
  });
  app.get<{Params:Params;Querystring:Record<string,unknown>}>('/incidents/:id/summary',async(request,reply)=> {
    if (Object.keys(request.query).length) return reply.code(400).send({error:'Este resumen no admite parámetros.'});
    if (!uuid(request.params.id) || !await incidents.find(request.params.id)) return reply.code(404).send({error:'Incidente no encontrado.'});
    reply.header('Cache-Control','no-store');
    return incidents.summary(request.params.id);
  });
  for (const path of ['/incidents','/incidents/:id/tickets','/incidents/:id/history','/tickets/:id/incident-history']) {
    app.get<{Params:Params;Querystring:Record<string,unknown>}>(path, async(request,reply)=> {
      if (Object.keys(request.query).some(k=>!(path === '/incidents' ? ['page','limit','q','status'] : ['page','limit']).includes(k))) return reply.code(400).send({error:'Solo se permiten page y limit.'});
      if (path === '/incidents' && request.query.status !== undefined && !['open','resolved'].includes(request.query.status as string)) return reply.code(400).send({error:'Estado de incidente inválido.'});
      const query=validateListQuery(request.query);
      if (!query.success) return reply.code(400).send({error:query.error});
      const id=request.params.id;
      if (path!=='/incidents' && (!uuid(id) || !(path.startsWith('/tickets')?await tickets.findById(id):await incidents.find(id)))) return reply.code(404).send({error:'Registro no encontrado.'});
      const {page,limit}=query, offset=(page-1)*limit;
      const rows=path==='/incidents'?await incidents.list(limit+1,offset,{q:query.filters.q,status:query.filters.status as 'open'|'resolved'|undefined}):path.endsWith('/tickets')?await incidents.tickets(id,limit+1,offset):path.startsWith('/tickets')?await incidents.ticketHistory(id,limit+1,offset):await incidents.history(id,limit+1,offset);
      return {data:rows.slice(0,limit),pagination:{page,limit,hasNext:rows.length>limit}};
    });
  }
  app.get<{Params:Params}>('/tickets/:id/incident',async(request,reply)=> {
    if (!uuid(request.params.id) || !await tickets.findById(request.params.id)) return reply.code(404).send({error:'Ticket no encontrado.'});
    return {incident:await incidents.linked(request.params.id)};
  });
  app.patch<{Params:Params}>('/incidents/:id/status',async(request,reply)=> {
    if (!uuid(request.params.id)) return reply.code(404).send({error:'Incidente no encontrado.'});
    const b=request.body;
    if (!body(b,['expectedVersion','status','reason']) || !version(b.expectedVersion) || !(b.status === 'open' || b.status === 'resolved') || !text(b.reason,10,2000)) return reply.code(400).send({error:'Enviar expectedVersion, status (open/resolved) y motivo de 10 a 2000 caracteres.'});
    const result=await incidents.changeStatus(request.params.id,b.expectedVersion,b.status as 'open'|'resolved',b.reason.trim());
    return result==='updated'?reply.code(204).send():reply.code(result==='not_found'?404:409).send({error:'Incidente inexistente, versión desactualizada o estado sin cambios.'});
  });
  app.patch<{Params:Params}>('/tickets/:id/incident',async(request,reply)=> {
    if (!uuid(request.params.id)) return reply.code(404).send({error:'Ticket no encontrado.'});
    const b=request.body;
    if (!body(b,['expectedVersion','incidentId','reason']) || !version(b.expectedVersion) || !(b.incidentId===null || uuid(b.incidentId)) || !text(b.reason,10,2000)) return reply.code(400).send({error:'Enviar expectedVersion, incidentId (UUID o null) y motivo de 10 a 2000 caracteres.'});
    const result=await incidents.link(request.params.id,b.incidentId?.toLowerCase() ?? null,b.expectedVersion,b.reason.trim());
    return result==='updated'?reply.code(204).send():reply.code(result==='not_found'?404:409).send({error:'Registro inexistente, ticket cerrado, incidente resuelto, vínculo sin cambios o versión desactualizada.'});
  });
}
