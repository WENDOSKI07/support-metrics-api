# Datos iniciales de tickets

Este módulo contiene los tipos de creación y una función de validación independiente. Todavía no hay rutas de tickets, almacenamiento ni autenticación implementados.

## Entrada y resultado

`CreateTicketInput` describe los datos del formulario: título, descripción y categoría.

`CreatedTicket` añade los campos controlados por el servidor:

| Campo | Origen previsto |
| --- | --- |
| `id` | Identificador generado al crear el ticket |
| `requesterId` | Identidad autenticada, nunca un usuario elegido libremente en el formulario |
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

Ejecutar `npm test` para comprobar los casos válidos, los límites y los rechazos. La futura ruta HTTP deberá invocar esta validación y comprobar la autenticación; esta función por sí sola no expone una API ni devuelve códigos HTTP.

## Qué comprueban los tipos

Una interfaz TypeScript ayuda a comprobar el código durante la compilación. No crea tablas, no guarda datos y no valida por sí sola un JSON recibido por HTTP. La validación de entradas y los permisos deberán implementarse antes de exponer una ruta de creación.
