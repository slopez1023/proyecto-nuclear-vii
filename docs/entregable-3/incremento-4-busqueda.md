# Incremento 4 — Búsqueda, autocompletado, detalle e integración YouTube (B03, B04, B05, B16)

## Estado real de cada historia (tras la prueba en dispositivo físico)

Resultados con **YouTube real → backend local → app Android en un TECNO KL8 físico** (Android 14, API 34, red móvil LTE, backend por túnel USB con `adb reverse`). Ver la matriz completa en [trazabilidad.md](trazabilidad.md).

| Historia | Estado | Qué se verificó |
|---|---|---|
| B03 Búsqueda | **Verificada en dispositivo físico (backend local)** | Búsqueda real, resultados con título, canal, duración y miniatura; sin resultados y error de conexión (emulador); datos listos en 0.57–1.14 s. |
| B04 Autocompletado | **Verificada funcionalmente; riesgo de cuota abierto** | Sugerencias reales mientras se escribe. Cada consulta consume 1 de las 100 llamadas diarias de `search.list` (ver "Cuota de YouTube Data API"). |
| B05 Información y miniaturas | **Verificada en dispositivo físico (backend local)** | Miniaturas reales en la lista y en el detalle, con título, canal, duración, disponibilidad e ID. |
| B16 Integración YouTube | **Verificada en dispositivo físico (backend local)** | Datos reales de YouTube llegan por el backend y se ven en el teléfono; errores de cuota y clave inválida clasificados (pruebas reales y unitarias). |

Reservas comunes: el backend corre en el equipo de desarrollo (no hay despliegue), la sesión de acceso es MOCK, la app se abrió con un enlace de `adb` y no escaneando un QR, y no se probó en tabletas.

## Validación en dispositivo físico (TECNO KL8)

Se comprobó con `adb devices -l` que el único dispositivo era el TECNO KL8 (serie omitida) y que no había emulador activo; todos los comandos usaron `-s` con esa serie.

| Prueba | Resultado | Evidencia |
|---|---|---|
| Enlace de acceso, Entrar, Inicio, Buscar | Correcto (arranque de la app: 1.6 s) | — |
| Autocompletado con "Shakira" | 5 sugerencias reales | `inc4-dispositivo-01-autocompletado.png` |
| Búsqueda "Shakira" | Resultados reales **con miniaturas cargadas** | `inc4-dispositivo-02-resultados-miniaturas.png` |
| Detalle de "Shakira - Soltera" | Miniatura grande, título, canal, "Duración 4:09", "Disponible", ID `oBofuVYDoG4` | `inc4-dispositivo-03-detalle.png` |
| Resultados a ~1 s de pulsar buscar | Lista con miniaturas ya visibles (Mon Laferte) | `inc4-dispositivo-04-a-1s-de-buscar.png` |
| Resultados a ~2 s de pulsar buscar | Lista con miniaturas (Sebastián Yatra) | `inc4-dispositivo-05-a-2s-de-buscar.png` |

### Tiempos en el teléfono

Cronómetro temporal en `BuscarViewModel` (desde que se pulsa buscar hasta que el estado de resultados está listo; **ya revertido**, no está en el código):

| Consulta nueva | Tiempo |
|---|---|
| Shakira | 960 ms |
| Feid Normal | 570 ms |
| Maluma Felices los 4 | 679 ms |
| Rosalia Despecha | 886 ms |
| Bad Bunny Titi | 574 ms |
| Juanes La Camisa Negra | 729 ms |
| Daddy Yankee Gasolina | 1141 ms |
| Sebastian Yatra Traidor | 739 ms |
| Mon Laferte Tu Falta De Amor | 704 ms |
| Feid Normal repetida (caché) | 1 ms |

- **Backend** (medido con `curl`, incluye dos llamadas a YouTube): 0.78–0.85 s por consulta nueva, 0.04 s con caché.
- **App, datos listos:** 570–1141 ms (mediana ~0.73 s), todas por debajo de 2 s.
- **Tiempo percibido:** con una espera de ~1 s tras pulsar buscar, la lista con miniaturas ya estaba en pantalla. El método (captura tras `sleep`) tiene una precisión de unos 0.3 s y solo da una cota superior; no es un cronómetro de render.
- **Límites:** 10 muestras con backend local conectado por USB y red móvil del teléfono. Un backend desplegado añadiría la latencia de red entre el teléfono y el servidor; el criterio de 2 s no está validado en un entorno desplegado.

