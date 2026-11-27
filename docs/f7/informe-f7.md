# Informe Final — FASE 7: Onboarding, Landing Page, APK, QR y Código de Seis Dígitos (PONGA PUES)

---

## Clasificación general por componente

| Componente | Estado | Evidencia / Detalle |
| --- | --- | --- |
| **FASE 7.0 — Diagnóstico y aislamiento** | `COMPLETADO Y VERIFICADO` | Worktree `.worktrees/f7` en rama `feature/f7-onboarding-descarga-qr`; árbol original intacto (`git status` idéntico al inicial). |
| **FASE 7.1 — Identidad PONGA PUES e inicio dual** | `COMPLETADO Y VERIFICADO` | `strings.xml`, icono adaptativo `ic_launcher`/`ic_launcher_round`, pantalla inicial dual (`BienvenidaContenido`), compilación `:app:assembleDebug` y `:app:assembleRelease`. |
| **FASE 7.2 — Escáner QR integrado (CameraX + ML Kit)** | `IMPLEMENTADO, PENDIENTE DE VALIDACIÓN` | Código y pruebas unitarias JVM (`LecturaQrTest`) aprobadas; pendiente validación física de cámara y flujo de permisos en dispositivo Android real (sin `adb` ni equipo conectado). |
| **FASE 7.3 — Códigos de 6 dígitos (Backend + BD)** | `IMPLEMENTADO, PENDIENTE DE VALIDACIÓN` | Migración `107_f7_codigo_acceso.sql`, lógica, endpoint `POST /api/sesiones/acceso-codigo` y pruebas unitarias 4/4 aprobadas; pruebas de integración contra PostgreSQL (`test/f7-codigo-acceso-integracion.test.js` y suite E4/E5 completa) pendientes de ejecutar localmente porque el demonio Docker Desktop no estuvo activo. |
| **FASE 7.4 — Panel administrativo (ACCESO A LA SESIÓN)** | `IMPLEMENTADO, PENDIENTE DE VALIDACIÓN` | Implementado en `admin.js`/`admin.css` y validado con `node -c`; pendiente prueba visual interactiva con backend conectado a PostgreSQL. |
| **FASE 7.5 — Ingreso manual en Android (6 dígitos)** | `COMPLETADO Y VERIFICADO` | Implementado, integrado con convergencia única y cubierto por `CodigoAccesoTest`, `CodigoAccesoViewModelTest`, `SesionRepositoryTest` y `DestinosTest` (303/303 pruebas JVM aprobadas). |
| **FASE 7.6 — Landing pública (`/descargar`)** | `COMPLETADO Y VERIFICADO` | HTML/CSS/JS propio con CSP, `/api/descarga`, `/descargar/app.apk` y prueba HTTP real `test/f7-descarga.test.js` aprobada. |
| **FASE 7.7 — APK release firmado (`0.2.0` / `2`)** | `PENDIENTE DE CONFIGURACIÓN` | APK compilado, firmado y verificado con `apksigner` y `aapt2` en ruta scratch; pendiente autorización para publicar en GitHub Releases, pasar `publicado: true`, configurar `ANDROID_SHA256_CERT` en Railway e instalar en teléfono real. |
| **FASE 7.8 — QR promocional (`/descargar`)** | `COMPLETADO Y VERIFICADO` | PNG (2048 px), SVG, `url.txt`, instrucciones y decodificación real verificada hacia `https://proyecto-nuclear-vii-production.up.railway.app/descargar` (marcado como provisional). |
| **Producción Railway / `develop`** | `PENDIENTE DE CONFIGURACIÓN` | Sin push a `develop`, sin cambios en variables productivas ni ejecución de migraciones/bootstrap en producción (cumpliendo restricciones). |

---

