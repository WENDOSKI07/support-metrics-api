import { type Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { type CreatedTicket, type Ticket, type StatusChange, type TicketHistory, type TicketFilters, type TicketCounts } from './ticket.types.js';
import { canTransition } from './ticket.status.js';

// pg devuelve timestamptz como Date; el contrato HTTP usa texto ISO en UTC.
type TicketRow = Omit<Ticket, 'createdAt'> & { createdAt: Date };

function toTicket(row: TicketRow): Ticket {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    category: row.category,
    requesterId: row.requesterId,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  };
}

export interface TicketRepository {
  counts(filters: Omit<TicketFilters, 'status'>): Promise<TicketCounts>;
  save(ticket: CreatedTicket): Promise<void>;
  findById(id: string): Promise<Ticket | undefined>;
  list(limit: number, offset: number, filters?: TicketFilters): Promise<Ticket[]>;
  changeStatus(id: string, change: StatusChange): Promise<'updated' | 'not_found' | 'conflict'>;
  history(id: string): Promise<TicketHistory[]>;
}

export function postgresTicketRepository(pool: Pool): TicketRepository {
  return {
    async counts(filters) {
      // La subconsulta devuelve una sola fecha por ticket para no duplicar conteos.
      const result = await pool.query<{ status: Ticket['status']; count: string; sample: string; average: string | null }>(
        `SELECT t.status, count(*)::text AS count,
           count(*) FILTER (WHERE t.status = 'resolved' AND h.resolved_at >= t.created_at)::text AS sample,
           avg(extract(epoch FROM (h.resolved_at - t.created_at)))
             FILTER (WHERE t.status = 'resolved' AND h.resolved_at >= t.created_at)::text AS average
         FROM tickets t
         LEFT JOIN LATERAL (
           SELECT min(changed_at) AS resolved_at FROM ticket_history
           WHERE ticket_id = t.id AND status = 'resolved'
         ) h ON true
         WHERE ($1::text IS NULL OR category = $1)
           AND ($2::timestamptz IS NULL OR created_at >= $2)
           AND ($3::timestamptz IS NULL OR created_at < $3)
         GROUP BY t.status`,
        [filters.category ?? null,
          filters.createdFrom ? `${filters.createdFrom}T00:00:00.000Z` : null,
          filters.createdBefore ? `${filters.createdBefore}T00:00:00.000Z` : null],
      );
      const counts: TicketCounts = {
        total: 0, byStatus: { open: 0, in_progress: 0, resolved: 0 },
        resolution: { averageSeconds: null, sampleSize: 0, excludedCount: 0 },
      };
      for (const row of result.rows) {
        const count = Number(row.count);
        if (!Number.isSafeInteger(count) || !Number.isSafeInteger(counts.total + count)) {
          throw new RangeError('El conteo supera la precisión numérica admitida.');
        }
        counts.byStatus[row.status] = count;
        counts.total += count;
        if (row.status === 'resolved') {
          counts.resolution = {
            averageSeconds: row.average === null ? null : Number(row.average),
            sampleSize: Number(row.sample),
            excludedCount: count - Number(row.sample),
          };
        }
      }
      return counts;
    },
    async changeStatus(id, change) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await client.query<{ status: Ticket['status'] }>('SELECT status FROM tickets WHERE id = $1 FOR UPDATE', [id]);
        const current = result.rows[0];
        if (!current) {
          await client.query('ROLLBACK');
          return 'not_found';
        }
        if (current.status !== change.expectedStatus || !canTransition(current.status, change.status)) {
          await client.query('ROLLBACK');
          return 'conflict';
        }
        await client.query('UPDATE tickets SET status = $1 WHERE id = $2', [change.status, id]);
        await client.query(`INSERT INTO ticket_history (id, ticket_id, previous_status, status, reason)
          VALUES ($1, $2, $3, $4, $5)`, [randomUUID(), id, current.status, change.status, change.reason]);
        await client.query('COMMIT');
        return 'updated';
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
    async history(id) {
      const result = await pool.query<Omit<TicketHistory, 'changedAt'> & { changedAt: Date }>(
        `SELECT id, previous_status AS "previousStatus", status, reason, changed_at AS "changedAt"
         FROM ticket_history WHERE ticket_id = $1 ORDER BY changed_at, id`, [id]);
      return result.rows.map(row => ({ ...row, changedAt: row.changedAt.toISOString() }));
    },
    async list(limit, offset, filters = {}) {
      const result = await pool.query<TicketRow>(
        `SELECT id, title, description, category, requester_id AS "requesterId",
                status, created_at AS "createdAt" FROM tickets
         WHERE ($3::text IS NULL OR status = $3) AND ($4::text IS NULL OR category = $4)
           AND ($5::timestamptz IS NULL OR created_at >= $5)
           AND ($6::timestamptz IS NULL OR created_at < $6)
         ORDER BY created_at DESC, id DESC LIMIT $1 OFFSET $2`,
        [limit, offset, filters.status ?? null, filters.category ?? null,
          filters.createdFrom ? `${filters.createdFrom}T00:00:00.000Z` : null,
          filters.createdBefore ? `${filters.createdBefore}T00:00:00.000Z` : null],
      );
      return result.rows.map(toTicket);
    },
    async save(ticket) {
      await pool.query(
        `INSERT INTO tickets (id, title, description, category, requester_id, status, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [ticket.id, ticket.title, ticket.description, ticket.category,
          ticket.requesterId, ticket.status, ticket.createdAt],
      );
    },
    async findById(id) {
      const result = await pool.query<TicketRow>(
        `SELECT id, title, description, category, requester_id AS "requesterId",
                status, created_at AS "createdAt" FROM tickets WHERE id = $1`, [id],
      );
      const row = result.rows[0];
      return row ? toTicket(row) : undefined;
    },
  };
}
