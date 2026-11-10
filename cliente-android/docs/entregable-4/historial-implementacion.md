# Historial de implementación — E4 Android

Rama: `feature/e4-android-frontend` (creada desde `develop`, que coincidía con `origin/develop` en `2ec7de4`). Sin commits ni push hasta que se autoricen.
`KT` = `app/src/main/java/co/edu/cue/nuclear/cliente`

## Entorno de validación (permanente, desde 2026-11-09)
El entorno principal de pruebas es el **celular Android físico conectado por USB** (no el emulador). Cada incremento debe indicar: si se validó en el dispositivo, qué funcionalidades se probaron y cuáles quedaron pendientes, separando pruebas unitarias JVM, compilación, vistas previas de Compose, pruebas instrumentadas, pruebas manuales en dispositivo y accesibilidad. Ver `README.md`.

**Estado de validación física por incremento**
| Incremento | JVM | Compilación | Vistas previas | Instrumentadas | Manual en celular | Accesibilidad (TalkBack) |
|---|---|---|---|---|---|---|
| 1 — Modelos y repositorio falso | 101 pasan | OK (debug y release) | No aplica | No existen | **No realizada** (no hay interfaz) | No aplica |
| 2 — Componentes visuales | 117 pasan | OK (debug y release) | Generan, **no revisadas visualmente** | No existen | Revisados en el incremento 3 (ver abajo) | Ver incremento 3 |
| 4, paso 4A — Preparación para la integración real | 173 pasan | OK (debug y release) | Sin cambios | No existen | **Regresión rápida** en el TECNO KL8 (vertical, 1.0×) | **No probada** (pendiente) |
| 4, paso 3 — Estado de la canción en el Detalle | 172 pasan | OK (debug y release, `--rerun-tasks`) | Generan, **no revisadas en Android Studio** | No existen (paso 7) | **Realizada** en el TECNO KL8 (vertical, 1.0×; 4 estados + flujo completo) | **No probada** (TalkBack, letra grande y horizontal pendientes) |
| 4, paso 2 — Cola destacada, estados vacíos y `launchSingleTop` | 158 pasan | OK (debug y release, `--rerun-tasks`) | Generan, **no revisadas en Android Studio** | No existen (paso 7) | **Realizada** en el TECNO KL8 (vertical, 1.5×, 2.0× y horizontal en la confirmación) | **No probada** (TalkBack pendiente) |
| 4, paso 1 — Confirmación de solicitud | 148 pasan | OK (debug y release, `--rerun-tasks`) | Generan, **no revisadas en Android Studio** | No existen (paso 7) | **Realizada** en el TECNO KL8 (vertical, 1.0×) | **No probada** (TalkBack, letra grande y horizontal pendientes) |
| 3 — ViewModel y pantalla de cola | 137 pasan | OK (debug y release, `--rerun-tasks`) | Generan, **no revisadas en el panel de Android Studio** | No existen | **Realizada** en el TECNO KL8, incluida letra grande y horizontal (3b) | Parcial: árbol semántico revisado; **escucha y gestos de TalkBack pendientes (manual)** |

---

## Incremento 1 — Modelos provisionales y repositorio falso (2026-11-09)

### Qué se hizo
- **Modelos provisionales** del dominio de la cola: `SolicitudCola`, `EstadoSolicitud`, `TipoVoto`, `ReproduccionActual`, `EstadoCola`, `MotivoRechazoOperacion`, `TipoErrorCola`, `ResultadoCola`, `ResultadoSolicitud`, `ResultadoVoto`.
- **Interfaz `ColaRepository`** con `obtenerCola()`, `solicitar(cancion)` y `votar(idSolicitud)`. No hay implementación real.
- **`ColaRepositoryFalso`**: "servidor de mentira" con estado propio, configurable para rechazos y errores.
- **`DatosSimulados`**: cola con varias canciones, solo reproduciendo, cola vacía, canción nueva para solicitar.

### Ubicación
| Archivo | Ruta |
|---|---|
| Modelos | `KT/data/cola/Cola.kt` |
| Interfaz | `KT/data/cola/ColaRepository.kt` |
| Repositorio falso | `app/src/debug/java/co/edu/cue/nuclear/cliente/data/cola/simulado/ColaRepositoryFalso.kt` |
| Datos simulados | `app/src/debug/java/…/data/cola/simulado/DatosSimulados.kt` |
| Pruebas del falso | `app/src/testDebug/java/…/data/cola/simulado/ColaRepositoryFalsoTest.kt` |

### Decisiones técnicas
- **El falso vive en `src/debug`:** no se compila en release; no puede usarse con el backend real por accidente. Verificado con `compileReleaseKotlin`. Sus pruebas están en `src/testDebug` para que `testReleaseUnitTest` no dependa de código solo-debug.
- **`miVoto: TipoVoto?`** (`AUTOMATICO`, `MANUAL`, `null`) distingue el voto automático del manual. `totalVotos` viene del repositorio; la UI no lo incrementa.
- **Pendiente ≠ reproduciéndose:** la cola solo trae pendientes; la que suena va en `reproduccionActual`.
- **El orden y la suma de votos son del falso**, que imita al servidor (votos desc., desempate por antigüedad). Android no reordena.
- **Duplicados (regla 1B):** el falso suma un voto si la canción espera o suena; repetir un voto propio se rechaza como `VOTO_DUPLICADO`.
- **Esperas no calculadas:** las solicitudes nuevas quedan en `null`; el cálculo es del backend.
- **Nombres en español**, coherentes con el proyecto. Los nombres de campos son **provisionales** (ver `contrato-integracion-pendiente.md`).

### Pruebas
- Nuevas: **15** (`ColaRepositoryFalsoTest`).
- Total tras el incremento: **101** (86 previas + 15), 0 fallos, 0 errores, 0 omitidas.
- `./gradlew testDebugUnitTest assembleDebug`: BUILD SUCCESSFUL. `compileReleaseKotlin`: BUILD SUCCESSFUL.

### Limitaciones
- Sin interfaz visible todavía. Sin integración real. Los motivos de rechazo `SOLICITUD_NO_VOTABLE` y `CANCION_NO_DISPONIBLE` son suposiciones de Android.
- No se ejecutó `testReleaseUnitTest`.

### Pendientes → ver `dependencias-backend.md` (DEP-01 a DEP-17, todas PENDIENTE).

---

## Incremento 2 — Componentes visuales de la cola (2026-11-09)

### Qué se hizo
Componentes reutilizables, con datos recibidos por parámetro (sin red, sin ViewModel, sin integración):
- `ElementoCola`: posición, miniatura, título, artista, votos (con barra opcional de popularidad), espera estimada y botón de voto.
- `BotonVoto` con 5 estados (`EstadoBotonVoto`): `Disponible`, `EnProceso`, `VotadoManual`, `VotoAutomatico`, `NoDisponible`. Solo `Disponible` reacciona al toque; `EnProceso` no admite otra pulsación.
- `ContadorVotos`: muestra el número recibido ("1 voto"/"N votos"); nunca suma.
- `TarjetaAhoraSuena`: canción actual con borde de acento e insignia "Ahora suena"; sin botón de voto.
- `TiempoEstimado` con estados `Cargando`, `Disponible(segundos)` y `NoDisponible`; `formatearEspera()` solo da formato al número del backend.
- `MensajeOperacion` + `MensajeUi`: avisos de solicitud aceptada, voto registrado, rechazos, errores de comunicación, "en proceso" e "información no disponible". Funciones `ResultadoSolicitud.aMensaje()`, `ResultadoVoto.aMensaje()` y `TipoErrorCola.aMensaje()`.
- Icono nuevo `ic_check.xml` (mismo estilo de línea que los existentes).

### Ubicación (`KT/ui/components/`)
`ElementoCola.kt`, `Votos.kt` (`BotonVoto`, `ContadorVotos`, `EstadoBotonVoto`), `AhoraSuena.kt`, `TiempoEstimado.kt`, `MensajeOperacion.kt`; icono en `app/src/main/res/drawable/ic_check.xml`.
Previews (11): `app/src/debug/java/…/ui/components/ColaPreview.kt` (en debug porque usan `DatosSimulados`).
Pruebas: `app/src/test/java/…/ui/components/ComponentesColaTest.kt`.

