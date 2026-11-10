# Entregable 4 — Propuesta técnica del Backend

**Proyecto:** PONGA (Proyecto Nuclear VII) · **De:** Juan Camilo Arias (Backend y base de datos) · **Para revisión de:** Santiago Cardona (Android)
**Estado:** **PROPUESTA**. Nada de esto está implementado. Responde a los pendientes 1–7 de la sección 15.2 de `ESPECIFICACION_TECNICA_ENTREGABLE_4.md` y propone el punto 8 (eventos) y el 9 (tiempo estimado).
**Actualización (implementación):** el motor final es **PostgreSQL 16** (no SQLite): ver la sección 2. El esquema vigente es `backend/migrations/001_esquema.sql`; el SQL de la sección 4 describe el mismo modelo. El contrato implementado está en `contrato-api-e4.md`.
**Base:** las decisiones de la sección 15.1 de la especificación se toman tal cual. Donde encontré algo que impide implementar una regla o que admite dos lecturas, lo dejo en la sección 1 **sin cambiar la regla**.

---

## 0. Resumen de las propuestas

| # | Pendiente (15.2) | Propuesta |
|---|---|---|
| 7 | Motor de base de datos | **PostgreSQL 16** con `pg`. Docker Compose en local (puerto 5433) y servicio `postgres:16` en GitHub Actions. Transacciones con bloqueo `FOR UPDATE` de establecimiento y sesión para la atomicidad de "solicitar implica votar" |
| 1 | Contrato API/JSON | 4 endpoints para el cliente (cola, flujo SSE, solicitar, votar), 2 para el reproductor (iniciar, siguiente) y 2 de simulación. Errores con el formato actual `{error:{codigo,mensaje}}` |
| 1 | SSE | `GET /api/sesiones/:idSesion/cola/flujo`. Cada mensaje trae el **estado completo** de la cola (mismo JSON que `GET /cola`), personalizado por dispositivo. Ping cada 10 s |
| 2 | UUID en las llamadas | Cabecera **`X-Dispositivo-Id`** en todas las llamadas del E4 (la añade un interceptor de OkHttp). `POST /api/eventos` del E3 no cambia |
| 3 | UUID–dispositivo–sesión | `dispositivo` **global** (único por UUID) y una tabla puente `dispositivo_sesion`. El intervalo se calcula por **(dispositivo, establecimiento)** a partir de los votos y las reproducciones, así que sobrevive a cambios de sesión y a reinicios |
| 4 | Conectividad actual | Un dispositivo está **activo** mientras tiene abierto el flujo SSE (con su cabecera), más una gracia de 20 s tras desconectarse. No hace falta un endpoint de heartbeat aparte |
| 6 | Catálogo permitido | Android envía **solo `youtube_video_id`**. El backend usa la canción guardada si se validó hace menos de 24 h; si no, la consulta con `videos.list` (1 unidad de cuota). Comprueba categoría Música (10), embebible, pública, no en vivo y con duración |
| 5 | Simulación de reproducciones | Los mismos endpoints que usará el reproductor real (`iniciar` / `siguiente`), protegidos por un token de entorno. Además, un **modo automático** que avanza la cola con tiempo acelerado y una probabilidad de fallo configurable, y **dispositivos activos virtuales** para probar los rangos |
| 9 | Tiempo estimado | Lo que falta de la canción actual más la suma de las duraciones de las pendientes que van antes. En segundos enteros; `null` si falta alguna duración |
| 8 | Eventos analíticos | Los emite el **servidor** (no pasan por `POST /api/eventos`). Lista en la sección 9 para que la revisen Karen y Santiago |

---

> **Actualización (fase de cierre, 2026-11-10):** H1 y H3c se **resolvieron** (ver `contrato-api-e4.md`, sección 12); H2, H3a, H3b y H4 se mantienen. El texto de abajo conserva la propuesta original.

## 1. Hallazgos que necesitan decisión del equipo (no he cambiado ninguna regla)

### H1. Bloqueo permanente con pocos dispositivos participando — **impide la funcionalidad**

Con la regla decidida (la canción propia no cuenta, y solo cuentan reproducciones de solicitudes), **la cola puede quedarse vacía y ningún dispositivo vuelve a tener voto**, aunque estén conectados.

Ejemplo con 2 dispositivos (rango 1–10, intervalo 2):

| Paso | Qué pasa | Contador A | Contador B |
|---|---|---|---|
| 1 | A solicita *a*; B solicita *b* | 0 | 0 |
| 2 | *a* se reproduce con éxito (es de A: no cuenta para A) | 0 | 1 |
| 3 | *b* se reproduce con éxito (es de B: no cuenta para B) | 1 | 1 |
| 4 | Cola vacía. Nadie llega a 2, nadie puede solicitar, no se reproduce nada más | 1 | 1 |

- Con **1 dispositivo** el bloqueo llega tras su primera canción.
- En general, se bloquea siempre que **los dispositivos que participan sean ≤ intervalo** (2, 4, 6 u 8). Por ejemplo, 12 conectados con solo 4 pidiendo canciones, en el rango 11–30 (intervalo 4).
- La lista por defecto del E5 **no lo resuelve**: según la regla, las canciones que no vienen de una solicitud tampoco cuentan.
- **Afecta al cierre del E4:** la prueba "dos celulares" de la sección 14 se bloquea en el paso 4. Con la simulación se puede probar igual, porque permite meter solicitudes de dispositivos virtuales, pero en un uso real con pocas personas la aplicación se detiene.

**Qué propongo:** que el equipo elija. Lo implemento como esté escrito mientras no se decida otra cosa.
- (a) Aceptarlo como limitación conocida del E4 y documentarlo.
- (b) Añadir una regla de respaldo, por ejemplo: si no hay nada sonando y la cola está vacía, todos los dispositivos recuperan su voto.
- (c) Otra regla que decida el equipo.

