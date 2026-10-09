import { buildApp } from '../../dist/app.js';

// Solo las pruebas aisladas usan memoria; el servidor exige PostgreSQL.
export function buildTestApp() {
  const tickets = new Map();
  return buildApp({
    async save(ticket) { tickets.set(ticket.id, structuredClone(ticket)); },
    async findById(id) { return tickets.get(id); },
    async list(limit, offset) {
      return [...tickets.values()]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
        .slice(offset, offset + limit);
    },
  });
}
