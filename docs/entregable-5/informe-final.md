# Informe Final — Entregable 5 (Proyecto Nuclear VII)

## 1. Confirmación de integridad de entregables anteriores

**Confirmado:** no se modificó, renombró ni eliminó ningún archivo de los entregables 1, 2, 3 y 4. La verificación con `git diff --stat` devuelve vacío. Todo el desarrollo del Entregable 5 se realizó en archivos nuevos bajo `backend/migrations-e5/`, `backend/src/e5/`, `backend/public/admin/`, `backend/scripts/`, `backend/test/` y `docs/entregable-5/`.

## 2. Funcionalidades desarrolladas

- **Autenticación y seguridad por roles (`admin` y `dj`):** inicio y cierre de sesión con hashing `scrypt`, tokens aleatorios almacenados como SHA-256 en cookie `HttpOnly + SameSite=Strict` (o `Bearer`), protección CSRF (`X-Ponga-Admin`), límite de intentos fallidos y aislamiento estricto por `id_establecimiento`.
- **Panel web (`/admin`):** interfaz nocturna responsiva alineada con los tokens de diseño PONGA (`#090a0f`, `#12151d`, `#8b7cff`, `#48d7a0`, tipografía Manrope) con vistas diferenciadas para `admin` y `dj`.
- **Gestión de sesiones y códigos QR:** creación de sesiones, activación/desactivación, activación/desactivación del QR, generación de imagen PNG del QR (`PUBLIC_BASE_URL/s/<qr_token>`) conservando el acceso exclusivo mediante la app móvil nativa.
- **Horarios, excepciones y pausa manual:** franjas semanales por zona horaria IANA (incluyendo horarios que cruzan la medianoche), excepciones por fecha, pausa manual del QR sin cerrar horario y planificador automático (`planificador.js`).
- **Mantenimiento de sesiones y colas:** limpieza de solicitudes pendientes (`retirada`) y reinicio de estado temporal conservando íntegro el historial en `solicitud`, `reproduccion` y `e5_jornada`.
- **Control de reproducción para el DJ + YouTube IFrame API:** iniciar, pausar, reanudar, siguiente, saltar y reportar error de reproducción, con reproductor oficial de YouTube embebido.
- **Bloqueo temporal de contenido:** registro de motivo y vigencia (`hasta`), retiro automático de solicitudes pendientes afectadas y desbloqueo manual.
- **Listas predeterminadas y continuidad musical automática:** CRUD de listas, agregar/quitar/reordenar canciones, selección de lista predeterminada, rotación entre listas y reproducción automática cuando no hay solicitudes pendientes (manteniendo prioridad de las solicitudes de clientes).
- **Auditoría y analítica:** tabla `e5_registro` y emisor `eventos-e5.js` compatible con el almacén JSONL del E3/E4.

## 3. Archivos nuevos creados