## A. Diagnóstico FASE 7.0
- **Estado Git encontrado:** rama `feature/bonificacion` en commit `bbb77b1` (`feat(e5): integrar pantalla publica PONGA PUES (fases 1-6)`), idéntico a `origin/develop`.
- **Cambios locales sin commit encontrados:** únicamente `cliente-android/app/build.gradle.kts` tenía cambios locales (`testOptions.unitTests.isIncludeAndroidResources = true` y `enableUnitTest = true`), además de archivos plantilla de Android Studio sin seguimiento en la raíz (`app/`, `build.gradle.kts`, `gradle.properties`, `gradle/`, `gradlew*`, `settings.gradle.kts`). Los otros cinco archivos indicados inicialmente (`AndroidManifest.xml`, `MainActivity.kt`, `TokenQr.kt`, `libs.versions.toml`, `backend/src/app.js`) no tenían modificaciones respecto a `HEAD`.
- **Aislamiento aplicado:** se extrajo `f7-prep.patch` solo con `cliente-android/app/build.gradle.kts`, se creó el worktree independiente `.worktrees/f7` sobre la rama `feature/f7-onboarding-descarga-qr` con commit preparatorio `a006f47`, preservando intacto el árbol original.
- **Arquitectura verificada:** sesiones gestionadas por `sesiones-admin.js` dentro de transacciones `repo4.conTransaccion`; QR generado con `ponga-<base64url>` hacia `${PUBLIC_BASE_URL}/s/<token>`; validación cliente en `GET /api/sesiones/:token` (`validarTokenEnBd`); ejecutor de migraciones en `backend/src/db/index.js` con bloqueo consultivo por esquema.

---

## B. Arquitectura implementada
```text
QR promocional (/descargar) ──► Landing pública (APK GitHub Releases)
                                      │
                                      ▼
                            App Android PONGA PUES
                       ┌──────────────┴──────────────┐
                       ▼                             ▼
           ESCANEAR CÓDIGO QR               INGRESAR CÓDIGO (6 dígitos)
        CameraX + ML Kit QR                     POST /api/sesiones/acceso-codigo
        TokenQr.desdeUrl/esValido                       │
                       │                        resuelve qr_token (sesión vigente)
                       └──────────────┬──────────────┘
                                      ▼
                    Punto único de entrada: onTokenObtenido(token)
                    MainActivity → NuclearNavHost → AccesoViewModel
                    → SesionRepository.validar → GET /api/sesiones/:token
                                      │
                                      ▼
                                MISMA SESIÓN MUSICAL
```

---

## C. Archivos modificados y creados (en rama `feature/f7-onboarding-descarga-qr`)

### Backend
- `backend/migrations-e5/107_f7_codigo_acceso.sql` *(nuevo)*
- `backend/migrations-e5/reversion/107_f7_codigo_acceso.down.sql` *(nuevo)*
- `backend/src/e5/codigo-acceso.js` *(nuevo)*
- `backend/src/e5/repositorio-e5.js`
- `backend/src/e5/sesiones-admin.js`
- `backend/src/e5/bootstrap.js`
- `backend/src/e5/montar-e5.js`
- `backend/src/e5/server-e5.js`
- `backend/src/descarga.js` *(nuevo)*
- `backend/src/app.js`
- `backend/data/descarga/apk.json` *(nuevo, con `publicado: false`)*
- `backend/scripts/generar-manifiesto-apk.js` *(nuevo)*
- `backend/scripts/generar-qr-promocional.js` *(nuevo)*
- `backend/test/helpers/e5.js`
- `backend/test/f7-codigo-acceso.test.js` *(nuevo)*
- `backend/test/f7-codigo-acceso-integracion.test.js` *(nuevo)*
- `backend/test/f7-descarga.test.js` *(nuevo)*

### Panel administrativo y Landing pública
- `backend/public/admin/admin.js`
- `backend/public/admin/admin.css`
- `backend/public/descargar/index.html` *(nuevo)*
- `backend/public/descargar/descargar.css` *(nuevo)*
- `backend/public/descargar/descargar.js` *(nuevo)*
- `backend/public/descargar/manrope.ttf` *(copia local de la fuente OFL del cliente Android)*

