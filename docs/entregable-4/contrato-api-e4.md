# Entregable 4 — Contrato de la API para Android

**De:** Juan Camilo Arias (Backend) · **Para:** Santiago Cardona (Android)
**Fuente:** el código del backend (`backend/src/rutas-e4.js`, `cola.js`, `reproduccion.js`, `flujo.js`, `comun-e4.js`) y el fixture `backend/test/fixtures/contrato-e4.json`.
**Estado:** implementado. **Actualizado en la fase de cierre del E4 (ver la sección 12):** H1 y H3c resueltos, aviso de cierre de sesión por SSE, regla única de canción permitida, acceso por QR desde PostgreSQL y eventos analíticos ampliados. Los nombres pueden cambiar si los revisamos juntos; si cambian, se regenera el fixture y te aviso.

> **Fixture con ejemplos reales:** `backend/test/fixtures/contrato-e4.json` tiene 20 casos (petición y respuesta **exactas**) que produce el backend sobre una base vacía con el reloj fijado. La prueba `e4-contrato.test.js` falla si una respuesta deja de coincidir con el fixture. Puedes leerlo desde tus pruebas, como ya haces con `eventos-e3.json`. Todos los ejemplos de este documento salen de ese archivo.
>
> No hay OpenAPI ni colección de Postman todavía.

---

## 1. Convenciones

- JSON en `snake_case`. Fechas en ISO-8601 UTC con milisegundos (`"2026-11-10T20:15:03.000Z"`), igual que en el E3.
- **Identificadores opacos** con prefijo: `SOL-n` (solicitud), `VOT-n` (voto), `REP-n` (reproducción). No los interpretes; úsalos tal cual en las rutas.
- **Errores** con el mismo formato del E3, más un `detalle` opcional:
  ```json
  { "error": { "codigo": "intervalo_no_cumplido", "mensaje": "…", "detalle": { … } } }
  ```
  Decide siempre por `error.codigo`, no por `mensaje` (el mensaje puede cambiar). `detalle` solo aparece en algunos códigos (sección 8). Con `ignoreUnknownKeys = true` no te rompe nada.
- `duracion_segundos` y `url_miniatura` pueden ser `null`, igual que en la búsqueda.

## 2. Sesión, establecimiento y dispositivo

**Acceso por QR (cierre del E4):** `GET /api/sesiones/{token}` lee la sesión de **PostgreSQL** (la misma fuente que la cola) cuando el backend tiene base de datos; así una sesión cerrada o con el QR desactivado se rechaza ya al escanear (`410`). Sin base de datos usa el mock del E3.

**Sesión:** la ruta usa el `id_sesion` (`SES-MOCK-001`), **no** el `qr_token`. Es el mismo `id_sesion` que ya recibes en `GET /api/sesiones/:token` (E3) y que guardas en `SesionActiva`.

**Establecimiento:** no va en ninguna petición del E4. El backend lo deduce de la sesión. Si lo necesitas en pantalla, ya viene en la respuesta del E3: `establecimiento { id_establecimiento, nombre }`.

**UUID del dispositivo:** se envía en la cabecera **`X-Dispositivo-Id`**, en todas las llamadas del E4. Es el mismo UUID de DataStore.
- Lo más simple es añadirla con **un interceptor de OkHttp** en `RedModule.kt`.
- Es **obligatoria** en solicitar y votar. Si falta o no es un UUID: `400 dispositivo_id_invalido`.
- Es **opcional** en `GET /cola` y en el flujo SSE:
  - Sin la cabecera recibes la vista pública: no vienen `mi_votacion`, `ya_voto` ni `es_mia`.
  - Con la cabecera recibes la vista personalizada, y en el flujo cuentas como dispositivo activo.
  - Si la envías con un valor inválido: `400`.
