import { priorities, type ManagementChange } from './ticket.types.js';
import { isStorableText } from './ticket.text.js';

// Catálogo de demostración; estos identificadores no acreditan identidad ni permisos.
export const demoAgents = [
  { id: 'demo-agent-1', name: 'Agente de soporte 1' },
  { id: 'demo-agent-2', name: 'Agente de soporte 2' },
];
export function validateManagement(input: unknown): ManagementChange | undefined {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return undefined;
  const v = input as Record<string, unknown>;
  if (Object.keys(v).length !== 4 || !['expectedVersion','kind','value','reason'].every(k => Object.hasOwn(v,k))) return undefined;
  if (!Number.isInteger(v.expectedVersion) || Number(v.expectedVersion) < 1 || Number(v.expectedVersion) > 2147483646) return undefined;
  if (typeof v.reason !== 'string') return undefined;
  const reason = v.reason.trim();
  if (!isStorableText(reason) || Array.from(reason).length < 10 || Array.from(reason).length > 2000) return undefined;
  if (v.kind === 'priority') {
    if (!priorities.includes(v.value as typeof priorities[number])) return undefined;
  } else if (v.kind === 'assignment') {
    if (v.value !== null && !demoAgents.some(a => a.id === v.value)) return undefined;
  } else return undefined;
  return { expectedVersion: v.expectedVersion, kind: v.kind, value: v.value, reason } as ManagementChange;
}
