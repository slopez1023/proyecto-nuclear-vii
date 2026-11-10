# Entregable 4 — Especificación técnica y guía de trabajo

**Proyecto:** PONGA (Proyecto Nuclear VII) · **Entregable:** Sistema de votación y visualización pública en tiempo real
**Para:** Juan Camilo Arias (Backend y base de datos) · **De:** Santiago Cardona (Frontend Android)
**Estado del documento:** versión actualizada con las decisiones definitivas del equipo (secciones 1 y 15.1). Lo "propuesto" (rutas, JSON, mecanismos) aún no está acordado ni implementado: el contrato lo propone Juan Camilo y lo revisa Santiago.

**Actualización de estado (2026-11-10):** este documento es la especificación de trabajo **previa a la implementación** (versión del 2026-11-08). Lo marcado como **[PROPUESTA]** o **[PENDIENTE]** se resolvió después: el contrato vigente está en `docs/entregable-4/contrato-api-e4.md`, las decisiones de cierre (H1, H3c, catálogo, sesión y analítica) en `cliente-android/docs/entregable-4/matriz-aceptacion-e4.md` y `revision-analitica-e4.md`, y el estado real de la implementación en `cliente-android/docs/entregable-4/`. Los ejemplos JSON de este documento son ilustrativos; los reales están en `backend/test/fixtures/contrato-e4.json`.

> **Cómo leer este documento.** Cada afirmación lleva una de estas etiquetas:
> - **[EXISTE]** está en el repositorio y lo verifiqué leyendo el código (se indica el archivo).
> - **[PARCIAL]** existe una parte, pero no basta para el Entregable 4.
> - **[NO EXISTE]** no hay nada en el repositorio.
> - **[DECIDIDO]** decisión definitiva del equipo, ya no se discute (se indica la fuente).
> - **[PROPUESTA]** idea para discutir; no es una decisión del equipo.
> - **[DOC]** viene de los documentos oficiales (`docs/Proyecto Nuclear VII (6).pdf` o la guía del proyecto), no del código.
> - **[PENDIENTE]** hay que acordarlo entre los dos (o con el equipo) antes de implementarlo.
>
> **Fuente de verdad:** las decisiones definitivas están en `docs/Proyecto Nuclear VII (6).pdf`; la guía general del proyecto contiene errores y no se usa para contradecirlas. Las capturas del prototipo que mencionan una regla de 15 reproducciones están **obsoletas** respecto a la regla de votación y no son fuente funcional vigente (15.4).
>
> No se ejecutó el backend ni se hicieron pruebas para escribir esto: todo sale de leer archivos. No se modificó ningún archivo de código.

---

## 1. Introducción

El Entregable 4 de la guía se llama **"Sistema de votación y visualización pública en tiempo real"**. Hasta el Entregable 3 un cliente podía entrar por QR y **buscar** canciones, pero no podía pedirlas ni votarlas. El Entregable 4 convierte esa búsqueda en participación:

1. el cliente **solicita** una canción: la solicitud registra automáticamente su voto a favor y la canción entra a la lista de espera;
2. otros clientes **votan** por las canciones ya solicitadas;
3. la lista se ordena por **popularidad** y todos la ven **actualizarse sola**, con la canción en reproducción y un tiempo estimado de espera.

Texto textual de la guía (**[DOC]**, `docs/GUIA_PROYECTO_NUCLEAR_MOVILES-BIGDATA_2S-2026.pdf`): *"botón o gesto de solicitud que agrega la canción a la lista de espera; mecanismo de votación adicional sobre canciones ya solicitadas; restricción de una votación por dispositivo; confirmación visual del voto registrado; cola ordenada por popularidad con contador de votos por canción, indicación de la canción en reproducción, actualización automática sin recargar y tiempo estimado de espera."* La fecha de entrega que figura en la guía es el viernes 6 de noviembre de 2026; conviene confirmar con el equipo/docente el estado real del plazo.

La guía añade como criterio de aceptación que **se generen eventos registrables por cada solicitud, voto y reproducción** para la capa analítica. La definición de los eventos es **conjunta** entre Backend, Android y el componente de analítica.

**Decisiones definitivas que fijan el alcance de este documento [DECIDIDO]:**
1. **Regla de votación:** por rangos de dispositivos activos del establecimiento (1–10 → 2 canciones, 11–30 → 4, 31–60 → 6, más de 60 → 8), aplicada por dispositivo y establecimiento y contando canciones reproducidas.
2. **Reproductor básico en el E4:** el equipo lo adelantó para que la cola, la canción actual, la regla de votación y el tiempo de espera tengan soporte funcional. El **backend mantiene el estado lógico** de la reproducción y un **reproductor autorizado dentro del establecimiento** (operador de música, de un entregable futuro) reporta éxito o fallo; **Android no reproduce ni controla canciones**. Las funciones avanzadas (salto, pausa, bloqueo, roles y autenticación, operación real del DJ) siguen en el Entregable 5 o en entregables futuros.
3. **Solicitar implica votar:** solicitar una canción registra automáticamente un voto a favor de ella. No son dos acciones independientes para el usuario, y no puede existir una solicitud aceptada sin su voto. Si el dispositivo no tiene disponible un voto, se rechaza la solicitud completa (no entra a la cola y no se registra ningún voto). Si la canción **está esperando o reproduciéndose**, no se duplica: se suma un voto a esa solicitud (si hay disponibilidad); si ya terminó de reproducirse, puede volver a agregarse.
4. **Inicio del intervalo de votación:** el intervalo se cuenta desde las reproducciones exitosas **posteriores** a la solicitud que registró el voto automático. La canción solicitada no cuenta, el contador parte de cero al aceptarse la solicitud, y solo las reproducciones exitosas lo incrementan (las fallidas no). Al aceptarse una nueva solicitud, el contador vuelve a cero. Un voto manual sobre una solicitud ajena también reinicia el intervalo.
5. **Reproducción que ya estaba en curso:** una reproducción exitosa cuenta para el intervalo de un dispositivo solo si **comenzó después** de la última solicitud aceptada por ese dispositivo. Una canción que comenzó antes no cuenta aunque termine bien después, y una que comenzó después pero falla tampoco cuenta. La desigualdad es estricta: si comienza en el mismo instante de la aceptación, no cuenta.
6. **Otras decisiones del equipo:** votos definitivos; orden por votos con desempate por antigüedad; nuevo rango aplicado de inmediato; el UUID identifica al dispositivo y se relaciona con su sesión actual; el intervalo persiste para el mismo dispositivo y establecimiento; dispositivo activo = conectividad actual; backend valida la canción en el catálogo; base de datos persistente; estados de solicitud según el documento del proyecto (en el E4: pendiente, en reproducción, reproducida y fallida); `409` para el rechazo por intervalo; vista pública con canción actual, cola y votos; eventos propuestos por el Backend y revisados por Karen y Android; mecanismo de tiempo real: **SSE**. Detalle en la sección 15.
7. **Canción votada manualmente:** cada reproducción exitosa de una canción votada manualmente cuenta para el intervalo del dispositivo que votó, siempre con la condición temporal estricta de la regla 5.
8. **Simulación de reproducciones en el E4:** mientras no exista un operador real, un mecanismo de simulación controlado desde el Backend registra reproducciones exitosas y fallidas para probar el intervalo, la contabilización, el tiempo estimado y la cola. Es temporal y **no** es la reproducción real de un DJ.
9. **Tiempo estimado:** se calcula con la duración de las canciones que están antes en la cola (fórmula y detalles por definir).
10. **Criterio de cierre del E4:** ver sección 17. **Inicio inmediato del desarrollo:** ver sección 13.

## 2. Contexto del proyecto

```
Celular (App Android: Kotlin + Jetpack Compose)  <--HTTP/JSON-->  Backend (Node.js + Express)  --->  YouTube Data API v3
        |                                                              |
   DataStore: UUID del dispositivo                    sesiones MOCK (JSON) + eventos (archivo JSONL)
```

- **Android** [EXISTE]: `cliente-android/`. Capas pantalla → ViewModel → repositorio → API Retrofit. Un solo `Retrofit` configurado en `app/src/main/java/co/edu/cue/nuclear/cliente/data/RedModule.kt` con la URL del backend.
- **Backend** [EXISTE]: `backend/`, Node ≥ 20, CommonJS, Express. **No tiene base de datos.**
- **La app nunca habla con YouTube**: lo hace el backend (la clave vive en `backend/.env`, no versionado).
- **Reglas de negocio ya definidas [DOC]:** cada establecimiento es independiente; solicitudes, votos y dispositivos se asocian a una **sesión**; el cliente no se registra ni da datos personales; el dispositivo se identifica con un UUID seudónimo.
- **Roles del equipo:** Santiago → Android; Juan Camilo → backend y BD; los **eventos analíticos** los propone el Backend y los revisan Karen (analítica / Big Data) y Android; es una responsabilidad compartida.

## 3. Estado actual del Backend

### 3.1 Estructura real de carpetas (archivos versionados con `git ls-files backend`)

```
backend/
├── .env.example               ← variables: YOUTUBE_API_KEY, PORT, PUBLIC_BASE_URL, ANDROID_PACKAGE, ANDROID_SHA256_CERT
├── package.json / package-lock.json
├── data/sesiones.mock.json    ← 3 sesiones ficticias (provisional)
├── public/index.html          ← cliente web auxiliar (B02) + ponga-logo.png
├── scripts/generar-qr.js      ← genera QR de las sesiones mock
├── src/
│   ├── server.js              ← arranque: carga sesiones, crea cliente YouTube y almacén de eventos
│   ├── app.js                 ← crea la app Express y define TODAS las rutas
│   ├── sesiones.js            ← validación del token QR
│   ├── youtube.js             ← cliente de YouTube Data API (búsqueda, caché, errores)
│   └── eventos.js             ← validación y almacenamiento (JSONL) de eventos
├── test/                      ← backend.test.js, contrato-eventos.test.js, fixtures/eventos-e3.json
└── test-real/youtube.real.js  ← prueba contra YouTube real (consume cuota; aparte)
```
Además existe `backend/data/eventos.jsonl` en disco, pero está ignorado por Git (`.gitignore`) y se crea al guardar eventos.

### 3.2 Tecnologías y dependencias (de `backend/package.json`)

| Dependencia | Versión | Uso |
|---|---|---|
| `express` | ^4.21.2 | servidor HTTP |
| `dotenv` | ^16.4.5 | lee `backend/.env` |
| `qrcode` | ^1.5.4 | solo `scripts/generar-qr.js` |

Scripts: `npm start` (`node src/server.js`), `npm test` (`node --test test/`), `npm run test:real`, `npm run qr`. Motor: Node ≥ 20. **No hay driver de base de datos, ORM, WebSocket ni librería de autenticación.**

### 3.3 Endpoints existentes — todos en `backend/src/app.js` [EXISTE]

| Método | Ruta | Qué hace | Respuestas verificadas en el código |
|---|---|---|---|
| GET | `/api/sesiones/:token` | Valida el token del QR (`validarToken` en `sesiones.js`) | 200 `{id_sesion, establecimiento{id_establecimiento,nombre}, estado, provisional:true}` · 400 `token_invalido` · 404 `sesion_inexistente` · 410 `sesion_cerrada` o `qr_desactivado` |
| GET | `/api/busqueda?q=` | Busca en YouTube (10 resultados); `q` de 2 a 100 caracteres | 200 `{resultados:[...]}` · 400 `consulta_invalida` · 503 `cuota_excedida` / `api_key_invalida` / `youtube_no_autorizado` / `sin_api_key` · 502 `youtube_no_disponible` · 500 `error_interno` |
| GET | `/api/busqueda/sugerencias?q=` | Títulos únicos de 5 resultados | 200 `{sugerencias:[...]}` y los mismos errores |
| POST | `/api/eventos` | Valida y guarda un evento | 202 `{evento_id}` · 400 con el código del error de validación |
| GET | `/.well-known/assetlinks.json` | Android App Links | 200 JSON |
| GET | `/s/:token` | Sirve `public/index.html` (cliente web de respaldo) | 200 HTML |
| (estático) | `express.static(public)` | Archivos de `backend/public` | — |

Formato de error uniforme: `{ "error": { "codigo": "...", "mensaje": "..." } }` (función `errorJson` en `app.js`). **Conviene mantenerlo en los endpoints nuevos.**

Forma de una canción en `resultados` (producida por `mapearCanciones` en `youtube.js`; también descrita en el modelo de datos del equipo): `youtube_video_id`, `titulo`, `artista_canal`, `duracion_segundos` (puede ser `null`), `url_miniatura` (puede ser `null`), `disponibilidad` (`"disponible"` / `"no_disponible"`). Los nombres de campo están verificados en `mapearCanciones` (`backend/src/youtube.js`, líneas 69–74).

### 3.4 Servicios y componentes relevantes

