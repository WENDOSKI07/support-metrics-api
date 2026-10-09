import { type Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { type CreatedTicket, type Ticket, type StatusChange, type TicketHistory } from './ticket.types.js';
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
  save(ticket: CreatedTicket): Promise<void>;
  findById(id: string): Promise<Ticket | undefined>;
  list(limit: number, offset: number): Promise<Ticket[]>;
  changeStatus(id: string, change: StatusChange): Promise<'updated' | 'not_found' | 'conflict'>;
  history(id: string): Promise<TicketHistory[]>;
}

export function postgresTicketRepository(pool: Pool): TicketRepository {
  return {
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
    async list(limit, offset) {
      const result = await pool.query<TicketRow>(
        `SELECT id, title, description, category, requester_id AS "requesterId",
                status, created_at AS "createdAt" FROM tickets
         ORDER BY created_at DESC, id DESC LIMIT $1 OFFSET $2`, [limit, offset],
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
