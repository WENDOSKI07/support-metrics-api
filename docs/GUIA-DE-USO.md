# Guía de uso de Support Metrics

Support Metrics reúne solicitudes de soporte, conversaciones, seguimiento e indicadores. La aplicación web y n8n consultan la misma API y PostgreSQL; n8n no mantiene otra bandeja de tickets.

## Dónde entrar

| Dirección local | Uso |
| --- | --- |
| [Aplicación](http://127.0.0.1:3000/) | Iniciar sesión y trabajar con tickets |
| [Guía de API](http://127.0.0.1:3000/docs) | Consultar rutas y contratos con una sesión de soporte |
| [n8n](http://localhost:5678/) | Administrar los workflows y sus credenciales |
| [Resumen real de n8n](http://localhost:5678/workflow/supportMetricsApi) | Ejecutar la consulta autenticada de métricas |

Las direcciones funcionan en el equipo donde están iniciados los servicios. En la aplicación usa el origen definido en `APP_ORIGIN`; no alternes localhost y 127.0.0.1.

## Qué puede hacer cada persona

| Operación | Solicitante | Soporte |
| --- | --- | --- |
| Crear solicitudes | Sí | Sí |
| Leer, buscar y comentar tickets | Solo propios | Todos |
| Consultar historiales | Solo propios | Todos |
| Asignar responsable y prioridad | No | Sí |
| Atender, resolver, reabrir y cerrar | No | Sí |
| Gestionar incidentes y ver métricas | No | Sí |
| Cambiar su propia contraseña | Sí | Sí |

Las cuentas de la aplicación y las de n8n son independientes. No hay registro público. Las cuentas de Support Metrics se crean desde una terminal con `npm run auth:create -- nombre requester` o `support`; la contraseña se introduce de forma oculta. [Detalles del acceso](AUTHENTICATION.md).

## Trabajar una solicitud

1. Entra en la aplicación y pulsa **Crear ticket**. Describe el problema y elige su categoría: funcionamiento, datos o uso.
2. Abre el ticket para ver el detalle y añadir comentarios. El solicitante puede seguir aquí la respuesta del soporte.
3. Como soporte, asigna prioridad y responsable con un motivo. El catálogo actual contiene dos agentes ficticios; asignar uno no crea una cuenta ni otorga permisos.
4. Escribe el motivo y pulsa **Iniciar atención**. El estado cambia de abierto a en atención.
5. Documenta lo que se hizo y pulsa **Registrar solución**. El estado cambia a resuelto.
6. Si el problema continúa, soporte puede reabrirlo con motivo. Si corresponde terminarlo definitivamente, puede cerrarlo desde resuelto.

Un ticket cerrado queda en modo consulta: no permite nuevos cambios ni comentarios. No se eliminan tickets. Si aparece un conflicto de versión, vuelve a consultar el ticket antes de decidir qué cambio aplicar.

## Encontrar y analizar trabajo

- **Bandeja:** busca por título o descripción, filtra por estado, categoría, prioridad, responsable y fechas; recorre las páginas.
- **Resumen de atención:** consulta conteos, promedio de resolución, primera atención y antigüedad de pendientes. Cero significa ningún caso; un promedio vacío significa que no hay observaciones válidas.
- **Exportar resumen CSV:** descarga las métricas del filtro aplicado. No incluye conversaciones ni descripciones. No sumes instantáneas de distintos días como si fueran nuevos tickets.
- **Historial:** revisa motivos y fechas de estados, prioridad, asignación y vínculos. Los cambios se conservan aunque se reabra un ticket.

Las fechas de filtros se interpretan en UTC. En el dashboard, categoría y fechas afectan las métricas; búsqueda, estado, prioridad y responsable afectan la bandeja. El promedio de resolución incluye noches y fines de semana y no mide satisfacción ni tiempo activo de trabajo. [Definiciones](RELIABILITY-ANALYTICS.md).

## Agrupar un problema compartido

En **Incidentes compartidos**, crea o busca el problema común. Desde un ticket puedes vincularlo a un incidente abierto y justificar la asociación. Un incidente reúne varios tickets; cada ticket solo tiene un incidente actual.

Resolver un incidente conserva su solución común, pero **no resuelve automáticamente los tickets**. Verifica la recuperación de cada solicitud y registra su solución individualmente. [Reglas de incidentes](INCIDENTS.md).

## Obtener el resumen real en n8n

1. Abre **Support Metrics · consultar resumen por API**, no el workflow que contiene DEMO.
2. Pulsa **Execute workflow**. El flujo inicia sesión con la cuenta de integración, consulta métricas globales y cierra sesión.
3. Abre el último nodo **Resumen de soporte** y selecciona **Output → JSON** o **Table**.
4. Revisa `total`, `pendientes`, `resueltos`, `cerrados`, `medidoEn` y `mensaje`. Pendientes suma abiertos y en atención. `medidoEn` indica cuándo se consultó la información.

El flujo consulta el estado global actual, sin filtrar por fecha. No crea ni resuelve tickets. La credencial de la instalación configurada está en n8n y no en el repositorio. Los valores cambian al trabajar en la aplicación; no deben coincidir siempre con los resultados históricos de una prueba.

El [workflow diario](http://localhost:5678/workflow/supportMetricsDaily) consulta automáticamente a las **08:00 de Colombia**. Abre su pestaña **Executions**, selecciona una ejecución y consulta **Obtener resumen real → Output**. El resultado queda solo en n8n, sin correo ni Telegram. Para consultar ahora, usa su disparador manual. Para pausarlo, despublica el workflow diario.

PostgreSQL, API y n8n deben permanecer encendidos a esa hora. Si un servicio falla, revisa la ejecución y consulta manualmente tras recuperarlo; no se garantiza recuperar horarios perdidos. [Instalación y conexión de n8n](../integrations/n8n/README.md).

## Iniciar después de apagar el equipo

Abre Docker Desktop. Desde la carpeta del proyecto que contiene tu `.env`, ejecuta:

```sh
npm run db:up
npm run build
npm start
```

Deja esa terminal abierta. En otra terminal, desde la copia que contiene `integrations/n8n`, ejecuta:

```sh
docker compose -f integrations/n8n/compose.yaml up -d
```

No vuelvas a cargar datos de ejemplo para usar la aplicación: el volumen conserva los tickets. Aplica `npm run db:migrate` cuando actualices a una versión con migraciones nuevas. No sobrescribas tu `.env`.

## Herramientas complementarias

| Herramienta | Qué permite | Guía |
| --- | --- | --- |
| Hoppscotch | Ejecutar peticiones manuales de login, tickets, estados e indicadores | [Colección y pasos](api/README.md) |
| Tester Army E2E | Comprobar en navegador el recorrido de creación a solución con dos roles y una base temporal | [Prueba E2E](E2E.md) |
| Power BI | Analizar instantáneas CSV por ticket; requiere importar los archivos en Power BI | [Exportación e importación](POWER-BI.md) |
| Copias locales | Crear un respaldo y comprobar su restauración en una base temporal | [Respaldo y recuperación](RELIABILITY-ANALYTICS.md) |

La colección de Hoppscotch requiere configurar variables y sesión; no es una integración que se ejecute sola. E2E requiere Node 24.8+, Chromium y Docker, y no usa la base habitual. Power BI no tiene un dashboard publicado incluido.

## Si algo falla

| Síntoma | Qué revisar |
| --- | --- |
| La aplicación no abre | Terminal de la API, Docker y puerto 3000 |
| La API no inicia o disponibilidad falla | PostgreSQL, `.env` y migraciones |
| Login devuelve 401 | Usuario, contraseña o sesión vencida |
| Una operación devuelve 403 | Rol de soporte y origen configurado |
| Un cambio devuelve 409 | Consulta actualizada del ticket y transición permitida |
| n8n no abre | Contenedor n8n y puerto 5678 |
| Login de n8n falla | Credencial Custom Auth del nodo Login; tras demasiados intentos espera 15 minutos |
| n8n no alcanza la API | API encendida y `host.docker.internal:3000` desde Docker Desktop |

`/health` comprueba que el proceso HTTP responde; `/ready` comprueba disponibilidad de la base y requiere sesión de soporte. No confundas un HTTP 200 de salud con una prueba de todas las funcionalidades.

## Límites actuales

No están implementados SLA, escalamiento automático, detección automática de duplicados, recuperación de contraseña por correo, MFA, notificaciones externas ni despliegue público. La cuenta de integración tiene rol de soporte: no existe todavía un rol de servicio de solo lectura. La API escucha localmente y no está instalada como servicio de Windows.

[Volver al README](../README.md).
