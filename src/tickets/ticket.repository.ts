import { type Pool } from 'pg';
import { type CreatedTicket } from './ticket.types.js';

// pg devuelve timestamptz como Date; el contrato HTTP usa texto ISO en UTC.
type TicketRow = Omit<CreatedTicket, 'createdAt'> & { createdAt: Date };

function toTicket(row: TicketRow): CreatedTicket {
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
  findById(id: string): Promise<CreatedTicket | undefined>;
  list(limit: number, offset: number): Promise<CreatedTicket[]>;
}

export function postgresTicketRepository(pool: Pool): TicketRepository {
  return {
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
