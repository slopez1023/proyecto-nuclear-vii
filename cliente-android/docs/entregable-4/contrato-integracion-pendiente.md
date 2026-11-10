# Contrato de integración pendiente — modelos provisionales de Android

> **Ningún nombre JSON de este documento está definido.** La columna "JSON esperado" solo copia lo que muestra el **borrador ilustrativo** de la especificación (secciones 8 y 12 de `docs/entregable-4/ESPECIFICACION_TECNICA_ENTREGABLE_4.md`) y se marca así. Juan Camilo propone el contrato; Santiago lo revisa. Los nombres actuales en Kotlin pueden cambiar.
>
> Código: `app/src/main/java/co/edu/cue/nuclear/cliente/data/cola/Cola.kt`. Última actualización: 2026-11-09.

**Estado de definición:** `SIN DEFINIR` (no hay nada acordado) · `BORRADOR` (aparece en el ejemplo ilustrativo, no es contrato) · `DECIDIDO` (regla de negocio cerrada por el equipo; el campo sigue sin definir).

## Principios del diseño actual

1. **Modelos de dominio, no DTOs.** Contienen solo lo que la interfaz necesita. Al integrar se crearán DTOs `@Serializable` (como `CancionDto` en búsqueda) y mapeadores `aDominio()`.
2. **Android no calcula** votos, posiciones, orden, esperas ni la regla del intervalo; muestra lo que entrega el repositorio. La cantidad de votos nunca se incrementa en la interfaz.
3. **Una pendiente nunca es "reproduciéndose":** `EstadoCola.cola` solo contiene pendientes y la que suena va en `reproduccionActual`.
4. **Se distingue el voto automático del manual** (`TipoVoto`).

## `SolicitudCola`

| Campo Kotlin | Significado | JSON esperado | Tipo | Definición | Observaciones para Juan Camilo |
|---|---|---|---|---|---|
| `idSolicitud` | Identificador de la solicitud | `id_solicitud` (borrador, ej. `"SOL-0001"`) | String | BORRADOR | Confirmar formato y si es único por sesión o global |
| `cancion` | Canción solicitada | `cancion { youtube_video_id, titulo, artista_canal, duracion_segundos, url_miniatura, disponibilidad }` | objeto | BORRADOR (los campos coinciden con la búsqueda actual) | Confirmar que reutiliza la forma de `CancionDto` (`duracion_segundos` y `url_miniatura` pueden ser `null`) |
| `estado` | Estado de la solicitud | `estado` (borrador: `"pendiente"`) | String → `EstadoSolicitud` | BORRADOR | Ver `EstadoSolicitud`; valores exactos por confirmar |
| `posicion` | Lugar en la cola (1 = siguiente); `null` si no está en cola | `posicion` (borrador) | Int? | BORRADOR | ¿Puede venir `null`? ¿La calcula siempre el servidor? (decidido: sí) |
| `totalVotos` | Votos totales según el servidor | `total_votos` (borrador) | Int | BORRADOR | Debe incluir el voto automático (parte en 1) |
| `esMia` | La solicitó este dispositivo | `es_mia` (borrador, "opcional/de trabajo") | Boolean | BORRADOR | Depende de cómo se identifique el UUID (DEP-06) |
| `miVoto` | Voto de este dispositivo: automático, manual o ninguno | ¿`mi_voto`? / `ya_voto` (borrador usa `ya_voto`) | `TipoVoto?` | SIN DEFINIR | El borrador solo trae un booleano `ya_voto`. Android necesita saber el **tipo** (o derivarlo de `es_mia`). Decidir cuál |
| `esperaEstimadaSegundos` | Espera calculada por el backend | `espera_estimada_segundos` (borrador, puede ser `null`) | Int? | BORRADOR | Unidad y fórmula (DEP-11) |
| *(derivado)* `puedeVotar` | `estado == PENDIENTE && miVoto == null` | — | Boolean | — | Lógica local de presentación (HU-05). El servidor valida siempre |

## `EstadoSolicitud`

| Valor Kotlin | Significado | JSON esperado | Definición | Observaciones |
|---|---|---|---|---|
| `PENDIENTE` | Espera en la cola | `"pendiente"` (borrador) | BORRADOR | |
| `EN_REPRODUCCION` | Suena ahora | `"reproduciendo"` aparece en `reproduccion_actual.estado` (borrador) | BORRADOR | **Inconsistencia a resolver:** el borrador usa `reproduciendo` para la reproducción y habla de estado "En reproducción" para la solicitud |
| `REPRODUCIDA` | Terminó con éxito | por definir | SIN DEFINIR | |
| `FALLIDA` | Su reproducción falló | por definir | SIN DEFINIR | Término del PDF (HU-15, provisional). Debe leerse "reproducción fallida" |
| *(otros)* | `saltada`, `retirada` existen en el ER/PDF pero el E4 no los produce | — | PENDIENTE (DEP-09) | Android debe ignorar sin romper un estado desconocido |

## `TipoVoto`

