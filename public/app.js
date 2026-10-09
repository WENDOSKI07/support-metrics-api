const $ = id => document.getElementById(id);
const statuses = { open: 'Abierto', in_progress: 'En atención', resolved: 'Resuelto' };
const categories = { functionality: 'Funcionamiento', data: 'Datos', usage: 'Uso de la plataforma' };
const date = value => new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
let page = 1, selected = null, current = null, commentPage = 1, listVersion = 0, detailVersion = 0;
let applied = new URLSearchParams();

function notice(message, error = false) {
  $('notice').textContent = message;
  $('notice').className = error ? 'error' : '';
}

async function api(path, method = 'GET', body) {
  const response = await fetch(path, { method, headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body) });
  const data = response.status === 204 ? null : await response.json();
  if (!response.ok) {
    const error = new Error(typeof data.error === 'string' ? data.error : data.error?.message || 'No se pudo completar la solicitud.');
    error.status = response.status;
    throw error;
  }
  return data;
}

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

async function loadList() {
  const version = ++listVersion;
  const params = new URLSearchParams(applied);
  params.set('page', String(page)); params.set('limit', '10');
  $('previous').disabled = true; $('next').disabled = true;
  try {
    const result = await api(`/tickets?${params}`);
    if (version !== listVersion) return;
    $('tickets').replaceChildren();
    if (!result.data.length) $('tickets').append(element('p', 'No hay tickets para esta consulta. Crea una solicitud o cambia los filtros.', 'empty'));
    for (const ticket of result.data) {
      const button = element('button', undefined, 'ticket-row');
      button.type = 'button'; button.dataset.id = ticket.id;
      button.setAttribute('aria-pressed', String(ticket.id === selected));
      const head = element('span', undefined, 'row-head');
      head.append(element('span', statuses[ticket.status], `badge ${ticket.status}`), element('small', categories[ticket.category]));
      button.append(head, element('strong', ticket.title), element('p', ticket.description));
      button.addEventListener('click', () => selectTicket(ticket.id));
      $('tickets').append(button);
    }
    $('page').textContent = `Página ${page}`;
    $('previous').disabled = page <= 1; $('next').disabled = !result.pagination.hasNext;
  } catch (error) {
    if (version === listVersion) {
      $('tickets').replaceChildren(element('p', 'No se pudo cargar la bandeja. Pulsa Actualizar para reintentar.', 'empty'));
      notice(error.message, true);
    }
  }
}

async function loadMetrics() {
  const params = new URLSearchParams();
  for (const key of ['category', 'createdFrom', 'createdBefore']) if (applied.has(key)) params.set(key, applied.get(key));
  const query = params.toString();
  const data = await api(`/metrics/tickets?${params}`);
  const now = new URLSearchParams();
  for (const key of ['category', 'createdFrom', 'createdBefore']) if (applied.has(key)) now.set(key, applied.get(key));
  if (now.toString() !== query) return;
  $('total').textContent = data.total; $('open').textContent = data.byStatus.open;
  $('in-progress').textContent = data.byStatus.in_progress; $('resolved').textContent = data.byStatus.resolved;
  const seconds = data.resolution.averageSeconds;
  $('average').textContent = seconds === null ? 'Sin muestra' : seconds >= 3600 ? `${(seconds / 3600).toFixed(1)} h` : `${(seconds / 60).toFixed(1)} min`;
  $('sample').textContent = `${data.resolution.sampleSize} tickets utilizados · ${data.resolution.excludedCount} excluidos`;
}

async function refresh() {
  await Promise.all([loadList(), loadMetrics().catch(error => {
    for (const id of ['total', 'open', 'in-progress', 'resolved', 'average']) $(id).textContent = '—';
    $('sample').textContent = 'No disponible'; notice(error.message, true);
  })]);
}

function renderComments(comments) {
  for (const comment of comments) {
    const item = element('div', undefined, 'comment');
    item.append(element('small', `Usuario demo · ${date(comment.createdAt)}`), element('p', comment.body));
    $('comments').append(item);
  }
}

