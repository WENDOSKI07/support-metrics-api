import pg from 'pg';

const examples = [
  { id: 'd0000000-0000-4000-8000-000000000001', title: 'El reporte mensual no se descarga',
    description: 'Al descargar el reporte de septiembre, el indicador llega al final pero no aparece el archivo. Ocurre con el formato Excel.',
    category: 'functionality', status: 'open', offset: 3600000 },
  { id: 'd0000000-0000-4000-8000-000000000002', title: 'Diferencia en el total de ventas',
    description: 'El resumen muestra 24 ventas, pero el listado tiene 23. Se necesita revisar si un registro está duplicado.',
    category: 'data', status: 'in_progress', offset: 7200000 },
  { id: 'd0000000-0000-4000-8000-000000000003', title: 'Cómo consultar reportes de meses anteriores',
    description: 'Necesito consultar el reporte de agosto. No encontraba el filtro para cambiar el periodo.',
    category: 'usage', status: 'resolved', offset: 10800000 },
];
const client = new pg.Client({ connectionTimeoutMillis: 5000 });
let added = 0;
try {
  await client.connect();
  await client.query('BEGIN');
  const now = Date.now();
  for (const [index, item] of examples.entries()) {
    const createdAt = new Date(now - item.offset);
    const result = await client.query(`INSERT INTO tickets (id,title,description,category,requester_id,status,created_at)
      VALUES ($1,$2,$3,$4,'local-demo-user',$5,$6) ON CONFLICT (id) DO NOTHING RETURNING id`,
    [item.id,item.title,item.description,item.category,item.status,createdAt]);
    if (!result.rowCount) continue;
    added++;
    await client.query(`INSERT INTO ticket_comments (id,ticket_id,author_id,body,created_at)
      VALUES ($1,$2,'local-demo-user',$3,$4)`,
    [`d1000000-0000-4000-8000-00000000000${index + 1}`, item.id,
      index === 2 ? 'Gracias, ya encontré el filtro y pude consultar agosto.' : 'Solicitud ficticia de demostración. Estamos recopilando los detalles.',
      new Date(createdAt.getTime() + 1800000)]);
    if (item.status !== 'open') {
      await client.query(`INSERT INTO ticket_history (id,ticket_id,previous_status,status,reason,changed_at)
        VALUES ($1,$2,'open','in_progress','Se inicia la revisión de la solicitud de demostración.',$3)`,
      [`d2000000-0000-4000-8000-00000000000${index + 1}`,item.id,new Date(createdAt.getTime() + 600000)]);
    }
    if (item.status === 'resolved') {
      await client.query(`INSERT INTO ticket_history (id,ticket_id,previous_status,status,reason,changed_at)
        VALUES ('d3000000-0000-4000-8000-000000000003',$1,'in_progress','resolved',
        'Se explicó cómo seleccionar el periodo y se verificó el acceso al reporte.',$2)`,
      [item.id,new Date(createdAt.getTime() + 1200000)]);
    }
  }
  await client.query('COMMIT');
  console.log(`Demo preparada: ${added} tickets añadidos. Los ejemplos existentes se conservaron.`);
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  console.error('No se pudo preparar la demo:', error.message);
  process.exitCode = 1;
} finally { await client.end(); }
