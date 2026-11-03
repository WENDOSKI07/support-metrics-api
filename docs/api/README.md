# Explorar la API con Hoppscotch

Importa [la colección](support-metrics.postman_collection.json) desde **Collections → Import → Postman** en Hoppscotch. Se distribuye en formato Postman v2.1, admitido por Hoppscotch, para poder usarla también en otros clientes.

## Preparación

1. Inicia la aplicación y PostgreSQL siguiendo el README principal. Usa datos ficticios: estas peticiones crean y modifican tickets reales en la base seleccionada.
2. Usa Hoppscotch Desktop con su transporte nativo. La aplicación exige `Origin` y `X-Requested-With`; el navegador restringe el encabezado Origin. No es necesario cambiar CORS ni desactivar las comprobaciones del servidor.
3. Tras importar, configura las variables en el entorno local de Hoppscotch: `baseUrl`, `username`, `password`, `ticketId`, `version` y `currentStatus`. Si el importador conserva expresiones Postman como `{{baseUrl}}`, sustitúyelas por la sintaxis de Hoppscotch `<<baseUrl>>` (también en URL, encabezados y cuerpos).
4. `baseUrl` debe coincidir exactamente con `APP_ORIGIN`, por defecto `http://127.0.0.1:3000`, sin barra final. No intercambies localhost y 127.0.0.1 durante la sesión.
5. Crea cuentas locales con `npm run auth:create` según la guía de autenticación. Introduce sus credenciales solo en tu entorno local; el archivo compartido las deja vacías. Habilita la conservación de cookies en el cliente.

## Recorrido manual

- Ejecuta salud, login del solicitante e identidad. Crea el ticket y copia `id` a `ticketId`.
- Lista tickets y añade un comentario. Cierra sesión y entra con una cuenta de soporte para asignar, atender y resolver ese mismo ticket.
- **Antes de cada PATCH**, consulta el ticket y actualiza `version` y `currentStatus`. La versión se interpola como número JSON, sin comillas. Asignar y cambiar estado incrementan la versión; no uses siempre 1.
- Comprueba ambos historiales y las métricas. Vuelve a entrar como solicitante para consultar el resultado.
- Termina con logout. El ticket permanece guardado; la colección no borra datos.

Resultados esperados: login y consultas `200`; creación y comentario `201`; cambios y logout `204`. Un `401` indica sesión ausente o vencida, `403` rol/origen no permitido y `409` versión o transición incompatible: consulta el ticket antes de reintentar.

Es una colección manual, sin scripts Postman ni captura automática de variables, para facilitar su importación. La automatización del recorrido está en [las pruebas E2E](../E2E.md).

Referencia: [importación de colecciones en Hoppscotch](https://docs.hoppscotch.io/documentation/features/collections).