| Componente | Archivo | Qué hace / qué debe saber el E4 |
|---|---|---|
| `crearApp({sesiones, youtube, almacenEventos, config})` | `src/app.js` | **Inyección de dependencias**: recibe todo desde fuera, lo que permite probar sin red. Un servicio nuevo (p. ej. cola) debería seguir el mismo patrón. |
| `validarToken(token, sesiones)` | `src/sesiones.js` | Valida formato (`^[A-Za-z0-9_-]{8,64}$`), existencia, `estado === 'activa'` y `qr_estado === 'activo'`. Trabaja con un arreglo en memoria. |
| `cargarSesiones()` | `src/sesiones.js` | Lee `data/sesiones.mock.json` **una vez al arrancar**. |
| `crearClienteYoutube()` | `src/youtube.js` | Búsqueda en dos llamadas (`search` + `videos`), caché en memoria de 5 minutos, errores con código estable. |
| `validarEvento(body)` | `src/eventos.js` | Solo acepta `dispositivo_unido` y `busqueda_realizada`; exige `sesion_id` (texto no vacío) y `dispositivo_id` con forma de UUID; añade `evento_id`, `fecha_hora` (UTC), `actor:'cliente'`, `version_esquema:'1.0'`. |
| `crearAlmacen()` | `src/eventos.js` | Agrega una línea JSON a `data/eventos.jsonl` (`appendFileSync`). |

### 3.5 Persistencia actual

- **Sesiones:** archivo JSON de solo lectura (`data/sesiones.mock.json`), marcado como datos provisionales (`_aviso`: se reemplaza por el módulo real en el Entregable 5, HU-24). Campos reales: `id_sesion`, `qr_token`, `estado`, `qr_estado`, `establecimiento{id_establecimiento, nombre}`.
- **Eventos:** archivo `backend/data/eventos.jsonl`, una línea por evento. **No** es el pipeline de Big Data.
- **Canciones, solicitudes, votos, dispositivos, reproducciones:** **[NO EXISTE]** persistencia alguna. El backend ni siquiera registra dispositivos: solo comprueba que el `dispositivo_id` de un evento tenga forma de UUID.
- **Todo estado en memoria se pierde al reiniciar** (caché de YouTube).

### 3.6 Pruebas existentes

- `backend/test/backend.test.js` (15 casos `test(...)`): validación de token, duración ISO, mapeo de canciones, cliente YouTube con `fetch` simulado, clasificación de errores, validación de eventos, rutas HTTP (`/api/sesiones`, búsqueda, sugerencias, eventos, assetlinks, cliente web).
- `backend/test/contrato-eventos.test.js` (2 casos): comprueba por HTTP real que el backend acepta los cuerpos de `test/fixtures/eventos-e3.json` y rechaza los que no son del E3.
- `backend/test-real/youtube.real.js`: aparte, usa YouTube real.
- Estilo usado: `node:test` con `node:assert`, servidor Express levantado en puerto libre (`listen(0)`).
- CI: `.github/workflows/backend.yml` ejecuta `npm test` (existe el archivo; no verifiqué ejecuciones recientes).
- **Contrato compartido con Android:** `test/fixtures/eventos-e3.json` lo leen las pruebas del backend y `EventosRepositoryTest` de Android. Es un buen modelo para el contrato del E4 (ver sección 8).

### 3.7 Lo que hace hoy el lado Android (resumen, [EXISTE])

Archivos en `cliente-android/app/src/main/java/co/edu/cue/nuclear/cliente/`:
- `data/sesion/SesionApi.kt` (`GET api/sesiones/{token}`), `data/busqueda/BusquedaApi.kt` (`GET api/busqueda`, `GET api/busqueda/sugerencias`), `data/eventos/EventosApi.kt` (`POST api/eventos`). Son **las únicas tres llamadas** que hace la app.
- `data/sesion/SesionActiva.kt`: `SesionActiva(idSesion, dispositivoId)` guardada **solo en memoria**. Android ya conoce el `id_sesion` y su UUID tras entrar por QR: es lo que necesitará enviar en solicitudes y votos.
- `data/dispositivo/DispositivoRepository.kt`: UUID aleatorio en DataStore.
- `data/busqueda/BusquedaRepository.kt`: tiene un diccionario en memoria `cancionesPorId` que alimenta el detalle.
- `ui/screens/detalle/DetalleScreen.kt`: muestra la canción; **no tiene botón de solicitar** (su comentario dice que pertenece al E4). Las demás pantallas: acceso, QR inválido, inicio, buscar.
- No hay tiempo real, ni cola, ni votos, ni modelos de solicitud en Android.

## 4. Funcionalidades existentes que deben conservarse

| Funcionalidad del E3 | Dónde vive | Por qué no debe romperse |
|---|---|---|
| Validación de QR/sesión: `GET /api/sesiones/:token` y sus códigos 400/404/410 | `app.js`, `sesiones.js` | Android la usa y distingue cada código para mostrar su mensaje. |
| Búsqueda y sugerencias: `/api/busqueda`, `/api/busqueda/sugerencias`, caché de 5 min, clasificación de errores | `app.js`, `youtube.js` | Protege la cuota de YouTube; Android depende de los códigos de error. |
| `POST /api/eventos` con los dos tipos del E3 y el contrato `eventos-e3.json` | `app.js`, `eventos.js` | Pruebas de ambos lados. Si se amplía, hacerlo **sumando** tipos, sin cambiar los cuerpos actuales. |
| Formato de error `{error:{codigo,mensaje}}` y códigos estables | `app.js` | Android decide el mensaje en pantalla según `error.codigo`. |
| Clave de YouTube solo en el backend | `.env`, `youtube.js` | Seguridad. |
| Cliente web auxiliar `/s/:token`, `assetlinks.json` | `public/`, `app.js` | B02 y App Links. |
| Las 17 pruebas del backend y las 86 de Android | `test/`, `app/src/test` | Línea base de regresión (sección 14). |

**Aviso importante:** la prueba `contrato-eventos.test.js` comprueba que el backend **rechaza** tipos de evento fuera del E3. Si se agregan `solicitud_creada`, `voto_registrado`, etc., esa prueba tendrá que actualizarse **a propósito**; no debe interpretarse como una regresión.

## 5. Requerimientos funcionales del Entregable 4

Fuentes: decisiones del equipo (resumidas en la sección 1), `docs/Proyecto Nuclear VII (6).pdf` (**[DOC]**: historias B08–B14, requisitos de cola/votación, ER, eventos). Lo marcado **[PENDIENTE]** no está cerrado; la lista completa, con responsables, está en la sección 15.

### F1. Solicitud de canción con voto automático (agregar a la lista de espera) — **DECIDIDO**
- **Decisión:** **solicitar una canción implica registrar automáticamente un voto a favor de esa canción.** Para el usuario es una sola acción. No debe existir una solicitud aceptada que agregue una canción a la cola sin registrar el voto correspondiente.
- **Qué hace:** desde el detalle de una canción (o desde el resultado), el cliente pulsa "Solicitar". Si el dispositivo tiene disponible un voto, la canción entra a la cola de **su sesión** con ese voto ya contado (o, si ya estaba en la cola, suma su voto: ver abajo).
- **Flujo:**
  1. Android envía la solicitud con el UUID del dispositivo y la identificación de la canción.
  2. El backend **valida que la canción exista en el catálogo permitido** (no confía en los datos enviados por Android), valida la sesión y comprueba si el dispositivo **puede votar** según F3.
  3. **Si puede votar** (una sola operación atómica, sección 10): se acepta la solicitud, se registra **automáticamente un voto a favor**, se actualizan cola y contadores, y Android muestra la confirmación de la solicitud **y** del voto registrado.
  4. **Si no puede votar:** se rechaza la solicitud completa. **No** se agrega la canción a la cola, **no** se registra ningún voto y Android informa que no puede solicitar otra canción porque todavía no tiene disponible otro voto.
- **Si la canción ya está esperando o reproduciéndose [DECIDIDO]:**
  - Una canción se considera **duplicada mientras está esperando en la cola (Pendiente) o reproduciéndose (En reproducción)**. **No se agrega una instancia duplicada.**
  - Si el dispositivo tiene disponibilidad de voto, la solicitud se acepta y se **registra un voto adicional para esa canción** (la solicitud existente). Se actualiza el total de votos y, si corresponde, su posición en la cola.
  - Si el dispositivo no tiene disponibilidad, se rechaza y no se registra el voto.
  - **Si la canción ya terminó de reproducirse, puede volver a agregarse** como una solicitud nueva.
  - Consecuencia de la regla "un voto por dispositivo en cada solicitud": si el dispositivo **ya votó** esa solicitud, no puede aportar otro voto a la misma (`voto_duplicado`). Es una consecuencia derivada de las reglas vigentes; se confirma al revisar el contrato.
  - Interpretaciones menores a confirmar al revisar el contrato (sección 15.2, punto 11): que una solicitud *fallida* cuente como "ya terminada", y que una solicitud repetida se trate como solicitud (su canción no cuenta para quien la pide).
- **Validación de la canción [DECIDIDO]:** el backend comprueba que la canción pertenece al catálogo permitido y usa sus propios datos (título, duración, miniatura, disponibilidad), no los que mande Android. El **mecanismo** concreto lo define Juan Camilo (sección 15). Hoy la búsqueda ya filtra por categoría de música y videos incrustables (`youtube.js`, [EXISTE]).
- **Backend:** validar sesión y canción, **validar la disponibilidad de voto**, crear/obtener la canción (única por `youtube_video_id`), crear la solicitud (o sumar el voto a la existente) en una sola operación, emitir los eventos. **Es quien hace cumplir la regla**; Android no decide nada.
- **Android:** botón de solicitar, estado de envío, confirmación de solicitud y voto, y mensaje de rechazo. Puede deshabilitar el botón o avisar usando el estado de votación que recibe del backend, pero solo como ayuda visual: el backend vuelve a validar siempre.
- **Consecuencias:**
  - Toda solicitud aceptada nace con **al menos 1 voto**; el contador inicial es 1.
  - El dispositivo que solicita ya votó esa solicitud. La solicitud (o el voto adicional sobre una existente) es el **punto de partida del intervalo**: el contador de reproducciones exitosas empieza en 0 (F3).
  - Un dispositivo no puede solicitar otra canción hasta tener disponible otro voto, así que **no hace falta un límite aparte de solicitudes por dispositivo**.
- **Rechazo vs. fallo [DECIDIDO]:** una solicitud **rechazada** por falta de disponibilidad nunca existió (no tiene estado ni registro en la cola). Es distinta de una solicitud **aceptada que luego falló al reproducirse** (estado Fallida, F10).
- **Depende de:** sesión válida (E3) y de F3. Es la base de F2–F11.

### F2. Votación adicional sobre canciones ya solicitadas — **DECIDIDO (votos definitivos)**
- **Qué hace:** el cliente vota una solicitud existente de la cola, **pedida por otro dispositivo**. (El voto del propio solicitante ya se registró con la solicitud, F1.) Se le llama **voto manual (P2)** para distinguirlo del voto automático de la solicitud.
- **Esperado:** el voto incrementa el contador y puede reordenar la cola.
- **Los votos son definitivos [DECIDIDO]:** no se permite **cambiar ni retirar** un voto una vez registrado. No habrá operación para eso en el contrato.
- **Efecto en el intervalo [DECIDIDO]:** cada voto válido sobre una solicitud ajena **también reinicia el intervalo de votación** del dispositivo que lo realiza (ver F3, tabla de comparación).
- **Backend:** registrar el voto, validar las reglas de F3, recalcular, emitir evento. **Android:** botón de voto en cada fila de la cola y actualización del contador.
- **Datos:** `id_solicitud`, `dispositivo_id`. La solicitud y el dispositivo deben pertenecer a la **misma sesión** [DOC].

### F3. Restricción de votación por dispositivo — **DECIDIDO**
- **Regla:** cada dispositivo puede votar **una sola vez por cada solicitud**. Además, después de un voto válido debe esperar a que se reproduzcan con éxito cierto número de canciones antes de volver a votar. Ese número depende de los **dispositivos activos del establecimiento**:

| Dispositivos activos | Intervalo para votar |
|---|---|
| 1 a 10 | Cada 2 reproducciones exitosas |
| 11 a 30 | Cada 4 reproducciones exitosas |
| 31 a 60 | Cada 6 reproducciones exitosas |
| Más de 60 | Cada 8 reproducciones exitosas |

- **Cómo se aplica:**
  - Se aplica **por dispositivo y por establecimiento**, y se cuenta **en canciones reproducidas, no en tiempo**.
  - Solo cuentan las **reproducciones exitosas**. Las **fallidas** no cuentan (y las saltadas del E5 tampoco).
  - **Inicio del conteo [DECIDIDO]:** el contador de un dispositivo comienza **en cero cuando se acepta su solicitud y se registra el voto**. **La canción solicitada no cuenta** como reproducción para habilitar el siguiente voto.
  - **Condición temporal [DECIDIDO]:** una reproducción cuenta para el dispositivo únicamente si
    `inicio_reproduccion > fecha_solicitud_aceptada`
    (en el modelo, `inicio_en` de la Reproducción frente a la fecha de la última solicitud aceptada del dispositivo; para un voto manual, frente a la fecha de ese voto, ver abajo).
    - comenzó **antes** de la solicitud → **no cuenta**, aunque termine después;
    - comenzó **después** y termina con éxito → **cuenta**;
    - comenzó **después** pero falla → **no cuenta**;
    - comenzó **exactamente en el mismo instante** que la aceptación → **no cuenta** (la desigualdad es estricta).
  - **Evaluación individual:** por dispositivo y establecimiento; la misma reproducción puede contar para un dispositivo y no para otro, según su última solicitud (o voto) aceptado.
  - Al alcanzar el contador el intervalo vigente, el dispositivo puede **solicitar otra canción**; al aceptarse, **el contador vuelve a cero**.
  - Solo cuentan canciones que correspondan a una solicitud **con votos**. Como toda solicitud aceptada lleva su voto, la condición solo deja fuera canciones que no vienen de una solicitud (p. ej. la lista por defecto del E5).
