# Dependencias pendientes con Juan Camilo (backend) — E4 Android

> Registro vivo. **Nada de lo que aparece aquí está acordado salvo que diga DECIDIDO.** Android no inventa rutas, campos ni códigos: cuando una dependencia se resuelve, se actualiza este archivo (estado y fecha) sin borrar el historial.
>
> Fuente de las decisiones: `docs/entregable-4/ESPECIFICACION_TECNICA_ENTREGABLE_4.md` (raíz del repositorio; sección 15 y borradores 7–8, **ilustrativos**).
> Última actualización: 2026-11-09 (incremento 4, paso 4A). Sin cambios de estado: todas siguen PENDIENTE; las notas "Incremento 3" recogen lo que Android ya hace y necesita confirmar.

**Estados:** `PENDIENTE` (no se ha definido) · `EN PROCESO` (Juan Camilo lo está definiendo/implementando) · `BLOQUEADA` (impide avanzar un trabajo de Android) · `RESUELTA` (entregada y verificada contra Android).

**Regla:** una dependencia pasa a `RESUELTA` solo cuando se cumple su criterio con el backend real o con un contrato acordado por escrito. Un modelo provisional o el repositorio falso **no** la resuelven.

Abreviatura de rutas: `KT` = `app/src/main/java/co/edu/cue/nuclear/cliente`. Los archivos marcados *(por crear)* **no existen todavía**.

## Resumen

| ID | Dependencia | Estado | Bloquea integración |
|---|---|---|---|
| DEP-01 | Endpoint para obtener la cola | PENDIENTE | Sí |
| DEP-02 | Endpoint para solicitar canciones | PENDIENTE | Sí |
| DEP-03 | Endpoint para votar | PENDIENTE | Sí |
| DEP-04 | Contratos JSON de solicitudes y respuestas | PENDIENTE | Sí |
| DEP-05 | Códigos y motivos reales de rechazo | PENDIENTE | Sí |
| DEP-06 | Envío e identificación del UUID del dispositivo | PENDIENTE | Sí |
| DEP-07 | Identificación de sesión y establecimiento | PENDIENTE | Sí |
| DEP-08 | Solicitud de una canción ya pendiente o en reproducción | PENDIENTE (regla decidida; señal en la respuesta sin definir) | Sí |
| DEP-09 | Estados definitivos de las solicitudes | PENDIENTE | Parcial |
| DEP-10 | Información de reproducción actual | PENDIENTE | Sí |
| DEP-11 | Tiempo estimado de espera | PENDIENTE | No (la UI tolera `null`) |
| DEP-12 | SSE: ruta y formato de eventos | PENDIENTE (mecanismo DECIDIDO) | No para pantallas; sí para tiempo real |
| DEP-13 | Reconexión y desconexiones | PENDIENTE | No para pantallas; sí para tiempo real |
| DEP-14 | Eventos analíticos desde Android | PENDIENTE | No |
| DEP-15 | Errores de comunicación y respuestas del servidor | PENDIENTE | Sí |
| DEP-16 | Estado de votación del dispositivo (`mi_votacion`, faltantes) *(adicional)* | PENDIENTE | No |
| DEP-17 | Validación del catálogo al solicitar *(adicional)* | PENDIENTE | Parcial |
| DEP-18 | Historial de solicitudes y votos del dispositivo *(adicional, aplazada)* | PENDIENTE | No (incremento 5) |

---

