# Pruebas

Esta carpeta contiene pruebas del comportamiento de la API con `node:test` y las aserciones integradas de Node.js. Ejecutar `npm test` desde la raíz; el comando compila TypeScript antes de probar el JavaScript generado.

`health.test.js` comprueba el código HTTP, el tipo de contenido y el JSON de `GET /health`. Usa `app.inject()` de Fastify para realizar la petición sin abrir un puerto, y cierra la aplicación al terminar.

`info.test.js` verifica las respuestas de `/info` y `/info/health`. `npm test` descubre los archivos de pruebas de esta carpeta automáticamente.

Al desarrollar tickets, comprobaremos casos como entradas inválidas, acceso a solicitudes ajenas y transiciones de estado no permitidas. Cada prueba se añadirá junto con la funcionalidad correspondiente y usará datos ficticios.
