import { spawn, spawnSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, writeFile, readFile, readdir, mkdtemp, unlink } from 'node:fs/promises';
import { existsSync, createWriteStream } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

if (Number(process.versions.node.split('.')[0]) < 24) throw new Error('Las pruebas E2E requieren Node.js 24.8 o posterior. La aplicación conserva sus requisitos actuales.');
const root = fileURLToPath(new URL('../', import.meta.url));
process.chdir(root);
const output = join(root, '.e2e');
await mkdir(output, { recursive: true });
const runtimePath = join(output, 'runtime.json');
const suffix = randomUUID().slice(0, 8);
const container = `support-metrics-e2e-${suffix}`;
const password = randomBytes(32).toString('base64url');
const env = { ...process.env, PGHOST: '127.0.0.1', PGPORT: '15433', PGUSER: 'e2e', PGDATABASE: 'support_metrics_e2e', PGPASSWORD: password, POSTGRES_PASSWORD: password, E2E_TELEMETRY_DISABLED: '1' };
const sleep = ms => new Promise(done => setTimeout(done, ms));
const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, { cwd: root, env, stdio: 'inherit', ...options });
  if (result.error || result.status !== 0) throw new Error(`No se pudo completar ${command} ${args[0] ?? ''}`);
};
async function waitFor(probe, label) {
  for (let i = 0; i < 60; i++) {
    try { if (await probe()) return; } catch {}
    await sleep(500);
  }
  throw new Error(`Tiempo agotado: ${label}`);
}
let server, browser, startedContainer = false;
const log = createWriteStream(join(output, 'app.log'));
try {
  // Refuse to borrow an existing app or database listener.
  for (const port of [3000, 15433]) {
    const net = await import('node:net');
    await new Promise((done, reject) => {
      const check = net.createServer();
      check.once('error', () => reject(new Error(`Puerto ${port} ocupado. No se modificó el servicio existente.`)));
      check.listen(port, '127.0.0.1', () => check.close(done));
    });
  }
  run(process.execPath, ['node_modules/typescript/bin/tsc']);
  run('docker', ['run', '--detach', '--rm', '--name', container, '--publish', '127.0.0.1:15433:5432', '--memory', '512m', '--cpus', '1', '--env', 'POSTGRES_PASSWORD', '--env', 'POSTGRES_USER=e2e', '--env', 'POSTGRES_DB=support_metrics_e2e', 'postgres:17-alpine'], { stdio: 'pipe' });
  startedContainer = true;
  await waitFor(() => spawnSync('docker', ['exec', container, 'pg_isready', '-U', 'e2e', '-d', 'support_metrics_e2e'], { stdio: 'ignore' }).status === 0, 'PostgreSQL temporal');
  run(process.execPath, ['scripts/migrate.mjs']);
  const { default: pg } = await import('pg');
  const { hashPassword } = await import('../dist/auth/password.js');
  const pool = new pg.Pool({ host: env.PGHOST, port: Number(env.PGPORT), user: env.PGUSER, database: env.PGDATABASE, password });
  try {
    const hash = await hashPassword(password);
    for (const role of ['requester', 'support']) await pool.query('INSERT INTO app_users(id,username,password_hash,role) VALUES($1,$2,$3,$4)', [randomUUID(), `e2e-${role}`, hash, role]);
  } finally { await pool.end(); }
  server = spawn(process.execPath, ['scripts/e2e-server.mjs'], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
  server.stdout.pipe(log, { end: false }); server.stderr.pipe(log, { end: false });
  await waitFor(async () => (await fetch('http://127.0.0.1:3000/health')).ok, 'API local de pruebas');
  let executable = process.env.E2E_BROWSER_PATH;
  if (!executable) {
    const cache = join(homedir(), '.cache', 'puppeteer', 'chrome-headless-shell');
    const versions = await readdir(cache).catch(() => []);
    for (const version of versions.sort((a,b) => b.localeCompare(a, undefined, { numeric: true }))) {
      const candidate = join(cache, version, process.platform === 'win32' ? 'chrome-headless-shell-win64/chrome-headless-shell.exe' : 'chrome-headless-shell-linux64/chrome-headless-shell');
      if (existsSync(candidate)) { executable = candidate; break; }
    }
  }
  if (!executable || !existsSync(executable)) throw new Error('Define E2E_BROWSER_PATH con una instalación de Chromium de pruebas.');
  const profile = await mkdtemp(join(tmpdir(), 'support-metrics-e2e-browser-'));
  browser = spawn(executable, ['--headless=new', '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore' });
  const portFile = join(profile, 'DevToolsActivePort');
  await waitFor(() => existsSync(portFile), 'Chromium aislado');
  const [port] = (await readFile(portFile, 'utf8')).split('\n');
  await writeFile(runtimePath, JSON.stringify({ password, browserEndpoint: `http://127.0.0.1:${port.trim()}` }), { mode: 0o600 });
  const exit = await new Promise((done, reject) => {
    const child = spawn(process.execPath, ['node_modules/e2e/dist/cli/bin.js', 'run', 'e2e/ticket-flow.e2e.ts'], { cwd: root, env, stdio: 'inherit' });
    child.once('error', reject); child.once('exit', code => done(code ?? 1));
  });
  process.exitCode = exit;
} catch (error) {
  console.error(error.message); process.exitCode = 1;
} finally {
  browser?.kill(); server?.kill(); log.end();
  if (startedContainer) spawnSync('docker', ['rm', '--force', container], { stdio: 'ignore' });
  await unlink(runtimePath).catch(() => {});
}
