import type { Pool } from 'pg';
export interface Identity { id: string; username: string; role: 'support' | 'requester' }
export interface AuthStore {
  credentials(username: string): Promise<(Identity & { passwordHash: string }) | undefined>;
  session(hash: string): Promise<Identity | undefined>;
  createSession(hash: string, userId: string): Promise<void>;
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
    async createSession(hash, userId) {
      await pool.query('DELETE FROM auth_sessions WHERE expires_at<=now()');
      await pool.query(`INSERT INTO auth_sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '8 hours')`, [hash,userId]);
    },
    async revoke(hash) { await pool.query('DELETE FROM auth_sessions WHERE token_hash=$1', [hash]); },
  };
}
