import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { buildApp } from '../dist/app.js';
import { postgresTicketRepository } from '../dist/tickets/ticket.repository.js';

test('incidentes: vínculos auditados, concurrencia y ciclos independientes', async () => {
  const pool=new pg.Pool({connectionTimeoutMillis:5000});
  const repo=postgresTicketRepository(pool), app=buildApp(repo);
  const ids=[], incidentIds=[], reason='Motivo ficticio documentado de la prueba.';
  const patch=(url,payload)=>app.inject({method:'PATCH',url,payload});
  try {
    for(let i=0;i<2;i++) {
      const res=await app.inject({method:'POST',url:'/incidents',payload:{title:'Incidente de prueba '+i,description:'Fallo ficticio compartido del reporte.'}});
      assert.equal(res.statusCode,201);incidentIds.push(res.json().id);
    }
    const [a,b]=incidentIds;
    for(let i=0;i<2;i++) {
      const res=await app.inject({method:'POST',url:'/tickets',payload:{title:'Solicitud ficticia '+i,description:'Reporte de la misma falla de prueba.',category:'data'}});
      assert.equal(res.statusCode,201);ids.push(res.json().id);
    }
    const [t,u]=ids;
    const link=(id,incidentId,expectedVersion)=>patch(`/tickets/${id}/incident`,{incidentId,expectedVersion,reason});
    const state=(id,expectedVersion,status)=>patch(`/incidents/${id}/status`,{expectedVersion,status,reason});
    for(const payload of [{title:'corto',description:'corta'}, {title:'Título válido',description:'Descripción suficiente',status:'resolved'}, {title:'Texto\u0000nulo',description:'Descripción suficiente'}]) assert.equal((await app.inject({method:'POST',url:'/incidents',payload})).statusCode,400);
    assert.equal((await state(a,1,['resolved'])).statusCode,400);
    assert.equal((await state(a,0,'resolved')).statusCode,400);
    assert.equal((await app.inject('/incidents?limit=101')).statusCode,400);
    assert.equal((await app.inject('/incidents?status=open')).statusCode,400);
    assert.equal((await app.inject('/incidents?limit=1&limit=2')).statusCode,400);
    assert.equal((await app.inject(`/incidents/${randomUUID()}`)).statusCode,404);
    assert.equal((await link(t,randomUUID(),1)).statusCode,404);
    assert.equal((await repo.findById(t)).version,1);
    await assert.rejects(repo.incidents.link(t,a,1,'short'),{code:'23514'});
    assert.equal(await repo.incidents.linked(t),null); assert.equal((await repo.findById(t)).version,1);
    const races=await Promise.all([link(t,a,1),link(t,b,1)]);
    assert.deepEqual(races.map(r=>r.statusCode).sort(),[204,409]);
    const actual=(await repo.incidents.linked(t)).id;
    assert.equal((await link(t,actual.toUpperCase(),2)).statusCode,409);
    assert.equal((await link(t,null,2)).statusCode,204);
    assert.equal((await link(t,a,3)).statusCode,204);
    assert.equal((await link(u,a,1)).statusCode,204);
    await pool.query("UPDATE tickets SET created_at='2197-01-01T00:00:00Z' WHERE id=ANY($1::uuid[])",[ids]);
    const scope={createdFrom:'2197-01-01',createdBefore:'2197-01-02'};
    const before=await repo.findById(t);
    const countsBefore=await repo.counts(scope);
    assert.equal(countsBefore.total,2);
    assert.equal((await state(a,1,'resolved')).statusCode,204);
    assert.deepEqual(await repo.findById(t),before);
    assert.deepEqual((await repo.counts(scope)).byStatus,countsBefore.byStatus);
    assert.equal((await link(t,b,1)).statusCode,409);
    assert.equal((await link(u,a,2)).statusCode,409);
    assert.equal((await state(a,1,'open')).statusCode,409);
    assert.equal((await state(a,2,'open')).statusCode,204);
    assert.equal((await repo.incidents.find(a)).solution,null);
    const history=(await app.inject(`/incidents/${a}/history?limit=1`)).json();
    assert.equal(history.pagination.hasNext,true);assert.equal(history.data[0].reason,reason);
    assert.equal((await app.inject(`/incidents/${a}/tickets?limit=1`)).json().pagination.hasNext,true);
    assert.equal((await app.inject(`/tickets/${t}/incident-history?limit=1`)).json().pagination.hasNext,true);
    assert.equal((await app.inject(`/tickets/${t}/incident`)).json().incident.id,a);
    assert.equal((await app.inject(`/tickets/${randomUUID()}/incident-history`)).statusCode,404);
    for(const status of ['in_progress','resolved','closed']) {
      const ticket=await repo.findById(t);
      assert.equal((await patch(`/tickets/${t}/status`,{expectedVersion:ticket.version,expectedStatus:ticket.status,status,reason})).statusCode,204);
    }
    const closed=await repo.findById(t);
    assert.equal((await link(t,null,closed.version)).statusCode,409);
    const resolutionRace=await Promise.all([state(a,3,'resolved'),state(a,3,'resolved')]);
    assert.deepEqual(resolutionRace.map(r=>r.statusCode).sort(),[204,409]);
    assert.equal((await repo.findById(t)).status,'closed');
    assert.equal((await repo.findById(u)).status,'open');
    await assert.rejects(pool.query("UPDATE incidents SET solution=NULL WHERE id=$1",[a]),{code:'23514'});
    assert.equal((await repo.incidents.find(a)).solution,reason);
  } finally {
    for(const table of ['ticket_incident_history','ticket_incidents','ticket_management_history','ticket_history','ticket_comments']) await pool.query(`DELETE FROM ${table} WHERE ticket_id=ANY($1::uuid[])`,[ids]);
    await pool.query('DELETE FROM tickets WHERE id=ANY($1::uuid[])',[ids]);
    await pool.query('DELETE FROM incident_history WHERE incident_id=ANY($1::uuid[])',[incidentIds]);
    await pool.query('DELETE FROM incidents WHERE id=ANY($1::uuid[])',[incidentIds]);
    await app.close(); await pool.end();
  }
});
