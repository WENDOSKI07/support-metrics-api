# Primer reporte en Power BI

## Qué queremos responder

- ¿Cuántas solicitudes siguen abiertas y con qué prioridad?
- ¿Cuánto tardamos en empezar a atenderlas y resolverlas?
- ¿Qué incidentes concentran más solicitudes?
- ¿Cuántos tickets necesitaron reapertura?

## Generar datos

Con PostgreSQL iniciado y migrado, ejecuta:

```sh
npm run analytics:export
```

La consola muestra una carpeta nueva dentro de `exports/`. Usa solo carpetas completas, sin sufijo `.partial`. Cada ejecución produce una instantánea independiente con `tickets.csv` (UTF-8, coma, encabezados) y `manifest.json` (conteos de control). Los datos quedan excluidos de Git. Un fallo puede dejar una carpeta parcial; no la importes.

La lectura usa una transacción consistente y lotes de 500 filas. No modifica la base. No exporta títulos, descripciones, motivos, conversaciones ni identificadores de solicitantes. Los identificadores de tickets e incidentes permiten relacionar las solicitudes. Esto no convierte los datos de una empresa en datos anónimos.

## Importar en Power BI Desktop

1. Abre Power BI Desktop y selecciona **Obtener datos → Texto/CSV**.
2. Selecciona `tickets.csv` de la carpeta completa más reciente, con codificación UTF-8 y delimitador coma.
3. En **Transformar datos**, llama a la consulta `Tickets`.
4. Mantén identificadores, estados, categorías y prioridades como texto. Convierte los tres campos terminados en `_seconds` a número decimal usando configuración regional inglés (Estados Unidos), y `reopen_count` a entero. Conserva vacíos como null.
5. Convierte `created_at_utc` y `exported_at_utc` a fecha/hora/zona. Crea una columna de fecha de creación en UTC para la gráfica diaria.
6. Pulsa **Cerrar y aplicar**. Comprueba que el número de filas coincida con `total` en `manifest.json`.

Importa una sola instantánea: combinar exportaciones sucesivas duplicaría tickets. Para una exportación nueva, cambia la ruta del paso Origen y actualiza. Esta etapa no incluye actualización automática, publicación en la nube ni un archivo PBIX ya construido.

Guía oficial: [conector Texto/CSV](https://learn.microsoft.com/en-us/power-query/connectors/text-csv).

## Medidas DAX

Crea cada medida por separado. Los ejemplos usan comas; adapta el separador si tu configuración regional lo requiere.

```dax
Total tickets = COUNTROWS(Tickets)

Pendientes = CALCULATE([Total tickets], Tickets[status] IN {"open", "in_progress"})

Primera atención (min) = DIVIDE(AVERAGE(Tickets[first_attention_seconds]), 60)

Resolución (h) = DIVIDE(AVERAGE(Tickets[resolution_seconds]), 3600)

Muestra resolución = COUNT(Tickets[resolution_seconds])

Pendiente más antiguo (h) = DIVIDE(MAX(Tickets[pending_age_seconds]), 3600)

Tickets reabiertos = COUNTROWS(FILTER(Tickets, Tickets[reopen_count] > 0))
```

## Diseño del primer reporte

- Tarjetas: total, pendientes, primera atención y resolución, mostrando la muestra utilizada.
- Barras: tickets por categoría y prioridad.
- Línea: cantidad de tickets por fecha de creación UTC.
- Tabla: incident_id, total y pendientes; excluye incident_id vacío para estudiar problemas compartidos.
- Segmentadores: fecha de creación, categoría, prioridad y estado.

## Diccionario y límites

Una fila representa un ticket en el momento de extracción. Estado, prioridad, responsable y vínculo al incidente son actuales, no históricos. No son usuarios únicos ni un historial diario del backlog.

- `first_attention_seconds`: creación hasta primer evento in_progress; vacío si no existe, es negativo o está en el futuro.
- `resolution_seconds`: creación hasta última resolución, solo para tickets actualmente resolved/closed con duración no negativa. Sigue la definición de la API actual.
- `pending_age_seconds`: creación hasta extracción para open/in_progress con creación no futura. Se congela en la instantánea; no aumenta dentro de Power BI hasta volver a exportar.
- `reopen_count`: transiciones resolved → in_progress de ese ticket.
- `incident_id`, `incident_status`: asociación y estado del incidente al extraer; pueden estar vacíos.
- `assignee_id`: agente ficticio actual o vacío si no está asignado.
- `exported_at_utc`: misma fecha de extracción para todas las filas.

Los promedios ignoran valores vacíos: muestra siempre cuántos tickets aportaron duración. No reemplaces ausencia de atención por cero. Todos los tiempos son naturales, incluyen noches y fines de semana. Resuelto o cerrado no demuestra satisfacción. Filtrar por fecha de creación no equivale a contar resoluciones ocurridas en ese periodo.

Los tickets siguen siendo registros operativos: las personas de soporte investigan, responden y registran soluciones; Power BI ayuda a detectar patrones, no soluciona automáticamente el problema.