## DEP-01 — Endpoint para obtener la cola
- **Descripción:** consulta del estado de la cola de un establecimiento: canción que suena y solicitudes pendientes ordenadas.
- **Juan Camilo debe implementar/confirmar:** ruta, método, parámetros, códigos HTTP y forma de la respuesta. El borrador de la especificación (P3) propone `GET /api/sesiones/:idSesion/cola`, **sin confirmar**.
- **Android necesita:** carga inicial al abrir la pantalla de cola; orden ya resuelto por el servidor (votos desc., desempate por antigüedad); lista vacía y `reproduccion_actual` nula permitidas.
- **Afecta:** `ColaRepository.obtenerCola()` (`KT/data/cola/ColaRepository.kt`); *(por crear)* `KT/data/cola/ColaApi.kt`, `ColaRepositoryReal.kt`, `ColaDtos.kt`.
- **Modificación posterior:** crear `ColaApi` (Retrofit), DTO + mapeador a `EstadoCola`, repositorio real y conectarlo en `AppContainer`.
- **Resuelta cuando:** existe la ruta en el backend, hay contrato escrito y una prueba de Android con `MockWebServer` basada en una respuesta real/fixture compartida pasa.
- **Nota (incremento 3):** Android pide la cola **al abrir la pantalla** y **de nuevo tras cada solicitud o voto aceptado** (no reordena ni suma votos por su cuenta). Esto exige que la consulta sea ligera y devuelva siempre el estado completo y ordenado. Con SSE (DEP-12) podría evitarse el refresco tras cada operación.
- **Estado:** PENDIENTE.

## DEP-02 — Endpoint para solicitar canciones
- **Descripción:** crea una solicitud y registra el voto automático **de forma atómica** (decisión cerrada). Si se rechaza, no se agrega canción ni voto.
- **Juan Camilo debe confirmar:** ruta/método (borrador P1: `POST /api/sesiones/:idSesion/solicitudes`, sin confirmar), cuerpo mínimo (qué datos de la canción se envían: ¿solo `youtube_video_id`?), códigos de éxito (¿`201` vs `200`?) y de rechazo.
- **Android necesita:** la solicitud resultante con su `total_votos` ya incluyendo el voto automático, su posición y si fue nueva o sumó voto a una existente.
- **Afecta:** `ColaRepository.solicitar()`; `Cancion` (`KT/data/busqueda/Cancion.kt`) como origen de los datos; botón "Solicitar" aún no implementado en `KT/ui/screens/detalle/DetalleScreen.kt`.
- **Modificación posterior:** método en `ColaApi`, DTO de petición/respuesta, mapeo a `ResultadoSolicitud`, conexión desde `DetalleScreen` vía ViewModel.
- **Resuelta cuando:** contrato escrito + prueba con `MockWebServer` de éxito, rechazo y error.
- **Nota (incremento 3):** la solicitud se envía desde el detalle de una canción de la búsqueda (`Cancion`: `youtubeVideoId`, `titulo`, `artistaCanal`, `duracionSegundos`, `urlMiniatura`, `disponible`). **Confirmar** si basta con `youtube_video_id` (el backend podría revalidar el catálogo, DEP-17) o si debe recibir más campos. Android solo ofrece "Solicitar" si la canción está disponible. **Idempotencia:** Android bloquea la segunda pulsación mientras la primera está en camino, pero si hay un timeout y la persona reintenta, el backend debe evitar duplicar (regla 1B) — confirmar.
- **Estado:** PENDIENTE.

## DEP-03 — Endpoint para votar
- **Descripción:** voto manual sobre una solicitud ajena pendiente. Los votos son definitivos.
- **Juan Camilo debe confirmar:** ruta (borrador P2: `POST /api/sesiones/:idSesion/solicitudes/:idSolicitud/votos`, sin confirmar), cuerpo, respuesta (¿solicitud actualizada con `total_votos`?).
- **Android necesita:** el total de votos y el estado de votación del dispositivo tras el voto, sin recalcular localmente.
- **Afecta:** `ColaRepository.votar()`; componentes `BotonVoto`/`ContadorVotos` (`KT/ui/components/Votos.kt`).
- **Modificación posterior:** método en `ColaApi`, DTO, mapeo a `ResultadoVoto`.
- **Resuelta cuando:** contrato escrito + pruebas de voto registrado, duplicado e intervalo no cumplido.
- **Nota (incremento 3):** Android solo permite votar solicitudes `PENDIENTE` sin voto propio (presentación; el servidor valida siempre). Tras un voto registrado, vuelve a pedir la cola y muestra lo que devuelve el servidor; si ese refresco falla, aplica solo la solicitud que devolvió el voto. **Confirmar** que la respuesta del voto trae la solicitud actualizada (`total_votos`, tipo de voto del dispositivo).
- **Estado:** PENDIENTE.