### Decisiones técnicas
- **Voto automático ≠ voto manual en la interfaz:** la solicitud propia muestra "Tu solicitud" (su voto ya está incluido); el voto manual hecho muestra "Votaste". Son estados distintos, no un voto adicional.
- **Pendiente ≠ en reproducción:** `ElementoCola` solo representa pendientes; lo que suena usa `TarjetaAhoraSuena`.
- **La UI no calcula:** posición, votos y espera vienen del repositorio. Lo único local es `puedeVotar`/`estadoBotonVoto` (presentación) y el formato del tiempo. El servidor valida siempre.
- **Protección contra doble pulsación local:** el botón no tiene acción mientras está `EnProceso`. La protección real (un solo voto) sigue siendo del servidor.
- **Reutiliza el sistema de diseño:** `Insignia`, `MiniaturaCancion`, `NuclearIcon`, tokens `NuclearSpacing/IconSize/Layout`, `efectoPulsacion`, `ConBrillo`/`brillo`. Sin colores nuevos (solo transparencias de la paleta).
- **Accesibilidad:** objetivos táctiles ≥ 48 dp, descripciones ("Votar por …", "Posición N"), avisos con región activa, indicador de progreso estático si se piden menos animaciones.
- **Textos sin tecnicismos** (ni códigos HTTP ni excepciones).
- **Estados de tiempo:** "el backend no lo envía" y "no puede calcularse" se muestran igual (`NoDisponible`) porque hoy llegan igual (`null`). Se separarán si el contrato los distingue (DEP-11).

### Pruebas
- Nuevas: **16** (`ComponentesColaTest`). Total: **117** (86 previas + 15 del incremento 1 + 16), 0 fallos, 0 errores, 0 omitidas.
- `./gradlew testDebugUnitTest assembleDebug compileReleaseKotlin --rerun-tasks`: BUILD SUCCESSFUL.

### Limitaciones
- **Las vistas previas compilan pero no se revisaron visualmente** (no se abrió el panel de Android Studio ni un dispositivo en esta ejecución). Falta revisar en el celular/tableta y con TalkBack.
- No hay pantalla de cola ni ViewModel; los componentes aún no se ven en la app.
- No se probó el dibujo de los componentes con pruebas de interfaz (el proyecto no tiene `androidTest`).
- `BotonVoto`: un lector de pantalla anuncia el estado en el texto; no se verificó con TalkBack real.

### Pendientes → ver `dependencias-backend.md`. Sin cambios de estado: todas siguen PENDIENTE.
### Siguiente incremento sugerido
`ColaViewModel` (Cargando/Éxito/Vacío/Error + solicitando/votando/confirmación/rechazo) con `ColaRepositoryFalso`, y la pantalla de cola con su ruta.

---

## Incremento 3 — `ColaViewModel`, pantalla de cola y navegación (2026-11-09)

### Qué se hizo
- **`ColaViewModel`** (`ui/screens/cola/ColaViewModel.kt`): estado `ColaUiState` (`carga`, `votando`, `solicitando`, `mensaje`) con `CargaCola` = `Cargando`, `Exito`, `Vacia`, `Error`. Acciones: `alMostrarse`, `reintentar`, `votar`, `solicitar`, `cerrarMensaje`. Una sola instancia compartida por la cola y el detalle (alcance: la actividad, creada en `NuclearNavHost`).
- **`ColaScreen`** (`ui/screens/cola/ColaScreen.kt`): canción que suena, lista "En espera" con votos y botón de voto, estados cargando (esqueletos), vacía, "suena una canción sin cola", error con "Reintentar". El aviso de operación va en el **pie fijo**.
- **Navegación:** ruta `Destinos.COLA`; botón secundario "Ver la cola" en Inicio (`InicioScreen(onVerCola)`); en Detalle, "Solicitar esta canción" y "Ver la cola" (`DetalleScreen(onSolicitar, solicitando, mensaje, onVerCola)`).
- **Solicitar desde el detalle** con confirmación o rechazo.
- **`BotonSecundario`** nuevo y `BotonPrincipal(habilitado)`.
- **Selección real/simulado por variante:** `crearColaRepository(contexto)` definida en `src/debug` (devuelve `ColaRepositoryDepurable`, datos simulados) y en `src/release` (devuelve `null`). `AppContainer.cola` es `ColaRepository?`; con `null` la app **no ofrece cola ni solicitud**.
- **`ColaRepositoryDepurable`** (solo debug): envuelve el falso y lee `files/cola_simulada.txt` antes de cada operación para cambiar de escenario en el celular sin recompilar (`estado`, `errorConsulta`, `errorOperacion`, `rechazoSolicitud`, `rechazoVoto`, `latenciaMs`).

### Archivos
Creados: `ui/screens/cola/{ColaViewModel,ColaScreen}.kt`; `src/debug/…/data/cola/ColaModulo.kt`, `…/simulado/ColaRepositoryDepurable.kt`; `src/release/…/data/cola/ColaModulo.kt`; `src/debug/…/ui/screens/cola/ColaScreenPreview.kt` (12 previews); `src/debug/…/ui/screens/detalle/DetalleSolicitarPreview.kt` (5); `src/test/…/ui/screens/cola/ColaViewModelTest.kt`.
Modificados: `NuclearApp.kt` (`AppContainer.cola`), `ui/navigation/{Destinos,NuclearNavHost}.kt`, `ui/screens/inicio/InicioScreen.kt`, `ui/screens/detalle/DetalleScreen.kt`, `ui/components/Componentes.kt`, `ui/components/{ElementoCola,TiempoEstimado}.kt` (corrección de diseño), `…/simulado/ColaRepositoryFalso.kt` (`latenciaMs` pasó a `var`; `reiniciar()`).

### Decisiones técnicas
- **El ViewModel no aplica reglas del servidor.** No suma votos ni reordena: tras cada solicitud o voto aceptado vuelve a pedir la cola y muestra lo que devuelve el repositorio. Si ese refresco falla, aplica solo la solicitud que el servidor acaba de devolver y conserva el resto.
- **Protección local:** una segunda pulsación mientras la primera está en camino se ignora (voto y solicitud); no se vota una solicitud que la lista muestra como no votable. El servidor valida siempre.
- **Carga diferida:** la cola se pide al abrir la pantalla, no al iniciar la app (así, con el backend real, no se llamaría antes de validar el QR).
- **Sin repositorio = sin función:** en release `cola` es `null` y no hay botón "Ver la cola" ni "Solicitar". No hay clase "de relleno" que devuelva errores.
- **Avisos limpios al cambiar de pantalla:** se cierra el aviso al entrar al detalle y al ir a la cola, para que un rechazo viejo no aparezca fuera de contexto.
- **Botón "Solicitar" solo si la canción está disponible.**

### Pruebas
**1. Unitarias JVM:** 137 pasan, 0 fallos (86 previas + 15 del falso + 16 de componentes + **20 nuevas de `ColaViewModelTest`**: carga, vacía, error y reintento, refresco silencioso, voto en proceso y segunda pulsación ignorada, voto registrado/rechazado/error, respaldo si falla el refresco, solicitud aceptada/rechazada, cierre de mensajes).

**2. Compilación:** `./gradlew testDebugUnitTest assembleDebug compileReleaseKotlin --rerun-tasks`: BUILD SUCCESSFUL.

**3. Vistas previas de Compose:** compilan; no se abrió el panel de Android Studio.

**4. Instrumentadas:** no existen.

**5. Manuales en el TECNO KL8** (720×1600 px, 320 dpi = 360×800 dp; Android por USB, backend local en `localhost:3000` con `adb reverse`; datos de cola **simulados**, búsqueda real de YouTube). Realizado con capturas de pantalla y toques por ADB:
- Acceso por enlace QR → Inicio con "Ver la cola" (acción secundaria).
- Cola: **cargando** (esqueletos), **con datos** (canción actual, 4 solicitudes, posiciones, votos, barra de popularidad, "Tu solicitud", "Votaste", espera con y sin dato), **vacía**, **suena sin cola**, **error de conexión** y **error del servidor** con "Reintentar" (recuperación verificada).
- Votar: estado "Votando…", la segunda y tercera pulsación no cambian el resultado (2 votos y no 3 ni 4), el servidor simulado reordena con desempate por antigüedad, voto registrado, **rechazo** por intervalo (el voto no cambia) y **error de conexión**; aviso visible aunque la lista esté desplazada, y se cierra con la X.
- Detalle de una canción real (Queen – Bohemian Rhapsody): "Solicitar esta canción" en proceso (botón deshabilitado), **solicitud aceptada**, **rechazada** y repetida ("Ya votaste esta canción"); la canción aparece en la cola como elemento 5 con "Tu solicitud".
- Navegación: Inicio → Cola, Detalle → Cola, flecha de volver (cola → detalle), botón del sistema (detalle → resultados → inicio → sale).
- Objetivos táctiles: botón de voto 104×48 dp, flecha y cerrar 48 dp (por los límites del árbol de accesibilidad).

**6. Accesibilidad:** se volcó el árbol de accesibilidad con `uiautomator`: descripciones "Volver", "Posición N", "N votos", "Votar por …", "Ya votaste por …", "Solicitaste … y tu voto ya está incluido", "Espera estimada: …". **TalkBack real no se probó**: está instalado pero apagado y activarlo cambia un ajuste del celular (queda pendiente de autorización).

