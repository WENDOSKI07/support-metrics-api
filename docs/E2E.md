# Recorrido de navegador con Tester Army E2E

`npm run test:e2e` comprueba, con cuentas ficticias:

1. El solicitante inicia sesión y crea un ticket.
2. No dispone del control para iniciar atención.
3. Soporte inicia sesión, encuentra el ticket y asigna un responsable ficticio.
4. Inicia la atención y registra una solución.
5. El historial conserva los motivos tras recargar.
6. El solicitante vuelve a entrar y ve el resultado y su historial.

## Requisitos

- Node.js 24.8 o posterior para el ejecutor E2E. El requisito de la aplicación no cambia.
- Docker Desktop con motor Linux activo e imagen `postgres:17-alpine` disponible.
- Chromium de pruebas. El ejecutor busca Chrome Headless Shell en la caché de Puppeteer; también admite `E2E_BROWSER_PATH` con la ruta de un ejecutable compatible.
- Puertos locales 3000 y 15433 libres. Si están ocupados, el comando se detiene sin reutilizar ni detener esos servicios.

## Ejecución

```sh
npm ci
npm run test:e2e
```

El ejecutor compila la aplicación, crea un contenedor PostgreSQL exclusivo, aplica las migraciones existentes y genera dos cuentas con una contraseña aleatoria. Inicia un navegador con un perfil temporal separado y usa la aplicación real; no se simula la API.

La configuración usa comprobaciones exactas y no necesita un modelo de IA, suscripción ni clave API. Los accesos pasan por el formulario de login. Las contraseñas se entregan al ejecutor como secretos y no se incluyen en el código de las pruebas.

## Aislamiento y resultados

Los datos del recorrido se destruyen con su contenedor al terminar. No se lee `.env`, no se conecta a la base habitual y no se utiliza una sesión de navegador personal. El identificador del contenedor se genera por ejecución; la limpieza solo actúa sobre ese contenedor.

`.e2e/` está ignorado por Git: contiene resultados y, durante la ejecución, un archivo temporal de credenciales que se elimina al terminar. Los fallos conservan una traza con pasos, captura y estado de la pantalla. Un recorrido correcto también guarda una captura del ticket resuelto.

Esta prueba cubre un recorrido concreto y los controles visibles por rol; no sustituye las pruebas de autorización de la API ni una auditoría de seguridad.