| Valor Kotlin | Significado | JSON esperado | Definición | Observaciones |
|---|---|---|---|---|
| `AUTOMATICO` | Voto que nace con la solicitud | `tipo` = `"automatico"` (diccionario de datos) | DECIDIDO (concepto) / SIN DEFINIR (campo en la API) | Confirmar si la API expone el tipo o solo el total |
| `MANUAL` | Voto sobre una solicitud ajena | `tipo` = `"manual"` (diccionario de datos) | idem | |

## `ReproduccionActual`

| Campo Kotlin | Significado | JSON esperado | Tipo | Definición | Observaciones |
|---|---|---|---|---|---|
| `idSolicitud` | Solicitud que está sonando | `id_solicitud` (borrador, dentro de `reproduccion_actual`) | String | BORRADOR | |
| `cancion` | Canción actual | `cancion {…}` | objeto | BORRADOR | Igual que en `SolicitudCola` |
| `segundosRestantesEstimados` | Cuánto falta para que termine | `segundos_restantes_estimados` (borrador, "opcional") | Int? | BORRADOR | ¿Lo envía el servidor o Android lo deduce de `inicio_en` y la duración? Hoy no se calcula en Android |
| *(no modelado)* | `id_reproduccion`, `estado` (`reproduciendo`), `inicio_en` | `id_reproduccion`, `estado`, `inicio_en` | — | BORRADOR | No se modelan hasta confirmarse que Android los necesita |

## `EstadoCola`

| Campo Kotlin | Significado | JSON esperado | Tipo | Definición | Observaciones |
|---|---|---|---|---|---|
| `reproduccionActual` | Canción que suena, o `null` | `reproduccion_actual` (borrador, puede ser `null`) | `ReproduccionActual?` | BORRADOR | |
| `cola` | Solo pendientes, ya ordenadas | `cola[]` (borrador) | `List<SolicitudCola>` | BORRADOR / DECIDIDO (orden: votos desc., desempate por antigüedad, lo hace el servidor) | Puede ser `[]`. Confirmar que **nunca** incluye la que suena |
| *(no modelado)* | Versión/ marca de tiempo para descartar respuestas viejas | `version`, `actualizado_en` (borrador) | Long / String | BORRADOR | Podría ser necesario con SSE para ignorar eventos desordenados |
| *(no modelado)* | Reglas del intervalo y estado de votación del dispositivo | `reglas_votacion`, `mi_votacion` (borrador) | objeto | BORRADOR | DEP-16 |
| *(derivado)* `estaVacia` | Nada suena y nada espera | — | Boolean | — | Local, solo presentación |

## `ResultadoSolicitud` y `ResultadoVoto`

No son estructuras del JSON: **resumen de interpretación** que hará el repositorio real a partir de la respuesta.

| Resultado | Cuándo | Datos de la API que necesita | Definición |
|---|---|---|---|
| `ResultadoSolicitud.Aceptada(solicitud, sumoVotoAExistente)` | La API acepta la solicitud (nueva o suma voto a una existente) | La solicitud con `total_votos`; la **señal** nueva/existente | SIN DEFINIR (DEP-08); `201` vs `200` o campo |
| `ResultadoSolicitud.Rechazada(motivo, faltantes?)` | Rechazo de negocio (se espera `409` para el intervalo) | `error.codigo`; ¿canciones faltantes? | SIN DEFINIR (DEP-05, DEP-16) |
| `ResultadoSolicitud.Error(tipo)` | Sin red o respuesta inesperada | — | DEP-15 |
| `ResultadoVoto.Registrado(solicitud)` | El voto manual se registró | Solicitud actualizada con `total_votos` | SIN DEFINIR (DEP-03) |
| `ResultadoVoto.Rechazado(motivo, faltantes?)` | `voto_duplicado` / `intervalo_no_cumplido` (ambos `409`, distintos por `codigo`, según el borrador) | `error.codigo` | BORRADOR (códigos), SIN DEFINIR (HTTP exacto de los demás) |
| `ResultadoVoto.Error(tipo)` | idem | — | DEP-15 |
| `ResultadoCola.Exito / Error` | Resultado de la consulta | El objeto de estado de la cola | DEP-01 |

## Errores

| Tipo Kotlin | Significado | JSON / HTTP esperado | Definición | Observaciones |
|---|---|---|---|---|
| `TipoErrorCola.CONEXION` | Sin red, timeout o servidor inalcanzable | (sin respuesta) | — | Igual que `TipoErrorBusqueda.CONEXION` |
| `TipoErrorCola.SERVIDOR` | Respuesta inesperada o ilegible | 5xx / JSON inválido | — | Distinguir de un rechazo de negocio |
| `MotivoRechazoOperacion.INTERVALO_NO_CUMPLIDO` | No han sonado suficientes canciones desde su última solicitud/voto | `error.codigo` = `intervalo_no_cumplido` (borrador), `409` (DECIDIDO) | BORRADOR | Confirmar datos de apoyo (¿faltan N?) |
| `MotivoRechazoOperacion.VOTO_DUPLICADO` | Ya votó esa solicitud | `voto_duplicado`, `409` (borrador) | BORRADOR | |
| `MotivoRechazoOperacion.SOLICITUD_NO_VOTABLE` | La solicitud ya no está pendiente | **suposición de Android** | SIN DEFINIR | Confirmar código y HTTP |
| `MotivoRechazoOperacion.CANCION_NO_DISPONIBLE` | La canción no puede solicitarse | **suposición de Android** | SIN DEFINIR | DEP-17 |

