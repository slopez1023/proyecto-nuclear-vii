# Revisión de analítica del E4 (eventos del backend)

> **Quién revisa:** por indicación de Santiago, esta revisión se hace *asumiendo el papel de Karen* (analítica / Big Data) para no bloquear el trabajo. **No la sustituye:** Karen debe confirmar o corregir las propuestas. Es una revisión del **código real** (`backend/src/cola.js`, `reproduccion.js`, `eventos.js`, `flujo.js`, `conectividad.js`, `db/repositorio.js` y las pruebas `e4-*.test.js`), contrastado con `docs/entregable-4/propuesta-backend-e4.md` (sección 9) y con el criterio de aceptación del E4: *«se generen eventos registrables por cada solicitud, voto y reproducción»*.
>
> **No se modificó el backend ni se inventó ningún evento.** Lo que falta se propone al final y **nada de eso existe**. **Android no envía eventos del E4**: los registra el servidor.
> Fecha de la revisión: 2026-11-10. Rama `feature/e4-android-frontend` (con el merge de `feature/e4-backend`, commit `873d6ed`).

## 1. Cómo se registran hoy los eventos

- Sobre común (`eventos.js`): `evento_id` (UUID), `tipo`, `fecha_hora` (UTC, reloj del servidor), `sesion_id`, `actor`, `dispositivo_id` (UUID o `null`), `version_esquema`, `datos_evento`.
- Los del E4 llevan `actor: "servidor"` y `version_esquema: "1.1"`; los del E3 (enviados por Android a `POST /api/eventos`) llevan `actor: "cliente"` y `"1.0"`. Conviven en el mismo archivo `backend/data/eventos.jsonl` (una línea JSON por evento).
- Los del E4 **se emiten después del `COMMIT`** de la transacción (`cola.js` líneas 256-268 y 319-323; `reproduccion.js`), nunca antes: un rechazo o una operación fallida no genera un evento de éxito.
- `registrarEventoServidor` **nunca lanza**: si el archivo no se puede escribir, el error se registra en consola y la operación sigue (`e4-unidad.test.js`). Es deliberado (la analítica no rompe la operación), pero implica que **puede perderse un evento sin que nadie se entere**.
- No hay rotación ni pipeline: el JSONL no es la solución de Big Data (lo dice la propia especificación).

## 2. Matriz de eventos realmente implementados

Cumplimiento: **Cumple** (hace lo que dice la propuesta y sirve al objetivo), **Parcial** (existe pero le faltan datos útiles) o **No aplica**.