async function selectTicket(id, focus = true) {
  selected = id; current = null;
  const version = ++detailVersion;
  $('ticket-detail').hidden = true; $('placeholder').hidden = false;
  $('placeholder').replaceChildren(element('p', 'Cargando conversación…'));
  for (const row of document.querySelectorAll('.ticket-row')) row.setAttribute('aria-pressed', String(row.dataset.id === id));
  try {
    const [ticket, history, comments] = await Promise.all([api(`/tickets/${id}`), api(`/tickets/${id}/history`), api(`/tickets/${id}/comments?limit=20`)]);
    if (version !== detailVersion) return;
    current = ticket; commentPage = 1;
    $('detail-title').textContent = ticket.title; $('detail-description').textContent = ticket.description;
    $('detail-id').textContent = ticket.id; $('detail-category').textContent = categories[ticket.category];
    $('detail-date').textContent = `Creado el ${date(ticket.createdAt)}`;
    $('detail-status').textContent = statuses[ticket.status]; $('detail-status').className = `badge ${ticket.status}`;
    $('transition').hidden = ticket.status === 'resolved'; $('resolved-note').hidden = ticket.status !== 'resolved';
    $('transition-button').textContent = ticket.status === 'open' ? 'Iniciar atención' : 'Registrar solución';
    $('reason-label').textContent = ticket.status === 'open' ? 'Motivo para iniciar la atención' : 'Qué se hizo para solucionar el problema';
    $('reason').value = ''; $('comment-body').value = '';
    $('history').replaceChildren(...history.data.map(event => element('li', `${statuses[event.previousStatus]} → ${statuses[event.status]} · ${date(event.changedAt)}\n${event.reason}`)));
    $('comments').replaceChildren();
    if (!comments.data.length) $('comments').append(element('p', 'Todavía no hay mensajes. Puedes iniciar la conversación.', 'muted'));
    renderComments(comments.data); $('more-comments').hidden = !comments.pagination.hasNext;
    $('ticket-detail').hidden = false; $('placeholder').hidden = true;
    if (focus) $('detail-title').focus({ preventScroll: false });
  } catch (error) {
    if (version === detailVersion) {
      $('placeholder').replaceChildren(element('p', 'No se pudo abrir el ticket. Selecciónalo de nuevo para reintentar.'));
      notice(error.message, true);
    }
  }
}

$('filters').addEventListener('submit', event => {
  event.preventDefault(); applied = new URLSearchParams();
  for (const [key, value] of new FormData(event.target)) if (value.trim()) applied.set(key, value.trim());
  page = 1; notice(''); refresh();
});
$('clear').addEventListener('click', () => { $('filters').reset(); applied = new URLSearchParams(); page = 1; notice(''); refresh(); });
$('refresh').addEventListener('click', () => { notice(''); refresh(); if (selected) selectTicket(selected, false); });
$('previous').addEventListener('click', () => { if (page > 1) { page--; loadList(); } });
$('next').addEventListener('click', () => { page++; loadList(); });
$('new-ticket').addEventListener('click', () => { $('create-error').textContent = ''; $('create-dialog').showModal(); });
$('close-dialog').addEventListener('click', () => $('create-dialog').close());
$('create-form').addEventListener('submit', async event => {
  event.preventDefault(); const button = event.target.querySelector('[type=submit]'); button.disabled = true;
  try {
    const ticket = await api('/tickets', 'POST', Object.fromEntries(new FormData(event.target)));
    $('create-dialog').close(); event.target.reset();
    $('filters').reset(); applied = new URLSearchParams(); page = 1;
    await refresh(); await selectTicket(ticket.id); notice('Ticket registrado. Ya puedes iniciar su seguimiento.');
  } catch (error) { $('create-error').textContent = error.message; }
  finally { button.disabled = false; }
});
$('transition').addEventListener('submit', async event => {
  event.preventDefault(); if (!current) return;
  const ticket = current, button = $('transition-button'); button.disabled = true;
  const reason = $('reason').value;
  try {
    await api(`/tickets/${ticket.id}/status`, 'PATCH', { expectedStatus: ticket.status, status: ticket.status === 'open' ? 'in_progress' : 'resolved', reason });
    if (selected === ticket.id) await selectTicket(ticket.id, false);
    await refresh(); notice('Cambio de estado guardado en el historial.');
  } catch (error) {
    if (error.status === 409 && selected === ticket.id) { await selectTicket(ticket.id, false); $('reason').value = reason; }
    notice(error.message, true);
  } finally { button.disabled = false; }
});
$('comment-form').addEventListener('submit', async event => {
  event.preventDefault(); if (!current) return;
  const id = current.id, button = event.target.querySelector('[type=submit]'); button.disabled = true;
  try {
    await api(`/tickets/${id}/comments`, 'POST', { body: $('comment-body').value });
    if (selected === id) await selectTicket(id, false);
    notice('Comentario guardado. Si hay más de 20 mensajes, usa Cargar más mensajes para ver los siguientes.');
  } catch (error) { notice(error.message, true); }
  finally { button.disabled = false; }
});
$('more-comments').addEventListener('click', async () => {
  const id = selected, version = detailVersion; $('more-comments').disabled = true;
  try {
    const result = await api(`/tickets/${id}/comments?page=${commentPage + 1}&limit=20`);
    if (version !== detailVersion) return;
    commentPage++; renderComments(result.data); $('more-comments').hidden = !result.pagination.hasNext;
  } catch (error) { notice(error.message, true); }
  finally { $('more-comments').disabled = false; }
});
refresh();
