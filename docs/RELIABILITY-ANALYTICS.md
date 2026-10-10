# Confiabilidad y analítica operativa

[Volver al proyecto](../README.md)

## Comprobar disponibilidad

- `GET /health`: 200 cuando el proceso HTTP responde, aunque PostgreSQL falle.
- `GET /ready`: 200 con `{ "status": "ok", "database": "available" }` si puede consultar las tablas y columnas requeridas. Ante un fallo devuelve 503 con valores `unavailable`, sin detalles internos. No se almacena en caché.

El arranque usa la misma comprobación. La conexión espera hasta 5 segundos; la consulta tiene límite de 2 segundos y espera de bloqueos de 1 segundo. No demuestra que todas las operaciones funcionen ni sustituye una prueba de escritura. El dashboard consulta disponibilidad al cargar o actualizar; no es un monitor periódico.

## Crear una copia local

Requisitos: Docker Compose y PostgreSQL del proyecto iniciados, `.env` configurado para esa misma instancia. Los scripts usan `pg_dump` y `pg_restore` de la imagen PostgreSQL 17, sin instalar herramientas adicionales en Windows.

```sh
npm run db:backup
npm run db:verify-backup
```

La primera orden crea en `backups/`:

- Un archivo `.dump` en formato personalizado de PostgreSQL.
- Su manifiesto `.dump.json`, con SHA-256 del archivo y huellas de los datos y esquema públicos.

El archivo y el inventario corresponden a la misma instantánea de PostgreSQL, incluso si entran cambios mientras se genera. Los datos se procesan por lotes para calcular sus huellas. No se incluyen roles globales, `.env` ni archivos del frontend. La restauración omite aplicar propietarios y permisos del origen.

`backups/` está excluida de Git. No se suben copias ni se programan ejecuciones. Los archivos contienen los datos del proyecto y no están cifrados. Una copia en el mismo equipo no protege contra pérdida del disco: para ese caso conserva también los dos archivos en un almacenamiento separado bajo tu control.

## Verificar una restauración

Sin argumentos, `db:verify-backup` elige la copia más reciente por nombre. También admite un nombre exacto dentro de `backups/`:

```sh
npm run db:verify-backup -- support-FECHA-UUID.dump
```

1. Comprueba el SHA-256 frente al manifiesto antes de restaurar.
2. Crea una base nueva con nombre aleatorio `support_restore_test_…`.
3. Restaura en una transacción, sin limpiar ni sobrescribir la base original.
4. Compara todas las filas, columnas, restricciones e índices del esquema `public` con el manifiesto.
5. Elimina únicamente la base de prueba creada por esa ejecución.
6. Escribe `.dump.verified.json` con la fecha de verificación y confirmación de limpieza.

Necesita permiso CREATEDB y espacio para una segunda base. Si falla, termina con código distinto de cero. Un corte brusco del proceso puede dejar la base temporal; el prefijo anterior permite identificarla antes de limpiarla. Las copias no se eliminan automáticamente.

La comparación valida los objetos que utiliza este proyecto, no roles globales ni todos los posibles objetos de futuras extensiones. Restaurar archivos ejecuta instrucciones de base de datos: usa solo copias propias de confianza. El manifiesto detecta corrupción, no acredita el origen si alguien puede modificar ambos archivos.

## Recuperar en una base permanente nueva

La prueba anterior elimina su base temporal. Para una recuperación real, conserva la base original y elige un nombre nuevo. Este ejemplo usa el usuario local `support_app`; sustitúyelo si tu PGUSER es diferente. Sustituye NOMBRE.dump por la copia verificada:

```sh
docker compose cp backups/NOMBRE.dump postgres:/tmp/support-recovery.dump
docker compose exec -T postgres createdb -U support_app support_metrics_recovered
docker compose exec -T postgres pg_restore -U support_app -d support_metrics_recovered --no-owner --no-privileges --exit-on-error --single-transaction /tmp/support-recovery.dump
```

Si `createdb` indica que el nombre ya existe, detente y elige otro; no ejecutes la restauración sobre una base existente. Tras verificar los datos, cambia PGDATABASE en `.env` al nombre recuperado y reinicia la API. Estas instrucciones no se han ejecutado sobre tu base; la restauración temporal sí está probada. Ningún comando elimina el volumen de Docker.

## Definiciones de analítica

`GET /metrics/tickets` conserva los campos anteriores y añade `measuredAt`, `pendingAge` y `firstAttention`. Todas las métricas se calculan en una consulta y con una fila por ticket, para evitar duplicados por historial.

Los filtros de categoría y fechas seleccionan tickets por **creación**. Búsqueda, estado, prioridad y responsable siguen afectando solo la bandeja. La API no acepta esos filtros en métricas. Las duraciones usan segundos naturales, incluidas noches y fines de semana.

### Antigüedad de pendientes: pendingAge

Población: tickets actualmente `open` o `in_progress`. Duración desde creación hasta `measuredAt`, incluyendo todo el tiempo anterior a una reapertura.

- `averageSeconds`: promedio de las edades válidas.
- `oldestSeconds`: mayor edad válida.
- `sampleSize`: pendientes con fecha de creación no futura.
- `excludedCount`: pendientes con creación futura; siguen incluidos en los conteos por estado.
- `buckets`: `under24h` [0,24 h), `from1To3Days` [24,72 h), `from3To7Days` [72,168 h), `atLeast7Days` [168 h,∞).

Sin muestra, promedio y máximo son null; los rangos son cero. La suma de rangos equivale a sampleSize. sampleSize + excludedCount equivale a abiertos + en atención.

### Tiempo hasta primera atención: firstAttention

Duración desde creación hasta el primer evento `in_progress`, sin importar el estado actual. Una reapertura no sustituye el primer inicio ni añade otra observación.

- `averageSeconds` y `sampleSize`: media y cantidad de duraciones válidas, no negativas y con evento no futuro.
- `notStartedCount`: abiertos sin evento de atención y con fecha de creación válida. No se les asigna tiempo cero ni entran en la media.
- `excludedCount`: eventos anteriores a creación o futuros, o ausencia de historial en un ticket que ya no está abierto; también abiertos con creación futura sin inicio.

sampleSize + notStartedCount + excludedCount equivale al total. Sin muestra, el promedio es null. Un promedio bajo no demuestra buena atención si hay muchos tickets que aún no se han empezado; por eso el dashboard muestra ambas cantidades.

## CSV y validación

El CSV añade la antigüedad media y máxima, los cuatro rangos, primera atención, muestras y exclusiones. `consulted_at_utc` procede de measuredAt del servidor. Los valores numéricos se exportan en segundos sin el redondeo visual; null se representa como celda vacía.

`npm test` comprueba HTTP 200/503 y ausencia de información interna. `npm run test:db` contrasta rangos, medias, fechas futuras/negativas, reaperturas, filtros y conjuntos vacíos con datos controlados. La primera atención de 60, 180 y 60 segundos produce 100 segundos. También comprueba la disponibilidad real y una conexión fallida sin detener la base del usuario.

La verificación del respaldo se ejecuta aparte con `npm run db:verify-backup`. GitHub Actions permanece desactivado. Identidad y permisos siguen aplazados.