| Evento | Acción que lo genera | Actor | Atributos (`datos_evento`) | Establecimiento y sesión | Utilidad analítica | Cumplimiento | Observaciones y recomendaciones |
|---|---|---|---|---|---|---|---|
| `solicitud_creada` | `POST /solicitudes` crea una solicitud **nueva** (201) | servidor | `id_solicitud`, `youtube_video_id`, `duracion_segundos`, `posicion_inicial`, `dispositivos_activos` | `sesion_id` en el sobre. **Sin `id_establecimiento`** | Qué se pide, cuándo, con cuánta gente conectada y dónde entra en la cola | **Cumple** | Falta la **espera estimada que vio la persona** (para medir la precisión del tiempo estimado). `dispositivo_id` es el UUID en claro |
| `voto_registrado` (origen `solicitud`) | Voto automático al solicitar, **y** voto sumado al pedir una canción que ya estaba (200) | servidor | `id_solicitud`, `origen`, `total_votos`, `posicion_antes`, `posicion_despues`, `intervalo_canciones` | `sesion_id`. Sin establecimiento | Efecto de cada voto en la posición; seguimiento del intervalo vigente | **Parcial** | **No distingue** «voto automático de una solicitud nueva» de «voto sumado a una existente»: hay que inferirlo por la presencia o no de `solicitud_creada` en el mismo instante (frágil). Recomendación: añadir un campo `sumado_a_existente` (booleano) |
| `voto_registrado` (origen `manual`) | `POST /votos` aceptado (201) | servidor | Los mismos | `sesion_id` | Participación real de la gente en la cola | **Cumple** | `posicion_antes`/`posicion_despues` solo describen la solicitud votada; **el desplazamiento de las demás** no se registra |
| `solicitud_rechazada` | `POST /solicitudes` rechazado por **regla**: `intervalo_no_cumplido`, `voto_duplicado` o `cancion_no_permitida` | servidor | `youtube_video_id`, `motivo`, `canciones_restantes` (`null` salvo en intervalo) | `sesion_id` | Fricción de las reglas: cuántas veces choca la gente con el intervalo | **Cumple** | No se registran `cancion_inexistente` (404), la sesión cerrada ni los 400 (decisión documentada: solo reglas de negocio). `cancion_no_permitida` no trae el sub-motivo (`no_embebible`, `en_vivo`…), que el servidor sí conoce y es lo más útil para depurar el catálogo |
| `voto_rechazado` | `POST /votos` rechazado con 409 (`intervalo_no_cumplido`, `voto_duplicado`, `solicitud_no_votable`) | servidor | `id_solicitud`, `motivo`, `canciones_restantes` | `sesion_id` | Igual que el anterior, para votos | **Cumple** | `solicitud_inexistente` (404) no se registra. El 409 `solicitud_no_votable` mide el caso H3c (votar la que suena): útil para decidir esa regla |
| `reproduccion_iniciada` | Inicio de una canción (`iniciar`, o automático al terminar la anterior) | servidor (sin `dispositivo_id`) | `id_reproduccion`, `id_solicitud`, `youtube_video_id`, `total_votos`, `origen` (`simulacion` / `reproductor`) | `sesion_id` | Qué suena y con cuántos votos; separar la simulación de la realidad | **Parcial** | Falta el **tiempo que esperó la solicitud en cola** (hoy hay que restar `fecha_hora` de `solicitud_creada`). `origen: simulacion` permite excluir los datos de prueba: **bien** |
| `reproduccion_finalizada` | `siguiente` con resultado `exitosa` | servidor | `id_reproduccion`, `id_solicitud`, `segundos_reproducidos`, `origen` | `sesion_id` | Cierra la reproducción y alimenta el conteo de «canciones sonadas» del intervalo | **Parcial** | No lleva `youtube_video_id` ni `total_votos` (hay que unir por `id_reproduccion`/`id_solicitud`) |
| `reproduccion_fallida` | `siguiente` con resultado `fallida` | servidor | Los de arriba más `codigo_error` | `sesion_id` | Calidad del catálogo y fallos del reproductor | **Cumple** | `codigo_error` es texto libre (≤100 caracteres): conviene una lista cerrada cuando exista el reproductor del E5 |
| `dispositivo_unido` *(E3)* | Android, al validar el QR | cliente | `recurrente` | `sesion_id` | Alcance y recurrencia | **Cumple** (E3) | Sin cambios |
| `busqueda_realizada` *(E3)* | Android, búsqueda aceptada | cliente | `termino`, `cantidad_resultados`, `desde_cache` | `sesion_id` | Intención de búsqueda | **Cumple** (E3) | Sin cambios |

## 3. Cobertura frente al criterio del E4

| Requisito | Estado |
|---|---|
| Un evento por cada **solicitud** | ✅ `solicitud_creada`, `solicitud_rechazada` |
| Un evento por cada **voto** | ✅ `voto_registrado` (ambos orígenes), `voto_rechazado` |
| Un evento por cada **reproducción** | ✅ `reproduccion_iniciada`, `_finalizada`, `_fallida` |
| Sin datos personales | ✅ solo UUID seudónimo, ids opacos (`SOL-n`, `REP-n`) y `youtube_video_id`. **Matiz:** el UUID viaja en claro; el esquema de anonimización lo decide Karen |
| Hora del servidor | ✅ `fecha_hora` UTC |
| Separar simulación de datos reales | ✅ campo `origen` en reproducción. ⚠️ **No** lo hay en solicitudes y votos: los que se hagan durante pruebas con el modo automático no se distinguen de los reales de la simulación |

## 4. Hallazgos y propuestas (ninguna implementada)

Todas son **propuestas para Karen y Juan Camilo**; no bloquean el trabajo de Android.

