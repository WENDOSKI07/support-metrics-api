import { isStorableText } from './ticket.text.js';

export interface TicketComment {
  id: string;
  ticketId: string;
  authorId: string;
  body: string;
  createdAt: string;
}

export function validateComment(input: unknown): string | undefined {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return undefined;
  const value = input as Record<string, unknown>;
  if (Object.keys(value).length !== 1 || !Object.hasOwn(value, 'body') || typeof value.body !== 'string') return undefined;
  const body = value.body.trim();
  if (!isStorableText(body) || Array.from(body).length < 1 || Array.from(body).length > 5000) return undefined;
  return body;
}
