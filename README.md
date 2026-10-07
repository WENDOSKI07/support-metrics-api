# Support Metrics API

Proyecto de aprendizaje y portafolio: una API para registrar solicitudes de soporte y entender cómo se atienden.

**Estado:** planificación. Todavía no hay una aplicación ejecutable.

## Problema y usuarios

Un equipo de soporte necesita saber qué solicitudes siguen abiertas y cuánto tarda en resolverlas.

- **Agente de soporte:** registra, consulta y actualiza tickets.
- **Coordinador:** consulta cantidades y tiempos de resolución.

Estos son roles del producto; la primera versión local no implementa cuentas ni permisos. Trabajaremos con datos ficticios.

## Primera versión propuesta

1. Crear tickets con título, descripción y categoría.
2. Consultarlos por identificador y en una lista paginada.
3. Cambiar su estado: abierto → en proceso → resuelto.
4. Filtrar por estado, categoría y fecha de creación.
5. Consultar conteos por estado y tiempo promedio de resolución.

Ejemplo: registrar «No puedo iniciar sesión», iniciar su atención y resolverlo. El resumen debe reflejar el cambio y su duración.

Dashboard, autenticación, notificaciones y análisis con Python quedan para versiones posteriores. El MVP inicial se ejecutará localmente con datos ficticios.

## Desarrollo

El proyecto se construirá de forma incremental: API básica, persistencia de tickets, seguimiento de estados y métricas de resolución.