| # | Hallazgo | Propuesta | Prioridad |
|---|---|---|---|
| A1 | **Sin `id_establecimiento`.** El sobre solo trae `sesion_id`. Los establecimientos son independientes; para comparar locales hay que consultar la sesión aparte | Añadir `establecimiento_id` al sobre de los eventos del servidor | Alta |
| A2 | **No se distingue «voto sumado a una existente».** Hoy se infiere de la ausencia de `solicitud_creada` | Campo booleano `sumado_a_existente` en `voto_registrado`, o un evento propio | Alta |
| A3 | **Los cambios de la cola no se registran.** Un voto mueve a otras solicitudes y no queda rastro; tampoco hay evento de «cola vacía» (H1) ni de cambio del intervalo | Evento `cola_modificada` (posiciones afectadas) o al menos `cola_vacia`; evento `rango_dispositivos_cambiado` con el intervalo anterior y el nuevo | Media |
| A4 | **La conectividad no genera eventos.** Los dispositivos activos (clave para el intervalo) solo se ven en `dispositivos_activos` de `solicitud_creada`; la BD guarda última conexión/desconexión pero no es analítica | Eventos `flujo_conectado` / `flujo_desconectado` (con duración), o recoger esa tabla en el pipeline | Media |
| A5 | **Precisión del tiempo estimado no medible.** No se registra la espera estimada al pedir ni el tiempo real hasta sonar | `espera_estimada_segundos` en `solicitud_creada`; `segundos_en_cola` en `reproduccion_iniciada` | Media |
| A6 | **`cancion_no_permitida` sin sub-motivo.** | Incluir `detalle.motivo` (`no_embebible`, `en_vivo`, `sin_duracion`, …) en `solicitud_rechazada` | Baja |
| A7 | **`reproduccion_finalizada` sin `youtube_video_id` ni `total_votos`.** | Repetir esos dos datos para no depender de uniones | Baja |
| A8 | **Pérdida silenciosa de eventos** (la escritura falla y se ignora) y archivo JSONL sin rotación. Los eventos no son atómicos con la transacción | Aceptable en el E4; para la fase de producción, escribirlos en la misma BD o una cola fiable | Media (producción) |
| A9 | **UUID en claro** en el flujo analítico. | Que el pipeline lo reemplace por un identificador derivado (hash con sal) antes de salir del almacén operativo | Media (Karen) |
| A10 | **Solicitudes y votos hechos durante pruebas** no llevan marca de origen (solo la reproducción la tiene). | Marca `origen`/`simulado` también en solicitud y voto, o excluir por `sesion_id` de prueba | Baja |
| A11 | **Versión de esquema mezclada** (`1.0` cliente, `1.1` servidor) en el mismo archivo. | Documentar cómo se leen ambas versiones | Baja |

## 5. Qué hace y qué NO hace Android

- **Hace (E3, sin cambios):** `dispositivo_unido` y `busqueda_realizada`, con el UUID y el `id_sesion`.
- **No hace:** ningún evento del E4. No envía solicitudes, votos ni reproducciones a `POST /api/eventos` (el backend los rechazaría y, además, duplicaría lo que ya registra el servidor).
- **Consecuencia para Android de A1–A11:** ninguna; todas son cambios del servidor. Si se añadiera algún evento *de cliente* (p. ej. «la persona abrió la cola»), requeriría una definición conjunta con Karen que hoy no existe.

## 6. Decisiones que necesita el equipo (Karen, Juan Camilo, Santiago)

1. ¿Se acepta **A1** (establecimiento en el sobre) y **A2** (voto sumado) antes del cierre del E4? Son las que más afectan a los indicadores.
2. ¿Se registran A3–A5 en el E4 o se difieren al E5?
3. ¿Qué identificador reemplaza al UUID en el almacén analítico (A9)?
4. ¿Los rechazos por reglas se mantienen como eventos? Hoy sí; la propuesta de Juan Camilo pedía justamente esa confirmación.

Mientras tanto, el trabajo de Android continúa sin depender de ninguna de estas decisiones.

---

## 7. Evidencia real (Fase 3, 2026-11-10) y propuestas formales

> **Atribución:** esta revisión técnica la hizo el asistente **ocupando el lugar de la revisión de Karen**, por indicación de Santiago. **No lleva ni sustituye la aprobación personal de Karen**; sigue pendiente su confirmación.

### 7.0 A1 a A5: hallazgo frente a propuesta

Un **hallazgo** es algo observado (en el código o en los eventos reales); una **propuesta** es lo que se sugiere hacer. **Ninguna propuesta está implementada ni acordada.**

