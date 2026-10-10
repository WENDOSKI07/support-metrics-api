# Gestión del ticket

[Volver al README](../README.md)

## Reglas de la demo

| Prioridad | Criterio orientativo |
| --- | --- |
| low | Consulta sin bloqueo de trabajo |
| normal | Impacto limitado; valor inicial |
| high | Trabajo bloqueado |
| urgent | Impacto general crítico |

Soporte clasifica con motivo, sin inferir prioridad del texto. No hay SLA ni escalamiento automático. El catálogo `GET /agents` contiene dos agentes ficticios: demo-agent-1 y demo-agent-2. La asignación no acredita identidad ni permisos. Se permite dejar un ticket sin asignar y atenderlo; la responsabilidad no es obligatoria en esta demo.

Ciclo permitido: open → in_progress → resolved. Desde resolved: in_progress (reapertura) o closed (cierre definitivo). Un ticket cerrado se puede consultar, pero no cambiar, reabrir ni comentar. No se elimina información. Si se necesita continuar después de cerrar, se crea otra solicitud; aún no existe vinculación automática.

No hay cierre automático por falta de respuesta. El cierre es una decisión manual con motivo, no prueba de confirmación por el solicitante.

## Concurrencia y datos anteriores

GET /tickets/:id y el listado devuelven priority, assigneeId y version. POST asigna normal, null y 1; no acepta esos campos del cliente. La migración 005 conserva tickets e historiales previos y añade esos valores iniciales. No inventa cambios anteriores.

Todo PATCH requiere expectedVersion, entero positivo obtenido de la última consulta. Un cambio de estado o gestión incrementa version. Comentar no cambia la versión; se bloquea la fila para coordinar con un cierre simultáneo.

## Prioridad o responsable

PATCH /tickets/:id/management

```json
{
  "expectedVersion": 1,
  "kind": "priority",
  "value": "high",
  "reason": "El fallo bloquea la descarga necesaria para trabajar."
}
```

Para asignar: kind `assignment` y value `demo-agent-1`, `demo-agent-2` o null. Una petición cambia una sola propiedad. No admite campos extra. Motivo: 10–2000 puntos de código Unicode, sin NUL ni Unicode malformado.

204: guardado. 400: formato o valor inválido. 404: ticket inexistente. 409: cerrado, versión desactualizada o valor sin cambios. Actualización y evento se guardan en una transacción.

GET /tickets/:id/management-history?page=1&limit=20 devuelve data y pagination. Cada evento contiene kind, previousValue, value, reason, version y changedAt. El orden es fecha ascendente y UUID como desempate.

## Reabrir o cerrar

PATCH /tickets/:id/status

```json
{
  "expectedVersion": 3,
  "expectedStatus": "resolved",
  "status": "in_progress",
  "reason": "La solución anterior no corrigió el fallo reportado."
}
```

Para cerrar desde resolved, usar status `closed`. No reutilizar la versión del ejemplo: consultar el ticket. Ante un 409, revisar el nuevo estado antes de decidir. GET /tickets/:id/history ahora incluye pagination; permite page y limit con los mismos límites que el listado.

## Filtros y métricas

GET /tickets?priority=high&assignee=demo-agent-1&status=in_progress combina clasificación y responsable con filtros existentes. assignee=unassigned busca tickets sin responsable. Valores desconocidos o repetidos devuelven 400. El orden sigue siendo creación descendente; la prioridad no reordena automáticamente.

Las métricas solo admiten categoría y fechas de creación. byStatus incluye closed. El promedio mide creación hasta la última resolución entre tickets actualmente resolved o closed, una observación por ticket. Los reabiertos quedan fuera hasta resolverse otra vez. Cerrar no añade tiempo al promedio. No mide duración por ciclo ni tiempo activo de trabajo. El CSV incluye el conteo closed.

## Comprobación

`npm test` valida contratos y transiciones. `npm run test:db` comprueba asignación, reasignación, liberación, prioridad, rollback, conflictos con igual versión, reapertura, cierre, paginación y métricas con duración conocida. GitHub Actions permanece desactivado.