### Problemas encontrados en el celular y corregidos
1. **"Espera estimada: aprox. 2 min" se partía letra por letra** en `ElementoCola` (el botón de voto le quitaba el ancho). Las vistas previas no lo mostraron. Ahora va en su propia línea.
2. **El aviso de voto quedaba fuera de pantalla** si la lista estaba desplazada. Ahora va en el pie fijo.
3. **Un aviso del detalle se arrastraba a la cola.** Se limpia al navegar.

### Limitaciones
- **Sin pruebas con letra grande ni horizontal en el celular** (cambiar la escala de fuente o la rotación son ajustes del dispositivo; solo hay vistas previas sin revisar). Tableta (Lenovo): no probada.
- **TalkBack real: pendiente** (ver arriba).
- La pantalla de cola no se actualiza sola (no hay SSE): se refresca al abrirla y tras cada operación.
- El texto del error del servidor al cargar dice "No pudimos completar la operación" (comparte texto con las operaciones); se puede afinar.
- La doble pulsación **mientras se envía una solicitud** se verificó en el celular solo hasta el estado deshabilitado; la verificación de que no se envía dos veces es unitaria.
- Los datos de la cola son simulados; nada se verificó contra un backend real de cola (no existe).

### Pendientes → ver `dependencias-backend.md` (notas del incremento 3). Todas siguen PENDIENTE.
### Siguiente incremento sugerido
A decidir con Santiago: (a) probar TalkBack, letra grande y horizontal en el celular con su autorización; (b) instrumentación de eventos analíticos del E4 (depende de DEP-14); (c) preparar DTOs y `ColaApi` provisionales solo cuando Juan Camilo entregue el contrato.

---

## Incremento 3b — Accesibilidad, letra grande y horizontal (2026-11-09)

Detalle completo en [`accesibilidad-y-validacion.md`](accesibilidad-y-validacion.md). Resumen:

**Realizado en el TECNO KL8 (por USB):**
- **Letra grande** (1.5× y 2.0×): cola, detalle, avisos, Acceso e Inicio.
- **Horizontal:** Acceso, Inicio, cola (con aviso), detalle y su aviso.
- **TalkBack (parcial):** activado, foco inicial en la primera tarjeta de la cola, árbol semántico con descripciones comprensibles.

**No completado:** recorrido por gestos y escucha de la voz de TalkBack (ADB no puede reproducir los gestos ni oír el audio). Queda una lista de comprobación manual para Santiago.

**Correcciones (7):** espera estimada partida; contador de votos roto a 2.0×; artista cortado; aviso demasiado largo; texto de botón sin centrar; **aviso de voto invisible en horizontal** (nuevo `NuclearScreen(mantenerCabeceraYPieFijos)`, solo usado por la cola); y las dos de la ronda anterior (aviso fuera de pantalla, aviso arrastrado).

**Archivos modificados:** `ui/components/{ElementoCola,TiempoEstimado,Votos,AhoraSuena,MensajeOperacion,Componentes,NuclearScreen}.kt`, `ui/screens/cola/ColaScreen.kt`, `…/ComponentesColaTest.kt` (se ajustó una aserción por el texto del aviso más corto). Nuevo: `docs/entregable-4/accesibilidad-y-validacion.md`.

**Pruebas:** 137 unitarias JVM pasan (0 fallos); `testDebugUnitTest assembleDebug compileReleaseKotlin --rerun-tasks` OK. Sin pruebas instrumentadas. Pruebas manuales en el celular: ver arriba (hechas) y el archivo de accesibilidad (no completadas).

**Ajustes del celular (verificado por ADB):** tamaño de letra y rotación restaurados a sus valores originales. TalkBack se activó temporalmente para las pruebas y **se desactivó después** (solo ese servicio; no había otros habilitados); se comprobó que `enabled_accessibility_services` quedó vacío, `accessibility_enabled` y `touch_exploration_enabled` en 0, y que un solo toque vuelve a activar los controles. Detalle en `accesibilidad-y-validacion.md`, sección 5.

**TalkBack: pruebas manuales NO completadas** (no se verificaron los anuncios de voz ni el orden de navegación por gestos). **Pendientes:** prueba manual con TalkBack (activándolo de nuevo, con autorización); tableta Lenovo; QR inválido a letra grande/horizontal; observaciones del E3 (Buscar y Detalle en horizontal).

---

## Incremento 4 — Paso 1: pantalla de confirmación de solicitud (2026-11-09)

Del plan del incremento 4 (diagnóstico aprobado) **solo se hizo el paso 1**. Los pasos 2 a 8 **no se han iniciado**.

### Decisiones aprobadas por Santiago para el incremento 4
1. **Barra inferior de Figma y "Mi participación": aplazadas al incremento 5.** No se rehace la navegación ni se implementa el historial del dispositivo (ver "Funcionalidad pendiente" en el `README.md`).
2. **Modelo provisional de elegibilidad: NO se incluye.** DEP-16 sigue PENDIENTE hasta que Juan Camilo confirme contrato, reglas y datos. No se muestran estados de elegibilidad sin respaldo.
3. **Pruebas instrumentadas: autorizadas** (`ui-test-junit4` y la infraestructura mínima, revisando versiones existentes; deben correr con `connectedDebugAndroidTest` en el TECNO KL8). **Aún no se han añadido**: pertenecen al paso 7. Complementan, no sustituyen, las pruebas JVM ni la validación manual.
4. **Sin el encabezado "Actualización automática".** Las actualizaciones simuladas de debug (paso 4) se identificarán como simuladas; no se afirma que exista SSE ni tiempo real.

### Qué se hizo
- **`ConfirmacionScreen`** (`ui/screens/confirmacion/ConfirmacionScreen.kt`), según la pantalla `confirmacion` de Figma: ícono de éxito, insignia, título, canción, **"Incluye tu voto automático."**, posición actual, votos, espera estimada y los botones **"Ver cola"** y **"Seguir explorando"**.
- **Solicitud nueva frente a canción existente** (regla 1B; `ResultadoSolicitud.Aceptada.sumoVotoAExistente`):

| | Solicitud nueva | La canción ya estaba esperando o sonando |
|---|---|---|
| Insignia | "Solicitud registrada" | "Voto sumado" |
| Título | "Tu canción está en la cola." | "Tu voto se sumó a esta canción." |
| Línea del voto | "Incluye tu voto automático." | "Se sumó tu voto; la canción no se duplicó." |
| Detalle | La posición puede cambiar según los votos de la sesión. | Ya estaba en la cola o sonando, así que no se repitió; la posición puede cambiar… |

  En ningún caso se presenta el voto como "adicional".
- **Datos que muestra, tal como los informa el repositorio (sin calcular nada):** posición (`#N`; "Ahora suena" si la solicitud está sonando; "No disponible" si no hay), votos (`totalVotos`) y espera (`esperaEstimadaSegundos`, o "no disponible").
- **Datos más recientes:** tras aceptarse, el ViewModel vuelve a pedir la cola y, si trae la solicitud, actualiza en la confirmación su posición, votos y espera.
- **`ColaViewModel`:** una solicitud aceptada ya **no** produce el aviso verde; produce `confirmacion` + un evento de una sola vez (`navegarAConfirmacion`). Nuevas acciones `confirmacionMostrada()` y `cerrarConfirmacion()`. Los rechazos y errores siguen mostrándose como aviso en el Detalle, **sin** confirmación.
- **Navegación:** ruta `Destinos.CONFIRMACION`. Detalle → Confirmación; "Ver cola" abre la cola (sacando la confirmación de la pila); "Seguir explorando" y **Atrás** vuelven a los resultados de búsqueda (se conservan); si no hubiera resultados en la pila, al Inicio.
- **Solo debug:** `ColaRepositoryDepurable` acepta la clave `existente=<youtube_video_id>` para probar "la canción ya estaba en la cola" con una canción real de la búsqueda (la tercera solicitud simulada adopta ese id).

### Archivos
Creados: `ui/screens/confirmacion/ConfirmacionScreen.kt`; `src/debug/…/ui/screens/confirmacion/ConfirmacionPreview.kt` (6 previews); `src/test/…/ui/screens/confirmacion/ConfirmacionTextosTest.kt`.
Modificados: `ui/screens/cola/ColaViewModel.kt`, `ui/navigation/{Destinos,NuclearNavHost}.kt`, `src/debug/…/data/cola/simulado/ColaRepositoryDepurable.kt`, `src/test/…/ui/screens/cola/ColaViewModelTest.kt`.