- **Solicitud automática vs. voto manual [DECIDIDO]:**

| | Solicitud con voto automático (P1) | Voto manual sobre solicitud ajena (P2) |
|---|---|---|
| Qué hace el usuario | Pide una canción (nueva o ya presente en la cola) | Vota una solicitud de otro dispositivo |
| El voto | Se registra **automáticamente** | Se registra por acción explícita |
| ¿Consume el voto disponible? | Sí | Sí |
| ¿Reinicia el intervalo del dispositivo? | Sí: contador a 0 | Sí: contador a 0 |
| Lo que se compara con `inicio_reproduccion` | Fecha de la solicitud aceptada | Fecha del voto aceptado |
| ¿Cuenta la canción al reproducirse? | **No**: la canción de la propia solicitud (incluida la solicitud que suma voto a una existente) no cuenta | **Sí** [DECIDIDO]: cada reproducción exitosa de la canción votada cuenta para el votante, si comenzó después de su voto |
| Se puede deshacer | No (votos definitivos) | No (votos definitivos) |

  En ambos casos el **último voto válido** del dispositivo fija el momento desde el cual se cuenta. La **canción votada manualmente** sí cuenta: cada reproducción exitosa de esa canción incrementa el contador del dispositivo que votó, **siempre que haya comenzado después de su voto** (misma condición temporal estricta; no hay contradicción con la regla de las reproducciones que ya estaban en curso).
- **Cambio en la cantidad de dispositivos activos [DECIDIDO]:** el **nuevo intervalo se aplica inmediatamente** según el rango actual, evaluado cuando el dispositivo intenta votar. El **contador no se reinicia** por este cambio: solo se compara con el intervalo vigente. Ejemplo: contador 2; si el rango pasa de 2 a 4, aún no puede votar; si pasa de 4 a 2, ya puede.
- **Persistencia del intervalo [DECIDIDO]:** el intervalo se conserva si la app se cierra y se vuelve a abrir, siempre para el **mismo dispositivo y establecimiento**, y **no se reinicia por abrir una nueva sesión**. Cómo se asocia y conserva (relación UUID–dispositivo–sesión en el modelo) **no está definido**: sección 15.2, punto 3.
- **Dispositivo activo [DECIDIDO]:** un dispositivo se considera activo cuando **mantiene conectividad actual**. Si hace falta un heartbeat u otro mecanismo para comprobar esa conectividad, es un **detalle de implementación** que valida Juan Camilo (sección 15.2, punto 4) y no cambia esta definición funcional.
- **Ejemplo** — establecimiento con 10 dispositivos activos (intervalo de 2):

| Paso | Qué ocurre | Contador del dispositivo |
|---|---|---|
| 1 | El dispositivo solicita la Canción A; se acepta y se registra automáticamente su voto | 0 (la Canción A no cuenta) |
| 2 | Se reproduce exitosamente la Canción B (comenzó después de la solicitud) | 1 |
| 3 | Se reproduce exitosamente la Canción C (comenzó después) | 2 (intervalo cumplido) |
| 4 | El dispositivo ya puede solicitar otra canción | 2 |
| 5 | El dispositivo solicita la Canción D; se acepta y se registra el voto | vuelve a 0 |

  Si B o C hubiera fallado, o hubiera comenzado antes del paso 1, no habría incrementado el contador. Con el contador por debajo del intervalo, una solicitud nueva del dispositivo se rechaza completa.
- **Rechazo por intervalo [DECIDIDO]:** se responde con **`409 Conflict`**. Significado funcional: *"el dispositivo no tiene disponibilidad de voto porque no se ha cumplido el intervalo; el recurso no cambia"*. El **cuerpo** de esa respuesta forma parte del contrato que propone Juan Camilo (sección 8); el estándar actual de errores del backend `{error:{codigo,mensaje}}` es [EXISTE].
- **Consecuencia técnica:** esta regla **necesita** que el backend registre qué canciones se reproducen y con qué resultado; por eso el reproductor básico está en el E4 (F10).
- **Backend:** valida siempre (no se confía en Android). **Android:** muestra el estado y la disponibilidad de votación (y cuántas canciones faltan); no aplica la regla.
- Detalle en la sección 10.

### F4. Confirmación visual del voto registrado
- **Qué hace:** feedback inmediato tras solicitar o votar (y también si se rechaza).
- **Al solicitar:** confirmación de la solicitud **y** del voto registrado. **Al votar** una solicitud ajena: confirmación del voto.
- **Si se rechaza por falta de voto disponible:** mensaje claro (no puede solicitar otra canción porque todavía no tiene otro voto disponible). La canción no aparece en la cola.
- **Backend:** responder con éxito/errores claros y el estado actualizado. **Android:** confirmación visual, estado "ya votaste" mientras la regla lo exija, mensajes de rechazo.
- **Datos:** `total_votos`, `ya_voto` y el estado de votación del dispositivo; errores diferenciados (`voto_duplicado` vs. `intervalo_no_cumplido`, ambos `409`, distinguidos por su `codigo`).

### F5. Cola ordenada por popularidad — **DECIDIDO (orden y desempate)**
- **Qué hace:** lista de solicitudes **Pendientes** de la sesión, ordenadas.
- **Orden [DECIDIDO]:** de **mayor a menor cantidad de votos**.
- **Desempate [DECIDIDO]:** con igual cantidad de votos, va primero la solicitud **solicitada primero**.
- **Backend:** calcula el orden (única fuente de verdad). **Android:** solo dibuja en el orden recibido; no reordena.
- **Datos:** posición, solicitud, canción, votos.

### F6. Contador de votos por canción
- **Qué hace:** número de votos de cada solicitud.
- **Backend:** el total puede calcularse a partir de los registros de Voto; si se almacena, debe mantenerse consistente [DOC]. **Android:** muestra `total_votos`.
- **[DECIDIDO]** una solicitud nueva empieza en **1** voto (el automático). Los votos adicionales (P2 o solicitudes repetidas de otros dispositivos) lo incrementan.

### F7. Indicación de la canción en reproducción — **DECIDIDO: la soporta el reproductor básico (F10)**
- **Qué hace:** marca cuál canción suena ahora, en el celular y en la vista pública.
- **Backend:** mantiene la reproducción actual (estado lógico) y la entrega en la consulta de cola. **Android:** la muestra.

### F8. Actualización automática sin recargar
- **Qué hace:** la cola, los votos y la canción actual se refrescan solos.
- **Mecanismo [DECIDIDO]:** **SSE (Server-Sent Events)**. Ruta, formato de mensajes y reconexión los propone Juan Camilo en el contrato (sección 11).
- **Documento:** *"un cambio realizado por un usuario se refleja en la cola pública"*.

### F9. Tiempo estimado de espera
- **Qué hace:** estimación de cuánto falta para que suene una solicitud.
- **Documento:** prioridad **media**: *"cuando sea posible calcularlo"* (RF-21).
- **Regla [DECIDIDO]:** se calcula **utilizando la duración de las canciones que están antes en la cola**. Fórmula exacta, unidades, canciones sin duración y precisión **están por definir** (Juan Camilo propone, Santiago revisa; sección 12.2). Android muestra el valor y tolera que venga vacío.

### F10. Estado de reproducción y reproductor básico — **DECIDIDO: adelantado al Entregable 4**
- **Por qué se agrega:** sin un estado de reproducción no hay "canción actual", ni tiempo de espera, ni forma de saber cuándo un dispositivo vuelve a poder votar.
- **Modelo de funcionamiento [DECIDIDO]:**
  - El **backend mantiene el estado lógico** de la reproducción (qué suena, qué sigue, resultados).
  - Se usa **un reproductor autorizado dentro del establecimiento**, que ejecuta las acciones y **reporta al backend** si cada reproducción termina con éxito o falla. La reproducción real la hacen los **operadores de música o DJ**, funcionalidad de entregables futuros.
  - **Android no reproduce, pausa, salta ni controla canciones**, y no se asume que cualquier cliente Android pueda hacerlo.
  - Ese reporte alimenta la contabilización del intervalo de votación (F3) y la disponibilidad de votos.
- **Alcance del E4 (backend):**

| Capacidad | Descripción |
|---|---|
| Canción actual | Identificar cuál suena (`reproduccion_actual`) |
| Estado de reproducción | Estado lógico en el backend y resultado de cada reproducción |
| Avance | Pasar a la siguiente canción de la cola cuando termina la actual |
| Registro | Guardar cada reproducción con su resultado (**exitosa** o **fallida**) para aplicar la regla de votación |
| Datos para la espera | Duración de las canciones de la cola y registro lógico de la reproducción actual |

- **Controles visuales de Android (E4) frente a reproducción operativa (futuro):**

| | Entregable 4 | Entregables futuros |
|---|---|---|
| Android (Santiago) | Controles visuales de la **interfaz del cliente**: solicitar, votar, ver cola, canción actual, estado y disponibilidad de votación, tiempo estimado | — |
| Reproducción real del audio | No se hace desde Android | Operadores de música / DJ |
| Controles operativos (iniciar, continuar, pausar, detener, saltar) | No se desarrollan | Operadores de música / DJ (E5 y posteriores; HU-11, HU-26) |
| Autenticación y permisos de los operadores | No se desarrollan | E5 |

- **Estados de la solicitud (según `docs/Proyecto Nuclear VII (6).pdf`):** *pendiente*, *en reproducción*, *reproducida*, *saltada* y *fallida* (HU-15, marcada provisional) y *retirada* (ER). En el E4 solo se producen **pendiente, en reproducción, reproducida y fallida**: una reproducción exitosa deja la solicitud en *reproducida*; una fallida, en *fallida*. *Saltada* y *retirada* **se conservan en el modelo** y dependen de acciones del E5 (salto, retiro). El propio documento pide "alinear los estados definitivos" y menciona *abandonadas al cierre* "si se adoptan": la lista definitiva sigue por validar (15.3). Los identificadores exactos en el JSON se fijan en el contrato.
- **Rechazo vs. estado:** una solicitud rechazada por falta de disponibilidad **no es un estado**: nunca existió (ver F1).
- **Queda fuera del E4** [DOC/guía]: salto manual de canciones (HU-11), bloqueo de contenido (HU-12), pausa manual del sistema, lista por defecto cuando la cola se agota, activación/desactivación del QR por horario, modo mantenimiento, roles y autenticación, y panel de administración completo.
- **Responsabilidades:** Juan Camilo → estado lógico y registro de reproducciones, avance de cola, cálculo; Santiago → mostrar en la interfaz la canción actual y el estado (solo lectura).
- **Simulación de reproducciones durante el E4 [DECIDIDO]:** mientras no exista un operador real, se usa un **mecanismo de simulación controlado desde el Backend** que registra reproducciones **exitosas y fallidas**. Sirve para probar el intervalo de votación, la contabilización de reproducciones, el tiempo estimado y la lógica de la cola. Es **temporal** y no representa la reproducción real por un DJ. **Cómo se implementa lo propone Juan Camilo** (sección 15.2, punto 5); no se define aquí.

### F11. Vista pública web de la cola — **contenido DECIDIDO; responsable PENDIENTE**
- **Contenido [DECIDIDO]:** **canción actual**, **cola de reproducción** y **cantidad de votos**.
- **No incluye** controles administrativos ni controles de reproducción.
- **[PENDIENTE]** quién la construye y con qué tecnología (el cliente web actual `public/index.html` es el de B02, no una vista de cola). Usa los mismos datos de la cola (P3).

### Dependencias entre funcionalidades
```
F1 solicitud ─┬─> F5 cola ─┬─> F6 contador ──> F8 actualización ──> F11 vista pública
              └─> F2 voto ─┘        ^
F10 reproductor ──> F7 canción actual ──> F9 tiempo de espera
F10 reproductor (reporta éxito/fallo) ──> F3 (cuenta reproducciones) ──> F1 / F2 / F4
```

## 6. Repartición de responsabilidades

> Reparto vigente del equipo; los detalles técnicos se validan entre ambos. **No cambia** con las decisiones de este documento.

**Santiago — Frontend Android**
- Interfaz de solicitud (botón/gesto; **el voto se registra junto con la solicitud**) y de votación sobre canciones pedidas por otros.
- Confirmación visual de solicitudes y votos (la solicitud confirma ambos) y mensajes de rechazo, incluido el aviso de que no tiene otro voto disponible. Android solo **muestra** el estado y la disponibilidad de votación; no aplica la regla.
- Pantalla de cola: orden recibido, popularidad, contador de votos.
- Indicador de canción en reproducción y **controles visuales de la interfaz** del cliente (Android no reproduce ni controla canciones; ver F10).
- Actualización de la información en pantalla (consumo del flujo **SSE** que defina el contrato de Juan Camilo; validar si requiere dependencia).
- Presentación del tiempo estimado de espera.
- **Revisión del contrato API desde la perspectiva del cliente** (que sea adecuado para la integración).
- Integración con los endpoints (nuevo API Retrofit/repositorio/ViewModel) y datos simulados para trabajar antes de que el backend esté listo.