### Android (`cliente-android/`)
- `cliente-android/gradle/libs.versions.toml`
- `cliente-android/app/build.gradle.kts`
- `cliente-android/app/src/main/AndroidManifest.xml`
- `cliente-android/app/src/main/res/values/strings.xml`
- `cliente-android/app/src/main/res/values/colors.xml`
- `cliente-android/app/src/main/res/drawable/ic_launcher_foreground.xml` *(nuevo)*
- `cliente-android/app/src/main/res/drawable/ic_launcher_monochrome.xml` *(nuevo)*
- `cliente-android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml` *(nuevo)*
- `cliente-android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml` *(nuevo)*
- `cliente-android/app/src/main/java/co/edu/cue/nuclear/cliente/MainActivity.kt`
- `cliente-android/app/src/main/java/co/edu/cue/nuclear/cliente/data/sesion/LecturaQr.kt` *(nuevo)*
- `cliente-android/app/src/main/java/co/edu/cue/nuclear/cliente/data/sesion/CodigoAcceso.kt` *(nuevo)*
- `cliente-android/app/src/main/java/co/edu/cue/nuclear/cliente/data/sesion/ResultadoAcceso.kt`
- `cliente-android/app/src/main/java/co/edu/cue/nuclear/cliente/data/sesion/SesionApi.kt`
- `cliente-android/app/src/main/java/co/edu/cue/nuclear/cliente/data/sesion/SesionRepository.kt`
- `cliente-android/app/src/main/java/co/edu/cue/nuclear/cliente/ui/navigation/Destinos.kt`
- `cliente-android/app/src/main/java/co/edu/cue/nuclear/cliente/ui/navigation/NuclearNavHost.kt`
- `cliente-android/app/src/main/java/co/edu/cue/nuclear/cliente/ui/screens/acceso/AccesoScreen.kt`
- `cliente-android/app/src/main/java/co/edu/cue/nuclear/cliente/ui/screens/acceso/BienvenidaContenido.kt` *(nuevo)*
- `cliente-android/app/src/main/java/co/edu/cue/nuclear/cliente/ui/screens/acceso/QrInvalidoScreen.kt`
- `cliente-android/app/src/main/java/co/edu/cue/nuclear/cliente/ui/screens/escaner/EscanerScreen.kt` *(nuevo)*
- `cliente-android/app/src/main/java/co/edu/cue/nuclear/cliente/ui/screens/codigo/CodigoAccesoViewModel.kt` *(nuevo)*
- `cliente-android/app/src/main/java/co/edu/cue/nuclear/cliente/ui/screens/codigo/CodigoAccesoScreen.kt` *(nuevo)*
- Pruebas JVM Android agregadas/actualizadas: `CodigoAccesoTest.kt`, `LecturaQrTest.kt`, `CodigoAccesoViewModelTest.kt`, `SesionRepositoryTest.kt`, `AccesoViewModelTest.kt`, `DestinosTest.kt`.

### Documentación y QR promocional
- `docs/f7/plan-tecnico-f7.md` *(nuevo)*
- `docs/f7/release-v0.2.0.md` *(nuevo)*
- `docs/f7/informe-f7.md` *(nuevo)*
- `docs/f7/qr-promocional/ponga-pues-descargar.png` *(nuevo)*
- `docs/f7/qr-promocional/ponga-pues-descargar.svg` *(nuevo)*
- `docs/f7/qr-promocional/url.txt` *(nuevo)*
- `docs/f7/qr-promocional/INSTRUCCIONES-IMPRESION.md` *(nuevo)*

---

## D. Migraciones creadas
- **Aditiva:** `backend/migrations-e5/107_f7_codigo_acceso.sql`
  - Tabla `e5_codigo_acceso` referenciando `sesion(id_sesion)` con `codigo VARCHAR(6)` y `CHECK (codigo ~ '^[0-9]{6}$')` para conservar ceros iniciales.
  - Índices únicos parciales: `e5_codigo_acceso_codigo_vigente` `(codigo) WHERE vigente` y `e5_codigo_acceso_sesion_vigente` `(id_sesion) WHERE vigente`.
  - No altera tablas E3/E4 ni genera códigos retroactivos sobre sesiones históricas.
- **Reversión manual:** `backend/migrations-e5/reversion/107_f7_codigo_acceso.down.sql` (`DROP TABLE IF EXISTS e5_codigo_acceso;`), almacenada en subcarpeta para evitar su ejecución automática.

---

## E. Endpoint de resolución de códigos
- **Ruta:** `POST /api/sesiones/acceso-codigo` (en `backend/src/e5/montar-e5.js`).
- **Entrada:** cuerpo JSON `{ "codigo": "004281" }` y cabecera opcional `X-Dispositivo-Id` (UUID válido). Nunca recibe el código por URL ni query string.
- **Validaciones:** sesión en estado `activa` y `qr_estado = 'activo'`.
- **Respuestas:**
  - `200 OK`: `{ "qr_token": "..." }` (sin `id_establecimiento`, sin código ni datos administrativos).
  - `400 codigo_invalido`: formato distinto de 6 dígitos.
  - `404 codigo_no_disponible`: respuesta uniforme para código inexistente, revocado, sesión cerrada, en pausa manual o fuera de horario (impide enumeración).
  - `429 demasiados_intentos`: incluye cabecera `Retry-After` y `error.reintentar_en_s`.