| ID | Hallazgo (observado) | Cómo se comprobó | Propuesta | Estado de la propuesta |
|---|---|---|---|---|
| A1 | El sobre de los eventos del servidor **no trae `id_establecimiento`** | Claves reales de los 34 eventos de la validación y `crearEventoServidor` | Añadirlo al sobre (`version_esquema: "1.2"`) — sección 7.2 | **Formal**, sin decidir (equipo y Karen) |
| A2 | `voto_registrado` con `origen = solicitud` **no distingue** voto automático de solicitud nueva y voto sumado a una existente | 10 eventos `voto_registrado(solicitud)` frente a 7 `solicitud_creada` | Campo `sumado_a_existente` (+ `estado_solicitud`) — sección 7.3 | **Formal**, sin decidir |
| A3 | **No hay eventos** de cambio de la cola, de cola vacía ni de cambio del intervalo | Los tipos de evento realmente emitidos (solo 7, ninguno de esos); la cola vacía con dispositivos bloqueados (H1) sí ocurrió y no dejó rastro | `cola_modificada` / `cola_vacia` / `rango_dispositivos_cambiado` — sección 7.4 | **Mejora futura**, prioridad media |
| A4 | **No hay eventos** de conectividad (flujo abierto/cerrado), aunque la BD sí guarda la última conexión | Tipos emitidos y consulta a `dispositivo_sesion` | `flujo_conectado` / `flujo_desconectado` o recoger esa tabla — sección 7.4 | **Mejora futura**, prioridad media |
| A5 | **No se registra** la espera estimada que vio la persona ni el tiempo real en cola | `datos_evento` de `solicitud_creada` y `reproduccion_iniciada` (código y eventos reales) | `espera_estimada_segundos` y `segundos_en_cola` — sección 7.4 | **Mejora futura**, prioridad media |

A1 y A2 tienen evidencia **de la ejecución real**; A3, A4 y A5 se basan en la **ausencia** de esos eventos en el código y en los eventos reales (no se probó ninguna implementación).

### 7.1 Qué se observó en el backend real
Durante la validación contra PostgreSQL 16 el servidor registró **34 eventos del E4** (`backend/data/eventos.jsonl`): 7 `solicitud_creada`, 15 `voto_registrado`, 4 `solicitud_rechazada`, 3 `voto_rechazado`, 3 `reproduccion_iniciada` y 2 `reproduccion_finalizada` (+ los del E3 enviados por la app).
- **Sobre sin establecimiento (A1):** las claves reales del sobre son `actor`, `datos_evento`, `dispositivo_id`, `evento_id`, `fecha_hora`, `sesion_id`, `tipo`, `version_esquema`. **No hay** `id_establecimiento`.
- **Voto sumado indistinguible (A2):** hubo **10** `voto_registrado` con `origen = solicitud` y solo **7** `solicitud_creada`: los 3 de diferencia son votos sumados a canciones que ya estaban (en cola o sonando) y **solo se reconocen por conteo**, no por un campo.
- **Rechazos registrados:** `intervalo_no_cumplido` (2), `cancion_no_permitida` (2, sin el sub-motivo `en_vivo`), `voto_duplicado` (2) y `solicitud_no_votable` (1). No se registró el `404 solicitud_inexistente` (coherente con la propuesta).
- **Reproducción:** `dispositivo_id` es `null` (correcto: actor servidor) y `origen: simulacion` permite separar las pruebas.

### 7.2 Propuesta A1 — `id_establecimiento` en el sobre
- **Problema:** para comparar establecimientos (cada uno es independiente) hay que ir a buscar la sesión aparte; si la sesión cambia de establecimiento o se borra, el evento queda huérfano.
- **Propuesta (no implementada):** añadir `id_establecimiento` al sobre de los eventos del servidor, al lado de `sesion_id`, con `version_esquema: "1.2"`. Ejemplo:
  ```json
  { "evento_id": "…", "tipo": "voto_registrado", "fecha_hora": "…Z",
    "sesion_id": "SES-MOCK-001", "id_establecimiento": "EST-MOCK-001",
    "actor": "servidor", "dispositivo_id": "…", "version_esquema": "1.2", "datos_evento": { … } }
  ```
- **Impacto:** solo el servidor (`crearEventoServidor` ya conoce la sesión y su establecimiento: `cola.js` lo lee en cada operación). **Android: ninguno.** Hay que actualizar `e4-unidad.test.js` (que fija las claves del sobre) y avisar a Karen del cambio de versión.
- **Riesgo si no se hace:** indicadores por establecimiento dependen de un cruce con la tabla de sesiones. **Prioridad: alta.**