## DEP-04 — Contratos JSON de solicitudes y respuestas
- **Descripción:** nombres de campos, tipos, obligatorios/opcionales y ejemplos de todas las respuestas. El borrador de la especificación usa `snake_case` (coherente con la búsqueda actual) pero es ilustrativo.
- **Juan Camilo debe entregar:** contrato propuesto (Juan propone, Santiago revisa) con ejemplos, y un archivo de ejemplos compartido para pruebas de ambos lados.
- **Android necesita:** poder escribir DTOs `@Serializable` y fixtures. Ver `contrato-integracion-pendiente.md`.
- **Afecta:** *(por crear)* `KT/data/cola/ColaDtos.kt`; `KT/data/RedModule.kt` solo si cambia la configuración JSON (hoy `ignoreUnknownKeys = true`).
- **Resuelta cuando:** contrato revisado por Santiago y fixtures compartidos en el repositorio.
- **Estado:** PENDIENTE.

## DEP-05 — Códigos y motivos reales de rechazo
- **Descripción:** hoy Android modela `MotivoRechazoOperacion` = `INTERVALO_NO_CUMPLIDO`, `VOTO_DUPLICADO`, `SOLICITUD_NO_VOTABLE`, `CANCION_NO_DISPONIBLE`. Solo `voto_duplicado` e `intervalo_no_cumplido` aparecen en el borrador; los otros dos son **suposición de Android**.
- **Juan Camilo debe confirmar:** lista cerrada de códigos, cuáles devuelven `409` (decidido para el rechazo por intervalo) y cuáles otros estados HTTP, y si se envían datos de apoyo (p. ej. canciones faltantes).
- **Android necesita:** un código estable por motivo para mostrar un mensaje claro; qué hacer con un código desconocido (propuesta: mensaje genérico).
- **Afecta:** `MotivoRechazoOperacion` (`KT/data/cola/Cola.kt`); *(por crear)* mapeo de errores en `ColaRepositoryReal`; textos de `MensajeOperacion`.
- **Resuelta cuando:** tabla `código → motivo → HTTP` acordada y reflejada en el enum.
- **Estado:** PENDIENTE.

## DEP-06 — Envío e identificación del UUID del dispositivo
- **Descripción:** el UUID ya existe en Android (`DispositivoRepository`, DataStore) y se relaciona con la sesión actual (decisión 3A: en las llamadas, no en el establecimiento). Hoy solo viaja en el cuerpo de los eventos (`dispositivo_id`).
- **Juan Camilo debe confirmar:** cómo debe enviarse en solicitar/votar/consultar (cabecera, cuerpo o ruta) y cómo identifica "mi voto" y "mi solicitud" en la cola (`miVoto`, `esMia`).
- **Android necesita:** un único punto donde añadir el UUID a las llamadas.
- **Afecta:** `KT/data/dispositivo/DispositivoRepository.kt`; `KT/data/RedModule.kt` (interceptor si es cabecera); `SesionActivaStore`.
- **Resuelta cuando:** mecanismo acordado y una llamada real lo acepta.
- **Estado:** PENDIENTE.

## DEP-07 — Identificación de sesión y establecimiento
- **Descripción:** el backend actual devuelve `id_sesion` y `establecimiento` al validar el QR. La cola es por sesión/establecimiento. Las sesiones actuales son **simuladas y temporales** (reemplazo: E5).
- **Juan Camilo debe confirmar:** si las rutas del E4 usan `id_sesion` (borrador) o el token; cómo se comporta si la sesión se cierra durante el uso (código de error).
- **Android necesita:** el identificador estable de sesión durante toda la interacción. Hoy `SesionActivaStore` es **solo memoria** (se pierde si muere el proceso).
- **Afecta:** `KT/data/sesion/SesionActiva.kt`, `KT/data/sesion/SesionApi.kt`; decisión de persistir o revalidar el QR.
- **Resuelta cuando:** identificador y errores de sesión definidos en el contrato.
- **Estado:** PENDIENTE.

