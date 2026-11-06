# Incremento 3 — Acceso por QR e identificación de dispositivo (B01, B02, B07)

Estado real de cada historia tras este incremento. Ninguna se marca como completa.

| Historia | Estado | Qué está hecho | Qué falta / limitación |
|---|---|---|---|
| B01 Acceso por QR | **Parcial** | App Link `https://HOST/s/TOKEN` (intent-filter `autoVerify`), validación de formato en la app, validación contra `GET /api/sesiones/:token`, pantallas de acceso y QR inválido (token inválido, sesión inexistente, sesión cerrada, QR desactivado), errores de conexión/servidor con reintento. | Las sesiones del backend son **MOCK** (`backend/data/sesiones.mock.json`; la app muestra "Sesión de prueba"). La verificación de dominio de App Links no se pudo probar: `nuclear.example.com` es un placeholder. No se escaneó un QR físico. |
| B02 Acceso sin registro ni descarga | **Parcial** | La app no pide registro ni datos personales. El cliente web de respaldo (`/s/:token`, incremento 2) existe. | El cliente web no se validó en un navegador de teléfono sin la app instalada. El acceso "sin descarga" depende de él. |
| B07 Identificación única | **Parcial** | UUID aleatorio en DataStore, conservado entre aperturas (probado en unitarias y en el emulador). | Solo se genera y se guarda; se enviará en los eventos en el incremento 5. Se pierde si se borran los datos de la app. |

## Decisiones

- **Solo HTTPS en producción.** `network_security_config` de release no permite HTTP. El build debug lo permite (`src/debug/res/xml`) para usar el backend local.
- **Backend local en debug:** `http://localhost:3000/` con `adb reverse tcp:3000 tcp:3000`. En el emulador probado (Pixel_10_ProyectoNuclear) la app no alcanzaba `10.0.2.2`, aunque el shell de adb sí. Se puede cambiar con `-Pnuclear.backendUrl=...`.
- **Host de App Links:** placeholder `nuclear.example.com`; se cambia con `-Pnuclear.appLinkHost=host-real`. Para que `autoVerify` funcione hace falta un host público HTTPS que sirva `/.well-known/assetlinks.json` (lo sirve el backend con `ANDROID_PACKAGE` y `ANDROID_SHA256_CERT` de `.env`) y la huella SHA-256 del certificado con el que se firma el APK.
- Sin inyección de dependencias (Hilt): un contenedor manual (`AppContainer`) basta para el alcance.

## Pruebas ejecutadas

`./gradlew testDebugUnitTest assembleDebug`: **34 pruebas, 0 fallos** (JUnit local).

| Clase | Pruebas | Qué cubre |
|---|---|---|
| `TokenQrTest` | 6 | Formato del token y extracción desde URL HTTPS (rechaza `http` y `nuclear://`). |
| `SesionRepositoryTest` | 13 | Contrato con servidor HTTP **simulado** (MockWebServer): 200, 400, 404, 410 cerrada, 410 desactivada, 410 con código desconocido, 500, cuerpos ilegibles, servidor caído. |
| `DispositivoRepositoryTest` | 4 | UUID válido, generado una sola vez, conservado al reabrir, distinto por dispositivo. |
| `AccesoViewModelTest` | 8 | Estados: sin QR, cargando, válido (con UUID), rechazado, error de conexión con reintento, error de servidor. |
| `DestinosTest` | 3 | Rutas de navegación. |

Los tests de DataStore no pre-crean el archivo: en Windows el `rename` de DataStore falla si el destino ya existe (no ocurre en Android ni en Linux/CI).

## Prueba manual en emulador (Pixel_10_ProyectoNuclear, Android API 37)

Backend real local con sesiones MOCK, lanzando `adb shell am start -a android.intent.action.VIEW -d "https://nuclear.example.com/s/<token>" co.edu.cue.nuclear.cliente`:

| Token | Resultado observado |
|---|---|
| `demo-activa-001` | Bienvenida con "La Nota Bar (demo)" y aviso de sesión de prueba. "Entrar" navega a inicio (pantalla provisional). |
| `demo-cerrada-002` | "La sesión de este establecimiento ya terminó." |
| `demo-qr-desactivado-003` | "Este código QR está desactivado en este momento." |
| `no-existe-12345` | "No pudimos identificar el establecimiento." |
| `x` (formato inválido) | "El código QR no es válido." (sin llamar al servidor) |
| Abrir sin enlace | "Escanea el código QR". |
| Backend inalcanzable | "Sin conexión" con botón Reintentar, tras 10 s de timeout. |

El UUID del archivo DataStore fue idéntico en dos aperturas. En logcat, Google Play Services intentó verificar `nuclear.example.com` y falló con `ERR_CERT_AUTHORITY_INVALID`, que es lo esperado con el host placeholder.

Capturas en `docs/entregable-3/evidencias/`.

## Cómo probarlo

```bash
cd backend && npm start                       # backend en :3000
adb reverse tcp:3000 tcp:3000                 # emulador o teléfono por USB
cd cliente-android && ./gradlew installDebug  # añade la opción de certificados de Windows si hace falta
adb shell am start -a android.intent.action.VIEW -d "https://nuclear.example.com/s/demo-activa-001" co.edu.cue.nuclear.cliente
```