- **No hay endpoint de registro.** La primera llamada con un UUID nuevo registra el dispositivo en esa sesión.
- `POST /api/eventos` del E3 **no cambia**: sigue llevando `dispositivo_id` en el cuerpo. Los eventos analíticos del E4 los registra el servidor; Android no envía nada nuevo.

## 3. Rutas para Android

| Método | Ruta | Para qué | Cabecera `X-Dispositivo-Id` |
|---|---|---|---|
| GET | `/api/sesiones/{idSesion}/cola` | Estado completo de la cola (carga inicial o consulta puntual) | Opcional |
| GET | `/api/sesiones/{idSesion}/cola/flujo` | Flujo SSE con el estado completo en cada cambio | Opcional (recomendada) |
| POST | `/api/sesiones/{idSesion}/solicitudes` | Solicitar una canción (registra el voto automático) | Obligatoria |
| POST | `/api/sesiones/{idSesion}/solicitudes/{idSolicitud}/votos` | Voto manual sobre una solicitud de otro | Obligatoria |

- **No existe** cambiar ni retirar un voto. Cualquier otro método sobre `/votos` responde `405` **sin cuerpo**, con la cabecera `Allow: POST`.
- `…/reproduccion/iniciar` y `…/reproduccion/siguiente` existen, pero **no son para Android**: los usa la simulación del E4 (y el reproductor real en el E5). Sin el token correcto responden `404`.

## 4. Objetos

### 4.1 `cancion`

Mismo objeto en la cola, en `reproduccion_actual` y en cada solicitud. **`youtube_video_id` siempre está presente.**
```json
{ "youtube_video_id": "fJ9rUzIMcZQ", "titulo": "Bohemian Rhapsody", "artista_canal": "Queen Official",
  "duracion_segundos": 355, "url_miniatura": "https://i.ytimg.com/vi/fJ9rUzIMcZQ/mqdefault.jpg" }
```

### 4.2 `solicitud`

Es cada elemento de `cola[]` y también el campo `solicitud` en las respuestas de solicitar y votar.

| Campo | Tipo | Nota |
|---|---|---|
| `posicion` | int \| null | 1 = la siguiente en sonar. `null` si ya no está pendiente (por ejemplo, está sonando) |
| `id_solicitud` | string | `SOL-n` |
| `estado` | string | `pendiente`, `en_reproduccion`, `reproducida`, `fallida` (en el E4 solo se producen estos cuatro) |
| `total_votos` | int | Empieza en 1 (el voto automático de quien la pidió) |
| `fecha_solicitud` | string ISO | |
| `cancion` | `cancion` | |
| `ya_voto` | bool | **Solo con `X-Dispositivo-Id`**. Este dispositivo ya votó esta solicitud |
| `es_mia` | bool | **Solo con `X-Dispositivo-Id`**. Este dispositivo la creó |
| `espera_estimada_segundos` | int \| null | Ver sección 7 |

### 4.3 `reproduccion_actual` (la canción que está sonando)

```json
{
  "id_reproduccion": "REP-1",
  "id_solicitud": "SOL-1",
  "cancion": { "youtube_video_id": "Zi_XLOBDo_Y", "titulo": "Billie Jean", "artista_canal": "Michael Jackson",
               "duracion_segundos": 294, "url_miniatura": "https://i.ytimg.com/vi/Zi_XLOBDo_Y/mqdefault.jpg" },
  "total_votos": 1,
  "inicio_en": "2026-11-10T20:14:00.000Z",
  "segundos_restantes_estimados": 134
}
```
- Es `null` si no suena nada.
- La canción que suena **no aparece en `cola[]`**: la cola solo contiene solicitudes `pendiente`.
- Su solicitud pasa a estado `en_reproduccion`. Si alguien pide esa misma canción mientras suena, se le suma el voto (sección 6).

### 4.4 `mi_votacion` (estado de votos del dispositivo)

