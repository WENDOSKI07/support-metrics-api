# Datos iniciales de tickets

Este módulo contiene los tipos, la validación, la construcción y el almacenamiento de tickets. La demo ofrece `POST /tickets` y `GET /tickets/:id` con PostgreSQL. No hay autenticación.

## Construcción del ticket

`ticket.factory.ts` contiene `buildTicket(input, requesterId)`. Una factory es una función que construye un objeto con sus valores iniciales.

1. Comprueba que el llamador proporciona un identificador de solicitante no vacío.
2. Valida y normaliza los datos del formulario con `validateCreateTicket`.
3. Si son válidos, genera un UUID, asigna `open` y registra la fecha actual en UTC.
4. Devuelve `{ success: true, ticket }`; una entrada inválida devuelve `{ success: false, error }` sin ticket.

En la demo local, el segundo argumento es el valor fijo local-demo-user establecido por la ruta. Cuando se implemente autenticación, deberá provenir de una identidad verificada, no del formulario. Comprobar que es texto no autentica a nadie. Una llamada interna sin ese identificador lanza `TypeError` para señalar un error de integración.

La función solo construye un objeto. La ruta espera a que el repositorio lo guarde antes de responder 201. Dos llamadas válidas generan identificadores diferentes; historial e idempotencia siguen pendientes.

## Entrada y resultado

`CreateTicketInput` describe los datos del formulario: título, descripción y categoría.

`CreatedTicket` añade los campos controlados por el servidor:

| Campo | Origen previsto |
| --- | --- |
| `id` | Identificador generado al crear el ticket |
| `requesterId` | Valor fijo `local-demo-user` en esta demo; autenticación pendiente |
| `status` | Estado inicial `open` |
| `createdAt` | Fecha del servidor, representada como texto ISO 8601 en UTC |

`CreatedTicket` describe únicamente el resultado inicial. Los estados posteriores y sus transiciones siguen pendientes de diseño.

## Validación inicial

`validateCreateTicket()` recibe datos de tipo `unknown`: no asumimos que su forma sea correcta. Devuelve `{ success: true, data }` o `{ success: false, error }`. En caso de error indica el primer campo inválido y un mensaje, sin repetir los valores enviados.

Reglas iniciales de implementación, ajustables al revisar el formulario:

- `title`: texto obligatorio, entre 5 y 120 caracteres.
- `description`: texto obligatorio, entre 10 y 5000 caracteres.
- Se eliminan espacios exteriores antes de comprobar longitud; se preserva el contenido interior. Las longitudes cuentan puntos de código Unicode, no bytes ni símbolos visuales compuestos.
- `category`: uno de los códigos exactos de la tabla siguiente.
- Se rechazan campos adicionales, incluidos `id`, `requesterId`, `status` y `createdAt`. Los establece el servidor.
- La función no modifica el objeto de entrada ni verifica la identidad del solicitante.

| Código | Significado |
| --- | --- |
| `functionality` | Una función u operación falla |
| `data` | Información incorrecta o inconsistente |
| `usage` | Consulta sobre cómo usar la plataforma |

Ejecutar `npm test` para comprobar los casos válidos, los límites y los rechazos. La ruta invoca esta validación; el formulario no puede establecer identificador, solicitante, estado o fecha.

## Qué comprueban los tipos

El repositorio declara `TicketRow` para describir las filas consultadas: PostgreSQL devuelve `createdAt` como `Date`. `toTicket()` selecciona los campos de respuesta y convierte la fecha a texto ISO. El tipo ayuda durante la compilación; no valida el esquema SQL en ejecución. Las migraciones y pruebas de integración comprueban esa correspondencia.

Una interfaz TypeScript comprueba el código durante la compilación. Las tablas se crean mediante migraciones SQL, la validación examina el JSON en ejecución y el repositorio persiste el resultado. Los permisos siguen pendientes: esta demo es exclusivamente local.