### H2. ¿Qué "canción propia" se excluye del conteo? — interpretación

La especificación dice que la canción de **la** solicitud del dispositivo no cuenta. Caso no cubierto: A solicita *a* (t1), cumple el intervalo con otras canciones, solicita *d* (t2) y luego *a* suena (t3 > t2). ¿*a* cuenta para A?

**Propuesta por defecto:** **no cuenta**. Se excluye cualquier reproducción de una solicitud en la que el dispositivo puso un voto **automático** (`origen = 'solicitud'`), sea la última o una anterior. Es la lectura más cercana a "su propia canción no cuenta" y se expresa en una sola condición SQL (sección 5.3).

### H3. Casos límite del punto 11 de 15.2 — valores por defecto propuestos

| Caso | Por defecto propuesto | Motivo |
|---|---|---|
| (a) Solicitud repetida de una canción ya en cola | Es **solicitud**: voto `origen='solicitud'`, la canción no cuenta para quien la pide | Ya dicho en F3 ("incluida la solicitud que suma voto a una existente") |
| (b) Volver a pedir una canción cuya última solicitud quedó *fallida* | Se trata como **terminada**: se crea una solicitud nueva | Ni espera ni suena; el índice de duplicados solo mira `pendiente` y `en_reproduccion` |
| (c) Voto manual (P2) sobre una canción *en reproducción* | **No se permite**: `409 solicitud_no_votable`, como en el borrador | Incoherencia a decidir: por P1 sí se puede sumar voto a una canción que suena (decisión 1B). Opciones: dejarlo así, o permitir ambos, o impedir ambos. No bloquea el desarrollo |

### H4. Supuesto explícito: primer voto

Un dispositivo que **nunca ha votado** en el establecimiento tiene voto disponible. La especificación no lo dice literalmente, pero los ejemplos lo dan por hecho.

### Diferencias menores

La especificación cuenta 86 pruebas de Android; el informe del E3 decía 83. Lo verifico al correr la regresión.

---

## 2. Motor de base de datos (pendiente 7)

**Decisión implementada: PostgreSQL 16** con el driver `pg`. La primera versión de esta propuesta decía SQLite; se cambió al implementar.

- **Local:** `npm run db:up` (`backend/docker-compose.yml`) levanta `postgres:16` en el puerto **5433**, con la base `ponga` y la base de pruebas `ponga_test`. `npm run db:down` lo apaga.
- **Esquema:** migraciones SQL numeradas en `backend/migrations/` (`001_esquema.sql`). Se aplican al arrancar (`npm start`) o con `npm run migrar`. Quedan registradas en `schema_migrations` y llevan un candado consultivo para que dos procesos no migren a la vez.
- **Atomicidad y concurrencia:** cada solicitud, voto o cambio de reproducción es una transacción `READ COMMITTED` que primero bloquea (`FOR UPDATE`) el establecimiento y luego la sesión. Así el cálculo del intervalo y la escritura no se intercalan con otra petición del mismo establecimiento. Como defensa final quedan los índices únicos parciales (`solicitud_viva_unica`, `reproduccion_en_curso_unica`) y `UNIQUE (id_solicitud, id_dispositivo)`.
- **Pruebas:** cada archivo de prueba crea y borra su propio schema en `ponga_test` (variable `DATABASE_URL_TEST`). En GitHub Actions, PostgreSQL corre como servicio del job.
- **Sesiones:** `data/sesiones.mock.json` sigue siendo la fuente. Al arrancar se copia a las tablas `establecimiento` y `sesion` para tener claves foráneas. `GET /api/sesiones/:token` (E3) no cambia.

---

## 3. Identificación del dispositivo (pendiente 2)

**Propuesta: cabecera `X-Dispositivo-Id: <uuid>`** en todas las llamadas del E4.

- Android la añade con **un interceptor** de OkHttp en `RedModule.kt`, sin tocar cada interfaz de Retrofit.
- Sirve igual para GET, POST y el flujo SSE (OkHttp permite cabeceras en conexiones SSE) y no deja el UUID en las URL.
- Se valida con el mismo `UUID_REGEX` de `eventos.js`.
- Es **obligatoria** en solicitar y votar (si falta o es inválida: `400 dispositivo_id_invalido`). Es **opcional** en `GET /cola` y en el flujo: sin ella, la respuesta es la de la vista pública (sin `mi_votacion` ni `ya_voto`) y la conexión **no cuenta** como dispositivo activo.
- `POST /api/eventos` del E3 sigue recibiendo `dispositivo_id` en el cuerpo. **No se toca**, para no romper `eventos-e3.json`.
- **Registro implícito:** la primera llamada con un UUID nuevo crea el `dispositivo` y su fila en `dispositivo_sesion`. No hay endpoint de registro.
- **Limitación aceptada:** el UUID no es una credencial. Quien lo conozca puede actuar como ese dispositivo, y quien borre los datos de la app obtiene uno nuevo.

---

## 4. Relación UUID–dispositivo–sesión y ajuste del ER (pendiente 3)

**Problema del ER actual:** `Dispositivo` está ligado a una sesión (único por `id_sesion` + seudónimo), pero el intervalo debe sobrevivir a un cambio de sesión dentro del mismo establecimiento.

**Ajuste propuesto:**
- `dispositivo` pasa a ser **global**: una fila por UUID.
- La participación en cada sesión se guarda en **`dispositivo_sesion`**, con los datos de conexión que el ER tenía en `Dispositivo`.
- El intervalo **no se guarda en ninguna tabla**: se calcula por (dispositivo, establecimiento) a partir de `voto` y `reproduccion`. Así persiste entre sesiones y reinicios sin trabajo adicional.
- `voto` y `reproduccion` llevan una copia de `id_establecimiento` para que la consulta del intervalo no tenga que unir con `sesion`.