```json
{ "puede_votar": false, "intervalo_canciones": 2, "reproducciones_contadas": 0, "canciones_restantes": 2 }
```
| Campo | Significado |
|---|---|
| `puede_votar` | Si ahora puede solicitar o votar. **Es solo una ayuda visual: el backend vuelve a validar siempre** |
| `intervalo_canciones` | Reproducciones exitosas que exige el rango actual (2, 4, 6 u 8) |
| `reproducciones_contadas` | Cuántas lleva desde su último voto |
| `canciones_restantes` | `intervalo_canciones − reproducciones_contadas` (mínimo 0). Útil para "Te faltan N canciones" |

- Solo viene si envías `X-Dispositivo-Id`.
- Un dispositivo que **nunca votó** recibe `puede_votar: true` y `canciones_restantes: 0`.
- **Cola inactiva (H1, cierre del E4):** si **no suena nada y no hay nada en espera**, `puede_votar` es `true` y `canciones_restantes` es `0` aunque no se haya cumplido el intervalo; `reproducciones_contadas` conserva su valor real. Tras pedir, el intervalo vuelve a aplicarse con normalidad.
- Solicitar o votar reinicia el contador: tras una acción aceptada verás `reproducciones_contadas: 0`.
- Si cambia el número de dispositivos activos, el intervalo cambia **de inmediato** y el contador **no** se reinicia. Ejemplo: con 2 contadas, si el intervalo sube de 2 a 4, `canciones_restantes` pasa de 0 a 2.

### 4.5 `estado_cola` (respuesta de `GET /cola` y de cada mensaje SSE)