### Pruebas
**1. Unitarias JVM:** **148 pasan, 0 fallos.** De las 137 previas, **una se sustituyó** a propósito (`una solicitud aceptada confirma y vuelve a pedir la cola` verificaba el aviso verde, que ya no existe; ahora verifica la confirmación). Nuevas: 6 en `ColaViewModelTest` (nueva frente a existente, evento de una sola vez, cierre, rechazo/error sin confirmación, actualización con la cola, solicitud que suena) y 5 en `ConfirmacionTextosTest`.
**2. Compilación:** `testDebugUnitTest assembleDebug compileReleaseKotlin --rerun-tasks`: BUILD SUCCESSFUL.
**3. Vistas previas:** compilan; no se abrió el panel de Android Studio.
**4. Instrumentadas:** no existen todavía (paso 7).
**5. Manuales en el TECNO KL8** (USB, vertical, letra 1.0×, TalkBack apagado; datos de cola simulados, búsqueda real de YouTube), con capturas y toques por ADB:
- Solicitud nueva (Queen – Bohemian Rhapsody): estado "Enviando solicitud…", confirmación con "Solicitud registrada", "Incluye tu voto automático.", posición #5, 1 voto y espera "no disponible".
- **Ver cola:** abre la cola y se ve la solicitud como elemento 5 con "Tu solicitud". Flecha de la cola → vuelve al Detalle; botón del sistema → resultados.
- **Atrás** en la confirmación → resultados de búsqueda. **Seguir explorando** → resultados (se conservan).
- Solicitud **repetida** → aviso "Ya votaste esta canción" en el Detalle, **sin** confirmación.
- Canción **que ya estaba en la cola** (`existente=…`): confirmación "Voto sumado", "Tu voto se sumó a esta canción.", "Se sumó tu voto; la canción no se duplicó.", posición #3, 2 votos, espera aprox. 13 min.
**6. Accesibilidad:** el árbol semántico (volcado por `uiautomator`) muestra títulos, línea del voto, "Posición actual", "1 voto" y "Espera estimada: …". **TalkBack, letra grande y horizontal NO se probaron** en esta pantalla (no se cambiaron ajustes del celular); solo existen las vistas previas, sin revisar.

### Problema encontrado en el celular y corregido
Al tocar **"Ver cola"** la app volvía a los resultados en vez de abrir la cola: al cerrar la confirmación, su pantalla (aún visible durante la transición) se quedaba sin datos y disparaba el regreso a Buscar. Ahora recuerda la última confirmación y el regreso solo ocurre si nunca hubo una.

### Observaciones / pendientes (no se actuó sobre ellas)
- Al volver de la cola al Detalle, el botón "Solicitar esta canción" queda activo de nuevo (paso 3 del plan: indicar si la canción ya está en la cola).
- La cola no resalta ni lleva la vista a "Tu solicitud" (paso 2).
- En el simulador, `existente` solo cambia el id: la confirmación muestra los datos de la solicitud simulada (Hotel California), no los de la canción tocada. Con el backend real serán los mismos.
- Dependencias del backend: ver `dependencias-backend.md` (notas del incremento 4, paso 1). **Ninguna se marcó como resuelta.**
- Siguiente: paso 2 del plan, **solo cuando Santiago lo apruebe**.

---

## Incremento 4 — Paso 2: cola con la solicitud destacada y navegación (2026-11-09)

Santiago aprobó el paso 1 (incluida la sustitución de una prueba) y autorizó el paso 2 y la validación de la confirmación con letra 1.5×, 2.0× y horizontal. Los pasos 3 a 8 **no se han iniciado**.

### Qué se hizo
1. **Resaltar "Tu solicitud":** al llegar a la cola con "Ver cola" desde la confirmación, la solicitud confirmada se destaca (borde de acento de 2 dp y fondo de acento suave; descripción accesible "Tu última solicitud"). `ElementoCola` tiene un parámetro nuevo `resaltada`.
2. **Desplazamiento automático:** la lista se desplaza sola hasta esa solicitud, aunque esté al final, **una sola vez** (`BringIntoViewRequester`, `rememberSaveable`). Si la solicitud ya no está en la lista de espera (p. ej. se sumó el voto a la canción que suena), no se resalta ni se desplaza (`idDestacadoEnLista`).
3. **Botón "Buscar una canción"** en los dos estados vacíos de la cola ("La cola está vacía" y "No hay canciones en espera"). Navega con la ruta existente: si ya hay una búsqueda en la pila (se llegó desde un detalle) vuelve a ella en lugar de duplicarla; si no, abre Buscar.
4. **`launchSingleTop`** en todas las navegaciones hacia la cola (desde Inicio, Detalle y la confirmación) y hacia Buscar desde el estado vacío.
5. **El destacado no persiste:** se quita al entrar al Detalle, al usar "Ver la cola" desde Inicio o Detalle y al ir a Buscar. `ColaViewModel` tiene `solicitudDestacada`, `verColaDesdeConfirmacion()` y `quitarDestacado()`.
6. **Corrección de diseño en la confirmación (encontrada al validar):** con letra grande (> 1.3×) los botones "Ver cola" y "Seguir explorando" fijos tapaban "Posición actual" y la espera; ahora pasan al final del contenido desplazable (mismo criterio que `CancionItem`).

### Archivos
Modificados: `ui/screens/cola/{ColaViewModel,ColaScreen}.kt`, `ui/components/ElementoCola.kt`, `ui/screens/confirmacion/ConfirmacionScreen.kt`, `ui/navigation/NuclearNavHost.kt`, `src/debug/…/ui/screens/cola/ColaScreenPreview.kt` (2 previews nuevas y botón en las de estado vacío), `src/test/…/ui/screens/cola/ColaViewModelTest.kt`.
Creado: `src/test/…/ui/screens/cola/ColaScreenLogicaTest.kt`.

### Pruebas
**1. Unitarias JVM:** **158 pasan, 0 fallos** (148 previas + 5 de `ColaViewModelTest` sobre el destacado + 5 de `ColaScreenLogicaTest`). No se sustituyó ninguna prueba en este paso.
**2. Compilación:** `testDebugUnitTest assembleDebug compileReleaseKotlin --rerun-tasks`: BUILD SUCCESSFUL.
**3. Vistas previas:** compilan; no se abrió el panel de Android Studio.
**4. Instrumentadas:** no existen todavía (paso 7).
**5. Manuales en el TECNO KL8** (USB; datos de cola simulados; búsqueda real de YouTube):
- **Solicitud nueva → "Ver cola":** la lista se desplazó sola hasta el elemento 5 y se ve resaltado con "Tu solicitud".
- **El destacado no persiste:** al volver (flecha) al Detalle y entrar a "Ver la cola", la cola abre arriba y sin resalte.
- **`launchSingleTop`:** doble toque rápido en "Ver la cola" desde Inicio; un solo "Atrás" vuelve a Inicio (no se apilaron dos colas).
- **Cola vacía:** aparece "Buscar una canción"; abre Buscar con el campo listo; "Atrás" (cierra el teclado) y "Atrás" vuelven a la cola vacía.
- **Suena una canción, sin cola, llegando desde un detalle:** aparece el botón; vuelve a los resultados de búsqueda existentes, sin duplicarlos.
- **Confirmación con letra grande:** a **1.5×** y **2.0×**, solicitud nueva y canción existente: todo se alcanza desplazando; título, canción, "Incluye tu voto automático.", posición, votos, espera y botones se ven completos (el título de la canción se recorta a 2 líneas con "…"). Antes de la corrección de los botones fijos, a 1.5× la posición y la espera quedaban parcialmente tapadas.
- **Confirmación en horizontal** (girando el celular estando en la confirmación): se desplaza completa; "Ver cola" abre la cola ya desplazada a la solicitud destacada.
**6. Accesibilidad:** **TalkBack NO se probó** (pendiente, como se acordó).

### Ajustes del celular (modificados y restaurados)
| Ajuste | Original | Durante | Final (verificado por ADB) |
|---|---|---|---|
| `system font_scale` | 1.00002 | 1.5 y 2.0 | **1.00002** |
| `system accelerometer_rotation` | 0 | sin cambios | **0** |
| `system user_rotation` | 0 | 1 (horizontal) | **0** |
| TalkBack (`enabled_accessibility_services`, `accessibility_enabled`, `touch_exploration_enabled`) | vacío / 0 / 0 | sin cambios | **vacío / 0 / 0** |

### Incidente durante la validación
A mitad de la prueba a letra grande, ADB dejó de reconocer el celular: primero `unauthorized` (pidió confirmar de nuevo la depuración USB) y después se desconectó del todo. En ese momento la letra estaba en 2.0× y no se pudo restaurar hasta reconectar. Santiago autorizó de nuevo y reconectó el cable; se restableció el túnel `adb reverse tcp:3000`, se terminó la prueba y se restauraron los ajustes. No se usó ningún atajo para saltarse la autorización.

### Observaciones / pendientes (no se actuó sobre ellas)
- Paso 3: el Detalle sigue ofreciendo "Solicitar esta canción" activo al volver desde la cola, aunque la canción ya esté en ella.
- El resalte dura mientras se esté en la cola (no se desvanece solo).
- Rotación **estando en la cola con el resalte activo** no se probó en el celular (el desplazamiento está protegido con `rememberSaveable`, pero sin verificación física).
- El título de la canción en la confirmación se recorta a 2 líneas con letra grande.
- **TalkBack en la confirmación y en la cola resaltada: pendiente.**
- Dependencias del backend: las 18 siguen PENDIENTE; este paso no usa datos nuevos del backend.
- Siguiente: paso 3 del plan, **solo cuando Santiago lo apruebe**.