```
establecimiento 1───* sesion 1───* solicitud *───1 cancion
                          │            │
                          │            ├──* voto *───1 dispositivo
                          │            └──* reproduccion
                          └──* dispositivo_sesion *───1 dispositivo
```

```sql
CREATE TABLE establecimiento (
  id_establecimiento TEXT PRIMARY KEY,               -- 'EST-MOCK-001' (viene del mock)
  nombre             TEXT NOT NULL,
  estado             TEXT NOT NULL DEFAULT 'activo'
);

CREATE TABLE sesion (
  id_sesion          TEXT PRIMARY KEY,               -- 'SES-MOCK-001'
  id_establecimiento TEXT NOT NULL REFERENCES establecimiento,
  qr_token           TEXT NOT NULL UNIQUE,
  estado             TEXT NOT NULL CHECK (estado IN ('activa','cerrada')),
  qr_estado          TEXT NOT NULL CHECK (qr_estado IN ('activo','inactivo')),
  version_cola       INTEGER NOT NULL DEFAULT 0      -- se incrementa en cada cambio visible (sección 6.2)
);

CREATE TABLE dispositivo (
  id_dispositivo          INTEGER PRIMARY KEY,
  identificador_seudonimo TEXT NOT NULL UNIQUE,      -- UUID generado por la app
  creado_en               INTEGER NOT NULL,          -- epoch ms
  ultima_actividad        INTEGER NOT NULL
);

CREATE TABLE dispositivo_sesion (                    -- NUEVA: sustituye el vínculo Dispositivo→Sesión del ER
  id_dispositivo     INTEGER NOT NULL REFERENCES dispositivo,
  id_sesion          TEXT    NOT NULL REFERENCES sesion,
  unido_en           INTEGER NOT NULL,
  ultima_conexion    INTEGER,
  ultima_desconexion INTEGER,
  PRIMARY KEY (id_dispositivo, id_sesion)
);

CREATE TABLE cancion (
  id_cancion        INTEGER PRIMARY KEY,
  youtube_video_id  TEXT NOT NULL UNIQUE,
  titulo            TEXT NOT NULL,
  artista_canal     TEXT NOT NULL,
  duracion_segundos INTEGER,                         -- NULL si YouTube no la da
  url_miniatura     TEXT,
  disponibilidad    TEXT NOT NULL CHECK (disponibilidad IN ('disponible','no_disponible')),
  consultado_en     INTEGER NOT NULL                 -- última validación contra YouTube
);

CREATE TABLE solicitud (
  id_solicitud    INTEGER PRIMARY KEY,
  id_sesion       TEXT    NOT NULL REFERENCES sesion,
  id_cancion      INTEGER NOT NULL REFERENCES cancion,
  id_dispositivo  INTEGER NOT NULL REFERENCES dispositivo,   -- quien la creó
  fecha_solicitud INTEGER NOT NULL,
  estado          TEXT NOT NULL CHECK (estado IN
                   ('pendiente','en_reproduccion','reproducida','fallida','saltada','retirada'))
);
-- Defensa final contra duplicados: una sola solicitud viva por canción y sesión
CREATE UNIQUE INDEX solicitud_viva_unica ON solicitud (id_sesion, id_cancion)
  WHERE estado IN ('pendiente','en_reproduccion');

CREATE TABLE voto (
  id_voto            INTEGER PRIMARY KEY,
  id_solicitud       INTEGER NOT NULL REFERENCES solicitud,
  id_dispositivo     INTEGER NOT NULL REFERENCES dispositivo,
  id_establecimiento TEXT    NOT NULL REFERENCES establecimiento,
  fecha_hora         INTEGER NOT NULL,
  origen             TEXT NOT NULL CHECK (origen IN ('solicitud','manual')),
  UNIQUE (id_solicitud, id_dispositivo)              -- un voto por dispositivo y solicitud
);
CREATE INDEX voto_intervalo ON voto (id_dispositivo, id_establecimiento, fecha_hora);

CREATE TABLE reproduccion (
  id_reproduccion       INTEGER PRIMARY KEY,
  id_sesion             TEXT    NOT NULL REFERENCES sesion,
  id_establecimiento    TEXT    NOT NULL REFERENCES establecimiento,
  id_solicitud          INTEGER REFERENCES solicitud,          -- NULL reservado para la lista por defecto (E5)
  id_cancion            INTEGER NOT NULL REFERENCES cancion,
  inicio_en             INTEGER NOT NULL,
  fin_en                INTEGER,
  resultado             TEXT NOT NULL CHECK (resultado IN ('en_curso','exitosa','fallida')),
  segundos_reproducidos INTEGER,
  codigo_error          TEXT,
  origen                TEXT NOT NULL CHECK (origen IN ('simulacion','reproductor'))
);
CREATE UNIQUE INDEX reproduccion_en_curso_unica ON reproduccion (id_sesion) WHERE resultado = 'en_curso';
CREATE INDEX reproduccion_intervalo ON reproduccion (id_establecimiento, resultado, inicio_en);
```

**Cambios respecto al ER del documento del proyecto:**

