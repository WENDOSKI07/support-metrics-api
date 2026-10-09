# Support Metrics API

Proyecto de aprendizaje y portafolio: una API para registrar solicitudes de soporte y entender cómo se atienden.

**Estado:** demo local con creación, consulta, listado paginado y cambios de estado con historial en PostgreSQL mediante Docker. Autenticación y métricas siguen pendientes.

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

Dashboard, notificaciones y automatizaciones se evaluarán después del flujo básico. Estas capacidades todavía no están implementadas.

## Desarrollo

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

### Rutas disponibles

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