Ejemplo real (`estado_cola` en el fixture), con `X-Dispositivo-Id`:
```json
{
  "sesion_id": "SES-MOCK-001",
  "version": 5,
  "generado_en": "2026-11-10T20:16:40.000Z",
  "reproduccion_actual": {
    "id_reproduccion": "REP-1", "id_solicitud": "SOL-1",
    "cancion": { "youtube_video_id": "Zi_XLOBDo_Y", "titulo": "Billie Jean", "artista_canal": "Michael Jackson",
                 "duracion_segundos": 294, "url_miniatura": "https://i.ytimg.com/vi/Zi_XLOBDo_Y/mqdefault.jpg" },
    "total_votos": 1, "inicio_en": "2026-11-10T20:14:00.000Z", "segundos_restantes_estimados": 134
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
- **Orden:** `cola[]` viene **ya ordenada**: más votos primero y, con empate, la solicitada antes. **No reordenes en Android.**
- **`version`:** crece con cada cambio de la sesión. **Descarta cualquier estado con `version` menor o igual a la que ya muestras** (respuestas desordenadas, un GET que llega después de un mensaje SSE, etc.).
- `reglas_votacion` siempre viene, también en la vista pública.
- Sin cabecera (caso `estado_cola_publica` del fixture) es el mismo JSON sin `mi_votacion`, `ya_voto` ni `es_mia`.

## 5. Solicitar y votar

### 5.1 Solicitar: `POST /api/sesiones/{idSesion}/solicitudes`

Cuerpo: **solo** el id del video. El backend usa sus propios datos de la canción y no los que mande la app.
```json
{ "youtube_video_id": "fJ9rUzIMcZQ" }
```
Respuesta `201` (caso `solicitar_creada` del fixture):
```json
{
  "resultado": "solicitud_creada",
  "solicitud": { "posicion": 1, "id_solicitud": "SOL-2", "estado": "pendiente", "total_votos": 1,
                 "fecha_solicitud": "2026-11-10T20:15:03.000Z", "cancion": { "youtube_video_id": "fJ9rUzIMcZQ", "…": "…" },
                 "ya_voto": true, "es_mia": true, "espera_estimada_segundos": 231 },
  "voto": { "id_voto": "VOT-2", "id_solicitud": "SOL-2", "origen": "solicitud", "fecha_hora": "2026-11-10T20:15:03.000Z" },
  "mi_votacion": { "puede_votar": false, "intervalo_canciones": 2, "reproducciones_contadas": 0, "canciones_restantes": 2 }
}
```
(Valores del fixture. Aquí se resumen los campos de `cancion`. Espera de 231 s: lo que le quedaba a Billie Jean, que estaba sonando.)

### 5.2 Voto manual: `POST /api/sesiones/{idSesion}/solicitudes/{idSolicitud}/votos`

Sin cuerpo. Sobre solicitudes `pendiente` **o `en_reproduccion`** (H3c, cierre del E4) de **otro** dispositivo. Respuesta `201` (caso `votar_manual` del fixture):
```json
{
  "voto": { "id_voto": "VOT-4", "id_solicitud": "SOL-2", "origen": "manual", "fecha_hora": "2026-11-10T20:16:40.000Z" },
  "solicitud": { "posicion": 1, "id_solicitud": "SOL-2", "estado": "pendiente", "total_votos": 2,
                 "fecha_solicitud": "2026-11-10T20:15:03.000Z", "cancion": { "youtube_video_id": "fJ9rUzIMcZQ", "…": "…" },
                 "ya_voto": true, "es_mia": false, "espera_estimada_segundos": 134 },
  "mi_votacion": { "puede_votar": false, "intervalo_canciones": 2, "reproducciones_contadas": 0, "canciones_restantes": 2 }
}
```

## 6. Solicitud nueva o voto sumado a una canción existente

Si la canción que se pide **ya está esperando o sonando** en esa sesión, no se duplica: se suma el voto a la solicitud existente. Se distingue de dos formas, que siempre coinciden:

| | Solicitud nueva | Voto sumado |
|---|---|---|
| HTTP | **201** | **200** |
| `resultado` | `"solicitud_creada"` | `"voto_sumado"` |
| `solicitud` | La nueva, con `total_votos: 1` y `es_mia: true` | La **existente**, con `total_votos` y `posicion` ya recalculados y `es_mia: false` |
| `voto.origen` | `"solicitud"` | `"solicitud"` |

Ejemplo real de voto sumado a la canción **que está sonando** (caso `solicitar_voto_sumado_en_reproduccion`):
```json
{
  "resultado": "voto_sumado",
  "solicitud": { "posicion": null, "id_solicitud": "SOL-1", "estado": "en_reproduccion", "total_votos": 2,
                 "fecha_solicitud": "2026-11-10T20:13:00.000Z",
                 "cancion": { "youtube_video_id": "Zi_XLOBDo_Y", "titulo": "Billie Jean", "…": "…" },
                 "ya_voto": true, "es_mia": false, "espera_estimada_segundos": null },
  "voto": { "id_voto": "VOT-5", "id_solicitud": "SOL-1", "origen": "solicitud", "fecha_hora": "2026-11-10T20:17:00.000Z" },
  "mi_votacion": { "puede_votar": false, "intervalo_canciones": 2, "reproducciones_contadas": 0, "canciones_restantes": 2 }
}
```
Fíjate en que cuando suena, `posicion` y `espera_estimada_segundos` son `null`.

Si la canción ya terminó (`reproducida`) o falló (`fallida`), pedirla otra vez crea una **solicitud nueva** (`201`).

**Voto manual sobre la que suena (H3c, decidido en el cierre del E4):** tanto por **solicitar** como por **votar** (`/votos`) se puede sumar voto a una canción que está sonando; las dos vías son coherentes y no hay un 409 por perder la carrera contra el inicio de la canción. La respuesta de `/votos` trae la solicitud en `en_reproduccion`, con `posicion` y `espera_estimada_segundos` nulos. Una solicitud ya `reproducida` o `fallida` no se vota: `409 solicitud_no_votable`.

## 7. Tiempo estimado

- `reproduccion_actual.segundos_restantes_estimados = max(0, duracion − segundos transcurridos desde inicio_en)`. Vale `null` si la canción no tiene duración.
- `espera_estimada_segundos` de la posición *i* = lo que le queda a la actual + la suma de las duraciones de las pendientes en posiciones 1…*i*−1.
  - Si no suena nada, la actual cuenta 0. Por eso la primera de la cola tiene espera `0` (caso `solicitar_billie_jean`).
  - Si falta **alguna** duración del cálculo, esa posición y todas las siguientes son `null`. **Si viene `null`, no muestres estimación.**
  - Una solicitud que no está en la cola (por ejemplo, la que suena) tiene `null`.
- Unidad: **segundos enteros**. Se calcula en el instante de `generado_en`.
- El valor **no se actualiza solo con el paso del tiempo**: llega un estado nuevo cuando algo cambia (voto, solicitud, cambio de canción). Si quieres una cuenta atrás, resta el tiempo transcurrido desde `generado_en`. Si no, muéstralo tal cual ("≈ 8 min").
- Ejemplo del fixture: a Billie Jean le quedan 134 s, así que la posición 1 espera 134 y la posición 2 espera 134 + 355 = 489.

## 8. Códigos HTTP y de error

| HTTP | `codigo` | Rutas | Cuándo | `detalle` |
|---|---|---|---|---|
| 200 | — | cola; solicitar (`voto_sumado`) | | |
| 201 | — | solicitar (`solicitud_creada`); votar | | |
| 400 | `dispositivo_id_invalido` | todas (la cabecera es opcional en cola y flujo, pero si viene debe ser válida) | Falta o no es un UUID | — |
| 400 | `cancion_invalida` | solicitar | `youtube_video_id` falta o no cumple `^[A-Za-z0-9_-]{11}$` | — |
| 404 | `sesion_inexistente` | todas | | — |
| 404 | `solicitud_inexistente` | votar | No existe, el id no es `SOL-n`, o es de otra sesión | — |
| 404 | `cancion_inexistente` | solicitar | YouTube no tiene ese video | — |
| 405 | (sin cuerpo) | `/votos` con otro método | Los votos no se cambian ni se retiran | — |
| 409 | `intervalo_no_cumplido` | solicitar, votar | Sin voto disponible. **No se crea nada** | `{ intervalo_canciones, reproducciones_contadas, canciones_restantes }` |
| 409 | `voto_duplicado` | solicitar, votar | Ya votó esa solicitud (incluye votar la propia) | `{ id_solicitud }` |
| 409 | `solicitud_no_votable` | votar | La solicitud ya terminó (`reproducida` o `fallida`) | — |
| 410 | `sesion_cerrada` | todas | | — |
| 410 | `qr_desactivado` | todas | | — |
| 422 | `cancion_no_permitida` | solicitar | Fuera del catálogo permitido | `{ motivo }`: `no_musica`, `no_embebible`, `no_publico`, `en_vivo`, `sin_duracion` (también duración 0) o `demasiado_larga` (más de 20 minutos; configurable con `DURACION_MAXIMA_SEGUNDOS`) |
| 502 / 503 | códigos de YouTube del E3 (`cuota_excedida`, `youtube_no_disponible`, `sin_api_key`, …) | solicitar | Hubo que validar la canción con YouTube y no fue posible | — |
| 500 | `error_interno` | todas | Error inesperado | — |

Ejemplos reales:
```json
// 409 al solicitar sin voto disponible (caso error_intervalo_no_cumplido)
{ "error": { "codigo": "intervalo_no_cumplido",
  "mensaje": "Todavía no tienes otro voto disponible, por eso no puedes solicitar otra canción.",
  "detalle": { "intervalo_canciones": 2, "reproducciones_contadas": 0, "canciones_restantes": 2 } } }

