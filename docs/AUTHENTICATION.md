# Identidad y permisos

## Puesta en marcha

1. `npm run db:migrate` añade usuarios y sesiones sin reasignar los tickets existentes.
2. `npm run auth:create -- oscar support` solicita dos veces una contraseña oculta. Usa una frase única de al menos 15 caracteres (máximo 256 bytes UTF-8). No la envíes al chat.
3. `npm run auth:create -- solicitante requester` crea un solicitante de prueba.
4. `npm run dev` y abre `http://127.0.0.1:3000/login`.

No hay contraseñas predeterminadas, registro público ni rol elegible desde HTTP. El catálogo de responsables sigue siendo ficticio: asignar un ticket a un agente del catálogo no concede permisos ni crea una cuenta.

## Matriz de acceso

| Operación | Solicitante | Soporte |
| --- | --- | --- |
| Crear ticket | Con su identidad | Con su identidad |
| Listar, leer, comentar e historial | Solo propios | Todos |
| Prioridad, asignación y estados | No | Sí |
| Incidentes, métricas, disponibilidad y guía API | No | Sí |

La API verifica los permisos aunque alguien manipule la interfaz. Un ticket ajeno devuelve 404. Los identificadores de solicitante y autor provienen de la sesión; no se aceptan en el cuerpo. Los historiales de gestión son visibles para el dueño del ticket: no escribir notas internas confidenciales en ellos.

## Controles implementados

- Contraseñas derivadas con scrypt (N=32768, r=8, p=3), sal aleatoria individual y comparación de tiempo constante; no se guardan contraseñas legibles.
- Sesión opaca de 256 bits. PostgreSQL guarda únicamente SHA-256 del token; el rol se consulta en cada petición. Vence a las 8 horas y salir revoca la sesión.
- Cookie HttpOnly, SameSite=Strict y Path=/. En HTTPS usa Secure y el prefijo __Host-. No se guarda en localStorage.
- Mutaciones, incluido login, exigen origen exacto y encabezado X-Requested-With. No se habilita CORS. Configura APP_ORIGIN igual al origen del navegador, sin barra final.
- Login: 10 intentos por usuario y 20 por IP cada 15 minutos, incluso si fueron exitosos; máximo 2 comprobaciones de contraseña simultáneas. Contadores en memoria y tamaño limitado. Para varias instancias se requiere un limitador compartido; reiniciar limpia los contadores.
- Consultas parametrizadas, validación de campos, tamaño de peticiones limitado, renderizado con textContent y CSP sin scripts inline. Cookies y cabeceras de autorización se redactan en el log.
- Sin almacenamiento de identidad configurado, las rutas privadas rechazan el acceso.

La configuración HTTP solo se admite para localhost/127.0.0.1:3000. Para publicar, usa HTTPS y configura APP_ORIGIN. No habilitar trustProxy indiscriminadamente. Actualmente el servidor escucha únicamente en loopback.

## Operación y límites

Para suspender un usuario, un administrador de PostgreSQL puede actualizar `app_users.active=false`; el acceso se deniega inmediatamente, incluidas sesiones existentes. Los respaldos contienen hashes de contraseñas y sesiones: conservarlos privados y con acceso restringido, junto con las credenciales de PostgreSQL. La exportación analítica no incluye estas tablas.

Todavía no hay recuperación por correo, cambio de contraseña desde la interfaz, MFA ni auditoría de intentos centralizada. El cierre de sesión afecta la sesión actual. La administración de cuentas se hace localmente; no se expone un endpoint administrativo. Las pruebas usan cuentas ficticias y las eliminan al finalizar.

Referencia de parámetros: [OWASP Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html).