### 7.3 Propuesta A2 — diferenciar solicitud nueva, voto automático y voto sumado
- **Problema:** hoy `voto_registrado` con `origen: "solicitud"` cubre dos cosas distintas: el voto automático de una solicitud **nueva** y el voto de quien **pide una canción que ya existe**.
- **Propuesta (no implementada):** mantener `origen` (`solicitud` / `manual`, que mapea a `voto.origen` de la API y a Android) y añadir a `voto_registrado` el campo booleano **`sumado_a_existente`** (`true` cuando la respuesta fue `200 voto_sumado`). Opcionalmente, `estado_solicitud` en ese instante (`pendiente` / `en_reproduccion`) para distinguir el voto sumado a la que suena. Cuadro:

  | Situación | HTTP | Eventos actuales | Propuesta |
  |---|---|---|---|
  | Solicitud nueva | 201 | `solicitud_creada` + `voto_registrado(origen=solicitud)` | igual, con `sumado_a_existente: false` |
  | Pedir una canción ya en cola | 200 | solo `voto_registrado(origen=solicitud)` | `sumado_a_existente: true`, `estado_solicitud: "pendiente"` |
  | Pedir la que suena | 200 | solo `voto_registrado(origen=solicitud)` | `sumado_a_existente: true`, `estado_solicitud: "en_reproduccion"` |
  | Voto manual | 201 | `voto_registrado(origen=manual)` | `sumado_a_existente: false` |
- **Impacto:** solo servidor; Android ya usa `resultado` / `voto.origen` de la respuesta y **no envía** eventos. **Prioridad: alta.**

### 7.4 Mejoras o riesgos futuros (A3, A4, A5)
| # | Qué | Por qué importa | Prioridad | Riesgo si se pospone |
|---|---|---|---|---|
| A3 | Registrar cambios de la cola (`cola_modificada` o al menos `cola_vacia`) y del intervalo (`rango_dispositivos_cambiado`) | Un voto reordena a otras solicitudes y no queda rastro; `cola_vacia` es justo el síntoma de **H1** (en la validación, la cola quedó vacía con dos dispositivos bloqueados) | Media | No se podrán medir los bloqueos de H1 ni el efecto de los rangos |
| A4 | Eventos de conectividad (`flujo_conectado` / `flujo_desconectado`) o recoger `dispositivo_sesion` en el pipeline | El intervalo depende de los dispositivos activos (flujo SSE abierto + 20 s de gracia); hoy el único rastro es `dispositivos_activos` dentro de `solicitud_creada` | Media | No se puede explicar por qué cambió un intervalo |
| A5 | `espera_estimada_segundos` en `solicitud_creada` y `segundos_en_cola` en `reproduccion_iniciada` | Permite medir la precisión del tiempo estimado (RF-21) | Media | La estimación no se puede evaluar frente a la realidad |
| A6–A11 | Ver la tabla de la sección 4 | Mejoras menores | Baja | — |

### 7.5 Lo que NO cambia
No se modificó el backend ni se añadió ningún evento. **Android no envía eventos del E4**; solo conserva `dispositivo_unido` y `busqueda_realizada` (E3).

---

## 8. Decisiones de cierre (Fase 4, 2026-11-10)

> **Atribución:** revisión técnica **independiente realizada por el asistente asumiendo el rol de Karen** (analítica), por instrucción de Santiago, que indicó que ningún otro integrante estaba disponible. **No lleva la aprobación personal de Karen**, y ella puede revisarla cuando vuelva; el trabajo no la espera.

### 8.1 Decisión por hallazgo