// 409 al repetir un voto (caso error_voto_duplicado)
{ "error": { "codigo": "voto_duplicado", "mensaje": "Este dispositivo ya votó por esta solicitud.",
  "detalle": { "id_solicitud": "SOL-2" } } }

// 422 (caso error_cancion_no_permitida)
{ "error": { "codigo": "cancion_no_permitida", "mensaje": "Esta canción no está permitida en el catálogo.",
  "detalle": { "motivo": "no_embebible" } } }
```
Un rechazo `409` **no cambia nada**: ni cola, ni votos, ni contador.

## 9. Flujo SSE (tiempo real)

**Ruta:** `GET /api/sesiones/{idSesion}/cola/flujo`, con las cabeceras `Accept: text/event-stream` y `X-Dispositivo-Id`.

**Errores previos:** si la sesión no existe o está cerrada, o el UUID es inválido, la respuesta es **JSON normal** con su código (404 / 410 / 400) y no se abre el flujo.

**Respuesta `200`:** `Content-Type: text/event-stream; charset=utf-8`. Primer mensaje real (caso `flujo_primer_mensaje`):
```
retry: 3000

id: 9
event: estado
data: {"sesion_id":"SES-MOCK-001","version":9,"generado_en":"2026-11-10T20:21:30.000Z","reproduccion_actual":null,"reglas_votacion":{"dispositivos_activos":3,"intervalo_canciones":2},"mi_votacion":{"puede_votar":false,"intervalo_canciones":2,"reproducciones_contadas":1,"canciones_restantes":1},"cola":[]}

