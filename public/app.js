let sessionUser = null;
const isSupport = () => sessionUser?.role === 'support';
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
  const response = await fetch(path, { method, credentials: 'same-origin', headers: { 'X-Requested-With': 'support-metrics', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body) });
  const data = response.status === 204 ? null : await response.json();
  if (response.status === 401) { document.body.classList.add('auth-loading'); location.replace('/login'); }
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

function duration(seconds) {
  if (seconds === null) return 'Sin muestra';
  if (seconds >= 86400) return `${(seconds / 86400).toFixed(1)} días`;
  if (seconds >= 3600) return `${(seconds / 3600).toFixed(1)} h`;
  return `${(seconds / 60).toFixed(1)} min`;
}
async function loadReadiness() {
  try {
    await api('/ready');
    $('database-status').textContent = 'PostgreSQL disponible';
    $('database-status').classList.remove('unavailable');
  } catch {
    $('database-status').textContent = 'PostgreSQL sin verificar · Reintenta con Actualizar';
    $('database-status').classList.add('unavailable');
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
    $('pending-average').textContent = duration(data.pendingAge.averageSeconds);
    $('pending-oldest').textContent = duration(data.pendingAge.oldestSeconds);
    $('pending-sample').textContent = `${data.pendingAge.sampleSize} pendientes utilizados · ${data.pendingAge.excludedCount} excluidos`;
    for (const [id,key] of [['age-under24','under24h'],['age-1to3','from1To3Days'],['age-3to7','from3To7Days'],['age-7plus','atLeast7Days']]) $(id).textContent = data.pendingAge.buckets[key];
    $('attention-average').textContent = duration(data.firstAttention.averageSeconds);
    $('attention-sample').textContent = `${data.firstAttention.sampleSize} tickets utilizados · ${data.firstAttention.excludedCount} excluidos`;
    $('attention-waiting').textContent = `${data.firstAttention.notStartedCount} abiertos sin atención registrada; no entran en el promedio.`;
    $('metrics-measured').textContent = `Consulta: ${date(data.measuredAt)}. Usa Actualizar para renovar los datos.`;
    metricsSnapshot = { data, consultedAt: data.measuredAt };
    $('export-metrics').disabled = false;
  } catch (error) {
    if (version !== metricsVersion) return;
    for (const id of ['total', 'open', 'in-progress', 'resolved', 'closed', 'average','pending-average','pending-oldest','age-under24','age-1to3','age-3to7','age-7plus','attention-average']) $(id).textContent = '—';
    for (const id of ['sample','pending-sample','attention-sample','attention-waiting','metrics-measured']) $(id).textContent = 'No disponible'; notice(error.message, true);
  }
}

async function refresh() {
  await Promise.all([loadList(), ...(isSupport() ? [loadMetrics(), loadReadiness()] : [])]);
}