**Juan Camilo — Backend y base de datos**
- **Propuesta del contrato del backend** (endpoints y estructuras JSON) y decisiones técnicas relacionadas con el backend.
- Endpoints de solicitud, voto y reproducción.
- Registro y validación de votos y de la disponibilidad de voto (siempre en el servidor), **aplicada también a las solicitudes**: aceptar solicitud y voto automático en una sola operación atómica, o rechazar todo.
- Validación de que la canción pertenece al catálogo permitido.
- **Base de datos persistente** para solicitudes, votos y reproducciones.
- Gestión y ordenamiento de la cola; **estado lógico de reproducción** y registro de reproducciones reportadas.
- Dispositivos activos (conectividad actual; el mecanismo técnico para comprobarla lo propone Juan Camilo) y actualización en tiempo real con **SSE**.
- Lógica del tiempo estimado de espera.
- Propuesta del mecanismo de simulación de reproducciones (exitosas y fallidas) para el E4.
- Propuesta del motor de base de datos, de cómo enviar el UUID, de la validación del catálogo y del mecanismo de conectividad (el equipo y Santiago los validan).

**Eventos analíticos — responsabilidad compartida**
- El **Backend propone** los eventos analíticos del E4 (ver 7.2, P9); **Karen y Android los revisan**. No es responsabilidad exclusiva de una persona y no hay lista definitiva todavía.

**Ambos:** el contrato lo propone Juan Camilo y lo revisa Santiago **antes** de la integración (sección 8). Santiago puede trabajar con datos simulados.
**Por decidir:** el responsable de la vista pública web (F11); no bloquea la integración Android–Backend.

## 7. Especificación de endpoints

### 7.1 Endpoints existentes reutilizables [EXISTE]
Se conservan sin cambios (sección 3.3). El E4 reutiliza:
- `GET /api/sesiones/:token`: da el `id_sesion` que Android guardará y enviará.
- `GET /api/busqueda` y `/sugerencias`: de ahí salen las canciones que el usuario puede solicitar.
- `POST /api/eventos`: sigue valiendo para eventos que se generan en el cliente.

### 7.2 Endpoints propuestos [PROPUESTA — borrador de trabajo, no implementados]

> **Estado del contrato [DECIDIDO el proceso]:** **Juan Camilo propone el contrato del backend** (endpoints y JSON) y **Santiago lo revisa** desde Android. Esta sección y la 8 son un **borrador de trabajo** para arrancar esa conversación: **no son el contrato definitivo** y nada está implementado. Rutas, campos e identificadores pueden cambiar.

Convenciones del borrador, tomadas del backend actual: JSON, `snake_case`, errores `{error:{codigo,mensaje}}` [EXISTE], `id_sesion` en la ruta.

> **Abierto [PENDIENTE]:** cómo se envía el UUID del dispositivo en cada llamada (cuerpo/consulta o cabecera). El backend ya valida el formato UUID en eventos (`UUID_REGEX` en `eventos.js`). El UUID **no es una credencial**: quien lo conozca podría suplantar a ese dispositivo; se acepta como limitación del prototipo. El UUID identifica al dispositivo y se relaciona con su sesión actual; la regla se evalúa por dispositivo y establecimiento (sección 10).

#### P1. Solicitar una canción (con voto automático) — NUEVO
| Campo | Detalle |
|---|---|
| Método y ruta | `POST /api/sesiones/:idSesion/solicitudes` |
| Propósito | Crear una solicitud **y** registrar automáticamente el voto del dispositivo; si la canción ya está esperando o reproduciéndose, **sumar el voto a la solicitud existente**; o rechazar todo |
| Body (borrador) | `{ "dispositivo_id": "uuid", "cancion": { "youtube_video_id", … } }`. El backend **valida la canción en el catálogo permitido y no confía** en los demás datos de la canción que envíe Android; qué campos hacen falta en el body lo fija el contrato de Juan Camilo |
| Respuesta de éxito | La solicitud (nueva o existente) con su estado, `total_votos`, el voto registrado y el estado de votación del dispositivo (sección 8.1). Si es `201` o `200`, y cómo se distingue "nueva" de "sumó voto a una existente", queda en el contrato |
| Códigos | éxito · 400 datos inválidos · 404 `sesion_inexistente` · **409 `Conflict`: rechazo por falta de disponibilidad de voto (intervalo)** · 409 `voto_duplicado` (el dispositivo ya votó esa solicitud) · 410 sesión cerrada o QR desactivado |
| Validaciones | sesión existente y activa; `dispositivo_id` con forma de UUID; canción existente en el catálogo permitido y `disponible`; **el dispositivo puede votar (F3)**; tamaño de cuerpo (hoy `express.json` limita a 10 kb) |
| Garantía | **Atomicidad:** o se guardan solicitud y voto (o el voto sobre la existente), o no se guarda nada |
| Errores (nombres de trabajo) | `sesion_inexistente`, `sesion_cerrada`, `dispositivo_id_invalido`, `cancion_invalida`, `cancion_no_disponible`, `intervalo_no_cumplido`, `voto_duplicado` |

**Resultados posibles de P1:**

| Resultado | Qué pasa |
|---|---|
| Solicitud aceptada, canción nueva | Entra a la cola Pendiente con `total_votos` = 1; voto registrado; el contador del dispositivo parte de 0 |
| Solicitud aceptada, canción **ya esperando o reproduciéndose** | No se duplica; se suma 1 voto a la solicitud existente; se recalcula posición; el contador del dispositivo parte de 0 |
| Rechazada: sin disponibilidad de voto | `409`; no entra a la cola; **no** se registra voto; la respuesta indica cuántas canciones faltan (campo de trabajo) |
| Rechazada: el dispositivo ya votó esa solicitud | `409` `voto_duplicado` |
| Otros errores | sesión inexistente o cerrada, datos inválidos, canción fuera del catálogo o no disponible: no se crea nada |

#### P2. Votar una solicitud — NUEVO
| Campo | Detalle |
|---|---|
| Método y ruta | `POST /api/sesiones/:idSesion/solicitudes/:idSolicitud/votos` |
| Propósito | Registrar el voto manual de un dispositivo sobre una solicitud **existente de otro dispositivo** |
| Body (borrador) | `{ "dispositivo_id": "uuid" }` |
| Respuesta de éxito | El voto, la solicitud actualizada y el estado de votación del dispositivo |
| Códigos | éxito · 400 · 404 `solicitud_inexistente` / `sesion_inexistente` · 409 `voto_duplicado` · **409 `intervalo_no_cumplido`** · 410 sesión cerrada · 409 solicitud ya no votable (ya Reproducida/Fallida; el caso En reproducción está por confirmar, 15.2 punto 11) |
| Validaciones | solicitud y dispositivo de la **misma sesión**; **un voto por (solicitud, dispositivo)**; **intervalo según los dispositivos activos del establecimiento** (F3); solicitud Pendiente |
| Efecto | un voto válido **reinicia el intervalo** del dispositivo (F3) |
| No existe | **no hay operación para cambiar ni retirar un voto** (votos definitivos) |
| Estado | NUEVO |

> **Sobre el `409`:** se usa para el rechazo por intervalo, y también aparece en otros conflictos (`voto_duplicado`, solicitud no votable). Android los distingue por el `codigo` del error, como ya hace con los errores del E3. No se define aquí un formato de respuesta nuevo.

#### P3. Consultar la cola — NUEVO (cola, votos, canción actual, tiempo estimado y estado de votación del dispositivo)
| Campo | Detalle |
|---|---|
| Método y ruta | `GET /api/sesiones/:idSesion/cola` |
| Parámetros | `idSesion` (ruta); `dispositivo_id` (consulta, opcional) para devolver `ya_voto` y el estado de votación |
| Respuesta 200 | `{ sesion_id, version, actualizado_en, reproduccion_actual, reglas_votacion, mi_votacion, cola[] }` (borrador, 8.3) |
| Códigos | 200 · 404 · 410 |
| Estado | NUEVO. Con un solo GET se obtiene todo lo que Android y la vista pública necesitan, y sirve como consulta de estado para la carga inicial, mientras el flujo SSE entrega los cambios (propuesta; el contrato lo define Juan Camilo). |

#### P4. Estado de la reproducción — NUEVO (opcional)
`GET /api/sesiones/:idSesion/reproduccion` → el objeto `reproduccion_actual` de P3 (o `null`). **[PENDIENTE]** si hace falta aparte de P3.

#### P5. Detalle de una solicitud — NUEVO (opcional)
`GET /api/sesiones/:idSesion/solicitudes/:idSolicitud`. Puede omitirse si P3 basta. **[PENDIENTE]**.

#### P6. Flujo de actualización en tiempo real — **SSE [DECIDIDO el mecanismo]**
El mecanismo es **SSE** (sección 11). La **ruta, el formato de los mensajes y la reconexión** forman parte del contrato que propone Juan Camilo y revisa Santiago; **no se inventa aquí ningún endpoint**.

#### P7. Iniciar una reproducción — NUEVO (reproductor básico, F10)
| Campo | Detalle |
|---|---|
| Método y ruta | `POST /api/sesiones/:idSesion/reproduccion/iniciar` |
| Quién lo llama | El **reproductor autorizado** (operador de música; entregable futuro), no cualquier cliente Android. La autenticación y los permisos son del **E5**. **En el E4 estos reportes se simulan desde el Backend** (15.2, punto 5) |
| Propósito | Cuando no suena nada, el backend toma la primera solicitud de la cola (la de más votos; desempate por antigüedad) y la pasa a **En reproducción** |
| Respuesta 200 | `{ "reproduccion_actual": {...} }` |
| Códigos | 200 · 404 · 409 `ya_hay_reproduccion` · 409 `cola_vacia` · 410 sesión cerrada |
| Efectos | crea una Reproducción con `inicio_en` (servidor); la solicitud pasa a En reproducción |

#### P8. Reportar el resultado y avanzar — NUEVO (reproductor básico, F10)
| Campo | Detalle |
|---|---|
| Método y ruta | `POST /api/sesiones/:idSesion/reproduccion/siguiente` |
| Quién lo llama | El **reproductor autorizado**, que reporta si la reproducción terminó con éxito o falló. La autenticación y los permisos son del **E5**. **En el E4 estos reportes se simulan desde el Backend** (15.2, punto 5) |
| Propósito | Cerrar la reproducción actual con su resultado y pasar a la siguiente de la cola |
| Body (borrador) | `{ "resultado": "finalizada" \| "fallida", "segundos_reproducidos": 294, "codigo_error": "…" (solo si fallida) }` |
| Respuesta 200 | `{ "anterior": {...}, "reproduccion_actual": {...} \| null }` (`null` si la cola quedó vacía) |
| Códigos | 200 · 400 resultado inválido · 404 · 409 `sin_reproduccion_actual` |
| Efectos | guarda `fin_en` y `resultado`; la solicitud pasa a **Reproducida** (exitosa) o **Fallida**; **si es exitosa, incrementa el contador de cada dispositivo para el que `inicio_en` sea posterior a la fecha de su último voto aceptado** (no cuenta para quien solicitó esa canción; sí para quien la votó manualmente) (F3, desigualdad estricta); si falla no incrementa ningún contador; inicia la siguiente |
| Nota | `saltada` **no** se incluye (el salto es del E5); el campo `resultado` debe poder ampliarse sin romper el contrato |

**[PENDIENTE]** (P7 y P8): si el contrato de reportes se reutiliza para la simulación del E4 o se propone otro mecanismo, lo propone Juan Camilo (15.2, punto 5), junto con la forma de coordinar "el backend decide, el reproductor ejecuta". La **autenticación del reproductor y sus permisos pertenecen al E5**: el E4 no los diseña ni los implementa.

#### P9. Eventos analíticos del E4 — **[PENDIENTE: propone el Backend; revisan Karen y Android]**
Los eventos los **propone el Backend** y los **revisan Karen (analítica) y Android**; la responsabilidad es compartida y no hay lista definitiva. Lo que sí está documentado en el proyecto (sección XVI del documento) es el principio: **el servidor** registra el evento cuando confirma la acción, con hora UTC del servidor. Candidatos a definir: `solicitud_creada`, `solicitud_rechazada`, `voto_registrado`, `voto_rechazado`, `reproduccion_iniciada`, `reproduccion_finalizada`, `reproduccion_fallida` (el salto, `reproduccion_saltada`, es del E5). Quedan por definir en conjunto: cuáles se emiten en una solicitud aceptada con voto automático, cuáles en una solicitud sobre canción ya presente, y en un rechazo. Datos que el documento prevé: solicitud (canción, duración, posición en cola), voto (solicitud, votos totales, posición antes y después), rechazos (motivo), reproducción (origen, canción, votos, segundos reproducidos, código de error).

## 8. Contrato de integración Android–Backend [PROPUESTA — borrador ilustrativo]

> **Importante:** el contrato definitivo lo **propone Juan Camilo** y lo **revisa Santiago**. Estos ejemplos son un **borrador ilustrativo** para esa conversación: los nombres de campos e identificadores son de trabajo, no están acordados ni implementados. Lo único ya existente es el formato de error `{error:{codigo,mensaje}}`.

Todos los ejemplos son **coherentes entre sí** y siguen una misma historia (sesión `SES-MOCK-001`):

- A las 20:14:00 empieza a sonar *Billie Jean* (`SOL-0000`, 294 s, termina a las 20:18:54).
- Ya estaba pedida *Yesterday* (`SOL-0002`, 125 s) con **1 voto**: el automático de quien la solicitó.
- A las 20:15:03 el dispositivo `3f2b…` (que aún no había votado) solicita *Bohemian Rhapsody* (`SOL-0001`, 355 s): se acepta y **se registra su voto automático**; queda con 1 voto, segunda (empata con *Yesterday* y va después por haberse solicitado después, desempate **decidido**).
- A las 20:15:30 el mismo dispositivo `3f2b…` intenta solicitar otra canción: **se rechaza** porque no tiene voto disponible.
- A las 20:16:40 el dispositivo `7a91…` vota `SOL-0001`: queda con 2 votos y sube a primera.
- El establecimiento tiene 2 dispositivos activos (rango 1–10 → intervalo de 2 reproducciones exitosas).

