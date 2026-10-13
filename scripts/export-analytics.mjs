import pg from 'pg';
import { mkdir, rename } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { exportAnalytics } from './analytics-data.mjs';
const root=fileURLToPath(new URL('../exports/',import.meta.url));
const name='analytics-'+new Date().toISOString().replaceAll(':','-')+'-'+randomUUID();
const partial=join(root,name+'.partial'), target=join(root,name);
const client=new pg.Client({connectionTimeoutMillis:5000,statement_timeout:60000});
try {
  await mkdir(root,{recursive:true});await client.connect();
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const manifest=await exportAnalytics(client,partial);
  await client.query('COMMIT');await rename(partial,target);
  console.log(`Exportación lista: ${target}`);console.log(`${manifest.total} tickets. Importa tickets.csv en Power BI Desktop.`);
}catch(error){await client.query('ROLLBACK').catch(()=>{});console.error('No se completó la exportación:',error.message);process.exitCode=1;}
finally{await client.end();}