---

## Incremento 4 — Paso 3: mejoras en el Detalle de la canción (2026-11-09)

Santiago aprobó el paso 2 y autorizó el paso 3. Los pasos 4 a 8 **no se han iniciado**. No se repitieron las pruebas de accesibilidad de pasos anteriores (se conservan como pendientes para la validación final).

### Qué se hizo
1. **Estado de la canción respecto a la cola** (`EstadoCancionEnCola`, `ui/screens/detalle/`), calculado con la última cola recibida y comparando por `youtubeVideoId`:

| Estado | Cuándo | Qué muestra el Detalle |
|---|---|---|
| `Disponible` | Con datos de la cola, la canción no espera ni suena (o ya terminó, falló o salió) | Sin tarjeta; "Solicitar esta canción" + "Ver la cola" |
| `Desconocido` | La cola aún carga o falló | Sin tarjeta; no se bloquea nada (decide el servidor) |
| `Pendiente` | Solicitud pendiente de **otra** persona | Tarjeta "En la cola": posición, votos y espera (si existen); "Ya votaste por ella." si `miVoto = MANUAL`, o "Para apoyarla con un voto, ve a la cola." |
| `SolicitadaPorTi` | Solicitud pendiente de **este dispositivo** | Tarjeta "Solicitada por ti": posición, votos y espera; "Incluye tu voto automático." solo si el repositorio informó `miVoto = AUTOMATICO` |
| `Sonando` | Coincide con `reproduccionActual` (tiene prioridad) | Tarjeta "Ahora suena": "Termina en…" (si existe); "No hace falta solicitarla." |

2. **Sin solicitud repetida desde el Detalle:** en `Pendiente`, `SolicitadaPorTi` y `Sonando` no se ofrece "Solicitar esta canción"; la acción principal pasa a ser **"Ver la cola"**. Con `Disponible` o `Desconocido` se mantiene el comportamiento anterior.
3. **Datos tal como los informa el repositorio:** posición ("#N", "Ahora suena" o "No disponible"), votos y espera ("no disponible" si falta). No se calcula nada en Android.
4. **El servidor sigue decidiendo.** El bloqueo es solo una pista con la última cola recibida, que puede estar desactualizada. Si el estado es `Disponible` o `Desconocido` y la cola real estaba vieja, la solicitud se envía igual y el servidor la acepta, la rechaza o suma un voto. Los textos no afirman elegibilidad de voto ni reglas del intervalo (DEP-16 sigue pendiente).
5. **Carga de la cola al abrir el Detalle:** `NuclearNavHost` llama a `alMostrarse()` al entrar (carga la primera vez; después refresca sin vaciar). Al volver desde la cola o la confirmación el Detalle se recompone y se refresca otra vez.
6. **Ajuste de diseño (encontrado al validar):** con la tarjeta visible, la miniatura pasa de 16:9 a 2:1 para que la tarjeta y el botón quepan sin que la espera quede tapada.
7. **Solo debug:** `ColaRepositoryDepurable` acepta `existenteMia=<id>` (la primera solicitud simulada, de este dispositivo, adopta esa canción) y `existenteSonando=<id>` (la canción que suena), además de `existente=<id>` (solicitud de otra persona).

### Archivos
Creados: `ui/screens/detalle/{EstadoCancionEnCola,TarjetaEstadoEnCola}.kt`; `src/test/…/ui/screens/detalle/EstadoCancionEnColaTest.kt`.
Modificados: `ui/screens/detalle/DetalleScreen.kt`, `ui/navigation/NuclearNavHost.kt`, `src/debug/…/ColaRepositoryDepurable.kt`, `src/debug/…/ui/screens/detalle/DetalleSolicitarPreview.kt` (5 previews nuevas).

