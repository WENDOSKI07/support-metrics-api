# Código de la API

Esta carpeta contiene el código TypeScript de la aplicación.

- `app.ts`: construye la aplicación Fastify y define `GET /health`.
- `server.ts`: inicia la escucha local en el puerto 3000 y cierra la aplicación al recibir una señal de parada.

Esta separación permite probar las respuestas sin iniciar un servidor externo.

Las funcionalidades de tickets y métricas se incorporarán después. Sus carpetas se crearán cuando comience su implementación.