| ID | Decisión | Estado | Justificación |
|---|---|---|---|
| A1 | `id_establecimiento` en el sobre de todos los eventos del servidor; `version_esquema: "1.2"` | **Implementado** | Los establecimientos son independientes; sin él, cada indicador necesitaba cruzar con la tabla de sesiones |
| A2 | `voto_registrado` lleva `sumado_a_existente` (bool), `estado_solicitud` (`pendiente`/`en_reproduccion`) y `por_inactividad` (bool, para la regla de H1) | **Implementado** | Distingue solicitud nueva, voto sumado a una pendiente, voto sumado a la que suena y voto manual, sin inferir por conteo. Mantiene `origen` (`solicitud`/`manual`) que coincide con `voto.origen` de la API |
| A3 | Se implementa **`cola_vacia`** (al terminar la última canción); `cola_modificada` y `rango_dispositivos_cambiado` **→ E5** | **Parcial (justificado)** | `cola_vacia` es el síntoma que dejó H1 y ahora marca el momento en que todos recuperan el voto. Los otros dos son eventos de establecimiento (sin sesión) o dependen del modelo de cola del E5 |
| A4 | **→ E5** | **Diferido (justificado)** | La BD ya guarda `ultima_conexion` y `ultima_desconexion`; el pipeline puede leerlas. Un evento por flujo abierto/cerrado generaría ruido con cada reconexión |
| A5 | `espera_estimada_segundos` en `solicitud_creada`; `segundos_en_cola` en `reproduccion_iniciada` | **Implementado** | Permite medir la precisión del tiempo estimado (RF-21) |
| A6 | `motivo_catalogo` en `solicitud_rechazada` (`en_vivo`, `demasiado_larga`, `no_musica`…) | **Implementado** | Ayuda a depurar el catálogo |
| A7 | `reproduccion_finalizada` y `reproduccion_fallida` repiten `youtube_video_id` y `total_votos` | **Implementado** | Evita uniones en el análisis |
| A8 | Pérdida silenciosa de eventos y JSONL sin rotación | **Aceptado en el E4** | Es la decisión de la propuesta (la analítica no rompe la operación); para producción, escribir en la misma BD o en una cola fiable (E5) |
| A9 | UUID en claro | **Aceptado en el almacén operativo** | El UUID ya es seudónimo (aleatorio, sin datos personales); reemplazarlo por un hash con sal es tarea del pipeline antes de salir del almacén (E5) |
| A10 | Marca de origen en solicitudes y votos | **Diferido** | No hay solicitudes simuladas por el backend (la simulación solo reproduce); los datos de prueba se excluyen por `sesion_id` |
| A11 | Versiones de esquema mezcladas | **Documentado** | `1.0` (cliente, E3), `1.2` (servidor, E4); los de `1.1` de pruebas anteriores solo existen en archivos de desarrollo |

### 8.2 Matriz de eventos tras los cambios (los 8 que emite el servidor)

| Evento | Se genera cuando | Atributos (`datos_evento`) | Sobre |
|---|---|---|---|
| `solicitud_creada` | Se crea una solicitud (201) | `id_solicitud`, `youtube_video_id`, `duracion_segundos`, `posicion_inicial`, `dispositivos_activos`, **`espera_estimada_segundos`** | `id_establecimiento`, `sesion_id`, `dispositivo_id` |
| `voto_registrado` | Cada voto aceptado | `id_solicitud`, `origen`, `total_votos`, `posicion_antes`, `posicion_despues`, `intervalo_canciones`, **`sumado_a_existente`**, **`estado_solicitud`**, **`por_inactividad`** | ídem |
| `solicitud_rechazada` | Rechazo de una solicitud por regla | `youtube_video_id`, `motivo`, `canciones_restantes`, **`motivo_catalogo`** | ídem |
| `voto_rechazado` | Rechazo de un voto por regla | `id_solicitud`, `motivo`, `canciones_restantes` | ídem |
| `reproduccion_iniciada` | Empieza una canción | `id_reproduccion`, `id_solicitud`, `youtube_video_id`, `total_votos`, `origen`, **`segundos_en_cola`** | `id_establecimiento`, `sesion_id` (sin `dispositivo_id`) |
| `reproduccion_finalizada` | Termina bien | `id_reproduccion`, `id_solicitud`, `segundos_reproducidos`, `origen`, **`youtube_video_id`**, **`total_votos`** | ídem |
| `reproduccion_fallida` | Termina con fallo | los de arriba más `codigo_error` | ídem |
| **`cola_vacia`** | Termina la última canción y no queda nada | `id_reproduccion`, `origen` | ídem |

Los eventos del E3 (`dispositivo_unido`, `busqueda_realizada`, actor `cliente`, esquema `1.0`) **no cambian** y siguen sin `id_establecimiento`: se relacionan por `sesion_id`. **Android no envía ningún evento del E4.** Pruebas: `backend/test/e4-cierre.test.js` (A1, A2, A3, A5) y las actualizadas de `e4-solicitudes`, `e4-reproduccion` y `e4-unidad`.
