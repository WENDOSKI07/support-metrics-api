# Support Metrics API

Proyecto de aprendizaje y portafolio: una API para registrar solicitudes de soporte y entender cómo se atienden.

**Estado:** primer servidor implementado. Por ahora solo está disponible `GET /health`; tickets, autenticación y métricas siguen pendientes.

## Problema y usuarios

Un equipo de soporte necesita saber qué solicitudes siguen abiertas y cuánto tarda en resolverlas.

- **Solicitante:** registra una solicitud propia y consulta su seguimiento.
- **Agente de soporte:** atiende las solicitudes que tiene autorizadas y registra su avance.

El alcance inicial es el soporte de una sola plataforma para usuarios autenticados. La autenticación y los permisos forman parte del diseño; su implementación todavía está pendiente. Trabajaremos con datos ficticios.

## Primera versión propuesta

1. Crear tickets con título, descripción y categoría.
2. Consultarlos por identificador y en una lista paginada.
3. Registrar estados y un historial básico de atención.
4. Filtrar por estado, categoría y fecha de creación.
5. Consultar conteos por estado y tiempo promedio de resolución.

Ejemplo: registrar «No puedo generar un reporte», iniciar su atención y documentar la solución. El historial debe permitir reconstruir lo ocurrido y el resumen debe reflejar su duración.

## Reglas y límites

- Cada solicitante conserva su ticket y su seguimiento individual.
- El acceso depende de la identidad y de los permisos sobre la solicitud.
- Cerrar un ticket conserva su registro e historial; no equivale a eliminarlo.
- Un cierre sin respuesta no demuestra que el solicitante haya confirmado la solución.
- Las transiciones exactas, los permisos por acción y las condiciones de cierre siguen pendientes de definición.
- La recuperación de cuentas y las solicitudes sin iniciar sesión quedan fuera de la primera versión.

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

Requisitos: Node.js 20.20.0 o superior y npm. La API usa Fastify 5 y TypeScript 5. `tsx` permite reiniciar el servidor al editar TypeScript; las pruebas utilizan el ejecutor integrado de Node.js.

```sh
npm ci
npm run dev
```

Abrir `http://127.0.0.1:3000/health`. Responde con código HTTP 200 y:

```json
{ "status": "ok" }
```

Esta ruta pública solo comprueba que la API responde; todavía no comprueba una base de datos. El servidor escucha únicamente en la interfaz local. Para detenerlo, usar Ctrl+C.

### Verificar y compilar

```sh
npm test
npm run build
npm start
```

`npm test` compila y comprueba el contrato HTTP sin abrir un puerto. `npm run build` genera JavaScript en `dist/`, y `npm start` ejecuta esa compilación. Detener el servidor de desarrollo antes de iniciar el compilado para liberar el puerto 3000.

El archivo `package-lock.json` fija las versiones instaladas. Las dependencias y `dist/` están excluidos de Git.
