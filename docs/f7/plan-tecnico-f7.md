# Plan Técnico — FASE 7 (PONGA PUES)

## 1. Diagnóstico FASE 7.0

### Estado Git y preservación local
- **Rama original observada:** `feature/bonificacion` en commit `bbb77b1` (`feat(e5): integrar pantalla publica PONGA PUES (fases 1-6)`), coincidente con `origin/develop`.
- **Cambios sin commit detectados:** únicamente `cliente-android/app/build.gradle.kts` (`testOptions.unitTests.isIncludeAndroidResources = true` y `androidComponents.beforeVariants { enableUnitTest = true }`), además de archivos plantilla de Android Studio sin seguimiento en la raíz (`app/`, `build.gradle.kts`, `gradle.properties`, `gradle/`, `gradlew`, `gradlew.bat`, `settings.gradle.kts`).
- **Archivos sin cambios locales respecto a `HEAD`:** `AndroidManifest.xml`, `MainActivity.kt`, `TokenQr.kt`, `libs.versions.toml` y `backend/src/app.js` no presentaban modificaciones locales pendientes.
- **Aislamiento:** se creó el worktree independiente `.worktrees/f7` en la rama `feature/f7-onboarding-descarga-qr` desde `bbb77b1`, con el parche preparatorio aplicado en `chore(f7): integrar configuración de pruebas unitarias Android previa`, manteniendo intacto el árbol de trabajo original.

### Arquitectura de sesiones, QR y PostgreSQL
- **Creación de sesiones:** `backend/src/e5/sesiones-admin.js` (`crearSesion`) ejecuta una transacción (`repo4.conTransaccion`), inserta la sesión vía `repo5.insertarSesion` con estado inicial `cerrada` y `qr_estado = 'inactivo'`, y genera `qr_token` (`ponga-<base64url>`). `POST /api/admin/sesiones` (`soloAdmin` en `rutas-e5.js`) expone la creación y `listarSesiones` (`repositorio-e5.js`) alimenta al panel. `backend/src/e5/bootstrap.js` también llama a `repo5.insertarSesion` dentro de su transacción única de bootstrap.
- **Ciclo de vida:** `activarSesion` abre la sesión y habilita el QR si no existe pausa manual ni desactivación permanente. `desactivarSesion` y `cambiarEstadoQr(false)` marcan `e5_qr_desactivado` (irreversible) salvo cuando `origen === 'horario'`. `fijarPausaManual` cambia `qr_estado` temporalmente sin desactivación permanente.
- **Acceso cliente:** `GET /api/sesiones/:token` (`backend/src/app.js`) delega en `validarTokenEnBd` (`backend/src/sesiones.js`), exigiendo `estado === 'activa'` y `qr_estado === 'activo'`.
- **Migraciones:** el ejecutor `migrar()` (`backend/src/db/index.js`) aplica archivos `^\d+_.+\.sql$` de la carpeta indicada en orden léxico y dentro de transacciones individuales; no lee subcarpetas. La última migración existente en `migrations-e5/` es `106_e5_pantalla_autoridad.sql`.
- **Android y Gradle:** AGP `9.5.0`, Kotlin `2.4.21`, `compileSdk = 37`, `targetSdk = 37`, `minSdk = 26`, `applicationId = "co.edu.cue.nuclear.cliente"`. `MainActivity` mantiene `tokenQr` y lo inyecta en `NuclearNavHost`. `TokenQr.desdeUrl()` y `TokenQr.esValido()` validan el formato `https://HOST/s/<token>`.

---

## 2. Diseño técnico de los códigos de acceso de 6 dígitos

### Persistencia y migración (`107_f7_codigo_acceso.sql`)
- Tabla aditiva `e5_codigo_acceso` referenciando `sesion(id_sesion)`:
  - `codigo VARCHAR(6)` con restricción `CHECK (codigo ~ '^[0-9]{6}$')` para preservar ceros iniciales (`004281`).
  - `vigente BOOLEAN NOT NULL DEFAULT true`, `creado_en BIGINT NOT NULL`, `revocado_en BIGINT`, `motivo_revocacion TEXT`, y `CHECK (vigente OR revocado_en IS NOT NULL)`.
  - Índice único parcial `e5_codigo_acceso_codigo_vigente ON e5_codigo_acceso (codigo) WHERE vigente` (unicidad estricta entre códigos vigentes y base para `ON CONFLICT` atómico).
  - Índice único parcial `e5_codigo_acceso_sesion_vigente ON e5_codigo_acceso (id_sesion) WHERE vigente` (máximo un código vigente por sesión).
