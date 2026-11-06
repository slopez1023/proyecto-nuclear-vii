# Incremento 4 — Búsqueda, autocompletado, detalle e integración YouTube (B03, B04, B05, B16)

## Estado real de cada historia

| Historia | Estado | Verificado | Falta |
|---|---|---|---|
| B16 Integración con YouTube | **Parcial** | Pruebas reales con la clave de `backend/.env` (3/3). Resultados reales de YouTube (título, canal, duración, ID) llegan por el backend y se ven en la app Android en el emulador. | Ver miniaturas cargadas. Validación de disponibilidad y reproducción son de entregables posteriores. |
| B03 Búsqueda | **Parcial** | Búsqueda real en el emulador; estados sin resultados y sin conexión con "Reintentar"; tiempo medido (abajo). | Medición en teléfono real y con red real. |
| B04 Autocompletado | **Parcial** | Sugerencias reales aparecen mientras se escribe (`inc4-02`). | Decidir qué hacer con la cuota. |
| B05 Información y miniaturas | **Parcial** | Título, canal, duración y detalle verificados en pantalla. | **Miniaturas no cargaron** (ver abajo). |

## Validación en emulador (Pixel_10_ProyectoNuclear, API 37)

El emulador arrancó con Cold Boot sin problemas y sin consumir espacio (disco con ~15 GB libres). No se usó Wipe Data ni se tocó el AVD. Backend local con la clave real y `adb reverse tcp:3000 tcp:3000`.

| Prueba | Resultado | Evidencia |
|---|---|---|
| Acceso por App Link, Entrar, Inicio, Buscar | Correcto | — |
| Autocompletado con "Shakira" | 5 sugerencias reales | `inc4-02-autocompletado.png` |
| Búsqueda "Shakira" | Resultados reales: título, canal · duración | `inc4-03-resultados-reales-miniatura-pendiente.png` |
| Detalle de "She Wolf" | Título, canal, duración, "Disponible", ID `Fno-Akxow_c` | `inc4-04-detalle.png` |
| Búsqueda sin resultados | Mensaje con la consulta | `inc4-05-sin-resultados.png` |
| Backend caído | "Sin conexión" con Reintentar | `inc4-06-error-conexion.png` |
| **Miniaturas** | **No cargan: recuadro gris** | `inc4-03`, `inc4-04` |

### Por qué no cargan las miniaturas

Desde el emulador, **todo HTTPS** a Internet falla: logcat muestra `SSLHandshakeException: Trust anchor for certification path not found` (incluso para `https://www.google.com/generate_204`, la prueba de conectividad del propio Android). Es el escaneo HTTPS del antivirus del equipo (Avast) que reemplaza los certificados con uno propio que Android no conoce. El backend en Node sí funciona porque confía en el certificado de Avast mediante `NODE_EXTRA_CA_CERTS`. No es un fallo de la app: la URL de la miniatura llega correcta (`https://i.ytimg.com/...`), pero la descarga de imágenes falla en este entorno. Por eso **B05 y B16 no se marcan completas**.

Opciones para resolverlo (decisión del equipo):
1. Desactivar temporalmente el escaneo HTTPS de Avast mientras se prueba.
2. Probar en un teléfono físico con otra red.
3. Añadir, solo en el build debug, el certificado raíz de Avast como ancla de confianza (modifica la configuración de seguridad de la app de desarrollo).

## Tiempos de respuesta

Medidos con un cronómetro temporal en `BuscarViewModel` (desde que se pulsa buscar hasta que el estado de resultados está listo; **ya revertido**, no está en el commit):

| Consulta (nueva) | Tiempo en la app |
|---|---|
| Feid Normal (primera, conexión en frío) | 676 ms |
| Maluma Felices los 4 | 1112 ms |
| Rosalia Despecha | 709 ms |
| Bad Bunny Titi | 694 ms |
| Karol G Provenza (ya en caché del backend) | 49 ms |
| Feid Normal repetida (caché de la app) | 0 ms |