Los UUID y valores son inventados. Los valores de `espera_estimada_segundos` y `segundos_restantes_estimados` son **ilustrativos**: la regla decidida es que el tiempo estimado se calcula con la duración de las canciones que están antes en la cola, y la fórmula exacta está por definir (12.2). **Obligatorio** = mínimo que Android necesita (borrador); **opcional** = se puede omitir o cambiar.

### 8.1 Solicitar una canción
`POST /api/sesiones/SES-MOCK-001/solicitudes` (el voto es automático: no se envía):
```json
{
  "dispositivo_id": "3f2b8c1e-9d4a-4e6b-8a1c-0b5d7e9f1a2b",
  "cancion": {
    "youtube_video_id": "AAA111",
    "titulo": "Bohemian Rhapsody",
    "artista_canal": "Queen Official",
    "duracion_segundos": 355,
    "url_miniatura": "https://i.ytimg.com/vi/AAA111/mqdefault.jpg",
    "disponibilidad": "disponible"
  }
}
```
(Android envía estos datos de la canción que ya tiene de la búsqueda, pero el backend **los valida contra el catálogo permitido y usa los suyos**; qué campos hacen falta realmente lo decide el contrato.)

Respuesta de éxito (`201` en este borrador):
```json
{
  "solicitud": {
    "id_solicitud": "SOL-0001",
    "estado": "pendiente",
    "posicion": 2,
    "total_votos": 1,
    "fecha_solicitud": "2026-11-10T20:15:03.000Z",
    "cancion": {
      "youtube_video_id": "AAA111", "titulo": "Bohemian Rhapsody", "artista_canal": "Queen Official",
      "duracion_segundos": 355, "url_miniatura": "https://i.ytimg.com/vi/AAA111/mqdefault.jpg"
    },
    "es_mia": true,
    "ya_voto": true,
    "espera_estimada_segundos": 356
  },
  "voto": { "id_voto": "VOT-0003", "id_solicitud": "SOL-0001", "fecha_hora": "2026-11-10T20:15:03.000Z" },
  "mi_votacion": { "puede_votar": false, "canciones_restantes": 2 }
}
```
(356 s = 231 s que le quedan a la canción actual a las 20:15:03 + 125 s de *Yesterday*, que va antes. `voto` es el voto automático; `mi_votacion` indica que este dispositivo no tiene voto disponible hasta que se cumplan 2 reproducciones exitosas posteriores.)

**Si la canción ya estaba esperando o reproduciéndose**, la respuesta de éxito tendría la misma forma pero con la solicitud **existente** (con su `total_votos` incrementado y su posición recalculada) y el voto adicional registrado. Cómo se distingue de una solicitud nueva (código `200`/`201` o un campo) lo define el contrato.

**Solicitud rechazada** (misma petición, otra canción, a las 20:15:30; el dispositivo `3f2b…` no tiene voto disponible) → **`409 Conflict`**:
```json
{
  "error": {
    "codigo": "intervalo_no_cumplido",
    "mensaje": "Todavía no tienes otro voto disponible, por eso no puedes solicitar otra canción.",
    "intervalo_canciones": 2,
    "canciones_restantes": 2
  }
}
```
`codigo` y `mensaje` siguen el formato existente; `intervalo_canciones` y `canciones_restantes` son **campos de trabajo** que ayudarían a Android a explicar el rechazo (Santiago los revisará). No se crea ninguna solicitud ni voto y la cola no cambia.

### 8.2 Votar por una canción
`POST /api/sesiones/SES-MOCK-001/solicitudes/SOL-0001/votos`:
```json
{ "dispositivo_id": "7a91d4e2-5c3b-4f08-9b6e-2d4c8a0e1f33" }
```
Respuesta de éxito:
```json
{
  "voto": { "id_voto": "VOT-0004", "id_solicitud": "SOL-0001", "fecha_hora": "2026-11-10T20:16:40.000Z" },
  "solicitud": {
    "id_solicitud": "SOL-0001", "estado": "pendiente", "posicion": 1, "total_votos": 2,
    "ya_voto": true, "espera_estimada_segundos": 134
  },
  "mi_votacion": { "puede_votar": false, "canciones_restantes": 2 }
}
```
(134 s = lo que le queda a *Billie Jean* a las 20:16:40. Este voto **reinicia el intervalo** de `7a91…`: contador en 0, por eso faltan 2.)

Errores (`409`, formato existente). Si el mismo dispositivo repite el voto sobre `SOL-0001`:
```json
{ "error": { "codigo": "voto_duplicado", "mensaje": "Este dispositivo ya votó por esta solicitud." } }
```
Si ese dispositivo intenta votar `SOL-0002` antes de cumplir el intervalo:
```json
{
  "error": {
    "codigo": "intervalo_no_cumplido",
    "mensaje": "Aún no puedes votar de nuevo.",
    "intervalo_canciones": 2,
    "canciones_restantes": 2
  }
}
```
(`intervalo_canciones`, `canciones_restantes` y `mi_votacion` son campos de trabajo.)

### 8.3 Consultar la cola (incluye votos, canción actual, tiempo estimado y estado de votación)
`GET /api/sesiones/SES-MOCK-001/cola?dispositivo_id=7a91d4e2-5c3b-4f08-9b6e-2d4c8a0e1f33` → `200`:
```json
{
  "sesion_id": "SES-MOCK-001",
  "version": 17,
  "actualizado_en": "2026-11-10T20:16:40.000Z",
  "reproduccion_actual": {
    "id_reproduccion": "REP-0001",
    "id_solicitud": "SOL-0000",
    "estado": "reproduciendo",
    "cancion": { "youtube_video_id": "ZZZ999", "titulo": "Billie Jean", "artista_canal": "Michael Jackson",
                 "duracion_segundos": 294, "url_miniatura": "https://i.ytimg.com/vi/ZZZ999/mqdefault.jpg" },
    "inicio_en": "2026-11-10T20:14:00.000Z",
    "segundos_restantes_estimados": 134
  },
  "reglas_votacion": { "dispositivos_activos": 2, "intervalo_canciones": 2 },
  "mi_votacion": { "puede_votar": false, "canciones_restantes": 2 },
  "cola": [
    { "posicion": 1, "id_solicitud": "SOL-0001", "estado": "pendiente", "total_votos": 2,
      "cancion": { "youtube_video_id": "AAA111", "titulo": "Bohemian Rhapsody", "artista_canal": "Queen Official",
                   "duracion_segundos": 355, "url_miniatura": "https://i.ytimg.com/vi/AAA111/mqdefault.jpg" },
      "ya_voto": true, "espera_estimada_segundos": 134 },
    { "posicion": 2, "id_solicitud": "SOL-0002", "estado": "pendiente", "total_votos": 1,
      "cancion": { "youtube_video_id": "BBB222", "titulo": "Yesterday", "artista_canal": "The Beatles",
                   "duracion_segundos": 125, "url_miniatura": null },
      "ya_voto": false, "espera_estimada_segundos": 489 }
  ]
}
```
(489 s = 134 s restantes de la actual + 355 s de *Bohemian Rhapsody*. La cola contiene solo solicitudes **Pendientes**; la que suena viaja en `reproduccion_actual`.)

- **Obligatorios (mínimo del borrador):** `cola[]` y, en cada elemento, `id_solicitud`, `posicion`, `total_votos`, `cancion` con `youtube_video_id` y `titulo`.
- **Opcionales/de trabajo:** `version` (descartar respuestas viejas o desordenadas), `actualizado_en`, `reproduccion_actual` y sus campos, `reglas_votacion`, `mi_votacion`, `ya_voto`, `es_mia`, `espera_estimada_segundos` (puede ser `null`), `segundos_restantes_estimados`.
- `reproduccion_actual` puede ser `null`; `cola` puede ser `[]`; `duracion_segundos` y `url_miniatura` pueden ser `null`, como en la búsqueda actual.
- Si `espera_estimada_segundos` falta o es `null`, Android no muestra estimación.
- `mi_votacion` solo viene si se envía `dispositivo_id`. `puede_votar` es **una ayuda**: el backend vuelve a validar.

### 8.4 Estado de la reproducción y reporte del reproductor autorizado
**Consultar** (`GET /api/sesiones/SES-MOCK-001/reproduccion`, P4) → el mismo objeto `reproduccion_actual` de 8.3 (o `null`).

**Iniciar** (`POST …/reproduccion/iniciar`, P7; lo llama el reproductor autorizado) → `200`:
```json
{ "reproduccion_actual": { "id_reproduccion": "REP-0001", "id_solicitud": "SOL-0000", "estado": "reproduciendo",
    "cancion": { "youtube_video_id": "ZZZ999", "titulo": "Billie Jean" },
    "inicio_en": "2026-11-10T20:14:00.000Z", "segundos_restantes_estimados": 294 } }
```

**Reportar el resultado y avanzar** (`POST …/reproduccion/siguiente`, P8; lo llama el reproductor autorizado), a las 20:18:54:
```json
{ "resultado": "finalizada", "segundos_reproducidos": 294 }
```
Respuesta `200`:
```json
{
  "anterior": { "id_reproduccion": "REP-0001", "id_solicitud": "SOL-0000", "resultado": "finalizada" },
  "reproduccion_actual": { "id_reproduccion": "REP-0002", "id_solicitud": "SOL-0001", "estado": "reproduciendo",
    "cancion": { "youtube_video_id": "AAA111", "titulo": "Bohemian Rhapsody" },
    "inicio_en": "2026-11-10T20:18:54.000Z", "segundos_restantes_estimados": 355 }
}
```
Qué significa esto para los contadores (regla de F3):
- *Billie Jean* (`SOL-0000`) **comenzó a las 20:14:00**, antes de la solicitud de `3f2b…` (20:15:03) y antes del voto de `7a91…` (20:16:40). Aunque terminó bien, **no cuenta** para ninguno de los dos: ambos contadores siguen en 0 y `canciones_restantes` sigue en 2.
- *Bohemian Rhapsody* (`SOL-0001`) empieza a las 20:18:54. Para `3f2b…` es su propia canción solicitada: **no cuenta**. Para `7a91…`, que la votó con un voto manual a las 20:16:40, **sí cuenta** si termina con éxito (comenzó después de su voto): su contador pasaría de 0 a 1 y `canciones_restantes` de 2 a 1. También contaría para un tercer dispositivo cuyo último voto fuera anterior a las 20:18:54.
- Si un video falla, no incrementa el contador de nadie. Ejemplo de reporte: `{ "resultado": "fallida", "segundos_reproducidos": 12, "codigo_error": "video_no_reproducible" }`; la solicitud queda en estado Fallida.

## 9. Diseño preliminar de base de datos

**Decisión [DECIDIDO]:** se usará una **base de datos persistente** para solicitudes, votos y reproducciones. Los archivos JSON de simulación (`sesiones.mock.json`) y el archivo de eventos (`eventos.jsonl`) **no** son la solución definitiva de persistencia. El **motor** concreto sigue sin decidirse (**[PENDIENTE]**, lo define Juan Camilo). El modelo de referencia es el ER del equipo (**[DOC]**, sección XV), que él mismo llama "base conceptual para discutir".

### 9.1 Estructura existente
- **Sesión (mock):** `data/sesiones.mock.json` (`id_sesion`, `qr_token`, `estado`, `qr_estado`, `establecimiento{id_establecimiento, nombre}`). Se conserva temporalmente durante el desarrollo (sección 15).
- **Evento analítico:** `data/eventos.jsonl`, parecido a la entidad *Evento analítico* del ER.
- **Dispositivo:** existe como UUID en el celular; **no** como registro en el backend.
- **Canción:** existe como respuesta JSON de búsqueda, sin persistir.
- **Solicitud, Voto, Reproducción:** [NO EXISTE].

### 9.2 Entidades que el E4 necesita (definidas en el ER del equipo) [PROPUESTA de uso]

| Entidad (ER) | Necesaria en E4 | Justificación | Atributos relevantes según el ER |
|---|---|---|---|
| Establecimiento | Sí | La regla de votación y el intervalo se aplican **por establecimiento** | `id_establecimiento`, `nombre`, `estado` |
| Sesión | **Sí** | Solicitudes y reproducciones pertenecen a una sesión; hoy es mock | `id_sesion`, `id_establecimiento`, `estado`, `qr_token` (único) |
| Dispositivo | **Sí** | "Un voto por solicitud", intervalo y dispositivos activos | `id_dispositivo`, `id_sesion`, `identificador_seudonimo`, `ultima_actividad`, `estado_conexion`, `ultima_conexion`, `ultima_desconexion`; único (`id_sesion`, `identificador_seudonimo`). El ER liga el dispositivo a una **sesión**, coherente con que el UUID se relaciona con la sesión actual (ver 9.4) |
| Canción | **Sí** | La solicitud referencia una canción | `id_cancion`, `youtube_video_id` (único), `titulo`, `artista_canal`, `duracion_segundos`, `url_miniatura`, `disponibilidad`, `consultado_en` |
| Solicitud | **Sí** | Elemento de la cola; se crea **junto con su primer Voto**. **No se duplica** para la misma canción pendiente | `id_solicitud`, `id_sesion`, `id_cancion`, `id_dispositivo`, `fecha_solicitud`, `estado` |
| Voto | **Sí** | Contador, un voto por solicitud y referencia temporal del intervalo; definitivo (no se cambia ni se retira) | `id_voto`, `id_solicitud`, `id_dispositivo`, `fecha_hora`, `estado`; **único (`id_solicitud`, `id_dispositivo`)** |
| Reproducción | **Sí (reproductor básico)** | Canción actual, resultado exitoso/fallido, intervalo, tiempo de espera | `id_reproduccion`, `id_sesion`, `id_cancion`, `id_solicitud`, `inicio_en`, `fin_en`, `resultado`, `duracion_reproducida_segundos`, `codigo_error` |
| Evento analítico | **Sí** | Eventos de solicitud, voto y reproducción | ya existe en forma de archivo |
| Lista por defecto / Elemento de lista | No (E5) | Continuidad musical | — |
| Personal autorizado | No (E5) | Administración con roles | — |