## DEP-08 — Solicitud de una canción ya pendiente o en reproducción
- **Descripción:** regla **DECIDIDO (1B)**: mientras la canción espera o suena no se duplica y se suma un voto; si ya terminó, puede volver a agregarse. Un rechazo no agrega canción ni voto. Falta cómo lo informa la API.
- **Juan Camilo debe confirmar:** cómo distingue la respuesta "solicitud nueva" de "sumó voto a existente" (código `200`/`201` o un campo) y qué ocurre si este dispositivo ya había votado esa solicitud.
- **Android necesita:** `ResultadoSolicitud.Aceptada.sumoVotoAExistente` para mostrar una confirmación coherente ("Tu voto se sumó a una canción que ya estaba en la cola").
- **Afecta:** `ResultadoSolicitud` (`KT/data/cola/Cola.kt`); mapeador futuro.
- **Resuelta cuando:** la señal está en el contrato y probada.
- **Estado:** PENDIENTE.

## DEP-09 — Estados definitivos de las solicitudes
- **Descripción:** el ER/PDF menciona pendiente, en reproducción, reproducida, saltada, fallida (provisional) y retirada. El E4 solo produce cuatro; Android modela `PENDIENTE`, `EN_REPRODUCCION`, `REPRODUCIDA`, `FALLIDA`. La lista definitiva sigue por validar con el equipo.
- **Juan Camilo debe confirmar:** valores textuales exactos y cuáles pueden aparecer en la cola o en `reproduccion_actual`.
- **Android necesita:** un valor desconocido no debe romper la pantalla (propuesta: tratarlo como no votable y no mostrarlo en la cola).
- **Afecta:** `EstadoSolicitud` (`KT/data/cola/Cola.kt`).
- **Resuelta cuando:** lista y textos acordados.
- **Estado:** PENDIENTE.

## DEP-10 — Información de reproducción actual
- **Descripción:** la canción que suena viaja aparte de la cola. En el E4 la reproducción es **simulada y controlada desde el backend** (Android no reproduce ni controla).
- **Juan Camilo debe confirmar:** forma de `reproduccion_actual` (nula cuando no hay), campos de la canción, segundos restantes (¿se envían o se calculan en Android?), y cómo se anuncia el cambio de canción.
- **Android necesita:** identificar la canción actual y, opcionalmente, el tiempo restante estimado. **No** calcula tiempos por su cuenta.
- **Afecta:** `ReproduccionActual` (`KT/data/cola/Cola.kt`); `TarjetaAhoraSuena` (`KT/ui/components/AhoraSuena.kt`).
- **Resuelta cuando:** campos acordados y fixture compartido.
- **Estado:** PENDIENTE.

## DEP-11 — Tiempo estimado de espera
- **Descripción:** regla **DECIDIDO (11A)**: se calcula con la duración de las canciones anteriores en la cola. Es un requisito condicionado ("cuando sea posible calcularlo").
- **Juan Camilo debe confirmar:** unidad (segundos), si incluye lo que falta de la canción actual, tratamiento de canciones sin duración y cuándo envía `null`.
- **Android necesita:** un entero en segundos o `null`; la UI muestra "no disponible" si falta.
- **Nota de implementación (incremento 2):** hoy "no se envía" y "no puede calcularse" llegan igual (`null`) y `TiempoEstimado` los muestra como `NoDisponible`. Si el contrato los distingue, hay que añadir un estado propio.
- **Afecta:** `SolicitudCola.esperaEstimadaSegundos`, `ReproduccionActual.segundosRestantesEstimados`; `TiempoEstimado` (`KT/ui/components/TiempoEstimado.kt`).
- **Resuelta cuando:** fórmula y unidad documentadas en el contrato.
- **Estado:** PENDIENTE.

## DEP-12 — SSE: ruta y formato de eventos
- **Descripción:** el mecanismo de tiempo real es **SSE (DECIDIDO, 6A)**. No está definido: ruta, tipos de evento, formato de los mensajes, si el evento trae la cola completa o un cambio, ni identificadores de evento.
- **Juan Camilo debe definir:** todo lo anterior. Propuesta de trabajo de la especificación (sin confirmar): carga inicial con la consulta de la cola y cambios posteriores por SSE.
- **Android necesita:** cliente SSE y a qué estado del ViewModel se aplica cada evento. Hay que decidir **si hace falta una dependencia nueva** (`okhttp-sse`); no se agrega sin acordarlo.
- **Afecta:** *(por crear)* `KT/data/cola/ColaEventos.kt`; `libs.versions.toml` / `app/build.gradle.kts` (solo si se acuerda); `ColaViewModel`.
- **Resuelta cuando:** formato acordado y una prueba con dos celulares recibe cambios sin recargar.
- **Estado:** PENDIENTE.

