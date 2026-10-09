import { type StatusChange } from './ticket.types.js';
import { isStorableText } from './ticket.text.js';

export function validateStatusChange(input: unknown): StatusChange | undefined {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return undefined;
  const value = input as Record<string, unknown>;
  if (Object.keys(value).length !== 3 ||
      !Object.hasOwn(value, 'expectedStatus') || !Object.hasOwn(value, 'status') || !Object.hasOwn(value, 'reason')) return undefined;
  const states = ['open', 'in_progress', 'resolved'];
  if (!states.includes(value.expectedStatus as string) || !states.includes(value.status as string) ||
      typeof value.reason !== 'string') return undefined;
  const reason = value.reason.trim();
  if (!isStorableText(reason) || Array.from(reason).length < 10 || Array.from(reason).length > 2000) return undefined;
  return { expectedStatus: value.expectedStatus, status: value.status, reason } as StatusChange;
}

export function canTransition(from: string, to: string): boolean {
  return (from === 'open' && to === 'in_progress') || (from === 'in_progress' && to === 'resolved');
}
