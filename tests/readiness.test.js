import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildApp } from '../dist/app.js';

test('readiness devuelve 200; un fallo de dependencia devuelve 503 sin detalles internos',async t=>{
  let failing=false;
  const app=buildApp({async checkReady(){if(failing)throw new Error('password=secreto host=privado');}});
  t.after(()=>app.close());
  assert.deepEqual((await app.inject('/ready')).json(),{status:'ok',database:'available'});
  failing=true;
  const result=await app.inject('/ready');
  assert.equal(result.statusCode,503);
  assert.equal(result.headers['cache-control'],'no-store');
  assert.deepEqual(result.json(),{status:'unavailable',database:'unavailable'});
  assert.equal((await app.inject('/health')).statusCode,200);
  failing=false;
  assert.equal((await app.inject('/ready')).statusCode,200);
});
