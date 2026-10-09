# Pruebas

La integración también verifica migraciones desde una base vacía. Crea una base temporal con nombre aleatorio, aplica las migraciones dos veces, comprueba que los registros y las fechas de aplicación se conservan y elimina únicamente esa base al terminar. Requiere un usuario de pruebas con permiso `CREATEDB` (el administrador local de Docker y el servicio de CI lo tienen). No ejecutar esta suite contra una instancia de producción.

Esta carpeta contiene pruebas del comportamiento de la API con `node:test` y las aserciones integradas de Node.js. Ejecutar `npm test` desde la raíz; el comando compila TypeScript antes de probar el JavaScript generado.

`health.test.js` comprueba el código HTTP, el tipo de contenido y el JSON de `GET /health`. Usa `app.inject()` de Fastify para realizar la petición sin abrir un puerto, y cierra la aplicación al terminar.

`info.test.js` verifica las respuestas de `/info` y `/info/health`. `npm test` descubre los archivos de pruebas de esta carpeta automáticamente.

Las pruebas de tickets cubren validación, campos controlados por el servidor, creación, consulta y errores de almacenamiento sin detalles internos. `helpers/app.js` proporciona memoria únicamente para las pruebas aisladas.

`npm run test:db` ejecuta `integration/tickets.test.js` contra PostgreSQL local. Requiere `.env`, `npm run db:up` y `npm run db:migrate`. Comprueba persistencia al reconstruir la aplicación y las conexiones, texto tratado como datos y restricciones de categoría, estado e identificador. Limpia solo su propio ticket ficticio. No implementamos todavía permisos ni transiciones de estado.