## DEP-13 — Estrategia de reconexión y manejo de desconexiones
- **Descripción:** sin definir qué hace el cliente al perder el flujo (reintentos, intervalo, reenvío del último evento, resincronización).
- **Juan Camilo debe definir:** política de reconexión del servidor (¿`Last-Event-ID`?, ¿`retry`?) y si el flujo ayuda a conocer la **conectividad del dispositivo** (rango de dispositivos activos; punto 4 de la sección 15.2 de la especificación).
- **Android necesita:** al reconectar, volver a cargar la cola completa para no mostrar datos viejos; indicar "reconectando" sin bloquear la pantalla.
- **Afecta:** *(por crear)* cliente SSE; `ColaViewModel`.
- **Resuelta cuando:** política acordada y probada cortando la red.
- **Estado:** PENDIENTE.

## DEP-14 — Eventos analíticos desde Android
- **Descripción:** decisión: el Backend propone los eventos del E4; Karen y Android revisan. Hoy Android emite `DispositivoUnido` y `BusquedaRealizada`.
- **Juan Camilo/Karen deben definir:** eventos de solicitud, voto, rechazo, etc., con esquema y reglas de anonimización.
- **Android necesita:** nombres y campos exactos. **No se inventa ninguno.**
- **Afecta:** `KT/data/eventos/Evento.kt`, `EventosRepository.kt`.
- **Resuelta cuando:** esquema acordado y `contrato-eventos.test.js` ampliado.
- **Estado:** PENDIENTE.

## DEP-15 — Tratamiento de errores de comunicación y respuestas del servidor
- **Descripción:** hoy el formato de error del backend es `{error:{codigo,mensaje}}` (vigente). Android distingue conexión (`IOException`) y servidor (`SerializationException`, estados inesperados) en `TipoErrorCola`.
- **Juan Camilo debe confirmar:** si los endpoints E4 mantienen ese formato; qué códigos HTTP usa para sesión cerrada, solicitud inexistente, límite de peticiones, etc.; si habrá reintentos idempotentes (¿qué pasa si el cliente repite una solicitud tras un timeout?).
- **Android necesita:** poder diferenciar "no llegó" de "llegó y se rechazó", y no duplicar una solicitud al reintentar.
- **Nota (incremento 3):** Android muestra "Sin conexión" para `TipoErrorCola.CONEXION` y "Algo salió mal" para `SERVIDOR`, con "Reintentar" al cargar. Falta decidir qué errores HTTP (sesión cerrada, límite de peticiones, 404 de solicitud) merecen un texto propio.
- **Afecta:** `TipoErrorCola`; *(por crear)* `ColaRepositoryReal`; patrón actual en `KT/data/busqueda/BusquedaRepository.kt` y `KT/data/sesion/SesionRepository.kt`.
- **Resuelta cuando:** tabla de errores acordada y probada.
- **Estado:** PENDIENTE.

## DEP-16 — Estado de votación del dispositivo *(adicional)*
- **Descripción:** el borrador menciona `mi_votacion` y `reglas_votacion` (intervalo por rangos 2/4/6/8). Android solo usa un `faltantes` opcional en los rechazos.
- **Juan Camilo debe confirmar:** si la cola trae cuántas canciones faltan para poder votar y si el cliente debe mostrarlo antes de intentar.
- **Android necesita:** decidir si deshabilita el botón de voto o deja que el servidor rechace. **Hoy Android no aplica la regla del intervalo.**
- **Afecta:** `ResultadoSolicitud.Rechazada.faltantes`, `ResultadoVoto.Rechazado.faltantes`, posible campo nuevo en `EstadoCola`.
- **Estado:** PENDIENTE.

