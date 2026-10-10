# v0.1.0 — Dashboard de soporte y métricas

Notas preparadas para la primera versión del proyecto. La etiqueta y la publicación en GitHub Releases están pendientes.

## Funcionalidades

- Crear, buscar, filtrar y paginar tickets desde una interfaz responsive en HTML, CSS y JavaScript nativos.
- Registrar comentarios e historial de cambios, con prioridad y asignación a agentes ficticios.
- Iniciar atención, resolver, reabrir y cerrar tickets; el cierre impide modificaciones posteriores.
- Detectar ediciones simultáneas mediante versiones y conservar cambios e historial en transacciones.
- Consultar métricas de resolución, antigüedad de pendientes y primera atención, y exportarlas a CSV.
- Comprobar disponibilidad de PostgreSQL con `/ready`, separado de la salud del proceso en `/health`.
- Crear respaldos locales y verificar su restauración en una base temporal independiente.

## Ejecutar la demo

Sigue el [inicio rápido del README](../README.md) para configurar el entorno, iniciar PostgreSQL, aplicar las migraciones y arrancar la API. Los datos de demostración son ficticios.

- [Guía técnica y contratos](DEVELOPMENT.md)
- [Reglas de gestión de tickets](TICKET-MANAGEMENT.md)
- [Respaldos, recuperación y definiciones de métricas](RELIABILITY-ANALYTICS.md)

## Validación de esta entrega

- 34 pruebas aisladas y 13 casos de integración aprobados durante la implementación.
- Flujo de creación, asignación, atención, resolución, reapertura y cierre comprobado en navegador.
- Interfaz comprobada en móvil y escritorio; exportación CSV y recuperación ante un fallo de disponibilidad verificadas.
- Respaldo real restaurado y comparado con su manifiesto; archivo corrupto rechazado antes de restaurar.

Las pruebas se ejecutan localmente. GitHub Actions permanece desactivado.

## Límites actuales

Es una demo de aprendizaje para uso local. No incluye autenticación ni permisos: el solicitante y los agentes son ficticios. No está preparada para exponer datos reales de usuarios en Internet.

Los respaldos son manuales, locales y sin cifrado; su almacenamiento externo y programación quedan pendientes. Las métricas usan tiempo natural, no horarios laborales ni acuerdos de nivel de servicio. No hay cierre automático por falta de respuesta.

La identidad de usuarios, los incidentes compartidos y la integración con Power BI quedan para próximas etapas.
