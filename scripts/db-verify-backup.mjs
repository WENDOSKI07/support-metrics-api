import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { backupDirectory, docker, fileHash, inventory, quote, requireConfig } from './backup-support.mjs';

requireConfig();
const filenamePattern = /^support-[0-9TZ.-]+-[0-9a-f-]{36}\.dump$/;
const names = (await readdir(backupDirectory)).filter(name=>filenamePattern.test(name)).sort();
const name = process.argv[2] ?? names.at(-1);
if (!name || !filenamePattern.test(name) || process.argv.length > 3) throw new Error('Indica un nombre de respaldo válido de backups/, sin rutas.');
const archive = join(backupDirectory,name);
const manifest = JSON.parse(await readFile(archive+'.json','utf8'));
if (manifest.format !== 1 || manifest.archive !== name || manifest.sha256 !== await fileHash(archive)) throw new Error('El respaldo no coincide con su manifiesto. No se restauró nada.');
// Nunca acepta una base de destino del usuario ni restaura sobre la base del proyecto.
const database = 'support_restore_test_' + randomUUID().replaceAll('-','');
const admin = new pg.Client({connectionTimeoutMillis:5000});
const restored = new pg.Client({database,connectionTimeoutMillis:5000,statement_timeout:60000});
let created = false, verified = false;
try {
  await admin.connect();
  await admin.query(`CREATE DATABASE ${quote(database)} TEMPLATE template0`); created=true;
  await docker(['pg_restore','--username',process.env.PGUSER,'--dbname',database,'--no-owner','--no-privileges','--exit-on-error','--single-transaction'],{input:archive});
  await restored.connect();
  await restored.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const actual = await inventory(restored);
  if (JSON.stringify(actual)!==JSON.stringify(manifest.inventory)) throw new Error('Los datos o el esquema restaurados no coinciden con el respaldo.');
  await restored.query('COMMIT');
  verified=true;
  console.log('Restauración verificada: datos, columnas, restricciones e índices coinciden.');
} catch(error) {
  console.error('Falló la prueba de restauración:',error.message);process.exitCode=1;
} finally {
  await restored.end();
  try {
    if (created) { await admin.query(`DROP DATABASE ${quote(database)}`); console.log('Base temporal de prueba eliminada.'); }
    if (verified) await writeFile(archive+'.verified.json',JSON.stringify({archive:name,sha256:manifest.sha256,verifiedAt:new Date().toISOString(),temporaryDatabaseRemoved:true},null,2)+'\n',{mode:0o600});
  } finally { await admin.end(); }
}