- Script de reversión manual almacenado fuera del runner en `backend/migrations-e5/reversion/107_f7_codigo_acceso.down.sql`.
- Las sesiones históricas previas a la migración conservan su QR y reportan `codigo_acceso: null` (sin códigos retroactivos).

### Generación atómica, unicidad y colisiones (`codigo-acceso.js`)
- Generación criptográficamente segura con `crypto.randomInt(0, 1_000_000)` formateado a 6 dígitos con `padStart(6, '0')`.
- Asignación dentro de la misma transacción que crea la sesión (`sesiones-admin.crearSesion` y `bootstrap.ejecutarBootstrapProduccion`), usando `INSERT ... ON CONFLICT (codigo) WHERE vigente DO NOTHING RETURNING codigo` con hasta 12 reintentos ante colisión.
- Si se agotan los reintentos, se lanza `ErrorApi(503, 'codigos_agotados', ...)` abortando toda la transacción (sin sesiones parciales sin código).
- En cierre definitivo (`desactivarSesion` y `cambiarEstadoQr(false)` cuando `origen !== 'horario'`), se revoca el código vigente (`revocarCodigo`). En cierre por horario o pausa manual el código permanece asociado a la sesión, pero bloqueado por la regla de vigencia en tiempo real.

### Endpoint y convergencia (`POST /api/sesiones/acceso-codigo`)
- Recibe `{ "codigo": "482169" }` únicamente en el cuerpo JSON (nunca en URL ni query string, ni en logs/analítica).
- Valida `estado === 'activa'` y `qr_estado === 'activo'` sobre la sesión vinculada y responde `{ "qr_token": "..." }` con código HTTP `200`, reutilizando el flujo estándar de ingreso (`GET /api/sesiones/:token`) en Android.
- Respuesta uniforme `404 codigo_no_disponible` para código inexistente, revocado, sesión cerrada, en pausa o fuera de horario, evitando enumeración de códigos o filtración de metadatos internos.

### Protección contra fuerza bruta y rate limiting
- Limitador en memoria (`crearLimitadorIntentos`) con ventanas deslizantes por dispositivo (`d:<uuid>`) e IP (`i:<ip>`):
  - Máximo `5` fallos por dispositivo en ventana de `15 minutos`.
  - Máximo `20` fallos por IP en ventana de `15 minutos`.
  - Máximo `60` peticiones por minuto por IP.
  - Retardo progresivo de `min(250 * (fallos - 2), 2000)` ms desde el tercer fallo.
  - Reserva previa a la consulta SQL para frenar ráfagas concurrentes; liberación automática si el código resuelve correctamente.
  - Sin bloqueo global por código (evita denegación de servicio hacia usuarios legítimos).
  - Cabecera `Retry-After` y cuerpo `429 demasiados_intentos` con `reintentar_en_s`.
  - Soporte opcional `trust proxy` en `server-e5.js` detrás de Railway sin alterar variables de producción.

---

## 3. Fases de ejecución restantes
1. **FASE 7.3 — Backend códigos de 6 dígitos** (`107_f7_codigo_acceso.sql`, `codigo-acceso.js`, `sesiones-admin.js`, `montar-e5.js`, pruebas unitarias y de integración).
2. **FASE 7.4 — Panel administrativo** (`admin.js`, `admin.css`: bloque **ACCESO A LA SESIÓN**, copiar código/enlace e impresión de tarjeta).
3. **FASE 7.1 / 7.2 / 7.5 — Android** (`PONGA PUES`, icono adaptativo, firma y versión `0.2.0`/`2`, bienvenida dual, CameraX + ML Kit, ingreso manual y convergencia en `MainActivity`/`NuclearNavHost`, pruebas JVM).
4. **FASE 7.6 — Landing y distribución APK** (`/descargar`, `/descargar/app.apk`, `/api/descarga`, script de manifiesto).
5. **FASE 7.7 — Build y firma release** (`ponga-pues-release.jks` fuera del repo, verificación `apksigner` / `aapt2`, guía de release).
6. **FASE 7.8 — QR promocional** (`PNG`, `SVG`, `url.txt`, instrucciones y decodificación verificada).
7. **FASE 7.9 — Regresión completa e informe final**.