$('export-metrics').addEventListener('click', () => {
  if (!metricsSnapshot) return;
  const { data, consultedAt } = metricsSnapshot;
  const headers = ['consulted_at_utc', 'date_field', 'time_zone', 'status_basis', 'category',
    'created_from_inclusive', 'created_before_exclusive', 'total', 'open', 'in_progress', 'resolved', 'closed',
    'average_resolution_seconds', 'sample_size', 'excluded_count',
    'pending_average_seconds','pending_oldest_seconds','pending_sample_size','pending_excluded_count',
    'pending_under_24h','pending_1_to_3_days','pending_3_to_7_days','pending_at_least_7_days',
    'first_attention_average_seconds','first_attention_sample_size','first_attention_not_started','first_attention_excluded'];
  const values = [consultedAt, data.scope.dateField, data.scope.timeZone, data.scope.statusBasis,
    data.scope.category, data.scope.createdFrom, data.scope.createdBefore, data.total,
    data.byStatus.open, data.byStatus.in_progress, data.byStatus.resolved, data.byStatus.closed,
    data.resolution.averageSeconds, data.resolution.sampleSize, data.resolution.excludedCount,
    data.pendingAge.averageSeconds,data.pendingAge.oldestSeconds,data.pendingAge.sampleSize,data.pendingAge.excludedCount,
    data.pendingAge.buckets.under24h,data.pendingAge.buckets.from1To3Days,data.pendingAge.buckets.from3To7Days,data.pendingAge.buckets.atLeast7Days,
    data.firstAttention.averageSeconds,data.firstAttention.sampleSize,data.firstAttention.notStartedCount,data.firstAttention.excludedCount];
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
    item.append(element('small', `${comment.authorId === sessionUser?.id ? 'Tú' : 'Participante'} · ${date(comment.createdAt)}`), element('p', comment.body));
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
    const [ticket, history, comments, management, linked, linkHistory] = await Promise.all([api(`/tickets/${id}`), api(`/tickets/${id}/history`), api(`/tickets/${id}/comments?limit=20`), api(`/tickets/${id}/management-history`), isSupport() ? api(`/tickets/${id}/incident`) : { incident: null }, isSupport() ? api(`/tickets/${id}/incident-history`) : { data: [], pagination: { hasNext: false } }]);
    if (version !== detailVersion) return;
    renderTicketIncident(linked.incident, linkHistory, ticket);
    current = ticket; commentPage = 1; historyPage = 1; managementPage = 1;
    $('detail-title').textContent = ticket.title; $('detail-description').textContent = ticket.description;
    $('detail-id').textContent = ticket.id; $('detail-category').textContent = categories[ticket.category];
    $('detail-date').textContent = `Creado el ${date(ticket.createdAt)}`;
    $('detail-status').textContent = statuses[ticket.status]; $('detail-status').className = `badge ${ticket.status}`;
    const closed = ticket.status === 'closed';
    $('transition').hidden = closed || !isSupport(); $('resolved-note').hidden = !closed;
    $('comment-form').hidden = closed; $('management-form').hidden = closed || !isSupport();
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
    await refresh(); if (activeIncident) await openIncident(activeIncident.id,false); notice('Cambio de estado guardado en el historial.');
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


function updateNavigation() {
  const target = ['#overview','#incidents'].includes(location.hash) ? location.hash : '#workspace';
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

// Incidentes y tickets conservan ciclos de atención independientes.
let incidentPage = 1, incidentListVersion = 0, incidentDetailVersion = 0, activeIncident = null;
let incidentTicketsPage = 1, incidentHistoryPage = 1, ticketIncidentPage = 1, linkedIncident = null;
const incidentDrafts = new Map(), linkDrafts = new Map();
let incidentFilters = new URLSearchParams();
$('ticket-incident-reason').addEventListener('input', () => { if (current) linkDrafts.set(current.id, {reason: $('ticket-incident-reason').value, id: $('ticket-incident-id').value, title: $('incident-selection').textContent}); });
$('ticket-incident-id').addEventListener('input', () => { if (current) linkDrafts.set(current.id, {reason: $('ticket-incident-reason').value, id: $('ticket-incident-id').value, title: $('incident-selection').textContent}); });
$('incident-reason').addEventListener('input', () => { if (activeIncident) incidentDrafts.set(activeIncident.id,$('incident-reason').value); });
function incidentNotice(message) { $('incident-notice').textContent = message; }
async function loadIncidents() {
  const version = ++incidentListVersion;
  $('incident-prev').disabled = true; $('incident-next').disabled = true;
  try {
    const params = new URLSearchParams(incidentFilters); params.set('page',String(incidentPage)); params.set('limit','10');
    const result = await api(`/incidents?${params}`);
    if (version !== incidentListVersion) return;
    $('incident-list').replaceChildren();
    for (const incident of result.data) {
      const button = element('button', undefined, 'incident-row');
      button.type='button'; button.dataset.incidentId=incident.id;
      button.setAttribute('aria-pressed',String(activeIncident?.id===incident.id));
      button.append(element('span',incident.status==='open'?'Abierto':'Resuelto',`badge ${incident.status}`),element('strong',incident.title),element('span',incident.description,'incident-excerpt'),element('small',`Creado ${shortDate(incident.createdAt)}`));
      button.addEventListener('click', () => openIncident(incident.id)); $('incident-list').append(button);
    }
    if (!result.data.length) $('incident-list').append(element('p','No hay incidentes en esta página.'));
    $('incident-page').textContent = `Página ${incidentPage}`;
    $('incident-prev').disabled = incidentPage <= 1; $('incident-next').disabled = !result.pagination.hasNext;
  } catch(error) { if (version === incidentListVersion) incidentNotice(error.message); }
}
function renderIncidentTickets(rows) {
  for (const ticket of rows) {
    const button = element('button',`${statuses[ticket.status]} · ${ticket.title}`);
    button.addEventListener('click',()=> { location.hash='workspace'; selectTicket(ticket.id); });
    $('incident-tickets').append(button);
  }
}
function renderIncidentHistory(rows) {
  for (const e of rows) $('incident-history').append(element('li',`${e.status === 'open' ? 'Reapertura' : 'Solución'} · ${date(e.changedAt)}\n${e.reason}`));
}
async function openIncident(id, focus = true) {
  const version = ++incidentDetailVersion; activeIncident = null; $('incident-detail').hidden = true;
  try {
    const [incident, tickets, history, summary] = await Promise.all([api(`/incidents/${id}`),api(`/incidents/${id}/tickets`),api(`/incidents/${id}/history`),api(`/incidents/${id}/summary`)]);
    if (version !== incidentDetailVersion) return;
    for(const row of document.querySelectorAll('.incident-row')) row.setAttribute('aria-pressed',String(row.dataset.incidentId===id));
    activeIncident = incident; incidentTicketsPage = 1; incidentHistoryPage = 1;
    for (const key of ['total','pending','resolved','closed']) $('incident-'+key).textContent = key === 'resolved' || key === 'closed' ? summary.byStatus[key] : summary[key];
    $('incident-impact-note').textContent = `${summary.byStatus.open} abiertos · ${summary.byStatus.in_progress} en atención. Estados actuales de los tickets vinculados; Actualizar incidentes renueva el resumen. Un cierre no confirma satisfacción del solicitante.`;
    $('incident-title').textContent = incident.title; $('incident-description').textContent = incident.description;
    $('incident-id').textContent = incident.id; $('incident-state').textContent = `${incident.status === 'open' ? 'Abierto' : 'Resuelto'} · Versión ${incident.version}`;
    $('incident-solution').textContent = incident.solution ? `Solución común: ${incident.solution}` : 'Pendiente de solución común.';
    $('incident-transition-button').textContent = incident.status === 'open' ? 'Resolver incidente' : 'Reabrir incidente';
    $('incident-reason-label').textContent = incident.status === 'open' ? 'Solución aplicada' : 'Motivo de la reapertura';
    $('incident-reason').value = incidentDrafts.get(id) || '';
    $('use-incident').disabled = incident.status !== 'open';
    $('incident-tickets').replaceChildren(); renderIncidentTickets(tickets.data);
    if (!tickets.data.length) $('incident-tickets').append(element('p','Sin tickets vinculados.'));
    $('incident-history').replaceChildren(); renderIncidentHistory(history.data);
    $('more-incident-tickets').hidden = !tickets.pagination.hasNext; $('more-incident-history').hidden = !history.pagination.hasNext;
    $('incident-detail').hidden = false; if (focus) $('incident-title').focus();
  } catch(error) { if (version === incidentDetailVersion) incidentNotice(error.message); }
}
$('incident-create').addEventListener('submit',async event=> {
  event.preventDefault(); const button=event.target.querySelector('[type=submit]'); button.disabled=true;
  try { const incident=await api('/incidents','POST',Object.fromEntries(new FormData(event.target))); event.target.reset(); $('incident-filters').reset(); incidentFilters=new URLSearchParams(); incidentPage=1; await loadIncidents(); await openIncident(incident.id); incidentNotice('Incidente creado. Ahora puedes vincular tickets.'); }
  catch(error) { incidentNotice(error.message); } finally { button.disabled=false; }
});
$('incident-transition').addEventListener('submit',async event=> {
  event.preventDefault(); if (!activeIncident) return;
  const incident=activeIncident, button=$('incident-transition-button'); button.disabled=true;
  try {
    await api(`/incidents/${incident.id}/status`,'PATCH',{expectedVersion:incident.version,status:incident.status==='open'?'resolved':'open',reason:$('incident-reason').value});
    incidentDrafts.delete(incident.id);
    if (activeIncident?.id === incident.id) await openIncident(incident.id,false);
    await loadIncidents(); if (selected) await selectTicket(selected,false);
    incidentNotice('Incidente actualizado. Cada ticket conserva su estado y debe verificarse individualmente.');
  } catch(error) { if (error.status===409 && activeIncident?.id===incident.id) await openIncident(incident.id,false); incidentNotice(error.message); }
  finally { button.disabled=false; }
});
$('refresh-incidents').addEventListener('click',()=> { loadIncidents(); if (activeIncident) openIncident(activeIncident.id,false); });
$('incident-prev').addEventListener('click',()=> { if (incidentPage>1) { incidentPage--; loadIncidents(); } });
$('incident-next').addEventListener('click',()=> { incidentPage++; loadIncidents(); });
$('use-incident').addEventListener('click',()=> {
  if (!current || current.status==='closed') { incidentNotice('Abre primero un ticket que no esté cerrado.'); return; }
  chooseIncident(activeIncident);
  location.hash='workspace'; $('ticket-incident-reason').focus();
});
function renderLinkHistory(rows) {
  for (const e of rows) $('ticket-incident-history').append(element('li',`${e.previousIncidentId || 'Sin vínculo'} → ${e.incidentId || 'Sin vínculo'} · ${date(e.changedAt)}\n${e.reason}`));
}
function renderTicketIncident(incident, history, ticket) {
  linkedIncident=incident; ticketIncidentPage=1;
  $('ticket-incident-summary').textContent=incident ? `${incident.title} · ${incident.status==='open'?'Abierto':'Resuelto'}${incident.solution ? '\nSolución común: '+incident.solution : ''}` : 'Este ticket no está vinculado a un incidente.';
  $('open-ticket-incident').hidden=!incident;
  $('ticket-incident-form').hidden=ticket.status==='closed';
  $('ticket-incident-id').value=linkDrafts.get(ticket.id)?.id ?? incident?.id ?? '';
  $('ticket-incident-reason').value=linkDrafts.get(ticket.id)?.reason || '';
  $('incident-selection').textContent=linkDrafts.get(ticket.id)?.title ?? incident?.title ?? 'Sin incidente seleccionado';
  $('ticket-incident-history').replaceChildren(); renderLinkHistory(history.data);
  $('more-ticket-incident-history').hidden=!history.pagination.hasNext;
}
$('open-ticket-incident').addEventListener('click',()=> { if (linkedIncident) { location.hash='incidents'; openIncident(linkedIncident.id); } });
$('ticket-incident-form').addEventListener('submit',async event=> {
  event.preventDefault(); if (!current) return;
  const ticket=current, button=event.target.querySelector('[type=submit]'); button.disabled=true;
  try {
    await api(`/tickets/${ticket.id}/incident`,'PATCH',{expectedVersion:ticket.version,incidentId:$('ticket-incident-id').value.trim() || null,reason:$('ticket-incident-reason').value});
    linkDrafts.delete(ticket.id); if (selected===ticket.id) await selectTicket(ticket.id,false);
    if (activeIncident) await openIncident(activeIncident.id,false);
    notice('Vínculo guardado con su motivo en el historial.');
  } catch(error) { if (error.status===409 && selected===ticket.id) await selectTicket(ticket.id,false); notice(error.message,true); }
  finally { button.disabled=false; }
});
for (const kind of ['tickets','history']) $('more-incident-'+kind).addEventListener('click',async()=> {
  if (!activeIncident) return;
  const id=activeIncident.id, version=incidentDetailVersion, button=$('more-incident-'+kind); button.disabled=true;
  const page=(kind==='tickets'?incidentTicketsPage:incidentHistoryPage)+1;
  try { const result=await api(`/incidents/${id}/${kind}?page=${page}`); if(version!==incidentDetailVersion)return;
    if(kind==='tickets'){incidentTicketsPage=page;renderIncidentTickets(result.data);}else{incidentHistoryPage=page;renderIncidentHistory(result.data);}button.hidden=!result.pagination.hasNext;
  } catch(error){incidentNotice(error.message);} finally{button.disabled=false;}
});
$('more-ticket-incident-history').addEventListener('click',async()=> {
  const id=selected, version=detailVersion, button=$('more-ticket-incident-history');button.disabled=true;
  try { const result=await api(`/tickets/${id}/incident-history?page=${ticketIncidentPage+1}`);if(version!==detailVersion)return;
    ticketIncidentPage++;renderLinkHistory(result.data);button.hidden=!result.pagination.hasNext;
  }catch(error){notice(error.message,true);}finally{button.disabled=false;}
});

$('incident-filters').addEventListener('submit',event=> {
  event.preventDefault(); incidentFilters=new URLSearchParams();
  for(const [key,value] of new FormData(event.target)) if(value.trim()) incidentFilters.set(key,value.trim());
  incidentPage=1; loadIncidents();
});
$('clear-incidents').addEventListener('click',()=> { $('incident-filters').reset(); incidentFilters=new URLSearchParams(); incidentPage=1; loadIncidents(); });
let pickerPage=1, pickerQuery='', pickerVersion=0, pickerTicket=null;
function chooseIncident(incident) {
  $('ticket-incident-id').value=incident?.id || '';
  $('incident-selection').textContent=incident?.title || 'Sin incidente seleccionado';
  linkDrafts.set(current.id,{id:incident?.id || '',title:$('incident-selection').textContent,reason:$('ticket-incident-reason').value});
}
async function loadPicker() {
  const version=++pickerVersion;
  $('picker-prev').disabled=true; $('picker-next').disabled=true;
  $('picker-results').replaceChildren(); $('picker-notice').textContent='Buscando…';
  const params=new URLSearchParams({status:'open',page:String(pickerPage),limit:'10'});
  if(pickerQuery)params.set('q',pickerQuery);
  try {
    const result=await api(`/incidents?${params}`);
    if(version!==pickerVersion || !$('incident-picker').open)return;
    $('picker-notice').textContent=result.data.length?'Selecciona un incidente; después guarda el vínculo con un motivo.':'No hay incidentes abiertos para esta búsqueda.';
    for(const incident of result.data) {
      const button=element('button',`${incident.title} · ${shortDate(incident.createdAt)}`);button.type='button';
      button.addEventListener('click',()=> { if(current?.id!==pickerTicket)return; chooseIncident(incident);$('incident-picker').close();$('ticket-incident-reason').focus(); });
      $('picker-results').append(button);
    }
    $('picker-page').textContent=`Página ${pickerPage}`;
    $('picker-prev').disabled=pickerPage<=1; $('picker-next').disabled=!result.pagination.hasNext;
  }catch(error){if(version===pickerVersion)$('picker-notice').textContent=error.message;}
}
$('choose-incident').addEventListener('click',()=> {
  if(!current || current.status==='closed')return;
  pickerTicket=current.id;pickerPage=1;pickerQuery='';$('picker-query').value='';$('incident-picker').showModal();loadPicker();
});
$('unlink-incident').addEventListener('click',()=> {if(current){chooseIncident(null);$('ticket-incident-reason').focus();}});
$('picker-close').addEventListener('click',()=> $('incident-picker').close());
$('incident-picker').addEventListener('close',()=> {pickerVersion++;});
$('picker-search').addEventListener('submit',event=> {event.preventDefault();pickerQuery=$('picker-query').value.trim();pickerPage=1;loadPicker();});
$('picker-prev').addEventListener('click',()=> {if(pickerPage>1){pickerPage--;loadPicker();}});
$('picker-next').addEventListener('click',()=> {pickerPage++;loadPicker();});

async function initializeSession() {
  try {
    sessionUser = (await api('/auth/me')).user;
    $('session-name').textContent = sessionUser.username;
    $('session-role').textContent = isSupport() ? 'Agente de soporte' : 'Solicitante';
    for (const node of document.querySelectorAll('[data-support-only]')) node.hidden = !isSupport();
    $('ticket-incident-form').closest('section').hidden = !isSupport();
    if (!isSupport()) {
      $('database-status').textContent = 'Tu espacio personal';
      document.querySelector('.intro h1').textContent = 'Mis tickets';
      document.querySelector('#workspace .section-heading h2').textContent = 'Mis solicitudes';
      $('assignee-filter').closest('label').hidden = true;
      if (['#incidents','#overview'].includes(location.hash)) location.hash = 'workspace';
    }
    document.body.classList.remove('auth-loading');
    if (isSupport()) await loadAgents();
    await refresh();
    if (isSupport()) await loadIncidents();
  } catch (error) {
    if (error.status !== 401) {
      document.body.classList.remove('auth-loading');
      notice('No se pudo verificar la sesión. Recarga para reintentar.', true);
    }
  }
}
$('logout').addEventListener('click', async () => {
  $('logout').disabled = true;
  try { await api('/auth/logout', 'POST'); drafts.clear(); location.replace('/login'); }
  catch (error) { notice(error.message, true); $('logout').disabled = false; }
});
// Revalidate when restoring a cached tab after logging out elsewhere.
window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
initializeSession();
