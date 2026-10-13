import { mkdir, open, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const columns = ['ticket_id','created_at_utc','status','category','priority','assignee_id','incident_id','incident_status','first_attention_seconds','resolution_seconds','pending_age_seconds','reopen_count','exported_at_utc'];
export function csvCell(value) {
  let text=value==null?'':value instanceof Date?value.toISOString():String(value);
  if (/^[=+@\-\t\r\n]/.test(text)) text="'"+text;
  return '"'+text.replaceAll('"','""')+'"';
}
// El llamador debe abrir una transacción REPEATABLE READ READ ONLY.
export async function exportAnalytics(client, directory) {
  await mkdir(directory,{recursive:false});
  const exportedAt=(await client.query('SELECT transaction_timestamp() AS time')).rows[0].time.toISOString();
  await client.query(`DECLARE analytics_rows NO SCROLL CURSOR FOR
    SELECT t.id AS ticket_id,t.created_at AS created_at_utc,t.status,t.category,t.priority,
      t.assignee_id,l.incident_id,i.status AS incident_status,
      CASE WHEN h.first_at>=t.created_at AND h.first_at<=transaction_timestamp()
        THEN extract(epoch FROM h.first_at-t.created_at)::float8 END AS first_attention_seconds,
      CASE WHEN t.status IN ('resolved','closed') AND h.resolved_at>=t.created_at
        THEN extract(epoch FROM h.resolved_at-t.created_at)::float8 END AS resolution_seconds,
      CASE WHEN t.status IN ('open','in_progress') AND t.created_at<=transaction_timestamp()
        THEN extract(epoch FROM transaction_timestamp()-t.created_at)::float8 END AS pending_age_seconds,
      h.reopen_count,transaction_timestamp() AS exported_at_utc
    FROM tickets t
    LEFT JOIN ticket_incidents l ON l.ticket_id=t.id
    LEFT JOIN incidents i ON i.id=l.incident_id
    LEFT JOIN LATERAL (
      SELECT min(changed_at) FILTER(WHERE status='in_progress') AS first_at,
        max(changed_at) FILTER(WHERE status='resolved') AS resolved_at,
        count(*) FILTER(WHERE previous_status='resolved' AND status='in_progress')::int AS reopen_count
      FROM ticket_history WHERE ticket_id=t.id
    ) h ON true ORDER BY t.created_at,t.id`);
  const file=await open(join(directory,'tickets.csv'),'wx');
  let total=0; const byStatus={open:0,in_progress:0,resolved:0,closed:0};
  const samples={first_attention_seconds:0,resolution_seconds:0,pending_age_seconds:0};
  try {
    await file.writeFile('\uFEFF'+columns.join(',')+'\r\n');
    while(true) {
      const {rows}=await client.query('FETCH 500 FROM analytics_rows');if(!rows.length)break;
      for(const row of rows){total++;byStatus[row.status]++;for(const key of Object.keys(samples))if(row[key]!==null)samples[key]++;}
      await file.writeFile(rows.map(row=>columns.map(key=>csvCell(row[key])).join(',')).join('\r\n')+'\r\n');
    }
  } finally {await file.close();await client.query('CLOSE analytics_rows');}
  const manifest={format:1,exportedAt,total,byStatus,samples,files:['tickets.csv'],scope:'all_tickets_current_state',timeZone:'UTC'};
  await writeFile(join(directory,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
  return manifest;
}
