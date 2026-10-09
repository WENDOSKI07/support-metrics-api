import { ticketCategories, type CreateTicketInput } from './ticket.types.js';

type ValidationResult =
  | { success: true; data: CreateTicketInput }
  | { success: false; error: { field: string; message: string } };

function invalid(field: string, message: string): ValidationResult {
  return { success: false, error: { field, message } };
}

/** Valida datos externos y devuelve una copia normalizada sin modificar la entrada. */
export function validateCreateTicket(input: unknown): ValidationResult {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return invalid('body', 'La solicitud debe ser un objeto.');
  }

  const body = input as Record<string, unknown>;
  const allowedFields = ['title', 'description', 'category'];

  for (const field of Object.keys(body)) {
    if (!allowedFields.includes(field)) {
      return invalid(field, 'Este campo no está permitido al crear un ticket.');
    }
  }

  for (const field of allowedFields) {
    if (!Object.hasOwn(body, field)) {
      return invalid(field, 'Este campo es obligatorio.');
    }
  }

  if (typeof body.title !== 'string') {
    return invalid('title', 'El título debe ser texto.');
  }
  if (typeof body.description !== 'string') {
    return invalid('description', 'La descripción debe ser texto.');
  }

  const title = body.title.trim();
  const description = body.description.trim();

  if (Array.from(title).length < 5 || Array.from(title).length > 120) {
    return invalid('title', 'El título debe tener entre 5 y 120 caracteres.');
  }
  if (Array.from(description).length < 10 || Array.from(description).length > 5000) {
    return invalid('description', 'La descripción debe tener entre 10 y 5000 caracteres.');
  }

  const category = ticketCategories.find((value) => value === body.category);
  if (category === undefined) {
    return invalid('category', 'La categoría debe ser functionality, data o usage.');
  }

  return { success: true, data: { title, description, category } };
}