- Base de datos: [backend/migrations-e5/101_e5_administracion.sql](file:///c:/Users/JASBLEIDY/AndroidStudioProjects/proyectonuclearvii/backend/migrations-e5/101_e5_administracion.sql)
- Backend E5:
  - [backend/src/e5/comun-e5.js](file:///c:/Users/JASBLEIDY/AndroidStudioProjects/proyectonuclearvii/backend/src/e5/comun-e5.js)
  - [backend/src/e5/repositorio-e5.js](file:///c:/Users/JASBLEIDY/AndroidStudioProjects/proyectonuclearvii/backend/src/e5/repositorio-e5.js)
  - [backend/src/e5/auth.js](file:///c:/Users/JASBLEIDY/AndroidStudioProjects/proyectonuclearvii/backend/src/e5/auth.js)
  - [backend/src/e5/eventos-e5.js](file:///c:/Users/JASBLEIDY/AndroidStudioProjects/proyectonuclearvii/backend/src/e5/eventos-e5.js)
  - [backend/src/e5/horarios.js](file:///c:/Users/JASBLEIDY/AndroidStudioProjects/proyectonuclearvii/backend/src/e5/horarios.js)
  - [backend/src/e5/sesiones-admin.js](file:///c:/Users/JASBLEIDY/AndroidStudioProjects/proyectonuclearvii/backend/src/e5/sesiones-admin.js)
  - [backend/src/e5/bloqueos.js](file:///c:/Users/JASBLEIDY/AndroidStudioProjects/proyectonuclearvii/backend/src/e5/bloqueos.js)
  - [backend/src/e5/listas.js](file:///c:/Users/JASBLEIDY/AndroidStudioProjects/proyectonuclearvii/backend/src/e5/listas.js)
  - [backend/src/e5/reproductor.js](file:///c:/Users/JASBLEIDY/AndroidStudioProjects/proyectonuclearvii/backend/src/e5/reproductor.js)
  - [backend/src/e5/planificador.js](file:///c:/Users/JASBLEIDY/AndroidStudioProjects/proyectonuclearvii/backend/src/e5/planificador.js)
  - [backend/src/e5/rutas-e5.js](file:///c:/Users/JASBLEIDY/AndroidStudioProjects/proyectonuclearvii/backend/src/e5/rutas-e5.js)
  - [backend/src/e5/montar-e5.js](file:///c:/Users/JASBLEIDY/AndroidStudioProjects/proyectonuclearvii/backend/src/e5/montar-e5.js)
  - [backend/src/e5/server-e5.js](file:///c:/Users/JASBLEIDY/AndroidStudioProjects/proyectonuclearvii/backend/src/e5/server-e5.js)
- Script CLI: [backend/scripts/e5-crear-usuario.js](file:///c:/Users/JASBLEIDY/AndroidStudioProjects/proyectonuclearvii/backend/scripts/e5-crear-usuario.js)
- Interfaz web: [backend/public/admin/index.html](file:///c:/Users/JASBLEIDY/AndroidStudioProjects/proyectonuclearvii/backend/public/admin/index.html), [admin.css](file:///c:/Users/JASBLEIDY/AndroidStudioProjects/proyectonuclearvii/backend/public/admin/admin.css), [admin.js](file:///c:/Users/JASBLEIDY/AndroidStudioProjects/proyectonuclearvii/backend/public/admin/admin.js)
- Pruebas: [backend/test/e5-unidad.test.js](file:///c:/Users/JASBLEIDY/AndroidStudioProjects/proyectonuclearvii/backend/test/e5-unidad.test.js), [backend/test/e5-integracion.test.js](file:///c:/Users/JASBLEIDY/AndroidStudioProjects/proyectonuclearvii/backend/test/e5-integracion.test.js), [backend/test/helpers/e5.js](file:///c:/Users/JASBLEIDY/AndroidStudioProjects/proyectonuclearvii/backend/test/helpers/e5.js)
- Documentación: [docs/entregable-5/README.md](file:///c:/Users/JASBLEIDY/AndroidStudioProjects/proyectonuclearvii/docs/entregable-5/README.md), [manual-personal.md](file:///c:/Users/JASBLEIDY/AndroidStudioProjects/proyectonuclearvii/docs/entregable-5/manual-personal.md), [informe-final.md](file:///c:/Users/JASBLEIDY/AndroidStudioProjects/proyectonuclearvii/docs/entregable-5/informe-final.md)

## 4. Conexión con entregables anteriores

- Reutiliza `crearApp()` (`src/app.js`), `app.locals.e4` (`cola`, `catalogo`, `flujo`, `conectividad`), `src/db/repositorio.js`, `src/comun-e4.js`, `src/eventos.js`, `src/sesiones.js` y `public/ponga-logo.png`.
- Los cambios de estado de `sesion` y `solicitud` actualizan `version_cola` y notifican por `flujo.notificarSesion()` para que Android reciba las actualizaciones en tiempo real por SSE.

## 5. Problemas de integración documentados y pendientes

1. **Arranque separado (`src/e5/server-e5.js`):** `src/server.js` y `package.json` no se modificaron por protección al código existente; se recomienda añadir `"start:e5": "node src/e5/server-e5.js"` en `package.json` en la fase de integración final.
2. **Catálogo E4 sin filtro de bloqueos:** el endpoint de solicitudes del E4 (`src/cola.js`) no consulta `e5_bloqueo`. El E5 retira las solicitudes pendientes al bloquear y evita reproducir canciones bloqueadas, pero impedir la creación directa de una solicitud bloqueada requerirá consultar `idsBloqueados` desde `cola.js` al integrar.
3. **Regla H1 vs. lista predeterminada:** para no bloquear la regla de inactividad del E4 mientras suena una canción de lista por defecto, la canción de lista en curso se gestiona en `e5_estado_reproduccion` y se inserta en `reproduccion` (con `id_solicitud NULL`) al finalizar. Como consecuencia, Android no muestra en "Ahora suena" las canciones de la lista predeterminada salvo que en integración se adapte `estadoBase()` en `cola.js`.
4. **Salto de canción en `reproduccion.resultado`:** el `CHECK` del E4 solo acepta `('en_curso','exitosa','fallida')`. El salto se registra como `fallida` con `codigo_error = 'saltada_por_operador'` y la solicitud en estado `saltada`, preservando intacta la regla de conteo de votos.
5. **Pruebas de integración en este equipo:** Docker Desktop no estaba iniciado durante la sesión, por lo que `test/e5-integracion.test.js` queda listo para ejecutarse en cuanto PostgreSQL (`npm run db:up`) esté activo.
