import { ticketCategories, type TicketFilters } from './ticket.types.js';

type ListQueryResult =
  | { success: true; page: number; limit: number; filters: TicketFilters }
  | { success: false; error: { field: string; message: string } };

/** Fechas de calendario reales, interpretadas como medianoche UTC. */
function isDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value) || value.startsWith('0000')) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function validateListQuery(query: Record<string, unknown>): ListQueryResult {
  for (const field of Object.keys(query)) {
    if (!['page', 'limit', 'status', 'category', 'createdFrom', 'createdBefore'].includes(field)) {
      return { success: false, error: { field, message: 'Parámetro no permitido.' } };
    }
  }
  const values = { page: 1, limit: 20 };
  for (const field of ['page', 'limit'] as const) {
    const value = query[field];
    if (value === undefined) continue;
    const maximum = field === 'page' ? 10000 : 100;
    if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value) || Number(value) > maximum) {
      return { success: false, error: { field, message: `Debe ser un entero entre 1 y ${maximum}.` } };
    }
    values[field] = Number(value);
  }
  const { page, limit } = values;
  const filters: TicketFilters = {};
  for (const field of ['status', 'category'] as const) {
    const value = query[field];
    if (value === undefined) continue;
    const allowed: readonly string[] = field === 'status' ? ['open', 'in_progress', 'resolved'] : ticketCategories;
    if (typeof value !== 'string' || !allowed.includes(value)) {
      return { success: false, error: { field, message: `Valores permitidos: ${allowed.join(', ')}.` } };
    }
    Object.assign(filters, { [field]: value });
  }
  for (const field of ['createdFrom', 'createdBefore'] as const) {
    const value = query[field];
    if (value === undefined) continue;
    if (!isDate(value)) return { success: false, error: { field, message: 'Usa una fecha real con formato AAAA-MM-DD (UTC).' } };
    filters[field] = value;
  }
  if (filters.createdFrom && filters.createdBefore && filters.createdFrom >= filters.createdBefore) {
    return { success: false, error: { field: 'createdBefore', message: 'Debe ser posterior a createdFrom.' } };
  }
  return { success: true, page, limit, filters };
}
