import { spawn } from 'node:child_process';
import { createReadStream, createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const root = fileURLToPath(new URL('../', import.meta.url));
export const backupDirectory = fileURLToPath(new URL('../backups/', import.meta.url));
export const quote = value => '"' + value.replaceAll('"', '""') + '"';

export function requireConfig() {
  for (const name of ['PGUSER','PGDATABASE']) if (!process.env[name]) throw new Error(`Falta ${name} en el entorno.`);
}

export async function docker(args, { input, output } = {}) {
  const child = spawn('docker', ['compose','exec','-T','postgres',...args], {
    cwd: root, windowsHide: true, stdio: [input ? 'pipe' : 'ignore','pipe','pipe'],
  });
  let stderr = '';
  child.stderr.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(-8000); });
  const timer = setTimeout(() => child.kill(), 120000);
  const ended = new Promise((resolve,reject) => {
    child.on('error',reject);
    child.on('close',code => code === 0 ? resolve() : reject(new Error(`Herramienta PostgreSQL falló (${code}): ${stderr}`)));
  });
  const streams = [];
  if (input) streams.push(pipeline(createReadStream(input),child.stdin));
  if (output) streams.push(pipeline(child.stdout,createWriteStream(output,{flags:'wx',mode:0o600})));
  else child.stdout.resume();
  try { await Promise.all([ended,...streams]); }
  catch(error) { child.kill(); throw error; }
  finally { clearTimeout(timer); }
}

export async function fileHash(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

// Requiere transacción abierta; lee por lotes y no vuelca los datos en consola.
export async function inventory(client) {
  await client.query("SET LOCAL TIME ZONE 'UTC'");
  const names = (await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename COLLATE \"C\" ")).rows.map(r=>r.tablename);
  if (!names.includes('tickets')) throw new Error('La base no contiene tickets.');
  const tables = [];
  for (const name of names) {
    const hash = createHash('sha256'); let count = 0;
    await client.query(`DECLARE backup_rows NO SCROLL CURSOR FOR SELECT to_jsonb(t)::text AS row FROM public.${quote(name)} t ORDER BY to_jsonb(t)::text COLLATE "C"`);
    try {
      while (true) {
        const { rows } = await client.query('FETCH 500 FROM backup_rows');
        if (!rows.length) break;
        for (const row of rows) { hash.update(row.row + '\n'); count++; }
      }
    } finally { await client.query('CLOSE backup_rows'); }
    tables.push({name,count,sha256:hash.digest('hex')});
  }
  const columns = (await client.query(`SELECT table_name,column_name,data_type,udt_name,is_nullable,column_default
    FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position`)).rows;
  const constraints = (await client.query(`SELECT c.relname AS table_name,con.conname,pg_get_constraintdef(con.oid) AS definition
    FROM pg_constraint con JOIN pg_class c ON con.conrelid=c.oid JOIN pg_namespace n ON c.relnamespace=n.oid
    WHERE n.nspname='public' ORDER BY c.relname,con.conname`)).rows;
  const indexes = (await client.query(`SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY tablename,indexname`)).rows;
  return {tables,columns,constraints,indexes};
}
