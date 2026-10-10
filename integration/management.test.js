import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import pg from 'pg';
import { buildApp } from '../dist/app.js';
import { postgresTicketRepository } from '../dist/tickets/ticket.repository.js';

test('prioridad, asignación, reapertura, cierre, conflictos, rollback y paginación', async () => {
  const pool = new pg.Pool({connectionTimeoutMillis:5000});
  const repo = postgresTicketRepository(pool), app = buildApp(repo);
  let id;
  try {
    const created = await app.inject({method:'POST',url:'/tickets',payload:{title:'Gestión de prueba',description:'Datos ficticios para ciclo completo.',category:'data'}});
    assert.equal(created.statusCode,201); id=created.json().id;
    assert.equal(created.json().priority,'normal'); assert.equal(created.json().assigneeId,null); assert.equal(created.json().version,1);
    const get = () => repo.findById(id);
    const reason = 'Cambio documentado para la prueba.';
    const manage = payload => app.inject({method:'PATCH',url:`/tickets/${id}/management`,payload});
    const change = async (kind,value) => manage({expectedVersion:(await get()).version,kind,value,reason});
    assert.equal((await app.inject('/agents')).json().data.length,2);
    assert.equal((await manage({expectedVersion:1,kind:'assignment',value:'intruder',reason})).statusCode,400);
    await assert.rejects(repo.changeManagement(id,{expectedVersion:1,kind:'priority',value:'high',reason:'short'}),{code:'23514'});
    assert.equal((await get()).version,1); assert.equal((await get()).priority,'normal');
    const races = await Promise.all(['high','urgent'].map(value=>manage({expectedVersion:1,kind:'priority',value,reason})));
    assert.deepEqual(races.map(r=>r.statusCode).sort(),[204,409]);
    assert.equal((await repo.managementHistory(id,20,0)).length,1);
    assert.equal((await manage({expectedVersion:1,kind:'priority',value:'low',reason})).statusCode,409);
    for (const agent of ['demo-agent-1','demo-agent-2',null]) assert.equal((await change('assignment',agent)).statusCode,204);
    assert.equal((await change('assignment',null)).statusCode,409);
    for(let i=0;i<22;i++) assert.equal((await change('priority',i%2?'high':'low')).statusCode,204);
    const h1=(await app.inject(`/tickets/${id}/management-history?limit=20`)).json();
    const h2=(await app.inject(`/tickets/${id}/management-history?limit=20&page=2`)).json();
    assert.equal(h1.pagination.hasNext,true); assert.equal(h2.pagination.hasNext,false);
    assert.equal(new Set([...h1.data,...h2.data].map(h=>h.id)).size,26);
    assert.equal((await app.inject('/tickets?priority=high&assignee=unassigned')).json().data.some(t=>t.id===id),true);
    const status = async target => {const ticket=await get(); return app.inject({method:'PATCH',url:`/tickets/${id}/status`,payload:{expectedVersion:ticket.version,expectedStatus:ticket.status,status:target,reason}});};
    assert.equal((await status('in_progress')).statusCode,204);
    const old=await get();
    assert.equal((await status('resolved')).statusCode,204);
    assert.equal((await status('in_progress')).statusCode,204);
    // El estado vuelve a coincidir, pero la versión vieja no puede modificar otro ciclo.
    assert.equal((await app.inject({method:'PATCH',url:`/tickets/${id}/status`,payload:{expectedVersion:old.version,expectedStatus:'in_progress',status:'resolved',reason}})).statusCode,409);
    assert.equal((await status('closed')).statusCode,409);
    assert.equal((await status('resolved')).statusCode,204);
    assert.equal((await status('closed')).statusCode,204);
    assert.equal((await status('in_progress')).statusCode,409);
    assert.equal((await change('priority','urgent')).statusCode,409);
    assert.equal((await app.inject({method:'POST',url:`/tickets/${id}/comments`,payload:{body:'Mensaje posterior al cierre.'}})).statusCode,409);
    const events=(await app.inject(`/tickets/${id}/history?limit=2`)).json();
    assert.equal(events.data.length,2);assert.equal(events.pagination.hasNext,true);
    assert.equal((await repo.history(id,100)).length,5);
    const reopened=(await repo.history(id,100)).filter(e=>e.status==='resolved');
    await pool.query('UPDATE tickets SET created_at=$1 WHERE id=$2',['2200-01-01T00:00:00Z',id]);
    for(const [i,e] of reopened.entries()) await pool.query('UPDATE ticket_history SET changed_at=$1 WHERE id=$2',[`2200-01-01T00:0${i?3:1}:00Z`,e.id]);
    const counts=await repo.counts({createdFrom:'2200-01-01',createdBefore:'2200-01-02'});
    assert.equal(counts.byStatus.closed,1); assert.equal(counts.resolution.averageSeconds,180);assert.equal(counts.resolution.sampleSize,1);
    assert.equal((await app.inject({method:'PATCH',url:`/tickets/${randomUUID()}/management`,payload:{expectedVersion:1,kind:'priority',value:'high',reason}})).statusCode,404);
  } finally {
    if(id) {for(const table of ['ticket_management_history','ticket_history','ticket_comments']) await pool.query(`DELETE FROM ${table} WHERE ticket_id=$1`,[id]);await pool.query('DELETE FROM tickets WHERE id=$1',[id]);}
    await app.close();await pool.end();
  }
});