---

## F. Estrategia de unicidad y protección contra fuerza bruta
- **Generación e integridad atómica:** `crypto.randomInt(0, 1_000_000)` formateado con `padStart(6, '0')` dentro de la misma transacción de `sesiones-admin.crearSesion` y `bootstrap.ejecutarBootstrapProduccion`, mediante `INSERT ... ON CONFLICT (codigo) WHERE vigente DO NOTHING RETURNING codigo` con hasta `12` reintentos. Al agotarse lanza `503 codigos_agotados` abortando toda la transacción.
- **Ciclo de vida:** cierre manual (`desactivarSesion` o `cambiarEstadoQr(false)` con `origen !== 'horario'`) revoca el código (`vigente = false`). Cierres por horario o pausa manual conservan la asociación pero bloquean la resolución mientras no esté activa.
- **Límites contra fuerza bruta y justificación:**
  - `5` fallos por dispositivo (`d:<uuid>`) en ventana deslizante de `15 minutos`: tolera errores de digitación legítimos y detiene automatización desde una misma instalación.
  - `20` fallos por IP (`i:<ip>`) en `15 minutos`: frena rotación de `X-Dispositivo-Id` desde un mismo cliente sin bloquear inmediatamente a un establecimiento con Wi-Fi compartido.
  - `60` peticiones/minuto por IP: protege contra ráfagas HTTP.
  - **Retardo progresivo:** desde el tercer fallo consecutivo se aplica `min(250 * (fallos - 2), 2000)` ms.
  - **Reserva previa síncrona:** cada solicitud reserva un fallo antes de consultar PostgreSQL para impedir condiciones de carrera concurrentes; los aciertos liberan su reserva.
  - **Sin bloqueo por código ni por sesión:** nunca se bloquea un código válido cuando un tercero falla, evitando DoS sobre usuarios legítimos.
  - **Registro seguro:** solo se registra el hash truncado del origen (`sha256(ip).slice(0, 10)`) al alcanzar el límite; nunca se registran códigos.
  - **Proxy (`trust proxy`):** `server-e5.js` configura `trust proxy` en entorno Railway (`RAILWAY_ENVIRONMENT`) o vía `TRUST_PROXY` para que `req.ip` refleje al cliente real.
  - **Alcance y riesgo residual:** el limitador reside en memoria del proceso (adecuado para instancia única actual; se reinicia al desplegar). Con 20 fallos por IP cada 15 min, el máximo teórico por IP asciende a ~1.920 intentos diarios (~0,19 % del espacio `000000–999999`), acotado además por la expiración de códigos al cerrar sesión.

---

## G. Cambios en Android
- **Identidad y versión:** `app_name = PONGA PUES`, icono adaptativo (`@mipmap/ic_launcher` y `@mipmap/ic_launcher_round` usando `ponga_logo` con `inset="20%"` sobre `#090A0F` más monocromo), `versionName = "0.2.0"`, `versionCode = 2`, `applicationId = "co.edu.cue.nuclear.cliente"` intacto y App Links sin alteraciones.
- **Pantalla inicial dual (`BienvenidaContenido`):** presenta el logo de PONGA PUES, bienvenida, botón principal `ESCANEAR CÓDIGO QR`, separador `O TAMBIÉN` y botón secundario `INGRESAR CÓDIGO`.
- **Escáner QR (`EscanerScreen`):** CameraX `1.7.0` + ML Kit `com.google.mlkit:barcode-scanning:17.3.0` empaquetado (`minSdk 26` conservado), visor en vivo con marco, gestión de permisos (concedido, denegado, denegado permanente hacia Ajustes del sistema y revalidación en `ON_RESUME`), anti-duplicado con `AtomicBoolean`, aviso para QR ajeno (con throttling de 2 s) y liberación completa de cámara y analizador en `onDispose`.
- **Ingreso manual (`CodigoAccesoScreen` + `CodigoAccesoViewModel`):** 6 cajas numéricas agrupadas `3 + 3`, teclado numérico, ceros iniciales preservados como `String`, progreso `n/6`, botón `INGRESAR` deshabilitado si incompleto o cargando (sin envíos dobles) y mensajes claros para cada fallo.
- **Convergencia única:** escáner, código manual y App Links desembocan en `onTokenObtenido(token)` → `MainActivity` (`key(tokenQr, generacionEntrada)`) → `NuclearNavHost` → `AccesoViewModel` → `SesionRepository.validar`.

