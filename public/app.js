const $ = id => document.getElementById(id);
const statuses = { open: 'Abierto', in_progress: 'En atención', resolved: 'Resuelto', closed: 'Cerrado' };
const priorityNames = { low: 'Baja', normal: 'Normal', high: 'Alta', urgent: 'Urgente' };
let agents = [], historyPage = 1, managementPage = 1;
const agentName = id => id === null ? 'Sin asignar' : agents.find(a => a.id === id)?.name || id;
const categories = { functionality: 'Funcionamiento', data: 'Datos', usage: 'Uso de la plataforma' };
const date = value => new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
let page = 1, selected = null, current = null, commentPage = 1, listVersion = 0, detailVersion = 0;
let applied = new URLSearchParams();
const drafts = new Map();
let metricsVersion = 0, metricsSnapshot = null;
const shortDate = value => new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value));

function emptyRow(message) {
  const row = element('tr');
  const cell = element('td', message, 'empty'); cell.colSpan = 4;
  row.append(cell); return row;
}

function saveDraft() {
  if (current) drafts.set(current.id, { reason: $('reason').value, body: $('comment-body').value, managementReason: $('management-reason').value });
}

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
    if (!result.data.length) $('tickets').append(emptyRow('No hay tickets para esta consulta. Crea una solicitud o cambia los filtros.'));
    for (const ticket of result.data) {
      const button = element('button', undefined, 'ticket-row');
      button.type = 'button'; button.dataset.id = ticket.id;
      button.setAttribute('aria-pressed', String(ticket.id === selected));
      const row = element('tr', undefined, ticket.id === selected ? 'selected' : undefined);
      const subject = element('td');
      button.append(element('span', `TK-${ticket.id.slice(0, 4)}…${ticket.id.slice(-4)}`, 'ticket-id'), element('span', ticket.title));
      subject.append(button, element('span', ticket.description, 'row-description'), element('span', `${priorityNames[ticket.priority]} · ${agentName(ticket.assigneeId)}`, `row-management priority-${ticket.priority}`));
      const status = element('td'); status.append(element('span', statuses[ticket.status], `badge ${ticket.status}`));
      const created = element('td'); const time = element('time', shortDate(ticket.createdAt));
      time.dateTime = ticket.createdAt; time.title = date(ticket.createdAt); created.append(time);
      row.append(subject, status, element('td', categories[ticket.category]), created);
      button.addEventListener('click', () => selectTicket(ticket.id));
      $('tickets').append(row);
    }
    $('page').textContent = `Página ${page}`;
    $('previous').disabled = page <= 1; $('next').disabled = !result.pagination.hasNext;
  } catch (error) {
    if (version === listVersion) {
      $('tickets').replaceChildren(emptyRow('No se pudo cargar la bandeja. Pulsa Actualizar para reintentar.'));
      notice(error.message, true);
    }
  }
}

async function loadMetrics() {
  const version = ++metricsVersion;
  metricsSnapshot = null; $('export-metrics').disabled = true;
  const params = new URLSearchParams();
  for (const key of ['category', 'createdFrom', 'createdBefore']) if (applied.has(key)) params.set(key, applied.get(key));
  try {
    const data = await api(`/metrics/tickets?${params}`);
    if (version !== metricsVersion) return;
    $('total').textContent = data.total; $('open').textContent = data.byStatus.open;
    $('in-progress').textContent = data.byStatus.in_progress; $('resolved').textContent = data.byStatus.resolved; $('closed').textContent = data.byStatus.closed;
    const seconds = data.resolution.averageSeconds;
    $('average').textContent = seconds === null ? 'Sin muestra' : seconds >= 3600 ? `${(seconds / 3600).toFixed(1)} h` : `${(seconds / 60).toFixed(1)} min`;
    $('sample').textContent = `${data.resolution.sampleSize} tickets utilizados · ${data.resolution.excludedCount} excluidos`;
    metricsSnapshot = { data, consultedAt: new Date().toISOString() };
    $('export-metrics').disabled = false;
  } catch (error) {
    if (version !== metricsVersion) return;
    for (const id of ['total', 'open', 'in-progress', 'resolved', 'closed', 'average']) $(id).textContent = '—';
    $('sample').textContent = 'No disponible'; notice(error.message, true);
  }
}

async function refresh() {
  await Promise.all([loadList(), loadMetrics()]);
}