### 9.3 Cómo se obtienen los datos de la regla de votación (conceptual, no es una consulta definitiva)
- **Último voto válido del dispositivo (referencia del conteo):** el `Voto` más reciente de ese dispositivo en el establecimiento (el voto automático de una solicitud o un voto manual). Su fecha se compara con `inicio_en`.
- **Reproducciones que cuentan:** `Reproducción` del establecimiento con `resultado` exitoso y `inicio_en` **estrictamente posterior** a esa fecha, cuya `Solicitud` tenga al menos un voto. La canción de la propia solicitud del dispositivo no cuenta; la de un voto manual sí cuenta. Una reproducción que comenzó antes de la solicitud o del voto no cuenta aunque termine después. El contador es esa cuenta; no necesita guardarse aparte (puede guardarse si se decide por rendimiento).
- **Persistencia del intervalo:** el intervalo debe conservarse para el mismo dispositivo y establecimiento (decidido). **[PROPUESTA a validar por Juan Camilo]:** calcularlo a partir de los registros de Voto y Reproducción guardados en la base de datos; el mecanismo de asociación entre sesiones no está definido (9.4, punto 4).
- **Solicitud y voto:** se crean **en la misma transacción**; no puede persistirse una Solicitud sin su Voto. Un rechazo no escribe nada.
- **Dispositivos activos del establecimiento:** los que mantienen conectividad actual (el mecanismo técnico para comprobarla está por validar).

### 9.4 Decisiones y puntos pendientes de base de datos
1. **Motor** y forma de ejecutarlo/probarlo sin complicar el CI actual.
2. **Estados de la Solicitud:** se usan los del documento del proyecto (pendiente, en reproducción, reproducida, saltada, fallida; y retirada en el ER). En el E4 solo se producen pendiente, en reproducción, reproducida y fallida; los demás se conservan y dependen del E5. La lista definitiva sigue por validar (15.3).
3. Si el total de votos y la posición se almacenan o se calculan en cada consulta.
4. **Identidad del dispositivo [DECIDIDO]:** el UUID identifica al dispositivo y se relaciona con la sesión que tiene en ese momento; **no** es un UUID asociado al establecimiento. **Ajuste a revisar:** el ER define el Dispositivo ligado a una sesión (único por sesión y seudónimo), mientras que el intervalo debe persistir para el mismo dispositivo y establecimiento aunque cambie de sesión. El ER actual no expresa cómo reconocer al mismo dispositivo entre sesiones del mismo establecimiento. **No se define aquí ningún mecanismo**; queda como revisión del modelo (15.2, punto 3).
5. **Sesión mock:** se conserva temporalmente durante el desarrollo; su reemplazo definitivo es del E5 (HU-24) y no se adelanta (15.3).
6. Tipo de los identificadores (hoy las sesiones usan textos como `SES-MOCK-001`).
7. Política de datos: el identificador seudónimo no debe mostrarse innecesariamente.

## 10. Restricción de votación por dispositivo (regla definitiva)

**Identidad [DECIDIDO].** El UUID identifica al dispositivo y se relaciona con la sesión que tiene en ese momento; **no** pertenece al establecimiento. La restricción de votación se evalúa por dispositivo **y** establecimiento. [EXISTE] hoy Android genera un UUID aleatorio por instalación (DataStore) y el backend lo valida solo por formato. Cómo se relaciona el mismo dispositivo con distintas sesiones de un establecimiento para conservar su intervalo **no está definido** (sección 15.2, punto 3).

**Lo que debe comprobar el backend en cada voto** (nunca confiar en Android). Aplica **a P2 (votar) y a P1 (solicitar)**, porque solicitar registra un voto; en P1 el punto 2 se refiere a la solicitud existente solo cuando la canción ya está esperando o reproduciéndose:
1. la sesión existe y está activa;
2. la solicitud (si la hay) existe, es de **esa** sesión y está Pendiente (en P1 también En reproducción, si se suma un voto a una canción repetida);
3. la canción pertenece al catálogo permitido (P1);
4. no existe ya un voto de ese dispositivo para esa solicitud (`voto_duplicado`);
5. se cumple el **intervalo por rangos**:
   - se cuentan los **dispositivos activos del establecimiento** en ese instante (los que mantienen conectividad actual) → intervalo de 2, 4, 6 u 8 reproducciones exitosas, aplicado **inmediatamente** si el rango cambió;
   - se cuentan las reproducciones **exitosas** cuyo `inicio_en` es **estrictamente posterior** al último voto válido del dispositivo, sin contar la canción de su propia solicitud (la de un voto manual sí cuenta);
   - una reproducción que ya estaba en curso al votar no cuenta aunque termine bien, ni una que falla;
   - si el contador es menor que el intervalo → rechazo `409` `intervalo_no_cumplido` con las que restan (`intervalo − contador`);
   - al aceptarse la solicitud o el voto, **el contador vuelve a 0**.

**Persistencia.** Restricción única (`id_solicitud`, `id_dispositivo`) como defensa final contra duplicados; las comprobaciones en código dan los mensajes claros. **Decidido:** el intervalo se conserva al cerrar y abrir la app para el mismo dispositivo y establecimiento, sin reiniciarse por abrir una nueva sesión. **[PROPUESTA a validar por Juan Camilo]:** obtener el contador del historial de Voto y Reproducción guardado en la base de datos; la asociación entre sesiones sigue por definir (15.2, punto 3). Como el contador se reinicia al aceptar un voto, crear la solicitud y su voto (que fija el nuevo punto de partida) debe ser atómico.

**Concurrencia.** Dos peticiones simultáneas del mismo dispositivo (doble toque, reintento de red) no deben producir dos votos. Con Node, el riesgo existe si hay operaciones asíncronas entre "comprobar" y "guardar". La solución robusta es que comprobar e insertar sean **atómicos** (restricción única + transacción, o una sección crítica). Android además desactiva el botón mientras envía, pero eso es solo ayuda. Hay otro caso: un voto que llega **justo cuando una reproducción termina o comienza**; el resultado debe ser determinista (se evalúa con el estado de reproducción al momento de procesar, con la desigualdad estricta de F3).

**Solicitud con voto automático y evasión.** En P1 la comprobación del intervalo y la creación de la solicitud y de su voto forman **una sola operación atómica**: si el dispositivo no puede votar, no se escribe nada. Un dispositivo no puede evadir la regla enviando solicitudes repetidas ni en paralelo: la primera consume su voto y las demás se rechazan con `intervalo_no_cumplido`. Tampoco sirve combinar solicitar y votar, porque ambas acciones consumen el mismo voto. Límite conocido: quien borre los datos de la app obtiene un UUID nuevo (ver Suplantación).

**Dispositivos activos [DECIDIDO].** Un dispositivo es activo cuando **mantiene conectividad actual**, como pide el documento del proyecto (no basta la última interacción). Si se requiere un heartbeat u otro mecanismo técnico para comprobarla (frecuencia, tiempo de espera, qué llamadas lo alimentan), es un detalle de implementación que valida Juan Camilo y no cambia la definición.

**Votos definitivos [DECIDIDO].** No hay cambio ni retiro de voto: un voto registrado es permanente, así que no existe operación de borrado ni de modificación.

**Suplantación.** Cualquiera que conozca un UUID podría votar como ese dispositivo; con 128 bits aleatorios no es adivinable. Aceptable para el prototipo; conviene escribirlo como limitación.

## 11. Actualización en tiempo real

**Hoy:** [NO EXISTE] ningún mecanismo. El backend solo atiende peticiones; no hay SSE, WebSocket ni difusión. Android tampoco tiene lógica de actualización periódica.

**Decisión [DECIDIDO]: se utilizará SSE (Server-Sent Events)** como mecanismo de tiempo real.
- **Qué es:** una conexión HTTP que se mantiene abierta y por la que el servidor "empuja" los cambios (cola, votos, canción actual) hacia los clientes. Encaja con el caso porque la información solo fluye del servidor al cliente.
- **No elegidas:** polling periódico y WebSockets se evaluaron y no se seleccionaron.
- **Qué NO está definido todavía** (lo propone Juan Camilo en el contrato, sección 15.2, punto 1): la ruta del flujo, el formato de los mensajes y la política de reconexión. En este documento no se inventa ningún endpoint de SSE.
- **Android (Santiago):** valida cómo consumir el flujo y **si requiere una dependencia nueva**; no se agrega ninguna sin acordarlo (sección 15.2, punto 10).
- **Carga inicial [PROPUESTA]:** la consulta de estado de la cola (P3) sirve para cargar el estado al abrir la pantalla, mientras SSE entrega los cambios posteriores. Lo confirma el contrato.
- **Relación con la conectividad [A evaluar por Juan Camilo]:** si la conexión abierta puede ayudar a comprobar la conectividad actual de los dispositivos es parte del mecanismo técnico del punto 4 de la sección 15.2; no está decidido.

No se implementa nada aquí.

## 12. Ordenamiento de la cola y tiempo estimado

### 12.1 Popularidad y orden — **DECIDIDO**
1. **Orden:** de mayor a menor número de votos.
2. **Desempate:** con los mismos votos, primero la solicitud solicitada antes.
3. **Valor inicial:** una solicitud nueva empieza con 1 voto (el automático).
4. **Qué entra a la cola:** solicitudes **Pendientes**; la que suena viaja aparte (`reproduccion_actual`).
5. **Canción duplicada:** mientras una canción está **esperando o reproduciéndose** no se duplica: se suma un voto a su solicitud. Si **ya terminó de reproducirse**, puede volver a agregarse como una solicitud nueva.
6. **Siguiente canción:** al avanzar, el backend toma la primera de la cola en ese momento según el orden anterior.
7. **Dónde se calcula:** el servidor, única fuente de verdad (celular y vista pública deben coincidir).

### 12.2 Tiempo estimado de espera
- **Regla [DECIDIDO]:** el tiempo estimado se calcula **utilizando la duración de las canciones que están antes en la cola**.
- **Datos que existen:** `duracion_segundos` de cada canción (puede ser `null` en la búsqueda actual, [EXISTE]) y el registro lógico de la reproducción actual.
- **Detalles por definir** (Juan Camilo propone, Santiago revisa; no se inventan aquí): fórmula exacta (por ejemplo, si se suma lo que falta de la canción en reproducción), unidades, tratamiento de canciones sin duración y precisión del valor. Los valores de los ejemplos de la sección 8 son **ilustrativos**.
- Es un requisito condicionado en el documento del proyecto: *"cuando sea posible calcularlo"* (RF-21). Android muestra el valor y tolera que no venga.
- Pausas, saltos y lista por defecto son del E5 y no se consideran.

## 13. Plan de desarrollo: empezar de inmediato

**Decisión [DECIDIDO]:** el equipo comienza el desarrollo **inmediatamente**. No se amplía la planificación: lo que bloquea la integración se prioriza, y los pendientes que no bloquean quedan identificados sin detener el trabajo. **No se fija aquí ninguna fecha límite ni reparto de horas** (no están acordados).

**Principio:** el contrato lo propone Juan Camilo y lo revisa Santiago; mientras tanto cada uno avanza con lo que no depende de él; los pendientes técnicos de integración (15.2) se cierran de forma ágil antes de integrar; al final se integra.

### 13.1 Qué se puede empezar ya (sin esperar decisiones)
| Quién | Puede empezar con |
|---|---|
| Juan Camilo | Propuesta de motor de base de datos; modelo de datos (Solicitud, Voto, Reproducción, Dispositivo) y ajuste del ER; borrador de contrato (endpoints y JSON, UUID en las llamadas, flujo SSE, estados); solicitud con voto automático atómico; cola y orden; regla por rangos; mecanismo de simulación de reproducciones; validación del catálogo |
| Santiago | Pantallas y modelos de solicitud, voto, cola, canción actual y avisos de rechazo con **datos simulados**; revisión del contrato desde Android; evaluación de cómo consumir SSE (y si pide dependencia) |
| Ambos | Revisión rápida del contrato; archivo de ejemplos de contrato compartido por ambos lados en las pruebas |

### 13.2 Qué bloquea qué
| Para poder... | Hace falta... |
|---|---|
| Integrar Android con el backend | Contrato revisado (incluye UUID en las llamadas, estados y formato SSE) |
| Probar el intervalo de votación y la contabilización | Simulación de reproducciones (exitosas y fallidas) y mecanismo de conectividad para el rango de dispositivos activos |
| Integrar la solicitud (P1) | Validación del catálogo definida |
| Persistir datos | Motor de base de datos propuesto y validado |
| Mostrar el tiempo estimado definitivo | Detalles del cálculo (12.2) |