---

## H. Cambios en panel administrativo
- Se integró en `tarjetaSesionHtml` (`backend/public/admin/admin.js` + `admin.css`) la sección **ACCESO A LA SESIÓN**: muestra QR, identificador de sesión, código de 6 dígitos en cajas grandes `3 + 3` obtenidas de la API (nunca generadas en frontend), pill de estado (`Acceso habilitado`, `Acceso en pausa / fuera de horario`, `Acceso revocado` o `Sesión creada antes del acceso por código: solo QR`), botones **Copiar código**, **Copiar enlace QR** e **Imprimir tarjeta**.

---

## I. Landing page (`/descargar`)
- Implementada en `backend/src/descarga.js` y `backend/public/descargar/` (HTML, CSS, JS, fuente Manrope local, CSP estricta).
- Expone `/descargar`, `/api/descarga` y `/descargar/app.apk` (redirección `302` con `Cache-Control: no-store` restringida al prefijo oficial de GitHub Releases cuando `publicado === true`, y `503` controlado mientras está `publicado: false`).
- Incluye secciones Hero, ¿Cómo funciona?, características reales, ficha técnica del APK cargada dinámicamente, instrucciones de instalación con aviso de desinstalar builds *debug* previas, FAQ y footer real.

---

## J. APK release v0.2.0
- **Artefacto compilado (fuera del repositorio):** `C:\Users\JASBLEIDY\.gemini\antigravity\brain\126fa65e-007e-4c10-8a04-81803825e7d1\scratch\release\ponga-pues-0.2.0.apk`.
- **Keystore privado:** `%USERPROFILE%\.ponga-pues\ponga-pues-release.jks` + `firma-release.properties` (fuera del repositorio).
- **Verificación `apksigner` / `aapt2` / `Get-FileHash`:**
  - Certificado DN: `CN=PONGA PUES, O=Proyecto Nuclear VII, C=CO`
  - SHA-256 certificado (`ANDROID_SHA256_CERT`): `F4:0A:CC:18:BC:50:47:F2:66:3B:CA:42:D1:43:9E:4E:3F:E3:84:50:38:1B:42:65:DD:C3:3E:12:65:21:7F:F5`
  - Paquete / versión / etiqueta: `co.edu.cue.nuclear.cliente`, `versionCode='2'`, `versionName='0.2.0'`, `application-label:'PONGA PUES'`, `minSdkVersion:'26'`, `targetSdkVersion:'37'`
  - Tamaño: `36723861` bytes
  - SHA-256 APK: `42ae97303460ee09b80e99f22a227b95ea47afdc25f7196a1e5c607f7e780ee5`
- **Manifiesto (`backend/data/descarga/apk.json`):** generado con metadatos reales y `publicado: false` hasta que se suba el APK a GitHub Releases y se autorice habilitarlo.

---

## K. QR promocional
- Destino provisional: `https://proyecto-nuclear-vii-production.up.railway.app/descargar` (landing page, nunca directo al APK).
- Generados en `docs/f7/qr-promocional/`: `ponga-pues-descargar.png` (2048 px, ECL H), `ponga-pues-descargar.svg`, `url.txt` e `INSTRUCCIONES-IMPRESION.md`.
- **Verificación por decodificación real (`jsqr` + `pngjs`):** `ponga-pues-descargar.png` decodificado correctamente devolviendo la URL exacta esperada.

---

## L. Pruebas y evidencias ejecutadas

