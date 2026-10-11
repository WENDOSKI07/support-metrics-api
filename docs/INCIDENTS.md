# Incidentes compartidos

Un incidente representa un problema común; un ticket conserva la solicitud y el seguimiento de una persona.

## Reglas

- Un ticket puede tener cero o un incidente vinculado; un incidente puede reunir muchos tickets.
- Los incidentes tienen estados `open` y `resolved`. Resolver exige una solución; reabrir exige un motivo y conserva la solución anterior en el historial.
- Solo se añaden vínculos a incidentes abiertos. Si el problema continúa después de resolverlo, se puede reabrir el incidente antes de vincular otra solicitud.
- Resolver o reabrir un incidente no modifica estados, comentarios ni métricas de sus tickets. Cada solución individual se comprueba y registra por separado.
- Se permite corregir o quitar un vínculo con motivo. Los tickets cerrados conservan su vínculo en modo lectura.
- No se eliminan tickets ni incidentes mediante la API. Desvincular quita la asociación actual y registra ambos identificadores en el historial.
- Cambiar un vínculo incrementa la versión del ticket; cambiar el estado del incidente incrementa su propia versión. Una versión antigua devuelve `409`.
- Las identidades siguen siendo ficticias. No se incorporan permisos, notificaciones ni detección automática de problemas duplicados.

Ejemplo: 20 solicitudes pueden compartir la misma solución, pero si solo 18 personas recuperaron el servicio, los otros dos tickets continúan su atención. El incidente resuelto sigue visible en todos los tickets vinculados.

## Uso desde el dashboard

1. Abre un ticket en la bandeja.
2. En **Incidentes compartidos**, crea o selecciona el problema común.
3. Pulsa **Usar en el ticket seleccionado**, escribe el motivo y guarda el vínculo.
4. Registra la solución del incidente cuando corresponda; verifica cada ticket antes de resolverlo individualmente.

El detalle del incidente muestra la solución actual, los tickets vinculados y su historial. Los listados e historiales tienen paginación. Los textos se muestran como texto plano.

## API

### Crear y consultar

```http
POST /incidents
Content-Type: application/json

{"title":"Reportes no disponibles","description":"La descarga de reportes falla para varios usuarios ficticios."}
```

Responde `201`, cabecera `Location` y `{id,title,description,status,version,solution,createdAt}`. El estado inicial es `open`, versión `1` y solución `null`. Título: 5–120 caracteres; descripción: 10–5000, tras recortar espacios. Identificador, fecha y estado los asigna el servidor.

| Ruta GET | Resultado |
| --- | --- |
| `/incidents` | Listado del más reciente al más antiguo |
| `/incidents/:id` | Incidente individual |
| `/incidents/:id/tickets` | Tickets vinculados: id, title, status |
| `/incidents/:id/history` | Cambios de estado, motivo, versión y fecha |
| `/tickets/:id/incident` | `{incident: objeto}` o `{incident: null}` |
| `/tickets/:id/incident-history` | Vínculos anteriores y nuevos, motivo, versión y fecha |

Listados e historiales devuelven `{data,pagination:{page,limit,hasNext}}`; admiten únicamente `page` (1–10000) y `limit` (1–100), con valores iniciales 1 y 20. Los historiales se ordenan del más antiguo al más reciente. Fechas ISO UTC. Un registro inexistente devuelve `404`.

### Vincular, cambiar o desvincular

```http
PATCH /tickets/:id/incident
Content-Type: application/json

{"expectedVersion":1,"incidentId":"UUID_DEL_INCIDENTE","reason":"La solicitud describe el mismo fallo de descarga."}
```

Para desvincular, envía `incidentId: null`. Usa la versión actual obtenida con `GET /tickets/:id`. El cambio y su historial se guardan juntos; la versión del ticket aumenta en uno.

### Resolver o reabrir

```http
PATCH /incidents/:id/status
Content-Type: application/json

{"expectedVersion":1,"status":"resolved","reason":"Se corrigió la configuración y se comprobó la descarga."}
```

Para reabrir usa `status: "open"` y la versión actual del incidente. Al resolver, el motivo también se guarda como solución actual. Al reabrir, `solution` vuelve a `null`; la solución anterior permanece en el historial.

Ambos PATCH devuelven `204` al completar, `400` por campos inválidos o adicionales, `404` por registros inexistentes y `409` por versión antigua, valor sin cambios o regla incompatible. Motivos: 10–2000 caracteres. Ante `409`, vuelve a consultar el registro antes de decidir qué cambio aplicar.

## Persistencia y verificación

Aplicar `npm run db:migrate`: 006 crea incidentes, asociaciones e historiales con claves foráneas e índices; 007 exige solución no nula al resolver. Las migraciones conservan tickets existentes.

Las transacciones bloquean el ticket al cambiar su vínculo, usando el mismo bloqueo que su cierre. La lectura bloqueada del incidente impide añadir un vínculo después de que otra transacción lo haya resuelto. Un fallo revierte tanto el cambio como su historial.

`npm run test:db` comprueba conflictos concurrentes, rollback, validación, paginación, cierre, reapertura y estados/métricas independientes. Los respaldos incluyen las nuevas tablas del esquema público.
