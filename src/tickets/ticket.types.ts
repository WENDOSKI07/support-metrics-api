export const ticketCategories = ['functionality', 'data', 'usage'] as const;

export type TicketCategory = (typeof ticketCategories)[number];

/** Datos que el solicitante envía al crear una solicitud. */
export interface CreateTicketInput {
  title: string;
  description: string;
  category: TicketCategory;
}

/** Forma inicial del ticket al crearse; el ciclo de atención se definirá después. */
export interface CreatedTicket extends CreateTicketInput {
  id: string;
  requesterId: string;
  status: 'open';
  createdAt: string;
}
