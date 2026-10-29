import type { Pool } from 'pg';
export interface Identity { id: string; username: string; role: 'support' | 'requester' }
export interface AuthStore {
  credentials(username: string): Promise<(Identity & { passwordHash: string }) | undefined>;
  session(hash: string): Promise<Identity | undefined>;
  createSession(hash: string, userId: string, expectedHash: string): Promise<boolean>;
  changePassword(userId: string, expectedHash: string, newHash: string): Promise<boolean>;
  revoke(hash: string): Promise<void>;
}
export function postgresAuthStore(pool: Pool): AuthStore {
  return {
    async credentials(username) {
      return (await pool.query(`SELECT id,username,role,password_hash AS "passwordHash" FROM app_users WHERE username=$1 AND active`, [username])).rows[0];
    },
    async session(hash) {
      return (await pool.query(`SELECT u.id,u.username,u.role FROM auth_sessions s JOIN app_users u ON u.id=s.user_id
        WHERE s.token_hash=$1 AND s.expires_at>now() AND u.active`, [hash])).rows[0];
    },
    async createSession(hash, userId, expectedHash) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        // Serialize with password changes: a login checked against an old hash cannot survive a reset.
        const user = (await client.query('SELECT password_hash FROM app_users WHERE id=$1 AND active FOR UPDATE', [userId])).rows[0];
        if (!user || user.password_hash !== expectedHash) { await client.query('ROLLBACK'); return false; }
        await client.query('DELETE FROM auth_sessions WHERE expires_at<=now()');
        await client.query(`INSERT INTO auth_sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '8 hours')`, [hash,userId]);
        await client.query('COMMIT'); return true;
      } catch (error) { await client.query('ROLLBACK'); throw error; }
      finally { client.release(); }
    },
    async changePassword(userId, expectedHash, newHash) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await client.query('UPDATE app_users SET password_hash=$3 WHERE id=$1 AND password_hash=$2 AND active RETURNING id', [userId,expectedHash,newHash]);
        if (!result.rowCount) { await client.query('ROLLBACK'); return false; }
        await client.query('DELETE FROM auth_sessions WHERE user_id=$1', [userId]);
        await client.query('COMMIT'); return true;
      } catch (error) { await client.query('ROLLBACK'); throw error; }
      finally { client.release(); }
    },
    async revoke(hash) { await pool.query('DELETE FROM auth_sessions WHERE token_hash=$1', [hash]); },
  };
}