## DEP-17 — Validación del catálogo al solicitar *(adicional)*
- **Descripción:** el borrador deja abierta la validación de que la canción exista y esté disponible (decisión 8A: la valida el backend).
- **Juan Camilo debe confirmar:** si se valida contra YouTube al solicitar y qué código devuelve (`CANCION_NO_DISPONIBLE` es suposición de Android).
- **Android necesita:** el motivo para informar al cliente; `Cancion.disponible` ya existe en la búsqueda.
- **Afecta:** `MotivoRechazoOperacion`, `DetalleScreen`.
- **Estado:** PENDIENTE.

## DEP-18 — Historial de solicitudes y votos del dispositivo *(adicional, aplazada al incremento 5)*
- **Descripción:** la pantalla "Mi participación" de Figma muestra las solicitudes y votos hechos desde este dispositivo, con su estado. Con lo que existe hoy solo se podrían ver las solicitudes que siguen en la cola (`esMia`, `miVoto`); las ya reproducidas, fallidas o los votos manuales sobre canciones que ya salieron de la cola no se pueden listar.
- **Juan Camilo debe definir:** si habrá una consulta de "mis solicitudes y votos" por dispositivo y sesión, su forma, y por cuánto tiempo se conservan los datos (el prototipo deja la retención "pendiente de definición" y advierte que el aviso de datos requiere revisión legal; no se redacta ni se muestra un aviso legal sin validar).
- **Android necesita:** lista de solicitudes/votos del dispositivo con su estado.
- **Afecta (futuro):** *(por crear)* pantalla de participación y su ViewModel; `ColaRepository` o un repositorio nuevo.
- **Resuelta cuando:** contrato acordado y probado.
- **Estado:** PENDIENTE (aplazada: no se implementa en el incremento 4).

## Notas del incremento 4, paso 1 (confirmación de solicitud)
**Ninguna dependencia cambió de estado; todas siguen PENDIENTE.**
- **DEP-02 / DEP-11:** la confirmación muestra `posicion`, `totalVotos` y `esperaEstimadaSegundos` de la solicitud aceptada. **Confirmar** que la respuesta de la solicitud los incluye; si no, Android los toma de la cola pedida justo después (ya lo hace: actualiza la confirmación con la cola más reciente). Si no llegan, muestra "No disponible" / "no disponible" en lugar de inventar un valor.
- **DEP-08:** la confirmación distingue "solicitud nueva" de "voto sumado a una existente" usando `sumoVotoAExistente`. **Falta definir cómo lo señala la API** (código `200`/`201` o un campo). También: para una canción que ya **está sonando**, Android muestra "Ahora suena" en lugar de posición; confirmar que la respuesta lo permite (`estado` en reproducción, sin posición).
- **DEP-16:** por decisión de Santiago **no se añadió ningún modelo de elegibilidad**; sigue pendiente hasta que Juan Camilo confirme contrato, reglas y datos. Android no muestra "Puedes votar" ni "Esperando nueva oportunidad".
- **DEP-12:** no se usa el encabezado "Actualización automática" mientras no exista SSE; las actualizaciones simuladas de debug (paso 4) se identificarán como simuladas.

## Notas del incremento 4, paso 2 (cola destacada y navegación)
**Ninguna dependencia cambió de estado; las 18 siguen PENDIENTE.** Este paso solo usa datos que Android ya tiene (`idSolicitud` y la lista de la cola). Para que "Tu solicitud" se destaque al integrar, la cola real debe devolver la solicitud con el mismo `idSolicitud` que devolvió la solicitud (DEP-01, DEP-02, DEP-04).

## Notas del incremento 4, paso 3 (estado de la canción en el Detalle)
**Ninguna dependencia cambió de estado; las 18 siguen PENDIENTE.**
- **DEP-01 / DEP-04:** para saber si una canción ya está en la cola o suena, Android la identifica por `youtube_video_id`. **Confirmar** que cada solicitud de la cola y la canción en reproducción lo incluyen (el borrador lo trae en `cancion`).
- **DEP-08:** Android ya **no ofrece** "Solicitar" desde el Detalle cuando hay una solicitud pendiente o la canción suena, y manda a la persona a la cola. Es una pista de interfaz con datos posiblemente desactualizados: **el servidor sigue validando** y, con la regla 1B, podría sumar el voto a una solicitud repetida. **Falta confirmar** si el servidor debe admitir ese caso y cómo lo informa.
- **DEP-10 / DEP-11:** para la canción que suena el Detalle muestra "Termina en…" con `segundosRestantesEstimados`, y para las pendientes la espera con `esperaEstimadaSegundos`; si faltan, "no disponible".
- **DEP-16:** sin cambios; no se añadió ningún modelo ni texto de elegibilidad.
- **DEP-12:** la pista del Detalle se refresca al abrirlo y tras cada operación; sin SSE puede quedar desactualizada.