**No bloquean** el inicio ni la integración: la vista pública web, los eventos analíticos (se definen en paralelo) y todo lo del E5 o entregables futuros (15.3).

### 13.3 Fases
| Fase | Juan Camilo (backend/BD) | Santiago (Android) | Punto de sincronización |
|---|---|---|---|
| 0. Contrato | Propone el contrato (endpoints y JSON) a partir de este documento | Lo revisa desde Android | Contrato revisado y acordado |
| 1. Base | Modelo en base de datos persistente, solicitud con voto automático y cola básica | Modelos y pantallas con **datos simulados** | Ejemplos de contrato compartidos |
| 2. Votos | Voto, duplicados, concurrencia y regla por rangos (con reproducciones simuladas) | Voto con confirmación, estados "ya votaste" e "intervalo no cumplido" con datos simulados | Mismo `409` y mismos códigos de error |
| 3. Reproducciones simuladas | Estado lógico, registro de resultados exitosos/fallidos y avance de cola, controlados desde el backend | Canción actual y estado en la interfaz (solo lectura) | Mecanismo de simulación (15.2, punto 5) |
| 4. Espera y SSE | Tiempo estimado; flujo SSE; conectividad de dispositivos | Mostrar la espera; consumir el flujo SSE | Pruebas con dos celulares |
| **Puerta de integración** | Pendientes técnicos del backend propuestos | Revisión de Android hecha | **Los pendientes de 15.2 que bloquean deben estar definidos antes de integrar** |
| 5. Integración | Backend real en red local | Reemplazar datos simulados por Retrofit real; pruebas con dispositivos reales | Regresión completa (sección 14) |

## 14. Pruebas necesarias

Marco existente: backend con `node --test` (servidor Express en puerto libre, dependencias inyectadas); Android con pruebas unitarias de ViewModel y repositorio (86) y MockWebServer. **No hay pruebas instrumentadas de interfaz.**

| Área | Casos mínimos |
|---|---|
| Solicitudes | Éxito (con su voto automático, ver tablas adicionales); sesión inexistente/cerrada; canción fuera del catálogo o no disponible; datos incompletos; `dispositivo_id` inválido |
| Votaciones | Voto válido incrementa el total; solicitud inexistente; solicitud de otra sesión; solicitud ya En reproducción |
| Votos duplicados | Mismo dispositivo y misma solicitud → `voto_duplicado`; **dos peticiones simultáneas** → un solo voto |
| Dispositivos diferentes | Dos dispositivos votan la misma solicitud → dos votos; el mismo dispositivo en otro establecimiento tiene su intervalo independiente |
| **Intervalo por rangos** | 1–10 → 2; 11–30 → 4; 31–60 → 6; >60 → 8. Fronteras: 10/11, 30/31, 60/61 dispositivos activos |
| Qué cuenta en el intervalo | Cuenta: reproducción **exitosa** cuyo `inicio_en` es **estrictamente posterior** al último voto del dispositivo, de una solicitud con votos, **incluida la canción votada manualmente**. No cuenta: la canción de la propia solicitud, una reproducción ya en curso, **fallida**, finalizada sin votos. Ver tablas B y C |
| Cambio de rango | El rango nuevo se aplica al intentar votar (p. ej. vota con 10 activos y reintenta con 11); el contador no se reinicia |
| Cola y orden | Orden por votos; desempate por antigüedad; cola vacía; reordenamiento tras un voto |
| Tiempo real (SSE) | Un cambio aparece en otro cliente sin recargar mediante el flujo SSE; reconexión del flujo tras un corte; carga inicial por consulta de estado; respuesta desordenada (`version`, si se adopta) |
| Simulación de reproducciones | Reproducciones simuladas desde el Backend (exitosas y fallidas): inicio con cola vacía y con cola; no iniciar otra con una en curso; cierre exitoso y fallido; avance a la siguiente solicitud; cola que queda vacía; se guarda el resultado y la solicitud pasa a reproducida o fallida |
| Tiempo estimado | Se calcula con la duración de las canciones que están antes en la cola; cola vacía; cambio al reordenarse por votos. Duración nula, unidades y canción en reproducción se prueban cuando se definan (12.2) |
| Eventos | Cuando se definan (sección 15): cada acción genera su evento; sin datos personales |
| Integración Android–Backend | Contrato JSON compartido leído por ambos lados (como `eventos-e3.json`); flujo QR → buscar → solicitar → votar → ver avanzar la reproducción; dos celulares |
| Regresión E3 | Las 17 pruebas del backend y las 86 de Android; `GET /api/sesiones`, búsqueda, sugerencias y eventos con las mismas respuestas; actualizar a propósito la prueba que rechaza tipos de evento fuera del E3 |

### Casos adicionales: "solicitar implica votar" [DECIDIDO]
| # | Caso | Resultado esperado |
|---|---|---|
| A1 | **Solicitud aceptada con voto automático** | Éxito; canción en la cola; `total_votos` = 1; `ya_voto` = true; un solo voto del dispositivo para esa solicitud |
| A2 | **Registra exactamente el voto correspondiente** | Un solo Voto, del dispositivo solicitante y de esa solicitud; ningún voto adicional |
| A3 | **Rechazo por intervalo** | `409` `intervalo_no_cumplido` con las canciones restantes; sin solicitud en la respuesta |
| A4 | **Rechazo no agrega canciones a la cola** | La cola es idéntica a la anterior |
| A5 | **Rechazo no registra votos** | El total de votos no cambió; sin Solicitud ni Canción huérfana |
| A6 | **No se evade con solicitudes repetidas** | La primera se acepta; las siguientes se rechazan |
| A7 | **No se evade en paralelo** (N simultáneas) | Una aceptada, N−1 rechazadas; un solo voto |
| A8 | **No se evade combinando acciones** (solicitar y luego votar otra) | El voto se rechaza con `intervalo_no_cumplido` |
| A9 | **Votar la propia solicitud** | `voto_duplicado` |
| A10 | **Atomicidad** (fallo al guardar el voto, base de pruebas simulada) | No queda la solicitud sin voto |
| A11 | **Intervalos vigentes aplicados a solicitudes** | Vuelve a poder solicitar solo tras 2, 4, 6 u 8 reproducciones exitosas; fronteras 10/11, 30/31, 60/61 |
| A12 | **Reproducciones fallidas no cuentan** | Sigue sin voto disponible hasta que haya exitosas suficientes |
| A13 | **Otras causas de rechazo** (sesión cerrada, canción no disponible, datos inválidos) | No se crea solicitud ni voto |
| A14 | **Android:** respuesta de éxito y de rechazo (datos simulados) | Confirmación de solicitud y voto; en el rechazo, aviso de que no tiene otro voto disponible y la canción no aparece en la cola |

### Casos adicionales: inicio del intervalo y reproducción en curso [DECIDIDO]
Usan el ejemplo de F3 (10 dispositivos activos → intervalo de 2).

| # | Caso | Resultado esperado |
|---|---|---|
| B1 | **La canción solicitada no cuenta** | Tras reproducirse A con éxito, el contador sigue en 0 |
| B2 | **El contador comienza en cero** | Tras aceptarse la solicitud: contador 0; `canciones_restantes` = 2; nueva solicitud rechazada |
| B3 | **Solo reproducciones exitosas posteriores incrementan** | Contador 1 tras B y 2 tras C |
| B4 | **Reproducción ya en curso** (comenzó antes, termina con éxito después) | No suma |
| B4a | **Terminó antes de la solicitud** | No suma |
| B4b | **Comenzó después y termina bien** | Suma 1 |
| B4c | **Comenzó después pero falla** | No suma |
| B4d | **Mismo instante** (`inicio_en` igual a la fecha de la solicitud) | No suma (desigualdad estricta) |
| B5 | **Las fallidas no incrementan** (B falla, C exitosa) | Contador 1; la nueva solicitud sigue rechazada |
| B6 | **Intervalo cumplido habilita otra solicitud** | Se acepta D, se registra el voto |
| B7 | **El contador se reinicia tras una nueva solicitud aceptada** | Contador 0; B y C ya no cuentan |
| B8 | **Intervalo por rango** (repetir B3 y B6 con 4, 6 y 8) | Se habilita solo al llegar al intervalo del rango |
| B9 | **Contadores independientes** | Cada dispositivo cuenta lo que comenzó después de **su** último voto |
| B10 | **Android:** `mi_votacion` con contador en 0, intermedio y cumplido (datos simulados) | Muestra cuántas canciones faltan; habilita solicitar al cumplirse (el backend sigue validando) |
| B11 | **Misma reproducción, dispositivos distintos** (X votó antes de que comenzara Z; Y votó con Z ya sonando) | Z suma al contador de X y no al de Y |
| B12 | **Por establecimiento** | Lo reproducido en un establecimiento no afecta los contadores de otro |

### Casos adicionales: decisiones del cuestionario [DECIDIDO]
| # | Decisión | Caso | Resultado esperado |
|---|---|---|---|
| C1 | Canción duplicada (1B) | Dispositivo con voto disponible solicita una canción **Pendiente** | No se duplica; se registra un voto adicional; total y posición actualizados; contador del dispositivo a 0 |
| C2 | Canción ya en la cola | Dispositivo **sin** voto disponible la solicita | `409`; no se registra voto; total sin cambio |
| C3 | Canción ya en la cola | El dispositivo ya había votado esa solicitud y la pide otra vez | `409` `voto_duplicado` |
| C4 | Voto manual reinicia (5.1) | Voto válido sobre solicitud ajena | Contador del votante a 0; reproducciones previas al voto no cuentan |
| C5 | Voto manual reinicia (5.1) | Reproducción que comienza antes del voto y termina después | No suma al votante |
| C6 | Votos definitivos (5.2) | Intentar cambiar o retirar un voto | No existe esa operación / se rechaza (código según contrato) |
| C7 | Orden y desempate (5.3, 5.4) | Dos solicitudes con los mismos votos | Primero la solicitada antes |
| C8 | Rango cambia (5.5) | De 10 a 11 dispositivos activos con contador en 2 | Ya no alcanza (intervalo 4); el contador no se reinicia |
| C9 | Rango cambia (5.5) | De 11 a 10 con contador en 2 | Ya puede votar |
| C10 | Persistencia (5.7) | Cerrar y reabrir la app; abrir una nueva sesión del mismo establecimiento | El contador se conserva |
| C11 | Regla por establecimiento | Mismo dispositivo en dos establecimientos | Contadores independientes |
| C12 | Dispositivo activo (5.8) | Dispositivo con conectividad actual vs. sin ella | Cuenta o no para el rango de dispositivos activos (el mecanismo técnico lo valida Juan Camilo) |
| C13 | Reproductor autorizado | Autorización de quien reporta la reproducción | **Fuera del alcance del E4**: autenticación y permisos son del E5; no se prueba aquí |
| C14 | Reporte de reproducción | Se reporta éxito / fallo (simulado desde el Backend en el E4, 15.2 punto 5) | Solicitud reproducida / fallida; contadores actualizados solo en el éxito |
| C15 | Catálogo (5.13) | Solicitar una canción fuera del catálogo permitido | Se rechaza; no se crea nada |
| C16 | Catálogo (5.13) | Datos de la canción manipulados por el cliente | El backend usa los suyos |
| C17 | Estados (5.16) | Ciclo completo de una solicitud | Pendiente → En reproducción → Reproducida / Fallida; ninguna "Rechazada" en la cola |
| C18 | Rechazo vs. fallo (5.16) | Solicitud rechazada vs. aceptada que falló al reproducirse | La rechazada no existe en la base de datos; la que falló queda Fallida |
| C19 | Rechazo `409` (5.19) | Rechazo por intervalo | Código `409` |
| C20 | Vista pública (5.20) | Contenido de la vista (no se exige para cerrar el E4) | Muestra canción actual, cola y votos; sin controles administrativos ni de reproducción |
| C21 | Canción duplicada (1B) | Se solicita una canción que está **En reproducción**, con voto disponible | No se duplica; se suma un voto a la solicitud en reproducción |
| C22 | Canción duplicada (1B) | Se solicita una canción que **ya terminó de reproducirse** | Se acepta como solicitud nueva con 1 voto |
| C23 | Canción votada manualmente (2A) | Voto manual y luego reproducción exitosa de esa canción que **comenzó después** del voto | Suma 1 al contador del votante |
| C24 | Canción votada manualmente (2A) | La canción votada ya estaba sonando al votar (comenzó antes) y termina con éxito | No suma al votante |
| C25 | Canción votada manualmente (2A) | La canción votada comenzó después del voto y falla | No suma |
| C26 | Canción votada manualmente (2A) | Reproducción exitosa de la canción **solicitada** por el propio dispositivo | No suma a quien la solicitó |
| C27 | Simulación (7B) | Escenario completo con reproducciones simuladas exitosas y fallidas | El contador, el intervalo y la habilitación de nuevas solicitudes coinciden con la regla |

Casos que dependen de los **casos límite** del punto 11 de la sección 15.2 (no se prueban hasta resolverlos): voto manual sobre una canción En reproducción, solicitud repetida de una canción fallida e interpretación de la solicitud repetida.

### Pruebas mínimas para cerrar el E4 [DECIDIDO]
Corresponden al criterio de cierre (sección 17): integración Android–Backend funcional (tabla principal, fila de integración); solicitudes de canciones y votos automáticos y manuales (tablas A y C); cola y ordenamiento por votos (fila de cola y C7); intervalo de votación funcional y su prueba mediante simulación de reproducciones (tablas B y C, C27); registro lógico de reproducciones exitosas y fallidas (fila de simulación y C14). La vista pública web **no** es necesaria para cerrar el E4.

