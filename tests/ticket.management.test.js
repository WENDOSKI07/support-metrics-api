import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateManagement } from '../dist/tickets/ticket.management.js';
import { validateStatusChange } from '../dist/tickets/ticket.status.js';
import { validateListQuery } from '../dist/tickets/ticket.query.js';

test('gestión: versión, agente, prioridad y motivo válidos; campos extra rechazados', () => {
  const input = { expectedVersion:1,kind:'priority',value:'high',reason:'  Impacto confirmado en el servicio.  ' };
  assert.equal(validateManagement(input).reason,'Impacto confirmado en el servicio.');
  assert.ok(validateManagement({...input,kind:'assignment',value:null}));
  assert.ok(validateManagement({...input,kind:'assignment',value:'demo-agent-2'}));
  for (const invalid of [null,[],{}, {...input,actor:'admin'}, {...input,value:'critical'},
    {...input,kind:'assignment',value:'intruder'}, {...input,reason:'corto'}, {...input,reason:'motivo con \0 nulo'}]) {
    assert.equal(validateManagement(invalid),undefined);
  }
  for (const expectedVersion of [undefined,0,-1,1.5,'1',2147483647]) {
    assert.equal(validateManagement({...input,expectedVersion}),undefined);
    assert.equal(validateStatusChange({expectedVersion,expectedStatus:'open',status:'in_progress',reason:input.reason}),undefined);
  }
  assert.equal(validateListQuery({priority:'urgent',assignee:'unassigned',status:'closed'}).success,true);
  for(const query of [{priority:'critical'},{assignee:'unknown'},{priority:['low','high']}]) assert.equal(validateListQuery(query).success,false);
});