```
- **Tipos de evento:** `estado` y `sesion_cerrada`.
  - `estado`: `data` es el **mismo JSON que `GET /cola`** (sección 4.5), completo y personalizado para tu dispositivo, en una sola línea. `id` es la `version`.
  - `sesion_cerrada` (cierre del E4): la sesión terminó o el QR se desactivó. `data`: `{"sesion_id":"SES-MOCK-001","motivo":"sesion_cerrada"|"qr_desactivado"}`. **Después el servidor cierra el flujo: no hay que reconectar.** El servidor lo comprueba en cada `: ping` (10 s) y al enviar un estado. Quien solo conozca `estado` puede ignorar este tipo.
- **Al conectar** recibes de inmediato el estado actual. No hace falta un `GET /cola` antes, aunque puedes hacerlo.
- **En cada cambio** (solicitud, voto, inicio o fin de canción, cambio de rango de dispositivos activos) llega un `estado` nuevo con una `version` mayor. Aplica la regla de descartar versiones menores o iguales.
- **Ping:** un comentario `: ping` cada **10 s**. Ignóralo. ⚠️ El `readTimeout` actual de `RedModule` es de 15 s; para el cliente SSE ponlo **mayor que 10 s** (por ejemplo 30 s) o desactívalo (0).
- **Reconexión:** `retry: 3000`, es decir, reconecta a los 3 s si se corta. El servidor **ignora `Last-Event-ID`**: al reconectar te manda el estado actual completo, así que no pierdes nada.
- **Dispositivo activo:** mientras tu flujo está abierto **con** `X-Dispositivo-Id`, cuentas como activo en el establecimiento. Al cerrarse, sigues contando 20 s más (margen para reconectar). Esto define el intervalo (2/4/6/8) **de todos**. Decide tú si el flujo se mantiene solo con la pantalla de la cola visible o mientras la app está en primer plano; te sugiero primer plano.
- **Librería:** `com.squareup.okhttp3:okhttp-sse:4.12.0` coincide con el OkHttp 4.12.0 que ya trae Retrofit 3.0.0. La otra opción es leer líneas con `@Streaming` y `ResponseBody`. Lo decides tú.

## 10. Flujo típico en la app

1. Al entrar por el QR: `GET /api/sesiones/{token}` (E3) para obtener `id_sesion` y `establecimiento`.
2. Abrir el flujo `/cola/flujo` con `X-Dispositivo-Id` y pintar cada `estado` con `version` mayor que la última.
3. En el detalle o la búsqueda, el botón "Solicitar" envía `POST /solicitudes {youtube_video_id}`:
   - `201`: "Canción solicitada y voto registrado".
   - `200`: "Ya estaba en la cola: sumamos tu voto".
   - `409 intervalo_no_cumplido`: "Te faltan `detalle.canciones_restantes` canciones para volver a pedir o votar".
   - `409 voto_duplicado`: "Ya votaste esta canción".
4. En la cola, el botón "Votar" aparece solo si `!ya_voto && !es_mia` y `mi_votacion.puede_votar` (como ayuda visual). Envía `POST /solicitudes/{id}/votos`.
5. Mientras se envía una acción, desactiva el botón: el backend ya impide los dobles votos, pero así evitas peticiones inútiles.

## 11. Para probar contra el backend local

- Requiere PostgreSQL: `npm run db:up` (Docker) y `backend/.env` con `DATABASE_URL` (ver `.env.example`).
- `CATALOGO_SEMILLA=true` carga canciones de `data/catalogo.semilla.json` para poder solicitar sin gastar cuota de YouTube.
- Para que las canciones avancen sin reproductor real: `REPRODUCTOR_TOKEN=<algo>` y `SIMULACION_HABILITADA=true`. Luego `npm run simular -- …`, o `POST /api/simulacion/sesiones/SES-MOCK-001/auto` con `{ "activo": true, "factor_tiempo": 30, "probabilidad_fallo": 0.2 }`.
- Para probar los rangos 4/6/8 con un solo teléfono: `POST /api/simulacion/establecimientos/EST-MOCK-001/dispositivos-activos-virtuales` con `{ "cantidad": 59 }`.

---

## 12. Cambios de la fase de cierre del E4 (2026-11-10)

Decisiones técnicas tomadas en la fase de estabilización (con el equipo no disponible: el asistente asumió los roles de backend, Android y analítica; ver `cliente-android/docs/entregable-4/matriz-aceptacion-e4.md`). Todos los cambios del contrato son **aditivos** salvo los dos de comportamiento marcados.

| # | Cambio | Tipo |
|---|---|---|
| H1 | `mi_votacion`: con cola inactiva (nada suena y nada espera) `puede_votar = true`, `canciones_restantes = 0` | **Comportamiento** |
| H3c | `POST /votos` acepta solicitudes `en_reproduccion` (201); solo rechaza `reproducida`/`fallida` | **Comportamiento** |
| F1 | `GET /api/busqueda`: `disponibilidad` usa la **misma regla** que el catálogo (música, embebible, pública, no en vivo, con duración y ≤ 20 min) | Aditivo (más resultados `no_disponible`) |
| F3 | Nuevo motivo `demasiado_larga` (> 20 min) y `sin_duracion` también para 0 s. Migración `002_motivo_demasiado_larga.sql` | Aditivo |
| F2 | `GET /api/sesiones/{token}` valida contra PostgreSQL | Aditivo (misma forma de respuesta) |
| — | SSE: evento `sesion_cerrada` (sección 9) | Aditivo |
| A1/A2/A3/A5/A6/A7 | Eventos analíticos ampliados (ver `revision-analitica-e4.md`, sección 8): `id_establecimiento` en el sobre (esquema `1.2`), `sumado_a_existente`, `estado_solicitud`, `por_inactividad`, `cola_vacia`, `espera_estimada_segundos`, `segundos_en_cola`, `motivo_catalogo`, y `youtube_video_id` y `total_votos` al cerrar una reproducción | Aditivo |

El fixture `backend/test/fixtures/contrato-e4.json` pasó de 20 a 33 casos: se añadieron `votar_en_reproduccion`, `solicitar_voto_sumado_en_cola`, `error_solicitud_no_votable` (ahora sobre una canción ya terminada), `error_solicitud_inexistente`, `error_cancion_inexistente`, `error_cancion_en_vivo`, `error_cancion_demasiado_larga`, `error_youtube_no_disponible` (503), `error_sesion_inexistente`, `error_qr_desactivado`, `error_metodo_no_permitido` (405), `flujo_actualizacion` y `flujo_sesion_cerrada`.
