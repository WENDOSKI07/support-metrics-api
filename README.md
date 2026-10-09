# Support Metrics API

Proyecto de aprendizaje y portafolio: una API para registrar solicitudes de soporte y entender cómo se atienden.

**Estado:** demo local con interfaz web, tickets, comentarios, búsqueda, filtros e historial en PostgreSQL mediante Docker. Incluye conteos por estado y promedio de resolución; autenticación sigue pendiente.

## Problema y usuarios

Un equipo de soporte necesita saber qué solicitudes siguen abiertas y cuánto tarda en resolverlas.

- **Solicitante:** registra una solicitud propia y consulta su seguimiento.
- **Agente de soporte:** atiende las solicitudes que tiene autorizadas y registra su avance.

El objetivo es el soporte de una sola plataforma. Por ahora se aplaza el login para practicar el flujo de tickets localmente con datos ficticios. Todas las solicitudes usan el identificador fijo `local-demo-user`: no representa un usuario autenticado. La demo no tiene control de acceso y no está preparada para publicarse como servicio multiusuario.

## Primera versión propuesta

1. Crear tickets con título, descripción y categoría.
2. Consultarlos por identificador y en una lista paginada.
3. Registrar estados y un historial básico de atención.
4. Filtrar por estado, categoría y fecha de creación.
5. Consultar conteos por estado y tiempo promedio de resolución.

Ejemplo: registrar «No puedo generar un reporte», iniciar su atención y documentar la solución. El historial debe permitir reconstruir lo ocurrido y el resumen debe reflejar su duración.

## Reglas y límites

- Cada solicitante conserva su ticket y su seguimiento individual.
- El acceso por identidad y permisos se implementará en una etapa posterior; aún no está protegido.
- Cerrar un ticket conserva su registro e historial; no equivale a eliminarlo.
- Un cierre sin respuesta no demuestra que el solicitante haya confirmado la solución.
- Se permite `open → in_progress → resolved`. Permisos por acción, confirmación del solicitante y cierre siguen pendientes de definición.
- La demo local admite peticiones sin iniciar sesión. La recuperación de cuentas queda fuera del alcance.

## Ampliaciones previstas

Vincular tickets a incidentes compartidos, analizar fallos recurrentes por servicio y explorar métricas con Power BI. Una solución común deberá conservar el resultado individual de cada solicitud.

La interfaz incluye un resumen de métricas. Notificaciones y automatizaciones se evaluarán en etapas posteriores.

## Desarrollo

### Comprobaciones automáticas

El workflow `.github/workflows/ci.yml` ejecuta las comprobaciones en GitHub Actions al recibir un push o pull request; también permite ejecución manual. Instala las dependencias del lockfile, compila TypeScript y ejecuta las pruebas aisladas y de integración.

Cada ejecución usa PostgreSQL 17 temporal con credenciales exclusivas de prueba. Aplica las migraciones desde cero y las repite para comprobar que no se vuelvan a aplicar. No usa el `.env` local, no despliega la API y solo dispone de permiso de lectura del repositorio. Las acciones están fijadas a commits concretos.

El resultado aparece en la pestaña **Actions** y en los checks del pull request después de publicar el workflow. Para impedir merges cuando falle, hay que configurar aparte una regla de protección de rama que exija `Build and test`.

El proyecto se construirá de forma incremental: API básica, persistencia de tickets, seguimiento de estados y métricas de resolución.

### Estructura inicial

```text
support-metrics-api/
├── src/         Código de la API
├── tests/       Pruebas del comportamiento
├── docs/        Documentación técnica
├── .gitignore  Exclusiones de Git
└── README.md   Presentación y alcance
```

### Ejecutar localmente

Requisitos: Node.js 20.20.0 o superior, npm y Docker Desktop iniciado con contenedores Linux. La API usa Fastify 5 y TypeScript 5. `tsx` reinicia el servidor al editar TypeScript.