## Qué debe revisar Juan Camilo (resumen)

1. ¿`miVoto` como tipo (`automatico`/`manual`) o `ya_voto` + `es_mia`?
2. Valor textual de cada estado y cuál se usa para "suena ahora".
3. Si `posicion` y `esperaEstimadaSegundos` pueden ser `null` y cuándo.
4. La señal "sumó voto a una solicitud existente".
5. Los códigos de rechazo y su HTTP.
6. Campos `version`/`actualizado_en` para ordenar eventos SSE.

---

## DTO y mapeadores necesarios (paso 4A) — nada de esto está definido ni creado

> Los nombres de clase son **propuestas internas de Android** para que Juan Camilo vea qué se espera recibir; **los nombres de los campos JSON los define su contrato**. No se creó ninguna clase: crearlas hoy implicaría adivinar campos.

Patrón a seguir (ya existe en búsqueda): `CancionDto` (`@Serializable`, `@SerialName`) + `CancionDto.aDominio()` en `data/busqueda/Cancion.kt`, con `Json { ignoreUnknownKeys = true }` (`RedModule.kt`).

| DTO (propuesto) | Para qué | Se convierte en | Dónde irá el mapeador | Contrato que lo define |
|---|---|---|---|---|
| `ColaRespuestaDto` | Respuesta de consultar la cola | `EstadoCola` | `data/cola/ColaMapeadores.kt` | C3 |
| `SolicitudColaDto` | Cada solicitud de la cola | `SolicitudCola` | ídem | C4, C5, C12 |
| `ReproduccionActualDto` | La canción que suena | `ReproduccionActual` | ídem | C3, C12 |
| `CancionDto` **(ya existe)** | La canción dentro de una solicitud, si tiene la misma forma que la búsqueda | `Cancion` | `data/busqueda/Cancion.kt` | C4 |
| `SolicitudPeticionDto` | Cuerpo de solicitar | — (sale de `Cancion`) | `data/cola/ColaMapeadores.kt` | C2 |
| `SolicitudRespuestaDto` | Respuesta de solicitar | `ResultadoSolicitud.Aceptada` (+ `sumoVotoAExistente`) | ídem | C6 |
| `VotoRespuestaDto` | Respuesta de votar | `ResultadoVoto.Registrado` | ídem | C7 |
| `ErrorRespuestaDto` **(ya existe)** | Cuerpo de error `{error:{codigo,mensaje}}` | `MotivoRechazoOperacion` / `TipoErrorCola` | `data/cola/ColaRepositoryReal.kt` | C8, C9 |

**Reglas de los mapeadores (no dependen del contrato):**
- Un valor de estado desconocido **no rompe la pantalla**: la solicitud se ignora o se trata como no votable.
- Los campos opcionales que el modelo ya admite como `null` (`posicion`, `esperaEstimadaSegundos`, `segundosRestantesEstimados`) se mapean a `null`, nunca a un número inventado.
- `miVoto` se deriva del contrato (tipo, o `es_mia` + voto); si el contrato solo trae un booleano se documentará la regla.
- La **posición y el orden** los entrega el servidor: Android no ordena ni numera.

### Tabla de errores a completar (C8, C9)
| Operación | Código (`error.codigo`) | HTTP | Se traduce a | Estado |
|---|---|---|---|---|
| votar / solicitar | *(por definir)* intervalo no cumplido | 409 (decidido) | `MotivoRechazoOperacion.INTERVALO_NO_CUMPLIDO` | código pendiente |
| votar | *(por definir)* voto duplicado | *(por definir)* | `VOTO_DUPLICADO` | pendiente |
| votar | *(por definir)* solicitud ya no votable | *(por definir)* | `SOLICITUD_NO_VOTABLE` (suposición de Android) | pendiente |
| solicitar | *(por definir)* canción no disponible | *(por definir)* | `CANCION_NO_DISPONIBLE` (suposición de Android) | pendiente |
| cualquiera | *(por definir)* sesión cerrada / inexistente | *(por definir)* | un `TipoErrorCola` nuevo | pendiente |
| cualquiera | cualquier otro código o estado | — | `TipoErrorCola.SERVIDOR` | regla de Android |

### SSE → estado de Android (a completar con C13 y C14)
| Evento del servidor | Qué hace Android | Estado |
|---|---|---|
| *(por definir)* cola actualizada | Reemplaza `EstadoCola` en `ColaViewModel` | pendiente |
| *(por definir)* cambio de canción | Actualiza `reproduccionActual` | pendiente |
| conexión perdida | Muestra que se perdió el vivo y, al reconectar, vuelve a llamar `obtenerCola()` | regla de Android; depende de C14 |
