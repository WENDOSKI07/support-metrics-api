import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import pg from 'pg';
import { buildApp } from '../dist/app.js';
import { postgresTicketRepository } from '../dist/tickets/ticket.repository.js';

test('antigüedad y primera atención: rangos, fechas inválidas, reapertura, filtros y conjunto vacío',async()=>{
  const client=new pg.Client({connectionTimeoutMillis:5000});await client.connect();
  const app=buildApp(postgresTicketRepository(client));
  try {
    await client.query('BEGIN');
    await client.query('CREATE TEMP TABLE tickets (LIKE public.tickets INCLUDING ALL) ON COMMIT DROP');
    await client.query('CREATE TEMP TABLE ticket_history (LIKE public.ticket_history INCLUDING ALL) ON COMMIT DROP');
    await client.query("SET LOCAL TIME ZONE 'America/Bogota'");
    const base=(await client.query('SELECT now() AS at')).rows[0].at.getTime();
    const fixtures=[['open',3600],['open',86400],['in_progress',259200],['in_progress',604800],['open',-3600],['resolved',7200],['closed',7200],['in_progress',3600]];
    const ids=[];
    for(const [status,age] of fixtures){
      const id=randomUUID();ids.push(id);
      await client.query(`INSERT INTO tickets(id,title,description,category,requester_id,status,created_at)
        VALUES($1,'Prueba de analítica','Registro ficticio controlado.','data','local-demo-user',$2,$3)`,[id,status,new Date(base-age*1000)]);
    }
    for(const [index,seconds] of [[2,60],[3,180],[5,60],[7,-60]]){
      await client.query(`INSERT INTO ticket_history(id,ticket_id,previous_status,status,reason,changed_at)
        VALUES($1,$2,'open','in_progress','Inicio de atención de prueba.',$3)`,[randomUUID(),ids[index],new Date(base-fixtures[index][1]*1000+seconds*1000)]);
    }
    // Segunda atención del mismo ticket: no duplica observaciones ni sustituye la primera.
    await client.query(`INSERT INTO ticket_history(id,ticket_id,previous_status,status,reason,changed_at)
      VALUES($1,$2,'resolved','in_progress','Reapertura de prueba documentada.',$3)`,[randomUUID(),ids[2],new Date(base-30000)]);
    const data=(await app.inject('/metrics/tickets?category=data')).json();
    assert.equal(data.total,8);
    assert.deepEqual(data.pendingAge.buckets,{under24h:2,from1To3Days:1,from3To7Days:1,atLeast7Days:1});
    assert.equal(data.pendingAge.sampleSize,5);assert.equal(data.pendingAge.excludedCount,1);
    const drift=(Date.parse(data.measuredAt)-base)/1000;
    assert.ok(Math.abs(data.pendingAge.oldestSeconds-(604800+drift))<0.01);
    assert.ok(Math.abs(data.pendingAge.averageSeconds-((3600+86400+259200+604800+3600)/5+drift))<0.01);
    assert.deepEqual(data.firstAttention,{averageSeconds:100,sampleSize:3,notStartedCount:2,excludedCount:3});
    assert.equal(data.pendingAge.sampleSize+data.pendingAge.excludedCount,data.byStatus.open+data.byStatus.in_progress);
    assert.equal(data.firstAttention.sampleSize+data.firstAttention.notStartedCount+data.firstAttention.excludedCount,data.total);
    const empty=(await app.inject('/metrics/tickets?category=usage')).json();
    assert.equal(empty.pendingAge.averageSeconds,null);assert.equal(empty.pendingAge.oldestSeconds,null);
    assert.deepEqual(empty.firstAttention,{averageSeconds:null,sampleSize:0,notStartedCount:0,excludedCount:0});
    assert.equal(Object.values(empty.pendingAge.buckets).reduce((a,b)=>a+b,0),0);
    const boundary=new Date(base-86400*1000).toISOString().slice(0,10);
    const filtered=(await app.inject(`/metrics/tickets?createdBefore=${boundary}`)).json();
    assert.ok(filtered.total<data.total);assert.equal(filtered.pendingAge.buckets.under24h,0);
  } finally {await client.query('ROLLBACK');await app.close();await client.end();}
});

test('readiness comprueba PostgreSQL real y falla ante una conexión indisponible',async()=>{
  const pool=new pg.Pool({connectionTimeoutMillis:5000});
  const good=buildApp(postgresTicketRepository(pool));
  // Un puerto inválido evita detener PostgreSQL o afectar al usuario.
  const unavailable=new pg.Pool({host:'127.0.0.1',port:1,connectionTimeoutMillis:300});
  const bad=buildApp(postgresTicketRepository(unavailable));
  try {
    assert.equal((await good.inject('/ready')).statusCode,200);
    assert.equal((await bad.inject('/ready')).statusCode,503);
    assert.equal((await bad.inject('/health')).statusCode,200);
  } finally {await good.close();await bad.close();await pool.end();await unavailable.end();}
});
