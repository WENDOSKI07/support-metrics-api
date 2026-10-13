import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import pg from 'pg';
import {exportAnalytics,csvCell} from '../scripts/analytics-data.mjs';
test('exportación: una fila por ticket, tiempos conocidos y sin conversaciones',async()=>{
 const client=new pg.Client({connectionTimeoutMillis:5000});const directory=await mkdtemp(join(tmpdir(),'support-analytics-test-'));
 try{
  await client.connect();await client.query('BEGIN');
  await client.query(`CREATE TEMP TABLE tickets(id uuid,created_at timestamptz,status text,category text,priority text,assignee_id text);
    CREATE TEMP TABLE incidents(id uuid,status text);
    CREATE TEMP TABLE ticket_incidents(ticket_id uuid,incident_id uuid);
    CREATE TEMP TABLE ticket_history(ticket_id uuid,previous_status text,status text,changed_at timestamptz);
    INSERT INTO tickets VALUES('00000000-0000-0000-0000-000000000001','2020-01-01','resolved','data','high',NULL);
    INSERT INTO ticket_history VALUES
    ('00000000-0000-0000-0000-000000000001','open','in_progress','2020-01-01 00:01:00Z'),
    ('00000000-0000-0000-0000-000000000001','in_progress','resolved','2020-01-01 00:02:00Z'),
    ('00000000-0000-0000-0000-000000000001','resolved','in_progress','2020-01-01 00:03:00Z'),
    ('00000000-0000-0000-0000-000000000001','in_progress','resolved','2020-01-01 00:04:00Z');`);
  const manifest=await exportAnalytics(client,join(directory,'data'));
  assert.equal(manifest.total,1);assert.equal(manifest.byStatus.resolved,1);
  const csv=await readFile(join(directory,'data','tickets.csv'),'utf8');const lines=csv.trim().split('\r\n');
  assert.equal(lines.length,2);assert.match(lines[1],/"60","240","","1"/);
  assert.equal(csv.includes('description'),false);assert.equal(csv.includes('reason'),false);
  assert.equal(csvCell('=1+1'),'"\'=1+1"');assert.equal(csvCell('a"b'),'"a""b"');
  await client.query('DELETE FROM ticket_history; DELETE FROM tickets');
  const empty=await exportAnalytics(client,join(directory,'empty'));assert.equal(empty.total,0);
  assert.equal((await readFile(join(directory,'empty','tickets.csv'),'utf8')).trim().split('\r\n').length,1);
 }finally{await client.query('ROLLBACK').catch(()=>{});await client.end();await rm(directory,{recursive:true,force:true});}
});
