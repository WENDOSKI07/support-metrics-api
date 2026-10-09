import { randomUUID } from 'node:crypto';
import { type CreatedTicket } from './ticket.types.js';
import { validateCreateTicket } from './ticket.validation.js';

type BuildTicketResult =
  | { success: true; ticket: CreatedTicket }
  | { success: false; error: { field: string; message: string } };

/** Construye un ticket sin guardarlo. El llamador controla requesterId; la demo usa uno fijo. */
export function buildTicket(input: unknown, requesterId: string): BuildTicketResult {
  // Comprueba el contrato interno; no verifica sesiones ni la existencia del usuario.
  if (typeof requesterId !== 'string' || requesterId.trim().length === 0) {
    throw new TypeError('Se requiere un identificador de solicitante válido.');
  }

  const validation = validateCreateTicket(input);
  if (!validation.success) {
    return validation;
  }

  return {
    success: true,
    ticket: {
      ...validation.data,
      id: randomUUID(),
      requesterId,
      status: 'open',
      createdAt: new Date().toISOString(),
    },
  };
}