| Suite / Verificación | Resultado exacto observado | Observaciones |
| --- | --- | --- |
| Sintaxis JS (`node -c` en 12 archivos modificados/nuevos) | **12/12 sin errores** | Ejecutado tras la última edición. |
| Backend unitario + HTTP sin BD (`backend.test.js`, `contrato-eventos.test.js`, `e4-unidad.test.js`, `e5-unidad.test.js`, `f7-codigo-acceso.test.js`, `f7-descarga.test.js`) | **40/40 aprobadas**, 0 fallidas, 0 omitidas | Cubre E3, contratos de eventos, E4 unidad, E5 unidad, códigos de 6 dígitos + rate limiter y landing/descarga APK. |
| Pruebas de integración PostgreSQL (`npm test` completo, incluyendo `test/f7-codigo-acceso-integracion.test.js` y `e4-*` / `e5-*`) | **No ejecutado localmente (pendiente de entorno BD)** | El demonio de Docker Desktop (`dockerDesktopLinuxEngine`) no estuvo disponible localmente; debe ejecutarse con `npm run db:up` cuando Docker esté en línea o vía CI. |
| Pruebas unitarias Android JVM (`:app:testDebugUnitTest`) | **303/303 aprobadas** (25 archivos XML, 0 fallos, 0 omitidos) | Incluye `CodigoAccesoTest`, `LecturaQrTest`, `CodigoAccesoViewModelTest`, `SesionRepositoryTest`, `AccesoViewModelTest` y `DestinosTest`. |
| Compilación Android (`:app:assembleDebug` y `:app:assembleRelease`) | **Compiladas con éxito** (`BUILD SUCCESSFUL`) | Release compilado con `BACKEND_URL` y `appLinkHost` de Railway y `lintVitalRelease` aprobado. |
| Verificación de APK (`apksigner verify`, `aapt2 dump badging`, `Get-FileHash`) | **Firma y metadatos verificados** | Confirmado certificado, permisos `INTERNET` + `CAMERA`, `0.2.0`/`2`, etiqueta `PONGA PUES`. |
| Decodificación QR promocional (`jsqr` + `pngjs`) | **Verificado** | Coincidencia exacta con `https://proyecto-nuclear-vii-production.up.railway.app/descargar`. |

### Lista de pruebas manuales pendientes en teléfono físico
1. Desinstalar cualquier compilación previa *debug* e instalar `ponga-pues-0.2.0.apk` verificando nombre **PONGA PUES** e icono adaptativo en launcher.
2. Abrir la app sin enlace: comprobar bienvenida con `ESCANEAR CÓDIGO QR` y `INGRESAR CÓDIGO`.
3. Probar permiso de cámara denegado temporalmente, denegado permanentemente (botón hacia Ajustes) y concedido en caliente.
4. Escanear QR ajeno (ver aviso sin navegar) y QR de sesión activa (entrar a la sesión y votar/pedir).
5. Probar ingreso manual con código válido (incluyendo un código con cero inicial), incompleto, erróneo, sesión cerrada y bloqueo tras 5 intentos fallidos (`429`).
6. Abrir `/descargar` desde el teléfono (y mediante escaneo del QR promocional) tras publicar el Release y pasar `publicado: true`.

---

## M. Pendientes de autorización y comandos sugeridos (NO ejecutados)
1. **Respaldar la firma privada (crítico):** guardar una copia segura de `%USERPROFILE%\.ponga-pues\ponga-pues-release.jks` y `%USERPROFILE%\.ponga-pues\firma-release.properties`. Sin este archivo no se podrán firmar futuras actualizaciones compatibles.
2. **Correr pruebas de integración backend con Docker:**
   ```powershell
   # Inicia Docker Desktop manualmente y luego en .worktrees/f7/backend:
   npm run db:up
   npm test
   ```
3. **Publicar APK en GitHub Releases (`v0.2.0`):** subir `C:\Users\JASBLEIDY\.gemini\antigravity\brain\126fa65e-007e-4c10-8a04-81803825e7d1\scratch\release\ponga-pues-0.2.0.apk` y cambiar `"publicado": true` en `backend/data/descarga/apk.json`.
4. **Habilitar App Links para firma release (opcional hasta autorizar en Railway):** actualizar `ANDROID_SHA256_CERT` en Railway con:
   `F4:0A:CC:18:BC:50:47:F2:66:3B:CA:42:D1:43:9E:4E:3F:E3:84:50:38:1B:42:65:DD:C3:3E:12:65:21:7F:F5`
5. **Subir rama y abrir PR hacia `develop` (cuando autorices):**
   ```powershell
   git -C .worktrees/f7 push -u origin feature/f7-onboarding-descarga-qr
   ```
