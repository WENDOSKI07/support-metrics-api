import { type Pool } from 'pg';
import { type CreatedTicket } from './ticket.types.js';

export interface TicketRepository {
  save(ticket: CreatedTicket): Promise<void>;
  findById(id: string): Promise<CreatedTicket | undefined>;
  list(limit: number, offset: number): Promise<CreatedTicket[]>;
}

export function postgresTicketRepository(pool: Pool): TicketRepository {
  return {
    async list(limit, offset) {
      const result = await pool.query(
        `SELECT id, title, description, category, requester_id AS "requesterId",
                status, created_at AS "createdAt" FROM tickets
         ORDER BY created_at DESC, id DESC LIMIT $1 OFFSET $2`, [limit, offset],
      );
      return result.rows.map(row => ({ ...row, createdAt: row.createdAt.toISOString() }));
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
      const result = await pool.query(
        `SELECT id, title, description, category, requester_id AS "requesterId",
                status, created_at AS "createdAt" FROM tickets WHERE id = $1`, [id],
      );
      const row = result.rows[0];
      return row ? { ...row, createdAt: row.createdAt.toISOString() } : undefined;
    },
  };
}
