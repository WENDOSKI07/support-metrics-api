export const ticketCategories = ['functionality', 'data', 'usage'] as const;

export type TicketCategory = (typeof ticketCategories)[number];

/** Datos que el solicitante envía al crear una solicitud. */
export interface CreateTicketInput {
  title: string;
  description: string;
  category: TicketCategory;
}

/** Forma inicial del ticket al crearse; el ciclo de atención se definirá después. */
export type TicketStatus = 'open' | 'in_progress' | 'resolved';

export interface Ticket extends CreateTicketInput {
  id: string;
  requesterId: string;
  status: TicketStatus;
  createdAt: string;
}

export interface CreatedTicket extends Ticket { status: 'open' }

export interface StatusChange {
  expectedStatus: TicketStatus;
  status: TicketStatus;
  reason: string;
}

export interface TicketHistory {
  id: string;
  previousStatus: TicketStatus;
  status: TicketStatus;
  reason: string;
  changedAt: string;
}