| Cambio | Motivo |
|---|---|
| `dispositivo` global y nueva `dispositivo_sesion` | El intervalo persiste por dispositivo y establecimiento (decisión 15.1) |
| Se quita `voto.estado` y se añade `voto.origen` | Los votos son definitivos, así que el estado no aporta nada. `origen` es necesario para "la canción propia no cuenta" y para los eventos |
| `voto.id_establecimiento` y `reproduccion.id_establecimiento` | Consulta del intervalo por establecimiento sin unir con `sesion` |
| `sesion.version_cola` | Orden de los mensajes SSE (sección 6.2) |
| `total_votos` y `posicion` **no se guardan** | Se calculan con `COUNT` y `ORDER BY`. Con colas de decenas de filas cuesta poco y evita incoherencias |
| Fechas en `INTEGER` (epoch ms) | Comparación estricta `inicio_en > fecha` sin problemas de formato. En el JSON salen como ISO-8601 UTC con milisegundos, igual que en el E3 |

**Identificadores en el JSON:** cadenas opacas con prefijo (`"SOL-42"`, `"VOT-7"`, `"REP-3"`). Android no debe interpretarlas.

---

## 5. Reglas de votación en el backend

### 5.1 Orden de comprobaciones (solicitar y votar)
Sigue la sección 10 de la especificación, y el primer fallo corta:
1. `X-Dispositivo-Id` válido (`400 dispositivo_id_invalido`).
2. Sesión existe y está activa con QR activo (`404 sesion_inexistente`, `410 sesion_cerrada`, `410 qr_desactivado`).
3. Solo en P1: la canción pertenece al catálogo (sección 8). Este paso puede llamar a YouTube y por eso va **antes** de la transacción.
4. **Transacción síncrona:**
   1. Localizar la solicitud: en P2 la indicada en la ruta; en P1 la solicitud viva de esa canción, si existe.
   2. Solo P2: la solicitud es de esta sesión y está `pendiente` (`404 solicitud_inexistente`, `409 solicitud_no_votable`).
   3. Voto duplicado (`409 voto_duplicado`).
   4. Intervalo cumplido (`409 intervalo_no_cumplido`).
   5. Insertar la solicitud si hace falta, insertar el voto, incrementar `version_cola`.
5. Fuera de la transacción: emitir los eventos analíticos y enviar el nuevo estado por SSE.

### 5.2 Intervalo vigente
`dispositivos_activos` del establecimiento (sección 7): 1–10 → 2, 11–30 → 4, 31–60 → 6, más de 60 → 8. Se evalúa **en cada intento**, así que un cambio de rango se aplica de inmediato y no reinicia el contador.

### 5.3 Contador (por dispositivo y establecimiento)
```sql
-- L: fecha del último voto válido del dispositivo en el establecimiento (automático o manual)
SELECT MAX(fecha_hora) AS L FROM voto WHERE id_dispositivo = :d AND id_establecimiento = :e;
-- Si L es NULL: nunca votó, tiene voto disponible (H4).

-- Reproducciones que cuentan
SELECT COUNT(*) FROM reproduccion r
WHERE r.id_establecimiento = :e
  AND r.resultado = 'exitosa'
  AND r.inicio_en > :L                                    -- desigualdad estricta (decisión 5)
  AND r.id_solicitud IS NOT NULL                          -- solo canciones que vienen de una solicitud
  AND NOT EXISTS (SELECT 1 FROM voto v                    -- su canción propia no cuenta (H2)
                  WHERE v.id_solicitud = r.id_solicitud
                    AND v.id_dispositivo = :d
                    AND v.origen = 'solicitud');
```
- `canciones_restantes = max(0, intervalo − contador)`. Puede votar si es 0.
- Con esto se cubren B1–B12 y C4, C5, C8–C11 y C23–C26: un voto manual sí cuenta, y una reproducción que ya estaba en curso o que falló no.

---

## 6. Contrato de la API (pendiente 1)

Convenciones: JSON en `snake_case`. Errores `{ "error": { "codigo", "mensaje", "detalle"? } }`, donde `detalle` es un objeto opcional nuevo; Android ya usa `ignoreUnknownKeys = true`, así que no le afecta. Fechas en ISO-8601 UTC con milisegundos. `:idSesion` es el `id_sesion` (no el `qr_token`).

### 6.1 Objetos comunes

**`cancion`**
```json
{ "youtube_video_id": "fJ9rUzIMcZQ", "titulo": "Bohemian Rhapsody", "artista_canal": "Queen Official",
  "duracion_segundos": 355, "url_miniatura": "https://i.ytimg.com/vi/fJ9rUzIMcZQ/mqdefault.jpg" }
```
`duracion_segundos` y `url_miniatura` pueden ser `null`, igual que en la búsqueda.

**`mi_votacion`** (solo si se envía `X-Dispositivo-Id`)
```json
{ "puede_votar": false, "intervalo_canciones": 2, "reproducciones_contadas": 0, "canciones_restantes": 2 }
```
Es solo una ayuda visual: el servidor vuelve a validar en cada solicitud y voto.

