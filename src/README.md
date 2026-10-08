# Código de la API

Esta carpeta contiene el código TypeScript de la aplicación.

- `app.ts`: construye la aplicación Fastify y registra los grupos de rutas.
- `routes/health.routes.ts`: define `GET /health`.
- `routes/info.routes.ts`: define `GET /info` y `GET /info/health`, reutilizando nombre y versión.
- `server.ts`: inicia la escucha local en el puerto 3000 y cierra la aplicación al recibir una señal de parada.

Esta separación permite probar las respuestas sin iniciar un servidor externo.

`app.register()` incorpora cada grupo como un plugin de Fastify: una función que recibe la aplicación y añade sus rutas. `FastifyInstance` describe el tipo de ese parámetro para TypeScript. En las respuestas, `...projectInfo` copia los campos de información del proyecto.

Las funcionalidades de tickets y métricas se incorporarán después. Sus carpetas se crearán cuando comience su implementación.
