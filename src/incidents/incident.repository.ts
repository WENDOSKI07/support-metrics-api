import { randomUUID } from 'node:crypto';
import { type Pool, type PoolClient } from 'pg';

export type Incident = { id: string; title: string; description: string; status: 'open' | 'resolved'; version: number; solution: string | null; createdAt: Date };
const columns = 'id,title,description,status,version,solution,created_at AS "createdAt"';
export function postgresIncidentRepository(pool: Pool) {
  async function transaction(run: (client: PoolClient) => Promise<'updated' | 'not_found' | 'conflict'>) {
    const client = await pool.connect();
    try { await client.query('BEGIN'); const result = await run(client); await client.query('COMMIT'); return result; }
    catch(error) { await client.query('ROLLBACK').catch(()=>{}); throw error; }
    finally { client.release(); }
  }
  return {
    async create(title: string, description: string) {
      return (await pool.query<Incident>(`INSERT INTO incidents(id,title,description) VALUES($1,$2,$3) RETURNING ${columns}`, [randomUUID(),title,description])).rows[0]!;
    },
    async find(id: string) { return (await pool.query<Incident>(`SELECT ${columns} FROM incidents WHERE id=$1`,[id])).rows[0]; },
    async list(limit: number, offset: number, filters: { q?: string | undefined; status?: 'open' | 'resolved' | undefined } = {}) {
      const search = filters.q ? '%' + filters.q.replace(/[!%_]/g, value => '!' + value) + '%' : null;
      return (await pool.query<Incident>(`SELECT ${columns} FROM incidents
        WHERE ($3::text IS NULL OR status=$3)
          AND ($4::text IS NULL OR title ILIKE $4 ESCAPE '!' OR description ILIKE $4 ESCAPE '!')
        ORDER BY created_at DESC,id DESC LIMIT $1 OFFSET $2`,[limit,offset,filters.status ?? null,search])).rows;
    },
    async summary(id: string) {
      const result = await pool.query<{ total: number; open: number; inProgress: number; resolved: number; closed: number }>(`
        SELECT count(*)::int AS total,
          count(*) FILTER (WHERE t.status='open')::int AS open,
          count(*) FILTER (WHERE t.status='in_progress')::int AS "inProgress",
          count(*) FILTER (WHERE t.status='resolved')::int AS resolved,
          count(*) FILTER (WHERE t.status='closed')::int AS closed
        FROM ticket_incidents l JOIN tickets t ON t.id=l.ticket_id WHERE l.incident_id=$1`, [id]);
      const row = result.rows[0]!;
      return { total: row.total, pending: row.open + row.inProgress,
        byStatus: { open: row.open, in_progress: row.inProgress, resolved: row.resolved, closed: row.closed },
        scope: { statusBasis: 'current', membership: 'currently_linked' } };
    },
    async tickets(id: string, limit: number, offset: number) {
      return (await pool.query(`SELECT t.id,t.title,t.status FROM ticket_incidents l JOIN tickets t ON t.id=l.ticket_id WHERE l.incident_id=$1 ORDER BY t.created_at DESC,t.id DESC LIMIT $2 OFFSET $3`,[id,limit,offset])).rows;
    },
    async history(id: string, limit: number, offset: number) {
      return (await pool.query(`SELECT id,status,reason,version,changed_at AS "changedAt" FROM incident_history WHERE incident_id=$1 ORDER BY changed_at,id LIMIT $2 OFFSET $3`,[id,limit,offset])).rows;
    },
    async ticketHistory(id: string, limit: number, offset: number) {
      return (await pool.query(`SELECT id,previous_incident_id AS "previousIncidentId",incident_id AS "incidentId",reason,version,changed_at AS "changedAt" FROM ticket_incident_history WHERE ticket_id=$1 ORDER BY changed_at,id LIMIT $2 OFFSET $3`,[id,limit,offset])).rows;
    },
    async linked(id: string) {
      return (await pool.query<Incident>(`SELECT i.id,i.title,i.description,i.status,i.version,i.solution,i.created_at AS "createdAt" FROM incidents i JOIN ticket_incidents l ON l.incident_id=i.id WHERE l.ticket_id=$1`,[id])).rows[0] ?? null;
    },
    async changeStatus(id: string, expectedVersion: number, status: 'open' | 'resolved', reason: string) {
      return transaction(async client => {
        const incident = (await client.query<Incident>('SELECT * FROM incidents WHERE id=$1 FOR UPDATE',[id])).rows[0];
        if (!incident) return 'not_found';
        if (incident.version !== expectedVersion || incident.status === status) return 'conflict';
        await client.query('UPDATE incidents SET status=$2,solution=$3,version=version+1 WHERE id=$1',[id,status,status==='resolved'?reason:null]);
        await client.query('INSERT INTO incident_history(id,incident_id,status,reason,version) VALUES($1,$2,$3,$4,$5)',[randomUUID(),id,status,reason,expectedVersion+1]);
        return 'updated';
      });
    },
    async link(ticketId: string, incidentId: string | null, expectedVersion: number, reason: string) {
      return transaction(async client => {
        // Mismo bloqueo que las transiciones del ticket: cierre y vínculo se serializan.
        const ticket = (await client.query('SELECT status,version FROM tickets WHERE id=$1 FOR UPDATE',[ticketId])).rows[0];
        if (!ticket) return 'not_found';
        if (ticket.status === 'closed' || ticket.version !== expectedVersion) return 'conflict';
        if (incidentId) {
          const incident = (await client.query('SELECT status FROM incidents WHERE id=$1 FOR SHARE',[incidentId])).rows[0];
          if (!incident) return 'not_found';
          if (incident.status !== 'open') return 'conflict';
        }
        const previous = (await client.query('SELECT incident_id FROM ticket_incidents WHERE ticket_id=$1',[ticketId])).rows[0]?.incident_id ?? null;
        if (previous === incidentId) return 'conflict';
        if (incidentId) await client.query('INSERT INTO ticket_incidents(ticket_id,incident_id) VALUES($1,$2) ON CONFLICT(ticket_id) DO UPDATE SET incident_id=EXCLUDED.incident_id',[ticketId,incidentId]);
        else await client.query('DELETE FROM ticket_incidents WHERE ticket_id=$1',[ticketId]);
        await client.query('UPDATE tickets SET version=version+1 WHERE id=$1',[ticketId]);
        await client.query('INSERT INTO ticket_incident_history(id,ticket_id,previous_incident_id,incident_id,reason,version) VALUES($1,$2,$3,$4,$5,$6)',[randomUUID(),ticketId,previous,incidentId,reason,expectedVersion+1]);
        return 'updated';
      });
    },
  };
}
export type IncidentRepository = ReturnType<typeof postgresIncidentRepository>;