$('export-metrics').addEventListener('click', () => {
  if (!metricsSnapshot) return;
  const { data, consultedAt } = metricsSnapshot;
  const headers = ['consulted_at_utc', 'date_field', 'time_zone', 'status_basis', 'category',
    'created_from_inclusive', 'created_before_exclusive', 'total', 'open', 'in_progress', 'resolved', 'closed',
    'average_resolution_seconds', 'sample_size', 'excluded_count'];
  const values = [consultedAt, data.scope.dateField, data.scope.timeZone, data.scope.statusBasis,
    data.scope.category, data.scope.createdFrom, data.scope.createdBefore, data.total,
    data.byStatus.open, data.byStatus.in_progress, data.byStatus.resolved, data.byStatus.closed,
    data.resolution.averageSeconds, data.resolution.sampleSize, data.resolution.excludedCount];
  // Comillas CSV y protección frente a fórmulas al abrir texto en una hoja de cálculo.
  const cell = value => {
    let text = value == null ? '' : String(value);
    if (/^[\s]*[=+@-]/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  };
  const csv = '\uFEFF' + [headers, values].map(row => row.map(cell).join(',')).join('\r\n') + '\r\n';
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = element('a'); link.href = url;
  link.download = `support-metrics-${consultedAt.replaceAll(':', '-')}.csv`;
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  notice('Resumen exportado. Incluye categoría y fechas aplicadas; no incluye búsqueda ni estado de la bandeja.');
});

function renderComments(comments) {
  for (const comment of comments) {
    const item = element('div', undefined, 'comment');
    item.append(element('small', `Usuario demo · ${date(comment.createdAt)}`), element('p', comment.body));
    $('comments').append(item);
  }
}

async function selectTicket(id, focus = true) {
  saveDraft();
  selected = id; current = null;
  document.querySelector('.detail').hidden = false;
  $('workspace').classList.add('has-detail');
  const version = ++detailVersion;
  $('ticket-detail').hidden = true; $('placeholder').hidden = false;
  $('placeholder').replaceChildren(element('p', 'Cargando conversación…'));
  for (const row of document.querySelectorAll('.ticket-row')) {
    row.setAttribute('aria-pressed', String(row.dataset.id === id));
    row.closest('tr').classList.toggle('selected', row.dataset.id === id);
  }
  try {
    const [ticket, history, comments, management] = await Promise.all([api(`/tickets/${id}`), api(`/tickets/${id}/history`), api(`/tickets/${id}/comments?limit=20`), api(`/tickets/${id}/management-history`)]);
    if (version !== detailVersion) return;
    current = ticket; commentPage = 1; historyPage = 1; managementPage = 1;
    $('detail-title').textContent = ticket.title; $('detail-description').textContent = ticket.description;
    $('detail-id').textContent = ticket.id; $('detail-category').textContent = categories[ticket.category];
    $('detail-date').textContent = `Creado el ${date(ticket.createdAt)}`;
    $('detail-status').textContent = statuses[ticket.status]; $('detail-status').className = `badge ${ticket.status}`;
    const closed = ticket.status === 'closed';
    $('transition').hidden = closed; $('resolved-note').hidden = !closed;
    $('comment-form').hidden = closed; $('management-form').hidden = closed;
    $('management-summary').textContent = `Prioridad ${priorityNames[ticket.priority]} · ${agentName(ticket.assigneeId)} · Versión ${ticket.version}`;
    $('priority-value').value = ticket.priority; $('assignee-value').value = ticket.assigneeId || '';
    $('next-status-label').hidden = ticket.status !== 'resolved';
    $('next-status').value = 'in_progress';
    updateTransition();
    $('management-history').replaceChildren(); renderManagement(management.data);
    $('more-management').hidden = !management.pagination.hasNext;
    $('more-history').hidden = !history.pagination.hasNext;
    const draft = drafts.get(id);
    $('reason').value = draft?.reason || ''; $('comment-body').value = draft?.body || ''; $('management-reason').value = draft?.managementReason || '';
    $('history').replaceChildren(...history.data.map(event => element('li', `${statuses[event.previousStatus]} → ${statuses[event.status]} · ${date(event.changedAt)}\n${event.reason}`)));
    $('comments').replaceChildren();
    if (!comments.data.length) $('comments').append(element('p', closed ? 'No se registraron mensajes antes del cierre.' : 'Todavía no hay mensajes. Puedes iniciar la conversación.', 'muted'));
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

$('close-detail').addEventListener('click', () => {
  saveDraft();
  const previousId = selected; selected = null; current = null; detailVersion++;
  document.querySelector('.detail').hidden = true;
  $('workspace').classList.remove('has-detail');
  for (const row of document.querySelectorAll('.ticket-row')) {
    row.setAttribute('aria-pressed', 'false'); row.closest('tr').classList.remove('selected');
  }
  const opener = [...document.querySelectorAll('.ticket-row')].find(row => row.dataset.id === previousId);
  (opener || $('workspace')).focus();
});

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
    await api(`/tickets/${ticket.id}/status`, 'PATCH', { expectedVersion: ticket.version, expectedStatus: ticket.status, status: ticket.status === 'resolved' ? $('next-status').value : ticket.status === 'open' ? 'in_progress' : 'resolved', reason });
    if (selected === ticket.id) { $('reason').value = ''; await selectTicket(ticket.id, false); }
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
    if (selected === id) { $('comment-body').value = ''; await selectTicket(id, false); }
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
loadAgents().finally(refresh);

function updateNavigation() {
  const target = location.hash === '#overview' ? '#overview' : '#workspace';
  for (const link of document.querySelectorAll('.sidebar a[href^="#"]')) {
    const active = link.getAttribute('href') === target;
    link.classList.toggle('active', active);
    if (active) link.setAttribute('aria-current', 'location');
    else link.removeAttribute('aria-current');
  }
}
window.addEventListener('hashchange', updateNavigation);
updateNavigation();

async function loadAgents() {
  try {
    agents = (await api('/agents')).data;
    for (const agent of agents) {
      for (const id of ['assignee-value','assignee-filter']) {
        const option = element('option', agent.name); option.value = agent.id; $(id).append(option);
      }
    }
  } catch (error) { notice('No se pudo cargar el catálogo de agentes. Recarga la página para reintentar.', true); }
}
function updateTransition() {
  if (!current) return;
  const reopened = current.status === 'resolved';
  const closing = reopened && $('next-status').value === 'closed';
  $('transition-button').textContent = closing ? 'Cerrar definitivamente' : reopened ? 'Reabrir atención' : current.status === 'open' ? 'Iniciar atención' : 'Registrar solución';
  $('reason-label').textContent = closing ? 'Motivo del cierre definitivo (bloquea cambios y comentarios)' : reopened ? 'Por qué la solución no resolvió el problema' : current.status === 'open' ? 'Motivo para iniciar la atención' : 'Qué se hizo para solucionar el problema';
}
$('next-status').addEventListener('change', updateTransition);
$('management-kind').addEventListener('change', () => {
  $('priority-label').hidden = $('management-kind').value !== 'priority';
  $('assignee-label').hidden = $('management-kind').value !== 'assignment';
});
function renderManagement(events) {
  for (const event of events) {
    const label = event.kind === 'priority' ? priorityNames : null;
    const from = label ? label[event.previousValue] : agentName(event.previousValue);
    const to = label ? label[event.value] : agentName(event.value);
    $('management-history').append(element('li', `${event.kind === 'priority' ? 'Prioridad' : 'Responsable'}: ${from} → ${to} · ${date(event.changedAt)}\n${event.reason}`));
  }
}
$('management-form').addEventListener('submit', async event => {
  event.preventDefault(); if (!current) return;
  const ticket = current, button = event.target.querySelector('[type=submit]'); button.disabled = true;
  const kind = $('management-kind').value;
  const reason = $('management-reason').value;
  try {
    await api(`/tickets/${ticket.id}/management`, 'PATCH', { expectedVersion: ticket.version, kind,
      value: kind === 'priority' ? $('priority-value').value : $('assignee-value').value || null, reason });
    if (selected === ticket.id) { $('management-reason').value = ''; await selectTicket(ticket.id, false); }
    await refresh(); notice('Clasificación guardada con su motivo en el historial.');
  } catch (error) {
    if (error.status === 409 && selected === ticket.id) await selectTicket(ticket.id, false);
    notice(error.message, true);
  } finally { button.disabled = false; }
});
for (const kind of ['history','management']) {
  $(`more-${kind}`).addEventListener('click', async () => {
    const id = selected, version = detailVersion, button = $(`more-${kind}`); button.disabled = true;
    try {
      const page = (kind === 'history' ? historyPage : managementPage) + 1;
      const result = await api(`/tickets/${id}/${kind === 'history' ? 'history' : 'management-history'}?page=${page}`);
      if (version !== detailVersion) return;
      if (kind === 'history') {
        historyPage = page;
        for (const e of result.data) $('history').append(element('li', `${statuses[e.previousStatus]} → ${statuses[e.status]} · ${date(e.changedAt)}\n${e.reason}`));
      } else { managementPage = page; renderManagement(result.data); }
      button.hidden = !result.pagination.hasNext;
    } catch(error) { notice(error.message, true); }
    finally { button.disabled = false; }
  });
}