**`estado_cola`**: lo devuelven `GET /cola` y cada mensaje del flujo SSE.
```json
{
  "sesion_id": "SES-MOCK-001",
  "version": 17,
  "generado_en": "2026-11-10T20:16:40.000Z",
  "reproduccion_actual": {
    "id_reproduccion": "REP-1",
    "id_solicitud": "SOL-1",
    "cancion": { "youtube_video_id": "Zi_XLOBDo_Y", "titulo": "Billie Jean", "artista_canal": "Michael Jackson",
                 "duracion_segundos": 294, "url_miniatura": "https://i.ytimg.com/vi/Zi_XLOBDo_Y/mqdefault.jpg" },
    "total_votos": 3,
    "inicio_en": "2026-11-10T20:14:00.000Z",
    "segundos_restantes_estimados": 134
  },
  "reglas_votacion": { "dispositivos_activos": 2, "intervalo_canciones": 2 },
  "mi_votacion": { "puede_votar": false, "intervalo_canciones": 2, "reproducciones_contadas": 0, "canciones_restantes": 2 },
  "cola": [
    { "posicion": 1, "id_solicitud": "SOL-2", "estado": "pendiente", "total_votos": 2,
      "fecha_solicitud": "2026-11-10T20:15:03.000Z",
      "cancion": { "youtube_video_id": "fJ9rUzIMcZQ", "titulo": "Bohemian Rhapsody", "artista_canal": "Queen Official",
                   "duracion_segundos": 355, "url_miniatura": "https://i.ytimg.com/vi/fJ9rUzIMcZQ/mqdefault.jpg" },
      "ya_voto": true, "es_mia": false, "espera_estimada_segundos": 134 },
    { "posicion": 2, "id_solicitud": "SOL-3", "estado": "pendiente", "total_votos": 1,
      "fecha_solicitud": "2026-11-10T20:15:10.000Z",
      "cancion": { "youtube_video_id": "NrgmdOz227I", "titulo": "Yesterday", "artista_canal": "The Beatles",
                   "duracion_segundos": 125, "url_miniatura": null },
      "ya_voto": false, "es_mia": false, "espera_estimada_segundos": 489 }
  ]
}
```
- `reproduccion_actual` puede ser `null` y `cola` puede ser `[]`.
- `cola` contiene solo solicitudes `pendiente`, ya ordenadas: más votos primero y, con empate, la más antigua (`fecha_solicitud`, luego `id_solicitud`). **Android no reordena.**
- `ya_voto`, `es_mia` y `mi_votacion` **solo aparecen** si se envía `X-Dispositivo-Id`.
- `es_mia` = este dispositivo creó la solicitud (útil para "tu canción").
- `version` crece con cada cambio de la sesión. Android descarta cualquier estado con `version` menor o igual al que ya muestra.

**Estados de solicitud en el JSON:** `pendiente`, `en_reproduccion`, `reproducida`, `fallida`. `saltada` y `retirada` existen en la base de datos pero no se producen en el E4.

### 6.2 Endpoints para el cliente

#### C1. `GET /api/sesiones/:idSesion/cola`
Carga inicial y consulta puntual. `200` con `estado_cola`; errores `404 sesion_inexistente` y `410 sesion_cerrada` / `qr_desactivado`.

#### C2. `GET /api/sesiones/:idSesion/cola/flujo` (SSE)
Cabeceras de la petición: `Accept: text/event-stream` y `X-Dispositivo-Id` (opcional, ver sección 3).

Respuesta `200`, `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `X-Accel-Buffering: no`:
```
retry: 3000

id: 17
event: estado
data: {"sesion_id":"SES-MOCK-001","version":17, ... mismo JSON que estado_cola en una sola línea ...}

: ping

id: 18
event: estado
data: {...}
```
- **Al conectar**, el servidor envía de inmediato el estado actual. Con esto `GET /cola` deja de ser obligatorio, aunque sigue disponible.
- **En cada cambio** (solicitud, voto, inicio o fin de reproducción, cambio de rango de dispositivos activos) se envía un `event: estado` con el estado **completo**, personalizado para cada conexión.
- **Ping** con un comentario `: ping` cada **10 s**, para que los proxies no corten la conexión y para detectar conexiones muertas. *Nota para Android:* el `readTimeout` actual de `RedModule` es de 15 s; para el cliente SSE debe ser mayor que el ping (por ejemplo 30 s) o desactivarse.
- **Reconexión:** el cliente reconecta pasados `retry` ms. Como cada mensaje trae el estado completo, el servidor **ignora `Last-Event-ID`** y responde con el estado actual. No hay que reproducir mensajes perdidos.
- `event: sesion_finalizada` con `data: {"codigo":"sesion_cerrada"}` y cierre de la conexión: queda reservado para cuando existan sesiones reales (E5). En el E4 no se emite.
- **Errores antes de abrir el flujo** (sesión inexistente o cerrada, UUID con formato inválido): respuesta JSON normal con su código HTTP, sin `text/event-stream`.
- **¿Por qué estado completo y no diferencias?** Android no tiene que aplicar parches ni mantener orden. La cola tiene decenas de filas, así que cada mensaje pesa pocos KB. Y la reconexión no pierde nada.

Para consumirlo en Android (pendiente 10, lo decide Santiago): `com.squareup.okhttp3:okhttp-sse:4.12.0` coincide con la versión de OkHttp que ya trae Retrofit. Si se prefiere no añadir dependencias, se puede leer línea a línea con `@Streaming` y `ResponseBody`.

#### C3. `POST /api/sesiones/:idSesion/solicitudes` (P1: solicitar con voto automático)
Cabecera `X-Dispositivo-Id` obligatoria. Cuerpo:
```json
{ "youtube_video_id": "fJ9rUzIMcZQ" }
```
Android **solo** envía el id: el backend obtiene título, duración, etc. de su catálogo (decisión C16).

**`201 Created`, canción nueva:**
```json
{
  "resultado": "solicitud_creada",
  "solicitud": { "id_solicitud": "SOL-2", "estado": "pendiente", "posicion": 2, "total_votos": 1,
                 "fecha_solicitud": "2026-11-10T20:15:03.000Z", "cancion": { "...": "..." },
                 "ya_voto": true, "es_mia": true, "espera_estimada_segundos": 356 },
  "voto": { "id_voto": "VOT-5", "id_solicitud": "SOL-2", "origen": "solicitud", "fecha_hora": "2026-11-10T20:15:03.000Z" },
  "mi_votacion": { "puede_votar": false, "intervalo_canciones": 2, "reproducciones_contadas": 0, "canciones_restantes": 2 }
}
```

**`200 OK`, la canción ya estaba esperando o sonando y se sumó el voto:** misma forma, pero con `"resultado": "voto_sumado"`, la solicitud **existente** (`total_votos` y `posicion` ya recalculados; `estado` puede ser `en_reproduccion`, y en ese caso `posicion` y `espera_estimada_segundos` son `null`) y `es_mia: false`.

**Errores:**

| HTTP | `codigo` | Cuándo | `detalle` |
|---|---|---|---|
| 400 | `dispositivo_id_invalido` | Falta la cabecera o no es un UUID | — |
| 400 | `cancion_invalida` | `youtube_video_id` falta o no cumple `^[A-Za-z0-9_-]{11}$` | — |
| 404 | `sesion_inexistente` | — | — |
| 404 | `cancion_inexistente` | YouTube no conoce ese video | — |
| 409 | `voto_duplicado` | Este dispositivo ya votó la solicitud viva de esa canción | `{ "id_solicitud": "SOL-2" }` |
| 409 | `intervalo_no_cumplido` | Sin voto disponible. **No se crea nada** | `{ "intervalo_canciones": 2, "reproducciones_contadas": 0, "canciones_restantes": 2 }` |
| 410 | `sesion_cerrada` / `qr_desactivado` | — | — |
| 422 | `cancion_no_permitida` | Fuera del catálogo (sección 8) | `{ "motivo": "no_embebible" }` |
| 502/503 | códigos de YouTube del E3 (`cuota_excedida`, `youtube_no_disponible`, …) | Hubo que validar contra YouTube y no fue posible | — |

Ejemplo de `409`:
```json
{ "error": { "codigo": "intervalo_no_cumplido",
             "mensaje": "Todavía no tienes otro voto disponible, por eso no puedes solicitar otra canción.",
             "detalle": { "intervalo_canciones": 2, "reproducciones_contadas": 0, "canciones_restantes": 2 } } }