---

## Solicitud de contratos a Juan Camilo (paso 4A) — lista exacta

> **Ningún nombre de campo, ruta ni código de esta lista está definido.** Es lo que Android necesita **recibir** y la clase de Android que lo usará. Los nombres de clases Kotlin marcados *(por crear)* son nombres internos propuestos, **no** nombres del JSON. Las 18 dependencias siguen PENDIENTE.
> Formato de entrega recomendado: el que ya funciona en el E3, es decir **ejemplos JSON reales en `backend/test/fixtures/`** que el backend verifica en una prueba y Android lee en la suya (patrón de `eventos-e3.json`). Propuesta de archivo: `backend/test/fixtures/cola-e4.json`.

| # | Qué necesitamos recibir | Dependencias | Qué archivo o clase de Android lo usará |
|---|---|---|---|
| C1 | Ruta y método de: consultar la cola, solicitar una canción y votar | DEP-01, 02, 03 | *(por crear)* `data/cola/ColaApi.kt` (Retrofit) |
| C2 | Cuerpo de la petición de **solicitar**: qué datos de la canción se envían (¿solo `youtube_video_id`?) | DEP-02, 17 | `ColaApi` + *(por crear)* `SolicitudPeticionDto`; origen: `Cancion` (`data/busqueda/Cancion.kt`) |
| C3 | Respuesta de **consultar la cola**: forma de la lista y de `reproduccion_actual` (puede ser `null`), lista vacía, campos de cada elemento | DEP-01, 04, 10 | *(por crear)* `ColaRespuestaDto` → `EstadoCola`; `ReproduccionActualDto` → `ReproduccionActual` |
| C4 | Campos de cada **solicitud**: id, estado, posición, total de votos, canción (¿misma forma que la búsqueda?), si es de este dispositivo, voto de este dispositivo (¿tipo automático/manual o solo booleano?), espera estimada | DEP-04, 09, 11 | *(por crear)* `SolicitudColaDto` → `SolicitudCola`; la canción reutilizaría `CancionDto` (`data/busqueda/Cancion.kt`) si tiene la misma forma |
| C5 | **Valores textuales de los estados** de solicitud y cuáles pueden aparecer en la cola y en `reproduccion_actual` | DEP-09 | `EstadoSolicitud` (`data/cola/Cola.kt`) + su mapeador |
| C6 | Respuesta de **solicitar**: la solicitud con su voto automático, y **cómo se distingue** "solicitud nueva" de "voto sumado a una existente" (código HTTP o campo) y el caso "la canción está sonando" | DEP-02, 08 | *(por crear)* `SolicitudRespuestaDto` → `ResultadoSolicitud.Aceptada(sumoVotoAExistente)`; `ConfirmacionScreen` |
| C7 | Respuesta de **votar**: ¿trae la solicitud actualizada (`total_votos`, voto del dispositivo)? | DEP-03 | *(por crear)* `VotoRespuestaDto` → `ResultadoVoto.Registrado(solicitud)` |
| C8 | **Tabla de errores**: por cada operación, código de `error.codigo`, estado HTTP (`409` para el intervalo está decidido) y significado; incluye los datos de apoyo (p. ej. canciones que faltan) | DEP-05, 15, 16 | `ErrorRespuestaDto` (`data/sesion/SesionApi.kt`, ya existe) + *(por crear)* tabla `código → MotivoRechazoOperacion` en `data/cola/` |
| C9 | **Sesión cerrada, expirada o inexistente durante el uso**: código y estado HTTP | DEP-07, 15 | `TipoErrorCola` (hoy solo `CONEXION` y `SERVIDOR`): habría que añadir un valor; `ColaViewModel` |
| C10 | **Dónde viaja el UUID** del dispositivo: cabecera, cuerpo, ruta o parámetro | DEP-06 | Cabecera → interceptor en `crearRetrofit` (`data/RedModule.kt`); cuerpo/ruta/parámetro → `ColaApi` y `ColaRepositoryReal` |
| C11 | **Qué identifica la ruta**: `id_sesion` (borrador) o token del QR, y si hace falta `id_establecimiento` | DEP-07 | `SesionActivaStore` / `SesionActiva` (`data/sesion/SesionActiva.kt`) |
| C12 | **Unidad y regla de la espera estimada** y cuándo llega `null` | DEP-11 | `SolicitudCola.esperaEstimadaSegundos`, `ReproduccionActual.segundosRestantesEstimados` |
| C13 | **SSE**: ruta, tipos de evento, formato de cada mensaje (¿cola completa o cambio?), identificador/versión para descartar eventos viejos, y si pide autenticación o el UUID | DEP-12 | *(por crear, paso 4B)* `data/cola/ColaEnVivo.kt` y su implementación; `ColaViewModel` |
| C14 | **Reconexión**: `retry`/`Last-Event-ID`, qué se espera del cliente al volver (¿reconsultar la cola?), y si el flujo sirve para saber qué dispositivos están conectados | DEP-13 | `ColaEnVivo`, `ColaViewModel` |
| C15 | **Reintentos tras un timeout**: ¿el servidor evita duplicar una solicitud repetida? ¿Hay clave de idempotencia? | DEP-15 | `ColaRepositoryReal`, `ColaViewModel` |
| C16 | **Cantidad máxima de solicitudes** que devuelve la cola (¿paginación?) | DEP-01 (HU-04) | `ColaScreen` |
| C17 | **Eventos analíticos del E4** (esquema y anonimización, acordados con Karen) | DEP-14 | `Evento.kt`, `EventosRepository.kt` |
| C18 | **Fixtures compartidos** con los casos: cola con datos, vacía, sin reproducción, solicitud nueva, voto sumado, voto registrado, cada rechazo y cada error | DEP-04 | *(por crear)* `ColaRepositoryRealTest` (MockWebServer), leyendo `backend/test/fixtures/cola-e4.json` |