Backend medido con `curl` (consultas nuevas, incluye dos llamadas a YouTube): 0.78–0.85 s; con caché: 0.04 s. Sugerencias: 0.68–0.81 s.

- **Backend:** ~0.8 s por búsqueda nueva.
- **App (tiempo de datos listos):** 0.7–1.1 s, es decir **por debajo de 2 s** en estas pruebas.
- **No medido:** el tiempo total percibido incluye pintar la lista y cargar las miniaturas; esto último no pudo medirse por el problema de TLS. Los volcados de pantalla de `uiautomator` tardan 4–6 s en este emulador, así que no sirven para medir la latencia; por eso se usó el cronómetro interno. Son pocas muestras en un emulador, con un backend local y la red de desarrollo: no es una prueba formal del criterio de 2 s.

## Riesgo de cuota (decisión para el equipo)

La API oficial cobra **100 unidades por cada `search.list`** y la cuota diaria por defecto es de 10 000, es decir, unas **100 búsquedas al día por clave**. El autocompletado usa también `search.list`, por lo que cada sugerencia consume una búsqueda. Mitigaciones implementadas: mínimo 3 caracteres, espera de 450 ms, caché de 5 minutos en backend y en la app. Aun así, un piloto con varios usuarios agotaría la cuota. Opciones a decidir con Juan Camilo: solicitar ampliación de cuota a Google, desactivar el autocompletado remoto, o usar una fuente de sugerencias distinta (el endpoint de sugerencias de Google no es oficial y no se usó).

## Qué se hizo

- Backend: `clasificarError` traduce los errores de YouTube a códigos estables (`cuota_excedida`, `api_key_invalida`, `youtube_no_autorizado`, `youtube_error`) sin incluir URL ni clave en los mensajes. Prueba real opcional en `backend/test-real/youtube.real.js` (`npm run test:real`, consume cuota).
- Android: `BusquedaApi`/`BusquedaRepository` (caché con vencimiento, errores no cacheados), `BuscarViewModel`, pantallas Inicio, Buscar y Detalle, componente `CancionItem` y miniaturas con Coil.
- La app solo habla con el backend; la clave nunca está en Android.
- Mensajes de error: sin conexión y error de servidor ofrecen "Reintentar"; cuota agotada, servicio no disponible y consulta inválida no lo ofrecen porque reintentar no sirve.

## Pruebas ejecutadas

| Suite | Resultado | Tipo |
|---|---|---|
| Backend `npm test` | 14/14 | Unitarias e integración HTTP, YouTube **simulado** |
| Backend `npm run test:real` | 3/3 | **YouTube real**: búsqueda con campos válidos, búsqueda sin resultados, clave inválida |
| Android `testDebugUnitTest` | 65/65, 0 fallos | `BusquedaRepositoryTest` 14 (MockWebServer), `BuscarViewModelTest` 13, `CancionTest` 4, más las del incremento 3 |
| Android `assembleDebug` | BUILD SUCCESSFUL | Compilación |

Búsqueda real realizada por el backend local: "Bohemian Rhapsody Queen" → 10 resultados con ID, título, canal, duración en segundos y miniatura `https://i.ytimg.com/...`. "Shakira" → 5 sugerencias.

## Seguridad de la clave

- `backend/.env` está en `.gitignore`, no está trackeado y la clave no aparece en ningún otro archivo del repositorio ni en el historial.
- `backend/.env.example` no tiene valor.
- Los mensajes de error no incluyen la clave (hay una prueba para eso).

## Cómo repetir la prueba

```bash
cd backend && npm start
adb reverse tcp:3000 tcp:3000
cd ../cliente-android && ./gradlew installDebug
adb shell am start -a android.intent.action.VIEW -d "https://nuclear.example.com/s/demo-activa-001" co.edu.cue.nuclear.cliente
# Entrar → Buscar una canción → escribir "Shakira" (sugerencias) → Enter → tocar un resultado
```