```

#### C4. `POST /api/sesiones/:idSesion/solicitudes/:idSolicitud/votos` (P2: voto manual)
Cabecera `X-Dispositivo-Id` obligatoria. Sin cuerpo (o `{}`).

**`201 Created`:**
```json
{
  "voto": { "id_voto": "VOT-6", "id_solicitud": "SOL-2", "origen": "manual", "fecha_hora": "2026-11-10T20:16:40.000Z" },
  "solicitud": { "id_solicitud": "SOL-2", "estado": "pendiente", "posicion": 1, "total_votos": 2,
                 "ya_voto": true, "es_mia": false, "espera_estimada_segundos": 134, "cancion": { "...": "..." } },
  "mi_votacion": { "puede_votar": false, "intervalo_canciones": 2, "reproducciones_contadas": 0, "canciones_restantes": 2 }
}
```
**Errores:** `400 dispositivo_id_invalido`; `404 sesion_inexistente` / `solicitud_inexistente` (incluye una solicitud de otra sesión); `409 voto_duplicado` (también al votar la solicitud propia, caso A9); `409 intervalo_no_cumplido` (con el mismo `detalle`); `409 solicitud_no_votable` (estado distinto de `pendiente`, ver H3c); `410 sesion_cerrada` / `qr_desactivado`.

No existe operación para cambiar ni retirar un voto. Un `DELETE` o `PUT` sobre `/votos` responde `405`.

### 6.3 Endpoints del reproductor (P7, P8)

Los llamará el reproductor autorizado (E5+) y, durante el E4, la simulación. **No los llama la app Android.**

**Protección mínima en el E4:** cabecera `X-Reproductor-Token` comparada con la variable `REPRODUCTOR_TOKEN` de `backend/.env`. Sin la variable, los endpoints responden `404`. **No es el diseño de autenticación del E5**: solo evita que cualquier cliente avance la cola.

#### R1. `POST /api/sesiones/:idSesion/reproduccion/iniciar`
Si no suena nada, toma la primera solicitud de la cola, la pasa a `en_reproduccion` y crea una `reproduccion` con `inicio_en = ahora` (hora del servidor).
- `200` devuelve `{ "reproduccion_actual": {...} }`.
- Errores: `409 ya_hay_reproduccion`, `409 cola_vacia`, `404`, `410`.

#### R2. `POST /api/sesiones/:idSesion/reproduccion/siguiente`
```json
{ "resultado": "exitosa", "segundos_reproducidos": 294 }
{ "resultado": "fallida", "segundos_reproducidos": 12, "codigo_error": "video_no_reproducible" }
```
Cierra la reproducción en curso (`fin_en`, `resultado`), pasa la solicitud a `reproducida` o `fallida` e **inicia automáticamente la siguiente** si hay cola.
- `200` devuelve `{ "anterior": { "id_reproduccion", "id_solicitud", "resultado" }, "reproduccion_actual": {...} | null }`.
- Errores: `400 resultado_invalido`, `409 sin_reproduccion_actual`.
- `resultado` solo acepta `exitosa` o `fallida` en el E4. La lista se puede ampliar (por ejemplo `saltada` en el E5) sin romper el contrato.
- No hace falta actualizar ningún contador: el contador se **calcula** (sección 5.3), así que el nuevo estado SSE ya refleja `mi_votacion` de cada dispositivo.

*Cambio respecto al borrador:* uso `"exitosa"` en lugar de `"finalizada"`, para que coincida con "reproducciones exitosas" de la regla.

P4 (`GET …/reproduccion`) y P5 (detalle de solicitud) **no se crean**: `estado_cola` ya contiene esa información.

---

## 7. Conectividad actual (pendiente 4)

**Definición operativa:** un dispositivo está activo en un establecimiento si tiene **al menos una conexión SSE abierta** con `X-Dispositivo-Id` en alguna sesión de ese establecimiento, **o** se desconectó hace menos de **20 s**. La gracia cubre la reconexión normal (`retry: 3000`) sin que el rango cambie de un momento a otro.

- Un registro **en memoria** (`conectividad.js`) lleva las conexiones abiertas por dispositivo. Como hay un solo proceso, es la fuente fiable. En la base de datos solo se guardan `ultima_conexion` y `ultima_desconexion` en `dispositivo_sesion`, para el ER y la analítica.
- Cuando el conteo de activos de un establecimiento cambia de rango, se envía un nuevo estado a todas sus conexiones (`reglas_votacion` y `mi_votacion` cambian). Si cambia el número pero no el rango, solo se actualiza `dispositivos_activos` en el siguiente mensaje.
- Las conexiones **sin** `X-Dispositivo-Id` (vista pública web) no cuentan.
- Si el servidor se reinicia, todos quedan inactivos hasta que reconectan (unos 3 s).

**Limitación:** si un teléfono pierde la red de golpe (sin cerrar TCP), el servidor puede tardar en notarlo, hasta que falle la escritura de un ping (de segundos a pocos minutos, según la red). Si el equipo necesita más precisión, se puede añadir un `POST …/latido` cada 30 s desde la app. No lo propongo por ahora.

**Para Santiago, decisión de Android:** si la app mantiene el flujo abierto solo con la pantalla de la cola visible, o mientras la app esté en primer plano. Afecta directamente al conteo de activos. Mi sugerencia es mientras la app esté en primer plano: un usuario que está buscando una canción sigue presente en el establecimiento.

---

## 8. Validación del catálogo permitido (pendiente 6)

**Definición propuesta de "catálogo permitido" para el E4:** videos de YouTube que cumplen los mismos filtros que ya aplica la búsqueda del E3, más los mínimos para poder reproducirse.

| Comprobación (de `videos.list` `part=snippet,contentDetails,status`) | Si falla: `cancion_no_permitida` con `motivo` |
|---|---|
| `snippet.categoryId === '10'` (Música) | `no_musica` |
| `status.embeddable !== false` | `no_embebible` |
| `status.privacyStatus === 'public'` | `no_publico` |
| `snippet.liveBroadcastContent === 'none'` | `en_vivo` |
| Duración ISO válida (`parseDuracionIso`) | `sin_duracion` |

Si el video no existe: `404 cancion_inexistente`.

**Flujo y cuota:**
1. Cada búsqueda (`/api/busqueda` y `/sugerencias`) guarda o actualiza las canciones devueltas en la tabla `cancion` con `consultado_en`. Para eso hay que pedir también `categoryId`, `privacyStatus` y `liveBroadcastContent`, que la búsqueda actual ya recibe en `videos.list`.
2. En P1, si la canción está en `cancion` y se consultó hace **menos de 24 h**, se usa sin llamar a YouTube. Es lo normal, porque el usuario la acaba de buscar.
3. Si no está o está vencida, se llama a `videos.list` por id (**1 unidad** de cuota; `search.list` cuesta 100) y se guarda.
4. Si YouTube no responde y la canción **ya estaba** en la tabla, se acepta con los datos guardados. Si no estaba, se responde con el error de YouTube del E3 (`503 cuota_excedida`, etc.).

**Para pruebas y simulación sin cuota:** un archivo `backend/data/catalogo.semilla.json` con unas 20 canciones reales (id, título, duración, …) que se carga en `cancion` al arrancar si `CATALOGO_SEMILLA=true`. En las pruebas automáticas YouTube se simula, como en el E3.

El bloqueo de contenido por el establecimiento (HU-12) es del E5. El esquema lo permitirá con una tabla de exclusiones, sin cambiar este flujo.

---

## 9. Eventos analíticos del E4 (pendiente 8, para revisión de Karen y Santiago)

Siguen el principio del documento del proyecto (sección XVI): **los registra el servidor** cuando confirma la acción, con hora UTC del servidor y `actor: "servidor"`. Se guardan con el mismo almacén JSONL del E3 y el mismo sobre (`evento_id`, `tipo`, `fecha_hora`, `sesion_id`, `actor`, `dispositivo_id`, `version_esquema: "1.1"`, `datos_evento`).

**No pasan por `POST /api/eventos`**, así que `eventos-e3.json` y `contrato-eventos.test.js` **no cambian**. Android no tiene que enviar nada nuevo.

| Tipo | Cuándo | `datos_evento` |
|---|---|---|
| `solicitud_creada` | P1 crea una solicitud | `id_solicitud`, `youtube_video_id`, `duracion_segundos`, `posicion_inicial`, `dispositivos_activos` |
| `voto_registrado` | Cualquier voto aceptado (P1 o P2) | `id_solicitud`, `origen` (`solicitud`/`manual`), `total_votos`, `posicion_antes`, `posicion_despues`, `intervalo_canciones` |
| `solicitud_rechazada` | P1 rechazada por regla | `youtube_video_id`, `motivo` (`intervalo_no_cumplido`, `voto_duplicado`, `cancion_no_permitida`), `canciones_restantes` |
| `voto_rechazado` | P2 rechazado por regla | `id_solicitud`, `motivo`, `canciones_restantes` |
| `reproduccion_iniciada` | R1 o el inicio automático de R2 | `id_reproduccion`, `id_solicitud`, `youtube_video_id`, `total_votos`, `origen` (`simulacion`/`reproductor`) |
| `reproduccion_finalizada` | R2 con `exitosa` | `id_reproduccion`, `id_solicitud`, `segundos_reproducidos`, `origen` |
| `reproduccion_fallida` | R2 con `fallida` | `id_reproduccion`, `id_solicitud`, `segundos_reproducidos`, `codigo_error`, `origen` |

- Una solicitud aceptada genera **dos** eventos: `solicitud_creada` y `voto_registrado` (con `origen: "solicitud"`). Si se sumó a una existente, solo `voto_registrado`.
- No se registran errores de validación de formato (400). Solo los rechazos por reglas de negocio.
- **Para Karen:** ¿registramos los rechazos?, ¿basta `dispositivos_activos` como contexto? Las reproducciones simuladas llevan `origen: "simulacion"`, para que se puedan excluir de la analítica.

---

## 10. Tiempo estimado de espera (pendiente 9)

- `restante_actual = max(0, duracion_actual − ⌊(ahora − inicio_en) / 1000⌋)`. Vale 0 si no suena nada y `null` si la canción actual no tiene duración.
- `espera_estimada_segundos(posición i) = restante_actual + Σ duracion_segundos de las pendientes en posiciones 1…i−1`.
- **Unidades:** segundos enteros. **Si falta cualquier duración** del cálculo, el resultado es `null` (RF-21: "cuando sea posible calcularlo"). No se usa una duración media inventada.
- Se calcula en el momento de `generado_en`. Android puede descontar el tiempo transcurrido desde `generado_en` para mostrar una cuenta atrás, o mostrarlo tal cual ("≈ 8 min"). Lo decide Santiago.
- No considera pausas, saltos ni la lista por defecto (E5).

---

## 11. Simulación de reproducciones (pendiente 5)

Objetivo: probar el intervalo, el conteo, el tiempo estimado y la cola **sin operador real**. Todo está deshabilitado salvo con `SIMULACION_HABILITADA=true` en `backend/.env`. Sin la variable, las rutas `/api/simulacion/*` responden `404`.

**Nivel 1, manual (con los endpoints reales):** R1 y R2 con `X-Reproductor-Token`, desde `curl`, Postman o un script:
```bash
npm run simular -- iniciar   SES-MOCK-001
npm run simular -- exitosa   SES-MOCK-001
npm run simular -- fallida   SES-MOCK-001 video_no_reproducible
```
Las reproducciones creadas así llevan `origen = 'simulacion'`.

**Nivel 2, automático:**
```
POST /api/simulacion/sesiones/:idSesion/auto
{ "activo": true, "factor_tiempo": 30, "probabilidad_fallo": 0.2 }
```
Mientras está activo, si no suena nada y hay cola, inicia la primera solicitud. Cada canción termina pasado `duracion / factor_tiempo` (con `factor_tiempo: 30`, una canción de 3 min dura 6 s) con resultado `fallida` según la probabilidad, y avanza. `{ "activo": false }` lo detiene. Sirve para la demo con dos celulares.

**Nivel 3, rangos de dispositivos activos:**
```
POST /api/simulacion/establecimientos/:idEstablecimiento/dispositivos-activos-virtuales
{ "cantidad": 59 }
```
Suma N dispositivos virtuales al conteo de activos de ese establecimiento. Así se prueban las fronteras 10/11, 30/31 y 60/61 (C8, C9, A11) con un solo teléfono.

**En las pruebas automáticas** no se usa nada de esto: `crearApp` recibe un **reloj inyectable** (`ahora()`) y un registro de conectividad falso, y las pruebas llaman a R1 y R2 con tiempos exactos. Así se pueden probar casos como B4d (misma milésima de segundo).

---

## 12. Cambios en el código del backend (plan)

Sin tocar el comportamiento del E3. `crearApp` recibe las nuevas dependencias como **opcionales**, de modo que las 17 pruebas actuales sigan pasando sin cambios.

| Archivo | Contenido |
|---|---|
| `src/db/esquema.sql`, `src/db/index.js` | Abrir la base (archivo o `:memory:`), aplicar el esquema, cargar sesiones y catálogo semilla |
| `src/catalogo.js` | Validación de la sección 8; `youtube.js` añade `obtenerVideo(id)` |
| `src/cola.js` | `solicitar`, `votar`, `estadoCola`, cálculo del intervalo y de la espera (transacciones) |
| `src/reproduccion.js` | `iniciar` y `siguiente` |
| `src/conectividad.js` | Registro de dispositivos activos |
| `src/flujo.js` | Conexiones SSE, envío de estados y ping |
| `src/simulacion.js` | Niveles 2 y 3 |
| `src/eventos.js` | Se añade `registrarEventoServidor` (los tipos del E3 no cambian) |
| `test/e4-*.test.js` | Tablas A, B y C de la especificación |
| `test/fixtures/contrato-e4.json` | Ejemplos de respuesta compartidos con Android, en el estilo de `eventos-e3.json` (cuando Santiago apruebe el contrato) |
| `.env.example` | `DB_RUTA`, `REPRODUCTOR_TOKEN`, `SIMULACION_HABILITADA`, `CATALOGO_SEMILLA` |
| `package.json` | Nueva dependencia `pg` |

**Orden de implementación:** base de datos y esquema; catálogo; P1, P2 y `GET /cola` con las pruebas A y C; R1, R2 y la simulación con las pruebas B; conectividad y SSE; tiempo estimado; eventos; fixture de contrato.

---

## 13. Qué necesito de Santiago

1. Revisar el contrato (sección 6) desde Android: nombres de campos, códigos y si `estado_cola` completo por SSE le sirve.
2. Confirmar la cabecera `X-Dispositivo-Id` con un interceptor (sección 3).
3. Decidir cómo consumir SSE (okhttp-sse u otra opción) y el `readTimeout` (sección 6.2).
4. Decidir cuándo se mantiene abierto el flujo, porque afecta a los dispositivos activos (sección 7).

**Para el equipo:** H1 (bloqueo con pocos dispositivos), y confirmar H2 y H3.