### Pruebas
**1. Unitarias JVM:** **172 pasan, 0 fallos** (158 previas + 14 nuevas de `EstadoCancionEnColaTest`: cola cargando/error/vacía, no presente, sonando, pendiente de otra persona, solicitada por ti, prioridad de lo que suena, solicitudes no pendientes, sin canción sonando, y textos que no afirman reglas del servidor).
**2. Compilación:** `testDebugUnitTest assembleDebug compileReleaseKotlin --rerun-tasks`: BUILD SUCCESSFUL.
**3. Vistas previas:** compilan; no se abrió el panel de Android Studio.
**4. Instrumentadas:** no existen todavía (paso 7).
**5. Manuales en el TECNO KL8** (USB, vertical, letra 1.0×, datos de cola simulados, búsqueda real de YouTube; canción: Queen – Bohemian Rhapsody):
- **Disponible:** "Solicitar esta canción" y "Ver la cola", sin tarjeta.
- **Pendiente de otra persona:** tarjeta "En la cola", posición #3, 1 voto, espera aprox. 13 min; solo "Ver la cola"; el botón abre la cola.
- **Solicitada por ti:** posición #1, 3 votos, "Incluye tu voto automático."; solo "Ver la cola".
- **Sonando:** tarjeta "Ahora suena", "Termina en: aprox. 2 min", "No hace falta solicitarla."; solo "Ver la cola".
- **Flujo completo:** solicitar → confirmación → "Seguir explorando" → abrir de nuevo la misma canción → "Solicitada por ti" (#5, 1 voto) y solo "Ver la cola".
**6. Accesibilidad / letra grande / horizontal:** **no repetidas** en este paso (solo hay una vista previa a 1.5×, sin revisar). **TalkBack sigue pendiente.**

### Ajustes del celular
No se cambió ningún ajuste del dispositivo en este paso. Verificados al final: `font_scale` 1.00002, `accelerometer_rotation` 0, `user_rotation` 0, TalkBack sin servicios. Se limpiaron el archivo de escenarios y el volcado temporal del celular.

### Observaciones / pendientes (no se actuó sobre ellas)
- **La pista puede estar desactualizada:** sin SSE (DEP-12), el estado se refresca al abrir el Detalle y tras cada operación, no solos. Una canción que acaba de terminar puede seguir mostrándose "En la cola" hasta refrescar (se corrige al volver a abrir el Detalle o la cola).
- **Coincidencia por `youtubeVideoId`:** depende de que la cola real devuelva ese identificador en cada solicitud y en la canción que suena (DEP-01, DEP-04).
- **La regla 1B** del servidor aceptaría una solicitud repetida como voto; Android, por decisión de este paso, dirige esa acción a la cola en vez de solicitarla desde el Detalle. Queda por confirmar con Juan Camilo si el servidor la debe admitir (DEP-08).
- **No probado:** la tarjeta nueva con letra grande, en horizontal y con TalkBack.
- **Dependencias del backend:** las 18 siguen PENDIENTE; este paso no usa datos nuevos del backend.
- Siguiente: paso 4 del plan (cola viva simulada), **solo cuando Santiago lo apruebe**.

---

## Incremento 4 — Paso 4A: preparación para la integración real del backend (2026-11-09)

Santiago aprobó el paso 3 y reorganizó los pasos restantes: la prioridad es dejar Android listo para integrar el backend de Juan Camilo. Este paso es **revisión técnica + preparación**; **no se creó repositorio real, ni endpoints, ni DTO, ni SSE, ni elegibilidad**, y el simulado de debug se conserva. Los pasos 4B en adelante no se han iniciado.

### Diagnóstico de preparación (resumen; detalle en `mapa-integracion-android.md`)
- **Listo:** `ColaRepository` ya es suficiente para el real; `ColaViewModel`, pantallas y componentes no dependen de datos simulados; el patrón de errores, de mapeadores (`CancionDto.aDominio()`) y de contratos compartidos con fixtures ya existe (E3).
- **Faltaba y se resolvió ahora (sin contrato):** orden y firma de `AppContainer`/`crearColaRepository`; conservar `idEstablecimiento`; aislar el ViewModel de la cola por sesión.
- **Falta y depende de Juan Camilo:** rutas, DTO, estados, códigos de error, UUID, SSE y reconexión (lista C1 a C18 en `dependencias-backend.md`).
- **Riesgo abierto:** la sesión en memoria no sobrevive a la muerte del proceso.

### Cambios de código
1. `AppContainer` (`NuclearApp.kt`): `cola` se crea después de `retrofit` y `sesionActiva` y recibe ambos: `crearColaRepository(contexto, retrofit, sesionActiva)`. Se actualizaron `src/debug/…/ColaModulo.kt` (sigue devolviendo `ColaRepositoryDepurable`) y `src/release/…/ColaModulo.kt` (sigue devolviendo `null`).
2. `Sesion` y `SesionActiva` conservan `idEstablecimiento` (opcional, valor por defecto `null`): `SesionRepository` lo toma de la respuesta de acceso del E3 y `AccesoViewModel` lo guarda.
3. `NuclearNavHost`: `ColaViewModel` con clave `"cola-$token"`, para que un QR nuevo no herede la cola de la sesión anterior.
4. Comentario de `ColaRepository`: aclara que no recibe sesión ni UUID (los toma de `SesionActivaStore`).

### Archivos
Modificados: `NuclearApp.kt`, `data/sesion/{ResultadoAcceso,SesionActiva,SesionRepository}.kt`, `ui/screens/acceso/AccesoViewModel.kt`, `ui/navigation/NuclearNavHost.kt`, `data/cola/ColaRepository.kt`, `src/debug/…/ColaModulo.kt`, `src/release/…/ColaModulo.kt`, `src/test/…/SesionRepositoryTest.kt`, `src/test/…/AccesoViewModelTest.kt`.
Documentos: `dependencias-backend.md`, `contrato-integracion-pendiente.md`, `mapa-integracion-android.md`, `README.md`, este historial.

### Pruebas
**1. Unitarias JVM:** **173 pasan, 0 fallos** (172 previas + 1 nueva: `conservaElIdDelEstablecimientoYDelaSesion`). **Se modificaron 3 aserciones de pruebas existentes** (`SesionRepositoryTest` y dos de `AccesoViewModelTest`) porque `Sesion` y `SesionActiva` comparan por igualdad y ahora incluyen `idEstablecimiento`; el comportamiento verificado sigue siendo el mismo.
**2. Compilación:** `testDebugUnitTest assembleDebug compileReleaseKotlin`: BUILD SUCCESSFUL (debug y release).
**3. Vistas previas / 4. Instrumentadas:** sin cambios; no existen instrumentadas todavía.
**5. Manuales en el TECNO KL8** (regresión rápida, vertical, 1.0×, datos simulados): Detalle → "Solicitar" → Confirmación → "Ver cola" (solicitud destacada) → Detalle con "Solicitada por ti". Sin problemas. **No se pudo verificar físicamente** el aislamiento del ViewModel por token (el backend solo tiene una sesión activa).
**6. Accesibilidad:** sin cambios; pendiente.

### Ajustes del celular
No se cambió ningún ajuste del dispositivo. Verificados: letra 1.00002, rotación 0 con bloqueo, TalkBack sin servicios.

### Riesgos y decisiones que requieren aprobación de Santiago
1. **Sesión en memoria** (opciones a/b en el mapa): ¿persistir la sesión en DataStore o llevar a Acceso si está vacía?
2. **Dependencia `okhttp-sse:4.12.0`** para SSE (misma versión que OkHttp) frente a lectura manual sin dependencia nueva.
3. **Interfaz `ColaEnVivo`** (Android-interna, sin formato de servidor) con simulador en debug, como paso 4B, para tener lista la capa de actualizaciones antes de recibir el contrato SSE.
4. **Selección real/simulado en debug** con una propiedad de Gradle, cuando exista el real.
5. Debe confirmarse que la **cola real traerá `youtube_video_id`** (lo usa el Detalle; C3, C4).

---

## Integración Fase 1 — API, DTO, mapeadores y repositorio real (2026-11-09)

Rama `feature/e4-android-frontend`, con el backend de Juan Camilo ya incorporado por merge local (`5d59c0a`); respaldo en `backup/e4-android-pre-integracion`. Sin commits ni push posteriores.

### Decisiones aprobadas por Santiago
1. `okhttp-sse:4.12.0` autorizada **(se añade en la Fase 2)**. 2. `mi_votacion` entra al modelo; `puede_votar` es solo ayuda visual. 3. **No** se deduce `miVoto` con `es_mia`/`ya_voto`: se conservan `esMia` y `yaVoto`; el origen sale de `voto.origen`. 4. Persistir el contexto mínimo de sesión en DataStore (**pendiente**). 5. SSE abierto en primer plano y cerrado en segundo plano (**Fase 2**).

### Qué se hizo
- `ColaApi`, DTO (`ColaDtos.kt`), mapeadores y `ColaRepositoryReal`; `InterceptorDispositivo` en el cliente de red; rutas con `id_sesion`.
- Modelos: `EstadoCola` con `version`, `generadoEn`, `reglasVotacion`, `miVotacion`; `SolicitudCola.yaVoto` (adiós `miVoto`); `MiVotacion`, `ReglasVotacion`; tres `TipoErrorCola` nuevos.
- `ColaViewModel`: descarte de estados con versión menor o igual; tras `SIN_CONFIRMAR` consulta la cola y **no repite** la operación.
- UI: botón `Votado` / `TuSolicitud` / `Espera` («Aún no»); mensajes de sesión no disponible, servicio no disponible y «No pudimos confirmar tu acción».
- Selección por variante: release real; debug simulado salvo `-Pnuclear.colaReal=true`.
- **No se hizo:** SSE, persistencia de sesión, `okhttp-sse`, eventos analíticos del E4 (los emite el servidor).

### Archivos
Creados (`KT/data/…`): `cola/ColaApi.kt`, `cola/ColaDtos.kt`, `cola/ColaMapeadores.kt`, `cola/ColaRepositoryReal.kt`, `InterceptorDispositivo.kt`. Pruebas: `data/cola/{ContratoE4,ColaMapeadoresTest,ColaRepositoryRealTest}.kt`, `data/InterceptorDispositivoTest.kt`.
Modificados: `NuclearApp.kt`, `data/RedModule.kt`, `data/cola/Cola.kt`, `ui/components/{ElementoCola,MensajeOperacion,Votos}.kt`, `ui/screens/cola/{ColaScreen,ColaViewModel}.kt`, `ui/screens/detalle/TarjetaEstadoEnCola.kt`, `app/build.gradle.kts`, `src/debug/…/{ColaModulo,ColaRepositoryFalso,DatosSimulados,ColaPreview,DetalleSolicitarPreview}.kt`, `src/release/…/ColaModulo.kt`, y las pruebas `ComponentesColaTest`, `ColaScreenLogicaTest`, `ColaViewModelTest`, `ConfirmacionTextosTest`, `EstadoCancionEnColaTest`, `ColaRepositoryFalsoTest`.
Documentos: los cinco de esta carpeta.

### Pruebas
**1. Unitarias JVM:** **224 pasan, 0 fallos**: las 173 anteriores (migradas de `miVoto` a `yaVoto`) + 51 nuevas (18 de DTO y mapeadores con el fixture, 21 del repositorio real con MockWebServer, 4 del interceptor, 6 del ViewModel y 2 del botón de voto). **Aserciones modificadas:** `ComponentesColaTest` («el voto manual y el automático se muestran distinto» pasó a «la solicitud propia y el voto a una ajena se muestran distinto sin deducir el origen») y la de tonos de error (los 3 errores nuevos son «aviso»; conexión y servidor siguen «peligro»).
**Cubren:** 200 y 201; solicitud nueva y voto sumado; canción sonando (posición `null`); cola vacía con reproducción `null`; `mi_votacion`; todos los códigos de la tabla; campos opcionales y nulos; versiones; UUID y ruta de sesión (sin token QR); timeouts y recuperación (una sola petición, luego se consulta la cola); sin sesión no llama a la red.
**Las pruebas del repositorio real usan un servidor HTTP simulado (MockWebServer), no el backend.**
**2. Compilación:** debug, `-Pnuclear.colaReal=true` y `compileReleaseKotlin`: exitosas. `assembleRelease` **completo falla** en `lintVitalAnalyzeRelease` (no puede descargar `lint-gradle:32.5.0`: error de certificado SSL `PKIX` del equipo, ya visto antes); con las tres tareas de lint vital excluidas, compila y genera el APK. El lint de release **no se ejecutó**.
**3. Vistas previas:** compilan; no se revisaron visualmente. **4. Instrumentadas:** no existen todavía.
**5. Manuales en el TECNO KL8** (vertical, 1.0×) con `-Pnuclear.colaReal=true` contra un **servidor local de fixtures** (los cuerpos exactos del backend, **no el backend**) y `adb reverse tcp:3000 tcp:3001`: la cola mostró reproducción, orden, «Votaste», «Aún no» y esperas; el servidor registró `X-Dispositivo-Id` con el UUID en `/cola` y `/solicitudes` y **sin** cabecera en el acceso del E3 y los eventos; solicitar → «Solicitud registrada» (201); con el servidor colgado la app mostró «Enviando solicitud…» y a los 15 s «No pudimos confirmar tu acción», con **un solo POST** y una consulta de la cola; con 410 `sesion_cerrada` mostró «Sesión no disponible». Después se restauró `adb reverse tcp:3000 tcp:3000`, se detuvo el servidor de fixtures y se reinstaló el debug simulado (cola simulada correcta). El proceso `node src/server.js` que ya ocupaba el puerto 3000 (backend del E3) **no se tocó**.
**6. Contra PostgreSQL / backend real del E4:** **no se ejecutó.** Docker Desktop estaba instalado pero su motor no estaba en marcha; no se inició sin autorización. La validación local queda preparada: `npm run db:up`, `backend/.env` (`DATABASE_URL`, `CATALOGO_SEMILLA=true`, `REPRODUCTOR_TOKEN`, `SIMULACION_HABILITADA=true`), `npm run migrar`, `npm start`, `adb reverse tcp:3000 tcp:3000` e `installDebug -Pnuclear.colaReal=true`.
**7. Accesibilidad:** sin cambios en el procedimiento; TalkBack sigue **pendiente**. El botón «Aún no» y «Tu solicitud» tienen descripción propia, sin probar con TalkBack.

### Ajustes del celular
No se cambió ningún ajuste (letra 1.00002, rotación 0, TalkBack sin servicios). Solo se modificó y se restauró el `adb reverse`.

### Hallazgos
- Con el servidor devolviendo siempre la misma versión, el GET posterior a una solicitud se descarta (misma versión): la confirmación conserva lo de la respuesta del POST. Con el backend real la versión crece y se aplica.
- Con 410 al abrir la cola, la pantalla conserva la última cola cargada; el aviso aparece en la siguiente acción.

### Limitaciones y pendientes
SSE (Fase 2); persistencia de sesión; validación contra PostgreSQL; lint de release; TalkBack; revisión de Karen de los eventos del servidor; H1 y H3c del backend sin decidir.

---

## Integración Fase 2 — SSE real, persistencia de sesión y revisión de analítica (2026-11-10)

Rama `feature/e4-android-frontend`. Sin commits ni push.

### Qué se hizo
- **SSE** (`ColaEnVivoSse`, `LectorSse`, `ColaEnVivo`): cliente independiente del de Retrofit, `Accept: text/event-stream` y `X-Dispositivo-Id`, solo el evento `estado`, ping ignorado, `retry:` del servidor, lectura de 30 s, errores HTTP previos clasificados (404/410 de sesión terminan; otros 4xx terminan; 5xx y cortes reconectan), cancelación que cierra el socket.
- **Ciclo de vida**: flujo abierto solo en primer plano y dentro de la sesión; un único flujo por ViewModel; se cierra al ir a segundo plano y se reabre al volver.
- **Versiones**: GET y SSE comparten la regla «descartar versión menor o igual».
- **Sesión persistida** (`SesionLocal`, `RestauradorSesion`, `conSesion`): `id_sesion` e `id_establecimiento` en el DataStore del UUID, validados con el servidor antes de darlos por vigentes; sesión cerrada, inexistente o expirada → se limpia y se vuelve a Acceso.
- **Analítica**: `revision-analitica-e4.md` (matriz de 9 eventos y 11 hallazgos). No se tocó el backend ni se creó ningún evento; Android no envía eventos del E4.

### Desviación respecto a lo autorizado
`okhttp-sse:4.12.0` **no se pudo descargar** (error de certificado `PKIX` del equipo; sin copia en caché). Se probó añadirla, falló la resolución y **se revirtió** (`libs.versions.toml` y `build.gradle.kts` quedaron como estaban). Se implementó el lector sobre OkHttp, sin dependencia nueva.

### Archivos
Creados (`KT/…`): `data/cola/{ColaEnVivo,LectorSse,ColaEnVivoSse}.kt`, `data/sesion/{SesionLocal,RestauradorSesion}.kt`, `ui/navigation/ConSesion.kt`. Pruebas: `data/cola/{ColaEnVivoSseTest,LectorSseTest,ServidorSseManual}.kt`, `data/sesion/RestauradorSesionTest.kt`, `ui/screens/cola/ColaViewModelEnVivoTest.kt`. Documento: `revision-analitica-e4.md`.
Modificados: `NuclearApp.kt`, `ui/navigation/NuclearNavHost.kt`, `ui/screens/cola/ColaViewModel.kt`, `ui/screens/acceso/AccesoViewModel.kt`, `src/debug/…/ColaModulo.kt`, `src/release/…/ColaModulo.kt`, `AccesoViewModelTest.kt` y los cinco documentos de integración.

### Pruebas
**1. Unitarias JVM: 276 pasan, 0 fallos** (las 224 anteriores + 52 nuevas: 17 del cliente SSE, 7 del lector, 12 de sesión local y restauración, 14 del ViewModel en vivo y 2 de que Acceso guarda la sesión). Ejecutadas con `cleanTestDebugUnitTest` dos veces seguidas, sin intermitencias. Cubren: conexión y cabeceras, estado inicial con el fixture real, actualizaciones sucesivas, ping, descarte de versiones (flujo y GET), reconexión con el `retry` del servidor, 503/410/404/400 previos al flujo, sin servidor, respuesta que no es `event-stream`, cancelación (el servidor ve el socket cerrarse), timeout de lectura, sin conexiones duplicadas, primer y segundo plano, persistencia y restauración (válida, cerrada, sin confirmar, concurrente, sin sesión), y que el QR token no se guarda.
**Las pruebas SSE usan servidores simulados** (MockWebServer y un servidor de sockets propio); no el backend ni PostgreSQL. Ninguna prueba existente se modificó.
**2. Compilación:** debug, debug con `-Pnuclear.colaReal=true`, `compileReleaseKotlin`: exitosos. `assembleRelease` completo **falla** en `lintVitalAnalyzeRelease` (certificado `PKIX`); sin las 3 tareas de lint vital compila. Lint de release **no ejecutado**.
**3. Vistas previas / instrumentadas:** sin cambios; la navegación con el ciclo de vida solo se verificó a mano (no hay pruebas instrumentales todavía).
**4. Manuales en el TECNO KL8** (con `-Pnuclear.colaReal=true` y un servidor local de fixtures con SSE en `localhost:3001`, redirigido con `adb reverse tcp:3000 tcp:3001`; **no es el backend**):
- La cola mostró el estado inicial del flujo y los votos de una solicitud subieron solos (16, 20, 24, 28) mientras el GET posterior, con versión vieja, **no** los pisó.
- Pasar a **segundo plano** cerró el flujo en el servidor en ~2 s; al volver se abrió **uno** nuevo (3 aperturas y 2 cierres en total, nunca dos a la vez).
- Cortar el servidor con el flujo abierto: la app siguió reintentando y, al volver el servidor, se reconectó sola.
- **Sesión cerrada con el flujo abierto** (servidor devolviendo 410): la app limpió la sesión y volvió a Acceso.
- **Muerte real del proceso** (`kill -9` con `run-as`) con la cola abierta: al relanzar, Navigation restauró la cola y la app **validó la sesión** (un `GET /cola` con el UUID existente) antes de mostrarla y abrir el flujo. Con la sesión cerrada en el servidor, volvió a Acceso, borró lo guardado y el arranque siguiente ya no consultó nada.
**5. Contra PostgreSQL / backend real:** **no ejecutada.** Docker Desktop instalado pero su motor no estaba en marcha; no se arrancó sin autorización. El puerto 3000 lo ocupa `node src/server.js` (backend del E3, PID 26404); no se detuvo. `backend/.env` no se abrió ni se modificó.
**6. Accesibilidad:** sin cambios; TalkBack sigue **pendiente**.

### Ajustes del celular
No se cambió ningún ajuste. Solo se modificó y se restauró el `adb reverse` (3000→3000). Durante las pruebas el teléfono tenía TikTok en primer plano en un momento dado (no lo abrí yo); se volvió a abrir la app de PONGA con `am start`. Se reinstaló el debug simulado al terminar.

### Hallazgos
- El servidor de fixtures reinicia su versión en 5 cada vez que se conecta, así que tras reconectar los estados nuevos se descartaban hasta superar la versión ya mostrada: es **el comportamiento deseado** de la regla de versiones; con el backend real la versión solo crece.
- Una primera versión del servidor de fixtures cerraba el flujo al instante por usar el evento `close` de la petición (en Node ≥16 se dispara al terminar la petición, no al cerrarse el socket); era un error del servidor de prueba, no de la app.
- Con la sesión cerrada, si el QR original sigue en la intención de la actividad, Acceso lo vuelve a validar y, si el servidor lo acepta, entra de nuevo: es lo esperado.

### Pendientes
Validación con PostgreSQL; `okhttp-sse` (certificado); evento de cierre de sesión dentro del flujo; TalkBack; pruebas instrumentadas; Karen debe confirmar la revisión de analítica; incremento 5; H1 y H3c del backend.

---

## Integración Fase 3 — Validación contra el backend real con PostgreSQL 16 (2026-11-10)

Rama `feature/e4-android-frontend`. Sin commits ni push. **Sin cambios de código de Android** en esta fase (solo documentación).

### Qué se hizo
Preparar el entorno (Docker, PostgreSQL 16, backend E4), ejecutar las pruebas del backend y validar la app real contra él en el TECNO KL8. El detalle de los 15 escenarios, la matriz de aceptación, H1/H3c y los hallazgos están en **`matriz-aceptacion-e4.md`**; la analítica, en **`revision-analitica-e4.md`** (sección 7, con las propuestas A1/A2).

### Entorno (antes → durante)
Docker Desktop apagado → iniciado; sin contenedor ni imagen de PostgreSQL del proyecto → `ponga-postgres` (`postgres:16`, puerto 5433, volumen `backend_ponga-pgdata`); puerto 3000 con el backend del E3 (PID 26404, confirmado por su línea de comandos) → detenido y sustituido por el backend E4. `backend/.env` solo tenía `YOUTUBE_API_KEY`: por instrucción de Santiago, las variables que faltaban se pasaron **solo al proceso** (dotenv no pisa variables ya definidas) y `.env` no se abrió ni modificó. `npm install` añadió `pg` y otros 13 paquetes a `node_modules` (sin cambios en archivos versionados).

### Pruebas
**1. Android JVM:** **276 pasan, 0 fallos** (sin cambios en el código).
**2. Backend:** **110 pasan, 0 fallos** contra PostgreSQL 16 (`npm test`, con `DATABASE_URL_TEST` en el proceso). La primera ejecución falló 10 pruebas por falta del módulo `pg`; tras `npm install` pasaron todas.
**3. Compilación:** debug y debug con `-Pnuclear.colaReal=true` exitosos. **Release completo: FALLA** en `lintVitalAnalyzeRelease` (`PKIX path building failed`, ambiental, sin resolver); sin las 3 tareas de lint vital compila. **El lint de release no se ejecutó.**
**4. Manuales en el TECNO KL8 contra el backend real:** 15 escenarios (ver la matriz): **11 completos** (1 a 5, 8, 9 y 11 a 14), **4 parciales** (6, 7, 10 y 15) y ninguno fallido ni sin ejecutar. Los parciales lo son porque la app **evita** pedir canciones ya en cola o sonando y bloquea el voto duplicado (el backend sí se comprobó por HTTP) y porque **no había segundo teléfono** (el segundo dispositivo fue HTTP).
**5. Accesibilidad / tableta:** no se probaron contra el backend real; TalkBack sigue **pendiente**.

### Hallazgos (detalle en la matriz)
H1 reproducido en vivo; H3c confirmado; F1 (búsqueda y catálogo), F2 (acceso con mock frente a sesión en BD, con rebote silencioso), F3 (catálogo acepta transmisión de 4,7 h y un video de recetas), F4 (intervalo no visible), F5 (sin aviso de cierre en el flujo).

### Restauración del entorno
Se hace al final de la sesión y se anota en el informe. Quedó así: se detuvo mi backend E4; el contenedor `ponga-postgres` se **detuvo sin eliminarlo** (con su volumen y datos de prueba); el puerto 3000 se **repobló con un backend del E3** levantado desde una copia de `develop` (`git archive`, en el directorio temporal; PID nuevo 43620), porque la copia de trabajo ahora tiene el código del E4, que exige PostgreSQL. **No es idéntico al original:** es otro proceso y su archivo de eventos vive en esa copia, no en `backend/data`; `adb reverse` igual que al inicio; se reinstaló el debug simulado en el celular; se cerró Docker Desktop (estaba apagado al empezar; los contenedores `eventia-*`, que Docker Desktop inició solos, volvieron a quedar detenidos).

### Datos de prueba dejados en la BD
La base `ponga` (volumen `backend_ponga-pgdata`) conserva las ~12 solicitudes, los votos y las reproducciones de la validación, y la sesión `SES-MOCK-001` quedó `activa`. Nada se borró. Para repetir la validación desde cero, un `docker compose down -v` **eliminaría** el volumen (no se ejecutó).

### Pendientes
Dos teléfonos reales; TalkBack; tableta; decisiones H1/H3c; F1–F3 (Juan Camilo); A1/A2 y confirmación de Karen; lint de release (certificado); incremento 5.

### Revisión de consolidación (2026-11-10)
Se revisó la documentación contra la evidencia: se corrigió el recuento de escenarios (**11 completos y 4 parciales**, no 9 y 4), se actualizaron frases de las Fases 1 y 2 que decían «sin validar contra el backend real» y se separaron en la revisión de analítica los hallazgos de las propuestas (A1 a A5). Sin cambios de código.

---

## Fase 4 — Cierre y estabilización (2026-11-10)

Rama `feature/e4-android-frontend`. El asistente asumió los roles de backend, Android y analítica por instrucción de Santiago (equipo no disponible) y **tomó** las decisiones pendientes. Detalle de decisiones, alternativas y justificación en `matriz-aceptacion-e4.md`, sección 8.

### Qué se hizo
- **Backend (Juan Camilo):** H1 (regla de inactividad), H3c (votar la que suena), F1/F3 (regla única de canción permitida, tope de 20 min, migración `002`), F2 (acceso por QR desde PostgreSQL), aviso `sesion_cerrada` por SSE, y analítica A1/A2/A3 (`cola_vacia`)/A5/A6/A7. Contrato y propuesta actualizados.
- **Android (Santiago):** `sesion_cerrada` en el cliente SSE; texto del intervalo en cola y Detalle; pantalla de sesión terminada; pruebas instrumentadas.
- **Analítica (Karen, revisión técnica independiente del asistente):** decisiones A1 a A11 en `revision-analitica-e4.md`, sección 8.
- **Fixture:** `contrato-e4.json` pasó de 20 a 33 casos y las pruebas de Android lo leen.

### Archivos
Backend: `src/{youtube,catalogo,comun-e4,cola,reproduccion,flujo,eventos,sesiones,app}.js`, `src/db/repositorio.js`, `migrations/002_motivo_demasiado_larga.sql`, pruebas `test/e4-cierre.test.js` (nueva), `backend.test.js`, `e4-contrato`, `e4-intervalo`, `e4-reproduccion`, `e4-solicitudes`, `e4-unidad`, `e4-esquema` y `fixtures/contrato-e4.json`.
Android: `data/cola/ColaEnVivoSse.kt`, `ui/components/Votos.kt`, `ui/screens/cola/ColaScreen.kt`, `ui/screens/detalle/DetalleScreen.kt`, `ui/navigation/NuclearNavHost.kt`, `androidTest/…/EntornoRealInstrumentadaTest.kt`, `app/build.gradle.kts`, `gradle/libs.versions.toml`; pruebas `ColaMapeadoresTest`, `ColaRepositoryRealTest`, `ColaEnVivoSseTest`, `ComponentesColaTest`.
Documentos: `docs/entregable-4/contrato-api-e4.md`, `propuesta-backend-e4.md` y los seis de `cliente-android/docs/entregable-4/`.

### Pruebas
**1. Backend:** **125 pasan, 0 fallos** contra PostgreSQL 16 (110 anteriores +15 nuevas). Siete pruebas existentes se modificaron **a propósito** porque fijaban el comportamiento que se decidió cambiar: H3c (2), eventos (3), fixture, mapeo de canciones del E3 (los mocks ahora llevan categoría y privacidad) y la lista de migraciones.
**2. Android JVM:** **285 pasan, 0 fallos** (276 +9). Tres aserciones de pruebas existentes se actualizaron por el nuevo fixture (versión y elegibilidad del primer mensaje, votos de la canción que suena).
**3. Instrumentadas en el TECNO: 4/4** (`am instrument`; `connectedDebugAndroidTest` bloqueado por el certificado).
**4. Compilación:** debug, debug con `-Pnuclear.colaReal=true`, `assembleDebugAndroidTest` y release **sin lint vital** compilan. **`assembleRelease` completo sigue fallando** (`PKIX`); el lint de release no se ejecutó.
**5. Manuales contra el backend real (TECNO + PostgreSQL 16):** F1, H1, F4, cierre de sesión por SSE (3 s), F2 (QR de sesión cerrada), rango de 8 (61 y 100 virtuales) y eventos con el sobre nuevo. **No ejecutado:** dos teléfonos, TalkBack, tableta, Compose.

### Incidentes
- `connectedDebugAndroidTest` falló (`gradle-work-action`, certificado) → se ejecutó el mismo APK con `am instrument`.
- Tras instalar los APK con `adb install`, el `adb reverse` se perdió (la app mostró «Sin conexión»); se restableció.
- Un servidor SSE de prueba con `Content-Length` mayor cerraba el flujo al terminar el cuerpo; se usó un servidor de sockets propio (Fase 2).
- Una captura del teléfono incluyó una notificación privada de otra aplicación; no se usa ni se documenta su contenido.

### Entorno
Docker Desktop se inició otra vez (estaba apagado). Se detuvo el backend E3 provisional (PID 43620, copia de `develop`) para usar el puerto 3000 con el backend E4 corregido, que aplicó la migración `002` a la BD `ponga` (aditiva). Restauración al final de la fase: ver el informe.

### Pendientes reales
Dos teléfonos reales; TalkBack; tableta; pruebas de Compose; lint de Release; reproductor real, A3 (resto), A4, hash del UUID e incremento 5 (E5).
