import { test } from '@e2e-dev/web';
import { credentials, expect } from 'e2e';

test('solicitante crea ticket y soporte lo atiende, resuelve y conserva el historial', async ({ app, screen, browser }) => {
  const title = 'E2E: no puedo descargar el reporte';
  const attention = 'Se inicia la revisión del reporte en el entorno de prueba.';
  const solution = 'Se corrige el filtro y se verifica la descarga del reporte.';
  const requester = credentials.user('requester');
  const support = credentials.user('support');

  await app.open('/login');
  await screen.getByLabel('Usuario').fill(requester.username);
  await screen.getByLabel('Contraseña').fill(requester.password);
  await screen.getByRole('button', 'Iniciar sesión').tap();
  await expect(screen.getByRole('heading', 'Mis tickets')).toBeVisible();

  await screen.getByRole('button', 'Crear ticket').tap();
  const form = screen.getByRole('dialog', 'Crear ticket');
  await form.getByLabel('Título').fill(title);
  await form.getByLabel('Descripción').fill('Solicitud ficticia E2E: la descarga del reporte no termina.');
  await form.getByRole('button', 'Registrar ticket').tap();
  await expect(browser.locator('#detail-title')).toHaveText(title);
  await expect(browser.locator('#detail-status')).toHaveText('Abierto');
  await expect(screen.getByRole('button', 'Iniciar atención')).not.toBeVisible();

  await screen.getByRole('button', 'Cerrar sesión').tap();
  await screen.getByLabel('Usuario').fill(support.username);
  await screen.getByLabel('Contraseña').fill(support.password);
  await screen.getByRole('button', 'Iniciar sesión').tap();
  await screen.getByRole('button', new RegExp(`${title}$`)).tap();
  await expect(browser.locator('#detail-title')).toHaveText(title);

  await browser.locator('#management-kind').selectOption({ value: 'assignment' });
  await browser.locator('#assignee-value').selectOption({ value: 'demo-agent-1' });
  await browser.locator('#management-reason').fill('Se asigna al agente ficticio para revisar el reporte.');
  await screen.getByRole('button', 'Guardar clasificación').tap();
  await expect(browser.locator('#management-summary')).toContainText('Agente de soporte 1');

  await screen.getByLabel('Motivo para iniciar la atención').fill(attention);
  await screen.getByRole('button', 'Iniciar atención').tap();
  await expect(browser.locator('#detail-status')).toHaveText('En atención');
  await screen.getByLabel('Qué se hizo para solucionar el problema').fill(solution);
  await screen.getByRole('button', 'Registrar solución').tap();
  await expect(browser.locator('#detail-status')).toHaveText('Resuelto');
  await expect(browser.locator('#history')).toContainText(attention);
  await expect(browser.locator('#history')).toContainText(solution);

  await app.open('/');
  await screen.getByRole('button', new RegExp(`${title}$`)).tap();
  await expect(browser.locator('#detail-status')).toHaveText('Resuelto');
  await expect(browser.locator('#history')).toContainText(solution);
  await app.screenshot('ticket-resuelto-con-historial');

  await screen.getByRole('button', 'Cerrar sesión').tap();
  await screen.getByLabel('Usuario').fill(requester.username);
  await screen.getByLabel('Contraseña').fill(requester.password);
  await screen.getByRole('button', 'Iniciar sesión').tap();
  await screen.getByRole('button', new RegExp(`${title}$`)).tap();
  await expect(browser.locator('#detail-status')).toHaveText('Resuelto');
  await expect(browser.locator('#history')).toContainText(solution);
  await expect(screen.getByRole('button', 'Registrar solución')).not.toBeVisible();
});
