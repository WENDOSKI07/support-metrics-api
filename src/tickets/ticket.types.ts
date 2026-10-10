export const ticketCategories = ['functionality', 'data', 'usage'] as const;

export type TicketCategory = (typeof ticketCategories)[number];

/** Datos que el solicitante envía al crear una solicitud. */
export interface CreateTicketInput {
  title: string;
  description: string;
  category: TicketCategory;
}

/** Forma inicial del ticket al crearse; el ciclo de atención se definirá después. */
export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';

export interface TicketFilters {
  priority?: TicketPriority;
  assignee?: string;
  q?: string;
  status?: TicketStatus;
  category?: TicketCategory;
  createdFrom?: string;
  createdBefore?: string;
}

export interface TicketCounts {
  measuredAt: string;
  pendingAge: {
    averageSeconds: number | null; oldestSeconds: number | null; sampleSize: number; excludedCount: number;
    buckets: { under24h: number; from1To3Days: number; from3To7Days: number; atLeast7Days: number };
  };
  firstAttention: { averageSeconds: number | null; sampleSize: number; notStartedCount: number; excludedCount: number };
  total: number;
  byStatus: Record<TicketStatus, number>;
  resolution: { averageSeconds: number | null; sampleSize: number; excludedCount: number };
}

export interface Ticket extends CreateTicketInput {
  id: string;
  requesterId: string;
  status: TicketStatus;
  createdAt: string;
  priority: TicketPriority;
  assigneeId: string | null;
  version: number;
}

export interface CreatedTicket extends Ticket { status: 'open' }

export interface StatusChange {
  expectedVersion: number;
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

export const priorities = ['low', 'normal', 'high', 'urgent'] as const;
export type TicketPriority = typeof priorities[number];
export interface ManagementChange {
  expectedVersion: number;
  kind: 'priority' | 'assignment';
  value: string | null;
  reason: string;
}
export interface ManagementHistory {
  id: string;
  kind: ManagementChange['kind'];
  previousValue: string | null;
  value: string | null;
  reason: string;
  version: number;
  changedAt: string;
}
