import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildApp } from '../dist/app.js';
import { hashPassword, verifyPassword, validPassword } from '../dist/auth/password.js';
const origin = 'http://127.0.0.1:3000';
const headers = { origin, 'x-requested-with': 'support-metrics' };

test('sin configuración de identidad las rutas privadas fallan cerradas', async t => {
  const app = buildApp({}); t.after(() => app.close());
  for (const url of ['/tickets','/metrics/tickets','/agents','/docs','/auth/me']) {
    assert.equal((await app.inject(url)).statusCode,401);
  }
  assert.equal((await app.inject('/login')).statusCode,200);
});
test('contraseñas: sal única, comparación y límites', async () => {
  const password = 'Una frase larga de prueba 2026';
  const first = await hashPassword(password), second = await hashPassword(password);
  assert.notEqual(first,second);
  assert.equal(await verifyPassword(password,first),true);
  assert.equal(await verifyPassword('Otra frase larga incorrecta',first),false);
  assert.equal(await verifyPassword(password),false);
  assert.equal(validPassword('corta'),false);
  assert.equal(validPassword('x'.repeat(257)),false);
});
test('login rechaza CSRF, campos de privilegios, cuerpos grandes y limita intentos', async t => {
  const app = buildApp({}); t.after(() => app.close());
  const payload = { username:'prueba', password:'Una frase larga incorrecta' };
  for (const bad of [{}, {origin:'https://evil.test','x-requested-with':'support-metrics'}, {origin}]) {
    assert.equal((await app.inject({method:'POST',url:'/auth/login',headers:bad,payload})).statusCode,403);
  }
  assert.equal((await app.inject({method:'POST',url:'/auth/login',headers,payload:{...payload,role:'support'}})).statusCode,400);
  assert.equal((await app.inject({method:'POST',url:'/auth/login',headers,payload:{...payload,password:'x'.repeat(3000)}})).statusCode,413);
  for (let i=0;i<10;i++) assert.equal((await app.inject({method:'POST',url:'/auth/login',headers,payload})).statusCode,401);
  assert.equal((await app.inject({method:'POST',url:'/auth/login',headers,payload})).statusCode,429);
});
test('cookie HTTPS segura y rotación de sesión al iniciar sesión', async t => {
  const passwordHash=await hashPassword('Frase segura de prueba 2026');
  const revoked=[],created=[];
  const app=buildApp({}, {}, {
    async credentials(){return {id:'test',username:'test',role:'support',passwordHash};},
    async revoke(hash){revoked.push(hash);}, async createSession(hash){created.push(hash);},
  },'https://support.example');
  t.after(()=>app.close());
  const result=await app.inject({method:'POST',url:'/auth/login',headers:{origin:'https://support.example','x-requested-with':'support-metrics',cookie:`__Host-session=${'a'.repeat(64)}`},payload:{username:'test',password:'Frase segura de prueba 2026'}});
  assert.equal(result.statusCode,200); assert.match(result.headers['set-cookie'],/^__Host-session=/);
  for(const flag of ['HttpOnly','Secure','SameSite=Strict','Path=/','Max-Age=28800']) assert.ok(result.headers['set-cookie'].includes(flag));
  assert.equal(revoked.length,1); assert.equal(created.length,1);
  assert.ok(!result.body.includes(passwordHash));
  assert.ok(!result.headers['set-cookie'].includes(created[0]));
});

test('cambio de contraseña exige sesión, contraseña actual y limita intentos', async t => {
 const passwordHash=await hashPassword('Contraseña actual ficticia 2026');
 let changed=0;
 const app=buildApp({}, {}, {
  async session(){return {id:'requester-test',username:'requester-test',role:'requester'};},
  async credentials(){return {id:'requester-test',username:'requester-test',role:'requester',passwordHash};},
  async changePassword(){changed++; return true;}
 });
 t.after(()=>app.close());
 const change=payload=>app.inject({method:'POST',url:'/auth/password',headers:{...headers,cookie:`session=${'b'.repeat(64)}`},payload});
 const payload={currentPassword:'Contraseña actual ficticia 2026',newPassword:'Contraseña distinta ficticia 2026'};
 assert.equal((await app.inject({method:'POST',url:'/auth/password',headers,payload})).statusCode,401);
 assert.equal((await change({...payload,newPassword:'corta'})).statusCode,400);
 assert.equal((await change({...payload,currentPassword:'Otra contraseña falsa extensa'})).statusCode,400);
 assert.equal(changed,0);
 const response=await change(payload);
 assert.equal(response.statusCode,204); assert.match(response.headers['set-cookie'],/Max-Age=0/);
 assert.equal(changed,1);
 await change({}); await change({});
 assert.equal((await change(payload)).statusCode,429);
});
