import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import pg from 'pg';
import { buildApp } from '../dist/app.js';
import { postgresTicketRepository } from '../dist/tickets/ticket.repository.js';
import { postgresAuthStore } from '../dist/auth/auth.repository.js';
import { tokenHash } from '../dist/auth/auth.js';
import { hashPassword } from '../dist/auth/password.js';

test('sesiones PostgreSQL, permisos, aislamiento, CSRF, SQL y revocación', async () => {
  const pool=new pg.Pool({connectionTimeoutMillis:5000});
  const app=buildApp(postgresTicketRepository(pool),{},postgresAuthStore(pool));
  const users=[],tickets=[];
  const headers={origin:'http://127.0.0.1:3000','x-requested-with':'support-metrics'};
  const password='Contraseña de prueba ficticia 2026!';
  const hash=await hashPassword(password);
  const call=(cookie,method,url,payload,extra={})=>app.inject({method,url,payload,headers:{...headers,cookie,...extra}});
  try {
    for(const role of ['requester','requester','support']){
      const id=randomUUID(),username='test-'+id;
      await pool.query('INSERT INTO app_users(id,username,password_hash,role) VALUES($1,$2,$3,$4)',[id,username,hash,role]);
      users.push({id,username,role});
    }
    for(const user of users){
      const login=await call('','POST','/auth/login',{username:user.username,password});
      assert.equal(login.statusCode,200);
      user.cookie=login.headers['set-cookie'].split(';')[0];
      assert.match(login.headers['set-cookie'],/HttpOnly/);
      const token=user.cookie.split('=')[1];
      assert.equal((await pool.query('SELECT 1 FROM auth_sessions WHERE token_hash=$1',[token])).rowCount,0);
      assert.equal((await pool.query('SELECT 1 FROM auth_sessions WHERE token_hash=$1',[tokenHash(token)])).rowCount,1);
    }
    const [alice,bob,support]=users;
    assert.equal((await app.inject('/tickets')).statusCode,401);
    assert.equal((await call(alice.cookie,'GET','/auth/me')).json().user.id,alice.id);
    for(const user of [alice,bob]){
      const response=await call(user.cookie,'POST','/tickets',{title:"Consulta ' OR 1=1 --",description:'Texto <script>alert(1)</script> guardado como contenido.',category:'usage'});
      assert.equal(response.statusCode,201); tickets.push(response.json().id);
      assert.equal(response.json().requesterId,user.id);
    }
    assert.equal((await call(alice.cookie,'GET','/tickets')).json().data.length,1);
    assert.equal((await call(alice.cookie,'GET','/tickets')).json().data[0].id,tickets[0]);
    assert.equal((await call(alice.cookie,'GET',`/tickets?requesterId=${bob.id}`)).statusCode,400);
    for(const suffix of ['', '/comments','/history','/management-history']) {
      assert.equal((await call(bob.cookie,'GET',`/tickets/${tickets[0]}${suffix}`)).statusCode,404);
      assert.equal((await call(alice.cookie,'GET',`/tickets/${tickets[0]}${suffix}`)).statusCode,200);
    }
    assert.equal((await call(bob.cookie,'POST',`/tickets/${tickets[0]}/comments`,{body:'No autorizado'})).statusCode,404);
    assert.equal((await call(alice.cookie,'GET','/tickets/------------------------------------')).statusCode,404);
    for(const url of ['/agents','/metrics/tickets','/incidents',`/tickets/${tickets[0]}/incident`]) assert.equal((await call(alice.cookie,'GET',url)).statusCode,403);
    for(const path of ['status','management','incident']) assert.equal((await call(alice.cookie,'PATCH',`/tickets/${tickets[0]}/${path}`,{})).statusCode,403);
    const comment=await call(alice.cookie,'POST',`/tickets/${tickets[0]}/comments`,{body:"Contenido ' ; DROP TABLE tickets; --"});
    assert.equal(comment.statusCode,201); assert.equal(comment.json().authorId,alice.id);
    assert.equal((await call(alice.cookie,'POST',`/tickets/${tickets[0]}/comments`,{body:'Texto válido',authorId:support.id})).statusCode,400);
    assert.equal((await call(alice.cookie,'POST','/tickets',{}, {origin:'https://evil.test'})).statusCode,403);
    assert.equal((await call(support.cookie,'PATCH',`/tickets/${tickets[0]}/status`,{expectedVersion:1,expectedStatus:'open',status:'in_progress',reason:'Atención iniciada por soporte.'})).statusCode,204);
    // Server restart retains the opaque session, but disabling the account takes effect immediately.
    const restarted=buildApp(postgresTicketRepository(pool),{},postgresAuthStore(pool));
    try { assert.equal((await restarted.inject({url:'/auth/me',headers:{cookie:alice.cookie}})).statusCode,200); }
    finally { await restarted.close(); }
    await pool.query('UPDATE app_users SET active=false WHERE id=$1',[bob.id]);
    assert.equal((await call(bob.cookie,'GET','/auth/me')).statusCode,401);
    await pool.query("UPDATE auth_sessions SET expires_at=now()-interval '1 second' WHERE user_id=$1",[support.id]);
    assert.equal((await call(support.cookie,'GET','/auth/me')).statusCode,401);
    assert.equal((await call(alice.cookie,'POST','/auth/logout')).statusCode,204);
    assert.equal((await call(alice.cookie,'GET','/auth/me')).statusCode,401);
    assert.equal((await pool.query('SELECT count(*)::int AS count FROM auth_sessions WHERE user_id=$1',[alice.id])).rows[0].count,0);
  } finally {
    for(const id of tickets){
      await pool.query('DELETE FROM ticket_comments WHERE ticket_id=$1',[id]);
      await pool.query('DELETE FROM ticket_history WHERE ticket_id=$1',[id]);
      await pool.query('DELETE FROM tickets WHERE id=$1',[id]);
    }
    for(const {id} of users) await pool.query('DELETE FROM app_users WHERE id=$1',[id]);
    await app.close(); await pool.end();
  }
});
