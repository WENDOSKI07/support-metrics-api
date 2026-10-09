import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateCreateTicket } from '../dist/tickets/ticket.validation.js';

const validInput = {
  title: 'No puedo generar un reporte',
  description: 'Al pulsar Generar, la plataforma muestra un error.',
  category: 'functionality',
};

test('rechaza NUL y Unicode malformado en ambos textos, conservando emojis válidos', () => {
  for (const field of ['title', 'description']) {
    for (const character of ['\0', '\ud800', '\udfff']) {
      const result = validateCreateTicket({ ...validInput, [field]: `Texto de prueba ${character}` });
      assert.equal(result.success, false);
      assert.equal(result.error.field, field);
    }
    assert.equal(validateCreateTicket({ ...validInput, [field]: 'Texto válido 🐘 中文' }).success, true);
  }
});

test('acepta las categorías iniciales y devuelve los datos esperados', () => {
  for (const category of ['functionality', 'data', 'usage']) {
    const input = { ...validInput, category };
    assert.deepEqual(validateCreateTicket(input), { success: true, data: input });
  }
});

test('recorta espacios exteriores sin modificar el objeto recibido', () => {
  const input = Object.freeze({
    ...validInput,
    title: `  ${validInput.title}  `,
    description: `\n${validInput.description}\n`,
  });
  assert.deepEqual(validateCreateTicket(input), { success: true, data: validInput });
  assert.equal(input.title, `  ${validInput.title}  `);
});

test('rechaza cuerpos que no son objetos de campos', () => {
  for (const body of [null, undefined, [], 'texto', 42, true]) {
    const result = validateCreateTicket(body);
    assert.equal(result.success, false);
    assert.equal(result.error.field, 'body');
  }
});

test('los tres campos son obligatorios', () => {
  for (const field of ['title', 'description', 'category']) {
    const input = { ...validInput };
    delete input[field];
    const result = validateCreateTicket(input);
    assert.equal(result.success, false);
    assert.equal(result.error.field, field);
  }
});

test('rechaza textos vacíos, tipos incorrectos y longitudes fuera del límite', () => {
  for (const [field, min, max] of [['title', 5, 120], ['description', 10, 5000]]) {
    for (const value of ['', ' \n\t ', null, 123, {}, [], 'a'.repeat(min - 1), 'a'.repeat(max + 1)]) {
      const result = validateCreateTicket({ ...validInput, [field]: value });
      assert.equal(result.success, false);
      assert.equal(result.error.field, field);
    }
    for (const length of [min, max]) {
      assert.equal(validateCreateTicket({ ...validInput, [field]: 'a'.repeat(length) }).success, true);
    }
  }
});

test('cuenta puntos de código Unicode al aplicar los límites de texto', () => {
  assert.equal(validateCreateTicket({ ...validInput, title: '😀'.repeat(120) }).success, true);
  assert.equal(validateCreateTicket({ ...validInput, title: '😀'.repeat(121) }).success, false);
});

test('rechaza categorías desconocidas y no las convierte automáticamente', () => {
  for (const category of ['other', '', 'DATA', ' data ', null, 1, []]) {
    const result = validateCreateTicket({ ...validInput, category });
    assert.equal(result.success, false);
    assert.equal(result.error.field, 'category');
  }
});

test('rechaza campos extra, incluidos los que controla el servidor', () => {
  for (const field of ['id', 'requesterId', 'status', 'createdAt', 'unexpected']) {
    const result = validateCreateTicket({ ...validInput, [field]: 'valor arbitrario' });
    assert.equal(result.success, false);
    assert.equal(result.error.field, field);
  }
});
