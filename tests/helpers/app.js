import { buildApp } from '../../dist/app.js';

// Solo las pruebas aisladas usan memoria; el servidor exige PostgreSQL.
export function buildTestApp() {
  const tickets = new Map();
  return buildApp({
    async checkReady() {},
    async save(ticket) { tickets.set(ticket.id, structuredClone(ticket)); },
    async findById(id) { return tickets.get(id); },
    async list(limit, offset, filters = {}) {
      return [...tickets.values()]
        .filter(ticket => (!filters.priority || ticket.priority === filters.priority) && (!filters.assignee || (filters.assignee === 'unassigned' ? ticket.assigneeId === null : ticket.assigneeId === filters.assignee)))
        .filter(ticket => !filters.q || ticket.title.toLowerCase().includes(filters.q.toLowerCase()) || ticket.description.toLowerCase().includes(filters.q.toLowerCase()))
        .filter(ticket => (!filters.status || ticket.status === filters.status) && (!filters.category || ticket.category === filters.category))
        .filter(ticket => (!filters.createdFrom || ticket.createdAt >= `${filters.createdFrom}T00:00:00.000Z`) &&
          (!filters.createdBefore || ticket.createdAt < `${filters.createdBefore}T00:00:00.000Z`))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
        .slice(offset, offset + limit);
    },
  });
}