En la primera instalación, copiar `.env.example` a `.env` y sustituir `PGPASSWORD` por una contraseña local propia. Si ya existe `.env`, conservarlo. Git ignora ese archivo.

```sh
npm ci
npm run db:up
npm run db:migrate
npm run dev
```

Abrir `http://127.0.0.1:3000/health`. Responde con código HTTP 200 y:

```json
{ "status": "ok" }
```

Esta ruta pública solo comprueba que la API responde; todavía no comprueba una base de datos. El servidor escucha únicamente en la interfaz local. Para detenerlo, usar Ctrl+C.

### Interfaz, guía y datos de ejemplo

Con el servidor iniciado, abrir:

- [Panel de soporte](http://127.0.0.1:3000/): crear tickets, buscar, filtrar, comentar y registrar su atención y resolución.
- [Guía de la API](http://127.0.0.1:3000/docs): rutas, ejemplos, respuestas y reglas del flujo.

El panel se adapta a pantallas móviles. Las métricas responden a categoría y fechas; búsqueda y estado filtran solamente la lista de tickets. Las fechas de los filtros se interpretan en UTC.

Para cargar tres tickets ficticios en distintos estados, después de aplicar las migraciones:

```sh
npm run db:seed
```

La carga usa identificadores fijos: repetirla no duplica los ejemplos ni sobrescribe sus cambios. Conserva los tickets existentes.

Para ejecutar un recorrido completo desde PowerShell, con la API iniciada:

```powershell
./docs/demo.ps1
```

Cada ejecución crea un ticket ficticio, añade un comentario, registra atención y resolución y consulta historial y métricas. Ese ticket se conserva para inspeccionarlo desde el panel.

`public/` contiene HTML, CSS y JavaScript de la interfaz; `src/routes/web.routes.ts` sirve únicamente los archivos permitidos. La interfaz utiliza las mismas rutas de la API y presenta los comentarios como texto plano. No añade dependencias de frontend.

### Rutas de salud e información

| Método | Ruta | Respuesta |
| --- | --- | --- |
| GET | `/health` | Estado `ok` |
| GET | `/info` | Nombre y versión del proyecto |
| GET | `/info/health` | Nombre, versión y estado `ok` |

Las tres rutas son públicas y responden con HTTP 200 y JSON. Las rutas de información forman parte del ejercicio inicial; el estado no representa una comprobación de servicios externos.

### Probar tickets desde PowerShell

Con `npm run dev` activo, ejecutar en otra terminal:

```powershell
$body = @{
  title = 'No puedo generar un reporte'
  description = 'Al pulsar Generar aparece un error y no se descarga.'
  category = 'functionality'
} | ConvertTo-Json

$ticket = Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:3000/tickets' -ContentType 'application/json' -Body $body
$ticket
Invoke-RestMethod -Uri "http://127.0.0.1:3000/tickets/$($ticket.id)"
```

`POST /tickets` devuelve 201 y la cabecera `Location` con la dirección del ticket. Una entrada inválida devuelve 400. `GET /tickets/:id` devuelve 200 si existe o 404 si no existe.

### Listar tickets

`GET /tickets?page=1&limit=20` devuelve `{ data: [...], pagination: { page: 1, limit: 20, hasNext: false } }`.

- `page`: entero entre 1 y 10000, por defecto 1.
- `limit`: entero entre 1 y 100, por defecto 20.
- Orden: fecha de creación descendente, con UUID descendente como desempate.
- Una página sin resultados devuelve 200 y `data: []`. `hasNext` indica si quedan resultados.
- Parámetros desconocidos, repetidos o inválidos devuelven 400.

La paginación usa desplazamiento (`OFFSET`); altas nuevas pueden mover los resultados entre páginas. No ofrece una instantánea de todo el recorrido. Si aumenta el volumen o se necesita recorrer datos mientras llegan nuevos tickets, se evaluará paginación por cursor. Esta ruta sigue siendo parte de la demo local sin control de acceso.

La migración `002_ticket_listing_index.sql` añade un índice acorde con el orden de consulta. Ejecutar `npm run db:migrate` al actualizar el proyecto.

Los tickets se conservan al reiniciar la API. PostgreSQL escucha en `127.0.0.1:15432` y la API en `127.0.0.1:3000`. La API comprueba al arrancar que puede consultar la tabla; si falta la base de datos o la migración, no inicia la escucha.

### Base de datos

- `compose.yaml` inicia PostgreSQL 17 y guarda sus datos en un volumen de Docker.
- `migrations/001_create_tickets.sql` crea la tabla con UUID único, campos obligatorios y categorías válidas. La migración 003 añade estados e historial.
- `npm run db:migrate` aplica las migraciones pendientes en una transacción y registra cuáles se ejecutaron. Puede repetirse sin duplicar la tabla. Las migraciones aplicadas se conservan; los cambios futuros van en otro archivo SQL.
- `npm run db:down` detiene y retira el contenedor conservando el volumen. `npm run db:up` vuelve a iniciarlo con los datos existentes. `docker compose down -v` eliminaría el volumen y sus datos.
- Cambiar `PGPASSWORD` en `.env` no cambia la contraseña de una base ya inicializada. La configuración inicial se usa cuando el volumen está vacío.

El usuario de base de datos es el administrador local creado por la imagen de PostgreSQL para este ejercicio. Antes de un despliegue se separarán los permisos de migración y los de la aplicación.

Para consultar registros desde PowerShell:

```powershell
docker compose exec postgres psql -U support_app -d support_metrics -c "SELECT id, title, category, status, created_at FROM tickets ORDER BY created_at DESC LIMIT 10;"
```

### Verificar y compilar

```sh
npm test
npm run test:db
npm run build
npm start
```

`npm test` comprueba validaciones y contrato HTTP con almacenamiento de prueba en memoria. `npm run test:db` requiere PostgreSQL iniciado y migrado: crea un ticket ficticio, cierra y reconstruye la aplicación y sus conexiones, recupera el ticket y comprueba restricciones SQL. Al terminar elimina únicamente ese registro de prueba.

`npm run build` genera JavaScript en `dist/`, y `npm start` ejecuta esa compilación. Detener el servidor de desarrollo antes de iniciar el compilado para liberar el puerto 3000.

El archivo `package-lock.json` fija las versiones instaladas. Las dependencias y `dist/` están excluidos de Git.

### Cambiar el estado y consultar el historial

Ejecutar `npm run db:migrate` para aplicar la migración 003. El flujo permitido es `open → in_progress → resolved`. No se permiten saltos, retrocesos ni repetir un estado.

`PATCH /tickets/:id/status` recibe exactamente `expectedStatus`, `status` y `reason`. El motivo es obligatorio, de 10 a 2000 caracteres después de quitar espacios exteriores. Al resolver debe describir la solución; el sistema comprueba el formato, no que el problema haya quedado efectivamente solucionado.

```powershell
# Usar el identificador de un ticket abierto creado previamente.
$ticketId = $ticket.id
$change = @{
  expectedStatus = 'open'
  status = 'in_progress'
  reason = 'Se inicia la revisión del problema reportado.'
} | ConvertTo-Json
Invoke-RestMethod -Method Patch -Uri "http://127.0.0.1:3000/tickets/$ticketId/status" -ContentType 'application/json' -Body $change
Invoke-RestMethod -Uri "http://127.0.0.1:3000/tickets/$ticketId/history"
```

Respuesta: 204 sin cuerpo cuando se guarda, 400 para formato inválido, 404 si no existe y 409 para transición no permitida o estado desactualizado. Para resolver, enviar `expectedStatus: in_progress`, `status: resolved` y la explicación de la solución en `reason`.

El repositorio bloquea la fila durante la transacción, verifica el estado esperado y guarda estado e historial juntos. Un fallo revierte ambos cambios. La comparación del estado es suficiente para este flujo sin retrocesos; si se añaden reaperturas deberá revisarse el control de concurrencia.

`GET /tickets/:id/history` devuelve `{ data: [...] }` con identificador del evento, estado anterior, estado nuevo, motivo y fecha UTC, del más antiguo al más reciente. Un ticket recién creado tiene historial vacío: su creación está en `createdAt`. No se inventan eventos para tickets anteriores a la migración. Por ahora hay como máximo dos transiciones por ticket.

No hay actor autenticado ni confirmación del solicitante: `resolved` significa que se registró una solución. La demo sigue siendo local y sin permisos por usuario. Las rutas no permiten editar ni eliminar el historial, pero esto no constituye un registro de auditoría inmutable ante un administrador de la base de datos.

### Filtrar el listado

`GET /tickets?status=open&category=data&page=1&limit=20` combina filtros de estado y categoría. Ambos son opcionales y se aplican antes de paginar; `hasNext` corresponde a los resultados filtrados.

- Estados: `open`, `in_progress`, `resolved`.
- Categorías: `functionality`, `data`, `usage`.
- Valores vacíos, desconocidos o parámetros repetidos devuelven 400.
- Sin coincidencias devuelve 200 con `data: []`.

Los filtros usan valores parametrizados en SQL. No cambian los permisos de la demo local ni crean nuevas migraciones.

### Filtrar por fecha de creación

Ejemplo: `GET /tickets?createdFrom=2026-10-01&createdBefore=2026-11-01&status=open`.

- `createdFrom` incluye la medianoche UTC del día indicado.
- `createdBefore` excluye la medianoche UTC del día indicado: el ejemplo abarca todo octubre en UTC.
- Formato estricto `AAAA-MM-DD`, años 0001 a 9999; se rechazan fechas inexistentes, valores vacíos y parámetros repetidos.
- Ambos límites son opcionales. Cuando están presentes, `createdBefore` debe ser posterior a `createdFrom`; un rango igual o invertido devuelve 400.
- Filtran `createdAt`, no la fecha de resolución. Se combinan con categoría, estado y paginación antes de limitar resultados.
- Los días son UTC, no días del calendario local de Colombia. No dependen de la zona horaria de PostgreSQL.

La validación del listado está en `src/tickets/ticket.query.ts`; las rutas se encargan de HTTP y el repositorio de SQL. No se requieren dependencias ni migraciones nuevas.

### Métricas de tickets

`GET /metrics/tickets` devuelve `total`, `byStatus` (open, in_progress, resolved) y `scope`, que indica la definición y filtros de la consulta.

Ejemplo: `GET /metrics/tickets?createdFrom=2026-10-01&createdBefore=2026-11-01&category=data`.

**Definición:** número de tickets creados en el periodo solicitado, agrupados por su estado actual al ejecutar la consulta. El periodo usa UTC, inicio inclusivo y fin exclusivo. Sin fechas se cuenta todo el historial de creación disponible. La categoría es opcional. Sin coincidencias, total y todos los estados son cero.

La consulta SQL agrupa tickets y toma una sola fecha de resolución por ticket del historial, sin paginar. Así cada ticket se cuenta una vez y los grupos se calculan en una misma consulta. No admite `page`, `limit` ni `status`; esos parámetros devuelven 400. La suma de los estados equivale al total.

**Límites:** no reconstruye el estado de los tickets al final de un periodo pasado; los conteos pueden cambiar si se atienden después. No mide incidentes únicos, disponibilidad ni satisfacción. Resuelto significa solución registrada, no confirmada por el solicitante. Esta demo usa datos ficticios y permanece sin autenticación.

**Validación:** integration/metrics.test.js contrasta cinco registros conocidos con los conteos esperados, el listado y la suma de estados. Comprueba filtros combinados, días UTC con PostgreSQL en zona Bogotá, conjunto vacío y parámetros inválidos. Sus datos se aíslan en una tabla temporal y se descartan al terminar.


### Tiempo promedio de resolución

La misma ruta `/metrics/tickets` añade `resolution`:

```json
{ "averageSeconds": 120, "sampleSize": 2, "excludedCount": 0 }
```

- `averageSeconds`: promedio aritmético de segundos transcurridos desde creación hasta la primera transición a `resolved`, entre los tickets actualmente resueltos con duración válida. Incluye noches y fines de semana; no representa horas de trabajo.
- `sampleSize`: cantidad de tickets utilizados. Sin observaciones válidas devuelve 0 y el promedio es `null`; una duración real de cero sí es válida.
- `excludedCount`: tickets resueltos sin evento de resolución o con fecha anterior a la creación. Se excluyen del promedio pero siguen en los conteos por estado.
- Los filtros siguen seleccionando por **fecha de creación**, aunque la solución se haya registrado fuera del periodo.
- Los tickets abiertos o en atención no entran en el promedio. Por eso no mide el tiempo de espera de las solicitudes pendientes ni garantiza calidad del servicio.

Prueba reproducible: duraciones de 60 y 180 segundos producen promedio 120 y muestra 2. Se verifica también un ticket creado al final de enero y resuelto en febrero, historial adicional, ausencia de fechas y duración negativa. No hay cambios de esquema.

Los textos de creación y motivos rechazan el carácter NUL y secuencias Unicode malformadas con HTTP 400, para evitar errores de almacenamiento o alteraciones al codificar UTF-8. Se conservan emojis y otros caracteres Unicode válidos.

### Conversación del ticket

`POST /tickets/:id/comments` recibe únicamente `{ "body": "El error aparece al descargar el reporte." }` y devuelve 201 con el comentario guardado. Admite de 1 a 5000 puntos de código Unicode después de quitar espacios exteriores; rechaza texto vacío, NUL, Unicode malformado y campos extra. El servidor asigna UUID, fecha UTC y autor fijo `local-demo-user`, que no representa una identidad autenticada.

`GET /tickets/:id/comments?page=1&limit=20` devuelve `data` y `pagination` con `page`, `limit` y `hasNext`. Usa los mismos límites de paginación del listado de tickets y ordena del más antiguo al más reciente, con UUID como desempate. Un ticket sin mensajes devuelve una lista vacía; un ticket inexistente devuelve 404. Solo permite parámetros page y limit.

Los comentarios son texto plano; la interfaz los representa como texto sin ejecutar HTML recibido. No cambian el estado, no sustituyen el motivo obligatorio al resolver y no modifican las métricas. También se aceptan en tickets resueltos: esta versión no tiene cierre definitivo. No hay adjuntos, edición, borrado ni distinción entre notas privadas y mensajes públicos.

Aplicar `npm run db:migrate` para crear la tabla con la migración 004. Las pruebas verifican persistencia, paginación, separación por ticket, campos del servidor y comentarios después de resolver. La demo sigue siendo local sin permisos por usuario.

### Buscar tickets por texto

`GET /tickets?q=reporte&status=open` busca una subcadena en título o descripción sin distinguir mayúsculas. Se combina con categoría, fechas y paginación. El texto debe tener de 2 a 120 puntos de código Unicode después de quitar espacios exteriores. Parámetros repetidos y texto inválido devuelven 400.

Los caracteres `%`, `_` y `!` se buscan literalmente; no actúan como comodines. No busca en comentarios ni ofrece relevancia, corrección ortográfica o equivalencia entre letras acentuadas y no acentuadas. Conserva el orden por fecha del listado. La ruta de métricas no admite `q`.

La consulta usa SQL parametrizado. La búsqueda por subcadena puede recorrer la tabla; si el volumen crece, se medirá su rendimiento antes de añadir índices especializados. No requiere migraciones nuevas.