## Validación previa en emulador (Pixel_10_ProyectoNuclear, API 37)

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

### Por qué no cargaban las miniaturas en el emulador

Desde el emulador, **todo HTTPS** a Internet falla: logcat muestra `SSLHandshakeException: Trust anchor for certification path not found` (incluso para `https://www.google.com/generate_204`, la prueba de conectividad del propio Android). Es el escaneo HTTPS del antivirus del equipo (Avast) que reemplaza los certificados con uno propio que Android no conoce. El backend en Node sí funciona porque confía en el certificado de Avast mediante `NODE_EXTRA_CA_CERTS`. No es un fallo de la app: la URL de la miniatura llega correcta (`https://i.ytimg.com/...`), pero la descarga de imágenes falla en este entorno. Por eso **B05 y B16 no se marcan completas**.

Opciones para resolverlo (decisión pendiente):
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

## Cuota de YouTube Data API (corregido)

**Corrección:** el informe anterior usaba el cálculo antiguo ("100 unidades por `search.list` de 10 000 diarias"). La documentación oficial vigente (consultada el 2026-11-05) dice otra cosa:

| Método | Costo | Cupo diario por defecto |
|---|---|---|
| `search.list` | **1 unidad por llamada** | **100 llamadas al día, en un cupo propio** (cupos granulares desde el 1 de junio de 2026) |
| `videos.list` | 1 unidad | Comparte las **10 000 unidades diarias** con el resto de métodos |
| `videos.insert` | 1 unidad | Cupo propio de 100 llamadas al día |
| `videos.batchGetStats` (nuevo, 3 de junio de 2026) | 1 unidad | Cupo propio de 10 000 unidades al día |
| `channels.list`, `playlists.list`, `videos.getRating` | 1 unidad | 10 000 unidades al día (cupo general) |
| `videos.update/rate/delete`, `playlists`/`channels` `insert/update/delete` | 50 unidades | 10 000 unidades al día (cupo general) |
| `captions.insert` / `captions.update` | 400 / 450 unidades | 10 000 unidades al día (cupo general) |

- Toda petición, incluso inválida, cuesta al menos 1 unidad.
- El cupo se reinicia a medianoche, hora del Pacífico.
- Para más cupo hay que llenar el formulario *Quota Extension Request* (no se ha solicitado; así lo indicó el líder técnico).
- El valor real del proyecto se consulta en Google Cloud Console; lo anterior son los valores por defecto de la documentación.

**Qué significa para el proyecto:** cada búsqueda del backend hace 1 `search.list` (cupo de 100 al día) y 1 `videos.list` (1 unidad del cupo de 10 000). El autocompletado hace exactamente lo mismo. El límite que importa es el de **100 llamadas `search.list` al día por proyecto**; el cupo de 10 000 unidades no corre riesgo. En la práctica el techo sigue siendo de unas 100 búsquedas o sugerencias al día, pero el cálculo en unidades del informe anterior era incorrecto. Las pruebas de desarrollo (reales, en emulador y en el teléfono) gastan del mismo cupo.

**Decisión del líder técnico (2026-11-05), pendiente de ratificar con Juan Camilo y Karen:** se mantiene el autocompletado remoto de YouTube para el Entregable 3 con las medidas actuales: mínimo 3 caracteres, espera de 450 ms, caché de 5 minutos en backend y app, y sin solicitudes duplicadas. No se solicita cuota adicional ni se cambia la estrategia de búsqueda sin consultar. El riesgo sigue abierto: un piloto con varios usuarios agotaría las 100 llamadas diarias.

Fuentes: [Cálculo de cuota](https://developers.google.com/youtube/v3/determine_quota_cost), [Primeros pasos: uso de cuota](https://developers.google.com/youtube/v3/getting-started), [Historial de revisiones](https://developers.google.com/youtube/v3/revision_history) (entradas del 1 y 3 de junio de 2026).

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
