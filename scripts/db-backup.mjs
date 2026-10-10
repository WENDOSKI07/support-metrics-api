import { mkdir, rename, writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { backupDirectory, docker, fileHash, inventory, requireConfig } from './backup-support.mjs';

requireConfig();
const client = new pg.Client({connectionTimeoutMillis:5000,statement_timeout:60000});
const name = `support-${new Date().toISOString().replaceAll(':','-')}-${randomUUID()}.dump`;
const target = join(backupDirectory,name), partial = target + '.partial';
let complete = false;
try {
  await mkdir(backupDirectory,{recursive:true});
  await client.connect();
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const snapshot = (await client.query('SELECT pg_export_snapshot() AS snapshot')).rows[0].snapshot;
  const expected = await inventory(client);
  await docker(['pg_dump','--username',process.env.PGUSER,'--dbname',process.env.PGDATABASE,
    '--format=custom','--no-owner','--no-privileges','--snapshot',snapshot],{output:partial});
  await client.query('COMMIT');
  await rename(partial,target);
  const manifest = {format:1,createdAt:new Date().toISOString(),archive:name,sha256:await fileHash(target),inventory:expected};
  await writeFile(target+'.json',JSON.stringify(manifest,null,2)+'\n',{flag:'wx',mode:0o600});
  complete = true;
  console.log(`Respaldo creado: backups/${name}`);
  console.log('Verifica su restauración con: npm run db:verify-backup');
} catch(error) {
  await client.query('ROLLBACK').catch(()=>{});
  console.error('No se completó el respaldo:',error.message); process.exitCode=1;
} finally {
  await client.end();
  await unlink(partial).catch(()=>{});
  if (!complete) await unlink(target).catch(()=>{});
}