## 15. Decisiones, pendientes y contradicciones

> **Criterio [DECIDIDO]:** las decisiones técnicas necesarias para integrar Android y Backend deben quedar definidas **antes de integrar**, y cada una tiene responsable. No se deben inventar para completar el documento. Lo que pertenece al E5 o a entregables futuros **no bloquea** el E4.

### 15.1 Decisiones cerradas
**Funcionales (ya no se discuten):**
- Regla de votación por rangos (2/4/6/8 reproducciones exitosas), por dispositivo y establecimiento. Dispositivo activo = conectividad actual.
- Solicitar implica votar, de forma atómica; el rechazo no agrega canción ni registra voto.
- **Canción duplicada (1B):** mientras está esperando o reproduciéndose no se duplica y se suma un voto (si hay disponibilidad); si ya terminó de reproducirse, puede volver a agregarse.
- Inicio del intervalo y condición temporal estricta (`inicio_reproduccion > fecha_solicitud_aceptada`); el voto manual también reinicia el intervalo.
- **Canción votada manualmente (2A):** cada reproducción exitosa de una canción votada manualmente cuenta para el intervalo del dispositivo que votó, respetando la condición temporal.
- Votos definitivos; orden por votos y desempate por antigüedad; nuevo rango aplicado de inmediato.
- El UUID identifica al dispositivo y se relaciona con su sesión actual; el intervalo persiste para el mismo dispositivo y establecimiento.
- Backend mantiene el estado lógico de reproducción; Android no reproduce ni controla canciones; la reproducción real es de operadores/DJ (futuro).
- Estados de solicitud según el documento del proyecto (en el E4: pendiente, en reproducción, reproducida, fallida).
- Base de datos persistente; sesiones simuladas temporales (su reemplazo es del E5).
- `409 Conflict` para el rechazo por intervalo; contenido de la vista pública (canción actual, cola, votos; sin controles).

**Técnicas y de proceso (14 respuestas finales):**
- **Tiempo real: SSE** (6A).
- **Simulación de reproducciones controlada desde el Backend** durante el E4 (7B): permite registrar reproducciones exitosas y fallidas para probar intervalo, contabilización, tiempo estimado y lógica de cola. Es temporal y **no** representa la reproducción real de un DJ.
- **Tiempo estimado** calculado con la duración de las canciones que están antes en la cola (11A); detalles por definir.
- **Responsables de proponer y revisar** (3A, 4A, 5A, 8A, 9A, 10B): ver 15.2.
- **Vista pública web:** responsable por decidir (12D); no bloquea.
- **Inicio inmediato del desarrollo** (13) y **criterio de cierre del E4** (14A, sección 17).

### 15.2 Pendientes técnicos para la integración
Responsabilidad: **propone** hace la propuesta, **revisa** la valida. "Bloquea" indica qué detiene si no se resuelve; **ningún pendiente impide empezar a desarrollar** (sección 13.1).

| # | Pendiente | Propone | Revisa | Impacto |
|---|---|---|---|---|
| 1 | **Contrato completo API/JSON:** rutas, campos, identificadores de estado (con los nombres del documento del proyecto), cuerpo de los errores (incluido el `409`), respuesta cuando se suma voto a una solicitud existente, flujo SSE | Juan Camilo | Santiago | **Bloquea la integración** |
| 2 | **Cómo se envía el UUID** en las llamadas al backend (formato y campos no definidos) | Juan Camilo | Santiago (compatibilidad con Android) | **Bloquea la integración** (parte del contrato) |
| 3 | **Relación UUID–dispositivo–sesión y ajuste del ER** (cómo se reconoce al mismo dispositivo entre sesiones del mismo establecimiento para conservar su intervalo) | Juan Camilo | Santiago (que corresponda con Android) | Bloquea el modelo de datos del backend; Android no depende hasta integrar |
| 4 | **Mecanismo técnico para comprobar la conectividad actual** (si requiere heartbeat u otro) | Juan Camilo | Santiago (impacto en Android) | Bloquea probar el rango de dispositivos activos |
| 5 | **Simulación de reproducciones desde el Backend** (cómo se registran las exitosas y fallidas) | Juan Camilo | Santiago | **Necesaria para probar** el intervalo, la contabilización, el tiempo estimado y la cola |
| 6 | **Validación del catálogo permitido** (cómo y contra qué fuente; no se asume una fuente definitiva) | Juan Camilo | Santiago (contrato) | Bloquea integrar la solicitud (P1) |
| 7 | **Motor de base de datos** y cómo ejecutarlo y probarlo (incluido el CI) | Juan Camilo | Equipo valida | **Prioritario**: bloquea la persistencia del backend |
| 8 | **Eventos analíticos del E4:** nombres, campos y cuáles se emiten en cada caso | Backend | Karen y Android | No bloquea el inicio ni la integración; responsabilidad compartida |
| 9 | **Tiempo estimado:** fórmula exacta, unidades, canciones sin duración, precisión (12.2) | Juan Camilo | Santiago | No bloquea el inicio; bloquea mostrar el valor definitivo |
| 10 | **Consumo de SSE en Android:** cómo se lee el flujo y si requiere una dependencia nueva (no se agrega sin acordarlo) | Santiago | Juan Camilo | Depende del punto 1 |
| 11 | **Casos límite a confirmar al revisar el contrato** (interpretaciones, no cambian decisiones): (a) una solicitud repetida de una canción duplicada se trata como solicitud (su canción no cuenta para quien la pide), no como voto manual; (b) una solicitud *fallida* se trata como ya terminada (puede volver a agregarse); (c) un voto manual sobre una canción *en reproducción* hoy figura como no votable en P2, mientras que una solicitud repetida sí suma voto | Equipo | Equipo | No bloquea el inicio |

### 15.3 Pendientes que no bloquean (otros entregables o por decidir)
| Asunto | Entregable | Nota |
|---|---|---|
| **Responsable de la vista pública web** | Por decidir (12D) | Alcance ya fijado: canción actual, cola y votos, sin controles. No bloquea la integración Android–Backend ni el cierre del E4 |
| **Roles y autenticación** (incluida la del reproductor y los operadores) | E5 | El E4 solo mantiene que exista un reproductor autorizado; no diseña autenticación ni permisos |
| **Modo mantenimiento** y limpieza de listas entre sesiones | E5 | No se define ahora si reinicia contadores |
| **Reproducción real por DJ / operadores de música** | Entregables futuros | No se reproduce audio desde Android |
| **Controles operativos del reproductor** (iniciar, continuar, pausar, detener, saltar) | E5 / futuros | Los controles visuales del E4 no los incluyen |
| **Reemplazo de las sesiones simuladas** (`sesiones.mock.json`) | E5 (HU-24) | Se conservan durante el E4 |
| **Lista definitiva de estados** (saltada, retirada, abandonada al cierre) | Por validar con el equipo | El documento del proyecto la marca provisional (HU-15) |

### 15.4 Contradicciones resueltas
| # | Contradicción | Aclaración |
|---|---|---|
| 1 | Dispositivo activo: actividad reciente o heartbeat frente a conectividad actual | **Dispositivo activo = conectividad actual**; el heartbeat, si hace falta, es un detalle técnico que valida Juan Camilo |
| 2 | UUID asociado al establecimiento frente al ER | **El UUID identifica al dispositivo y se relaciona con su sesión actual**; el intervalo persiste por dispositivo y establecimiento. Ajuste del ER: punto 3 de 15.2 |
| 3 | Persistencia del intervalo frente al modo mantenimiento | Modo mantenimiento es del E5 (15.3) |
| 4 | Estados mínimos frente a ER y HU-15 | Se usan los estados del documento del proyecto; en el E4 se producen cuatro; la lista final sigue por validar (15.3) |
| 5 | Reproductor autorizado en el E4 frente a roles y autenticación del E5 | La autenticación es del E5 (15.3) |
| 6 | Reemplazo de las sesiones simuladas | Pertenece al E5 (HU-24) |
| 7 | Capturas del prototipo con "15 reproducciones" | **Obsoletas** respecto a la regla de votación; no son fuente funcional. No se modificaron las imágenes |
| 8 | Controles visuales de Android frente a la reproducción real | Santiago desarrolla los controles visuales de la interfaz; la reproducción real y los controles operativos son de DJ en entregables futuros (F10) |
| 9 | "Reproducción básica" en el E4 frente a que la reproducción real es futura | En el E4 se mantiene el **estado lógico** y se **simulan** los reportes desde el Backend; no hay reproducción real |
| 10 | Canción votada manualmente: ¿cuenta? (antes pendiente) | **Sí**, cada reproducción exitosa cuenta para el votante si comenzó después de su voto (2A) |
| 11 | Tiempo real (antes pendiente) | **SSE** (6A) |

## 16. Plan de trabajo

### Para Juan Camilo — en este orden (lo que desbloquea a los demás primero)
**Primero (empezar ya):**
1. **Proponer el motor de base de datos** para validación del equipo (15.2, punto 7).
2. **Proponer el contrato** (endpoints, JSON, UUID en las llamadas, estados, `409`, flujo SSE) partiendo del borrador de las secciones 7 y 8, para que Santiago lo revise (puntos 1 y 2).
3. **Proponer el ajuste del ER** (Solicitud, Voto, Reproducción y la relación Dispositivo–Sesión) (punto 3).
4. **Proponer cómo se simulan las reproducciones** exitosas y fallidas desde el backend (punto 5).
5. **Definir la validación del catálogo** (punto 6).

**Después:**
6. Base de datos persistente y su modelo.
7. Solicitud P1 con voto automático atómico y suma de voto a una canción duplicada (esperando o reproduciéndose).
8. Cola P3 con orden por votos y desempate por antigüedad.
9. Voto manual P2: restricción única, concurrencia, regla por rangos y reinicio del intervalo.
10. Contabilización de reproducciones exitosas (incluida la canción votada manualmente) y estado lógico de reproducción.
11. Conectividad actual de dispositivos (punto 4).
12. Flujo SSE según el contrato.
13. Tiempo estimado con la duración de las canciones anteriores en la cola (punto 9).
14. Propuesta de eventos analíticos para revisión de Karen y Android (punto 8).
15. Pruebas (sección 14) y archivo de contrato compartido (estilo `eventos-e3.json`).
16. Actualizar la prueba de eventos del E3 que rechaza tipos nuevos, de forma explícita.
17. Pruebas de integración con Santiago y regresión del E3.

### Para Santiago — en paralelo
1. Pantallas y modelos con datos simulados (solicitar, votar, cola, canción actual, avisos de rechazo, estado de votación).
2. Revisar el contrato y el modo de enviar el UUID (puntos 1 y 2).
3. Evaluar el consumo de SSE y si necesita dependencia (punto 10).
4. Revisar el impacto de la conectividad y de la relación UUID–dispositivo–sesión en Android (puntos 3 y 4).

## 17. Conclusiones

- **Hoy** el backend valida sesiones, busca en YouTube y guarda eventos; **no** conoce solicitudes, votos, dispositivos, cola ni reproducción, y no tiene base de datos. Android tampoco tiene nada del E4, salvo el UUID del dispositivo y el `id_sesion` en memoria.
- **Todas las reglas funcionales del E4 están cerradas** (15.1): votación, intervalo, canciones duplicadas, canción votada manualmente, orden, estados, tiempo real con SSE y simulación de reproducciones.
- **Juan Camilo** construye el servidor y propone el contrato, el motor de base de datos, la simulación y la validación del catálogo. **Santiago** construye la parte de pantalla y revisa el contrato.
- **Criterio de cierre del E4 [DECIDIDO]:** el E4 se considera funcionalmente cerrado cuando se logre:
  - integración Android–Backend funcional;
  - solicitudes de canciones;
  - votos automáticos y manuales;
  - cola y ordenamiento por votos;
  - intervalo de votación funcional;
  - pruebas del intervalo mediante simulación de reproducciones;
  - registro lógico de reproducciones exitosas y fallidas.
- **No se exige para cerrar el E4:** reproducción real por DJ, roles y autenticación del operador, controles operativos de música, modo mantenimiento del E5, reemplazo definitivo de las sesiones simuladas ni la vista pública web (su responsable se decidirá después).
- **Qué sigue:** empezar de inmediato (sección 13); cerrar los pendientes de 15.2 que bloquean la integración con propuestas rápidas de Juan Camilo y revisión de Santiago.

---

### Anexo — Qué se verificó en este documento
- **Código (verificado leyendo archivos):** endpoints, códigos y formatos de error en `backend/src/app.js`; reglas de token en `sesiones.js`; reglas de eventos en `eventos.js`; campos de canción en `mapearCanciones` (`youtube.js`); dependencias en `backend/package.json`; archivos con `git ls-files backend`; pruebas en `backend/test/*.js`; rutas Retrofit, `SesionActiva` y `Cancion` en `cliente-android/.../data/`.
- **Documentos:** reglas de negocio, ER, eventos, requisitos y estados de solicitud (HU-15, HU-19, ER y trazabilidad) leídos de `docs/Proyecto Nuclear VII (6).pdf`; las decisiones y aclaraciones posteriores las comunicó el equipo y se incorporaron tal cual.
- **No verificado:** ejecución real del backend, estado del CI en GitHub, qué se necesita para consumir SSE en Android y cualquier decisión tomada fuera de los documentos.
