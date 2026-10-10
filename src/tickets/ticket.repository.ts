import { type Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { type CreatedTicket, type Ticket, type StatusChange, type TicketHistory, type TicketFilters, type TicketCounts, type ManagementChange, type ManagementHistory } from './ticket.types.js';
import { canTransition } from './ticket.status.js';
import { type TicketComment } from './ticket.comment.js';

type CommentRow = Omit<TicketComment, 'createdAt'> & { createdAt: Date };

// pg devuelve timestamptz como Date; el contrato HTTP usa texto ISO en UTC.
type TicketRow = Omit<Ticket, 'createdAt'> & { createdAt: Date };

function toTicket(row: TicketRow): Ticket {
  return {
    id: row.id,
    priority: row.priority, assigneeId: row.assigneeId, version: row.version,
    title: row.title,
    description: row.description,
    category: row.category,
    requesterId: row.requesterId,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  };
}

export interface TicketRepository {
  addComment(ticketId: string, body: string): Promise<TicketComment | 'closed' | undefined>;
  comments(ticketId: string, limit: number, offset: number): Promise<TicketComment[]>;
  counts(filters: Omit<TicketFilters, 'status' | 'q' | 'priority' | 'assignee'>): Promise<TicketCounts>;
  save(ticket: CreatedTicket): Promise<void>;
  findById(id: string): Promise<Ticket | undefined>;
  list(limit: number, offset: number, filters?: TicketFilters): Promise<Ticket[]>;
  changeStatus(id: string, change: StatusChange): Promise<'updated' | 'not_found' | 'conflict'>;
  history(id: string, limit?: number, offset?: number): Promise<TicketHistory[]>;
  changeManagement(id: string, change: ManagementChange): Promise<'updated' | 'not_found' | 'conflict'>;
  managementHistory(id: string, limit: number, offset: number): Promise<ManagementHistory[]>;
}

export function postgresTicketRepository(pool: Pool): TicketRepository {
  return {
    async addComment(ticketId, body) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const ticket = (await client.query<{status: string}>('SELECT status FROM tickets WHERE id = $1 FOR UPDATE', [ticketId])).rows[0];
        if (!ticket || ticket.status === 'closed') {
          await client.query('ROLLBACK'); return ticket ? 'closed' : undefined;
        }
        const result = await client.query<CommentRow>(
          `INSERT INTO ticket_comments(id,ticket_id,author_id,body) VALUES ($1,$2,'local-demo-user',$3)
           RETURNING id,ticket_id AS "ticketId",author_id AS "authorId",body,created_at AS "createdAt"`,
          [randomUUID(),ticketId,body]);
        await client.query('COMMIT');
        const row = result.rows[0]!;
        return { ...row, createdAt: row.createdAt.toISOString() };
      } catch (error) { await client.query('ROLLBACK'); throw error; }
      finally { client.release(); }
    },
    async comments(ticketId, limit, offset) {
      const result = await pool.query<CommentRow>(
        `SELECT id, ticket_id AS "ticketId", author_id AS "authorId", body, created_at AS "createdAt"
         FROM ticket_comments WHERE ticket_id = $1 ORDER BY created_at, id LIMIT $2 OFFSET $3`,
        [ticketId, limit, offset],
      );
      return result.rows.map(row => ({ ...row, createdAt: row.createdAt.toISOString() }));
    },
    async changeManagement(id, change) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const row = (await client.query<{priority: string; assignee_id: string | null; status: string; version: number}>(
          'SELECT priority, assignee_id, status, version FROM tickets WHERE id = $1 FOR UPDATE', [id])).rows[0];
        if (!row) { await client.query('ROLLBACK'); return 'not_found'; }
        const previous = change.kind === 'priority' ? row.priority : row.assignee_id;
        if (row.status === 'closed' || row.version !== change.expectedVersion || previous === change.value) {
          await client.query('ROLLBACK'); return 'conflict';
        }
        // El nombre de columna solo procede de esta selección interna, nunca del cliente.
        const column = change.kind === 'priority' ? 'priority' : 'assignee_id';
        await client.query(`UPDATE tickets SET ${column} = $1, version = version + 1 WHERE id = $2`, [change.value,id]);
        await client.query(`INSERT INTO ticket_management_history(id,ticket_id,kind,previous_value,value,reason,version)
          VALUES ($1,$2,$3,$4,$5,$6,$7)`,[randomUUID(),id,change.kind,previous,change.value,change.reason,row.version+1]);
        await client.query('COMMIT'); return 'updated';
      } catch (error) { await client.query('ROLLBACK'); throw error; }
      finally { client.release(); }
    },
    async managementHistory(id, limit, offset) {
      const result = await pool.query<Omit<ManagementHistory,'changedAt'> & {changedAt: Date}>(
        `SELECT id,kind,previous_value AS "previousValue",value,reason,version,changed_at AS "changedAt"
         FROM ticket_management_history WHERE ticket_id=$1 ORDER BY changed_at,id LIMIT $2 OFFSET $3`,[id,limit,offset]);
      return result.rows.map(row => ({...row,changedAt:row.changedAt.toISOString()}));
    },
    async counts(filters) {
      // La subconsulta devuelve una sola fecha por ticket para no duplicar conteos.
      const result = await pool.query<{ status: Ticket['status']; count: string; sample: string; average: string | null }>(
        `SELECT t.status, count(*)::text AS count,
           count(*) FILTER (WHERE t.status IN ('resolved', 'closed') AND h.resolved_at >= t.created_at)::text AS sample,
           avg(extract(epoch FROM (h.resolved_at - t.created_at)))
             FILTER (WHERE t.status IN ('resolved', 'closed') AND h.resolved_at >= t.created_at)::text AS average
         FROM tickets t
         LEFT JOIN LATERAL (
           SELECT max(changed_at) AS resolved_at FROM ticket_history
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
        total: 0, byStatus: { open: 0, in_progress: 0, resolved: 0, closed: 0 },
        resolution: { averageSeconds: null, sampleSize: 0, excludedCount: 0 },
      };
      let weightedSeconds = 0;
      for (const row of result.rows) {
        const count = Number(row.count);
        if (!Number.isSafeInteger(count) || !Number.isSafeInteger(counts.total + count)) {
          throw new RangeError('El conteo supera la precisión numérica admitida.');
        }
        counts.byStatus[row.status] = count;
        counts.total += count;
        if (row.status === 'resolved' || row.status === 'closed') {
          const sample = Number(row.sample);
          counts.resolution.sampleSize += sample;
          counts.resolution.excludedCount += count - sample;
          weightedSeconds += Number(row.average ?? 0) * sample;
        }
      }
      if (counts.resolution.sampleSize) counts.resolution.averageSeconds = weightedSeconds / counts.resolution.sampleSize;
      return counts;
    },
    async changeStatus(id, change) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await client.query<{ status: Ticket['status']; version: number }>('SELECT status, version FROM tickets WHERE id = $1 FOR UPDATE', [id]);
        const current = result.rows[0];
        if (!current) {
          await client.query('ROLLBACK');
          return 'not_found';
        }
        if (current.version !== change.expectedVersion || current.status !== change.expectedStatus || !canTransition(current.status, change.status)) {
          await client.query('ROLLBACK');
          return 'conflict';
        }
        await client.query('UPDATE tickets SET status = $1, version = version + 1 WHERE id = $2', [change.status, id]);
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
    async history(id, limit = 20, offset = 0) {
      const result = await pool.query<Omit<TicketHistory, 'changedAt'> & { changedAt: Date }>(
        `SELECT id, previous_status AS "previousStatus", status, reason, changed_at AS "changedAt"
         FROM ticket_history WHERE ticket_id = $1 ORDER BY changed_at, id LIMIT $2 OFFSET $3`, [id, limit, offset]);
      return result.rows.map(row => ({ ...row, changedAt: row.changedAt.toISOString() }));
    },
    async list(limit, offset, filters = {}) {
      // ! es el escape SQL elegido; %, _ y ! del usuario se buscan literalmente.
      const pattern = filters.q === undefined ? null : `%${filters.q.replace(/[!%_]/g, '!$&')}%`;
      const result = await pool.query<TicketRow>(
        `SELECT id, title, description, category, requester_id AS "requesterId",
                status, priority, assignee_id AS "assigneeId", version, created_at AS "createdAt" FROM tickets
         WHERE ($3::text IS NULL OR status = $3) AND ($4::text IS NULL OR category = $4)
           AND ($5::timestamptz IS NULL OR created_at >= $5)
           AND ($6::timestamptz IS NULL OR created_at < $6)
           AND ($7::text IS NULL OR title ILIKE $7 ESCAPE '!' OR description ILIKE $7 ESCAPE '!')
           AND ($8::text IS NULL OR priority = $8)
           AND ($9::text IS NULL OR ($9 = 'unassigned' AND assignee_id IS NULL) OR assignee_id = $9)
         ORDER BY created_at DESC, id DESC LIMIT $1 OFFSET $2`,
        [limit, offset, filters.status ?? null, filters.category ?? null,
          filters.createdFrom ? `${filters.createdFrom}T00:00:00.000Z` : null,
          filters.createdBefore ? `${filters.createdBefore}T00:00:00.000Z` : null, pattern, filters.priority ?? null, filters.assignee ?? null],
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
                status, priority, assignee_id AS "assigneeId", version, created_at AS "createdAt" FROM tickets WHERE id = $1`, [id],
      );
      const row = result.rows[0];
      return row ? toTicket(row) : undefined;
    },
  };
}