**Fuera de esta lista por decisión de Santiago:** elegibilidad de voto (DEP-16, no se implementa hasta recibir contrato), historial del dispositivo y "Mi participación" (DEP-18, incremento 5).

## Notas del paso 4A (preparación para la integración real)
**Ningún estado cambió; las 18 siguen PENDIENTE.**
- **DEP-06 (UUID):** el UUID ya está disponible **de forma síncrona** en `SesionActivaStore.actual.dispositivoId` (se guarda al validar el QR). `DispositivoRepository.obtenerId()` es `suspend` (DataStore) y **no** sirve para un interceptor de OkHttp. Cualquiera de las cuatro opciones del contrato es viable sin cambiar la arquitectura.
- **DEP-07 (sesión y establecimiento):** `SesionActivaStore` ahora conserva `idSesion`, `dispositivoId` **e `idEstablecimiento`** (este último ya lo entrega el endpoint de acceso del E3). **Riesgo abierto:** el store vive solo en memoria. Si el sistema mata el proceso y Navigation restaura la pantalla (cola o detalle), la sesión queda vacía y el repositorio real no podría armar sus rutas. Decisión pendiente de Santiago (ver el historial): persistir la sesión o forzar el regreso al acceso. El contrato de Juan Camilo decide cuánto hay que persistir.
- **DEP-12 (SSE):** OkHttp 4.12.0 ya está en el proyecto (lo trae Retrofit 3.0.0). SSE se podría leer con `okhttp-sse:4.12.0` (dependencia nueva, requiere aprobación) o manualmente con OkHttp, sin dependencia nueva. El cliente actual corta las lecturas a los 15 s, así que el flujo necesita un cliente derivado sin ese límite. **No se implementó nada.**
- **DEP-15:** el patrón de errores para la cola será el de `BusquedaRepository` / `SesionRepository` (`IOException` → conexión, `SerializationException` → servidor, cuerpo `{error:{codigo,mensaje}}` → motivo). Falta la tabla de códigos (C8).
