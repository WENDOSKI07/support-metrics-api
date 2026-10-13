import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import pg from 'pg';
import { hashPassword } from '../dist/auth/password.js';

const [username, role] = process.argv.slice(2);
if (!/^[a-z0-9._-]{3,64}$/.test(username ?? '') || !['support','requester'].includes(role) || !process.stdin.isTTY) {
  console.error('Uso en una terminal: npm run auth:create -- usuario support|requester');
  process.exitCode = 1;
} else {
  // Password input is hidden; it never appears in arguments, shell history or logs.
  const silent = new Writable({ write(_chunk, _encoding, done) { done(); } });
  const input = createInterface({ input: process.stdin, output: silent, terminal: true });
  const client = new pg.Client({ connectionTimeoutMillis: 5000 });
  try {
    process.stdout.write('Contraseña (mínimo 15 caracteres, entrada oculta): ');
    const password = await input.question('');
    process.stdout.write('\nRepite la contraseña: ');
    const repeat = await input.question('');
    process.stdout.write('\n');
    if (password !== repeat) throw new Error('Las contraseñas no coinciden.');
    const hash = await hashPassword(password);
    await client.connect();
    await client.query('INSERT INTO app_users(id,username,password_hash,role) VALUES($1,$2,$3,$4)', [randomUUID(),username,hash,role]);
    console.log('Usuario creado. Ya puedes iniciar sesión en /login.');
  } catch (error) {
    console.error(error.code === '23505' ? 'El usuario ya existe.' : 'No se pudo crear el usuario. Comprueba los datos, la contraseña y PostgreSQL.');
    process.exitCode = 1;
  } finally { input.close(); await client.end(); }
}
