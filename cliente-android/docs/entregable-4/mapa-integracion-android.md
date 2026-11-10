# Mapa de integración Android ↔ backend (E4)

> Dónde se conectará el backend real cuando Juan Camilo lo entregue. **Nada de esto está implementado todavía**: los archivos marcados *(por crear)* no existen. Las columnas "Archivo actual" usan clases reales del proyecto.
> Última actualización: 2026-11-09. Dependencias: ver `dependencias-backend.md` (DEP-xx).

`KT` = `app/src/main/java/co/edu/cue/nuclear/cliente`

## 1. Capa de datos

| # | Integración | Archivo actual | Responsabilidad hoy | Cambio futuro esperado | Habilita |
|---|---|---|---|---|---|
| 1 | Servicio Retrofit real de la cola | *(por crear)* `KT/data/cola/ColaApi.kt` — modelo a seguir: `KT/data/busqueda/BusquedaApi.kt`, `KT/data/sesion/SesionApi.kt` | No existe | Interfaz Retrofit con consulta de cola, solicitar y votar, `suspend` y `Response<…>` como en `BusquedaApi` | DEP-01, 02, 03, 04 |
| 2 | DTOs y mapeadores | *(por crear)* `KT/data/cola/ColaDtos.kt` — modelo a seguir: `CancionDto` + `CancionDto.aDominio()` en `KT/data/busqueda/Cancion.kt` | No existe | `@Serializable` con `@SerialName` según el contrato; `aDominio()` hacia `SolicitudCola`, `ReproduccionActual`, `EstadoCola`; tolerar estados desconocidos | DEP-04, 09, 10 |
| 3 | Repositorio real | *(por crear)* `KT/data/cola/ColaRepositoryReal.kt` (implementa `ColaRepository`) | `ColaRepository` (interfaz) ya existe en `KT/data/cola/ColaRepository.kt` | Llamar a `ColaApi`, traducir respuestas a `ResultadoCola/Solicitud/Voto`, capturar `IOException` → `CONEXION` y `SerializationException` → `SERVIDOR`, decodificar `ErrorRespuestaDto` (`KT/data/sesion/SesionApi.kt`) para los rechazos | DEP-05, 08, 15 |
| 4 | Repositorio falso | `src/debug/java/…/data/cola/simulado/ColaRepositoryFalso.kt` y `DatosSimulados.kt` | Servidor de mentira **solo en debug** | Se conserva para desarrollo/pruebas de UI. No se borra al integrar; deja de ser el predeterminado | — |
| 5 | Identificación del dispositivo en las llamadas | `KT/data/dispositivo/DispositivoRepository.kt`, `KT/data/RedModule.kt` (`crearRetrofit`) | El UUID se genera y guarda; hoy solo viaja en el cuerpo de los eventos | Añadirlo donde el contrato indique (cabecera con interceptor en `crearRetrofit`, o parámetro/cuerpo en `ColaApi`) | DEP-06 |
| 6 | Sesión en las rutas | `KT/data/sesion/SesionActiva.kt` (`SesionActivaStore`, solo memoria), `KT/data/sesion/SesionApi.kt` | Guarda `idSesion` y `dispositivoId` tras validar el QR | `ColaRepositoryReal` lee `sesionActiva.actual` para armar las rutas; definir qué hacer si es `null` (proceso reiniciado) | DEP-07 |
| 7 | Configuración JSON/HTTP | `KT/data/RedModule.kt` | Retrofit único, `ignoreUnknownKeys = true`, 10 s/15 s | Probablemente sin cambios; revisar timeouts si se agrega SSE (necesita lectura sin límite) | DEP-12 |

## 2. Inyección de dependencias

| # | Integración | Archivo actual | Cambio futuro esperado | Habilita |
|---|---|---|---|---|
| 8 | Registrar el repositorio en el contenedor | `KT/NuclearApp.kt` (`AppContainer`) | **Hecho parcialmente (incremento 3):** `val cola: ColaRepository? = crearColaRepository(contexto)`. Pendiente: crear el repositorio real con `retrofit.create(ColaApi::class.java)` cuando existan DEP-01 a DEP-04 | DEP-01 |
| 9 | **Seleccionar real o falso sin que el falso llegue a release** | **Hecho (incremento 3):** `src/debug/…/data/cola/ColaModulo.kt` (devuelve `ColaRepositoryDepurable`, datos simulados) y `src/release/…/data/cola/ColaModulo.kt` (devuelve `null`: sin repositorio, la app no ofrece cola ni solicitud) | **Al integrar:** el archivo de `release` debe devolver el repositorio real; el de `debug` puede devolver el real o el simulado según una propiedad de Gradle (p. ej. `-Pnuclear.colaSimulada=true`, patrón de `nuclear.backendUrl`). La firma pasará a recibir `Retrofit` | DEP-01 |
| 10 | Pruebas con el repositorio real | `src/test/…` (MockWebServer 4.12.0, ya en uso) | Pruebas del repositorio real al estilo de `BusquedaRepositoryTest`, con un fixture compartido | DEP-04 |

## 3. ViewModels

| # | Integración | Archivo actual | Cambio futuro esperado | Habilita |
|---|---|---|---|---|
| 11 | ViewModel de la cola | **Hecho (incremento 3):** `KT/ui/screens/cola/ColaViewModel.kt` | `StateFlow<ColaUiState>`. Recibe `ColaRepository`: funciona igual con el falso y con el real; no hay nada que cambiar al integrar salvo, quizá, añadir la recolección de eventos SSE | — |
| 12 | Conexión en el NavHost | **Hecho (incremento 3):** `KT/ui/navigation/NuclearNavHost.kt`, `Destinos.kt` (`COLA`) | Una instancia de `ColaViewModel` por actividad, compartida por cola y detalle; la ruta solo existe si `contenedor.cola != null` | — |
| 13 | Solicitar desde la canción | **Hecho (incremento 3):** `KT/ui/screens/detalle/DetalleScreen.kt` (`onSolicitar`, `solicitando`, `mensaje`, `onVerCola`) | Usa el `ColaViewModel` compartido. Al integrar no cambia la pantalla; cambia el repositorio. Falta confirmar qué datos de la canción pide el backend (DEP-02) | DEP-02, 08 |
| 14 | Recibir actualizaciones | `ColaViewModel` | Aplicar cada evento SSE a su `StateFlow`; ignorar eventos con `version` vieja si el contrato la trae | DEP-12 |

## 4. Tiempo real (SSE)

| # | Integración | Archivo | Cambio futuro esperado | Habilita |
|---|---|---|---|---|
| 15 | Cliente SSE | *(por crear)* `KT/data/cola/ColaEventos.kt` (interfaz `Flow<…>`) + implementación | Flujo de eventos que `ColaRepositoryReal` o el ViewModel recolecta. Decidir si usa `okhttp-sse` (dependencia nueva a acordar) o lectura manual de OkHttp | DEP-12 |
| 16 | Ciclo de vida y reconexión | `ColaViewModel` (`viewModelScope`) o `collectAsStateWithLifecycle` en la pantalla | Conectar solo con la pantalla visible; al reconectar recargar la cola completa (`obtenerCola`) | DEP-13 |
| 17 | Timeouts del cliente | `KT/data/RedModule.kt` | Un cliente aparte sin `readTimeout` para el flujo; no alterar el de las demás llamadas | DEP-12 |

## 5. Errores del backend

| # | Integración | Archivo | Cambio futuro esperado | Habilita |
|---|---|---|---|---|
| 18 | Decodificar `{error:{codigo,mensaje}}` | `KT/data/sesion/SesionApi.kt` (`ErrorRespuestaDto`), patrón en `KT/data/busqueda/BusquedaRepository.kt` | Reutilizar `ErrorRespuestaDto` en `ColaRepositoryReal`; tabla `codigo → MotivoRechazoOperacion` | DEP-05, 15 |
| 19 | Texto para el cliente | **Hecho (incremento 2):** `KT/ui/components/MensajeOperacion.kt` | Mapea `MotivoRechazoOperacion`/`TipoErrorCola` a texto; se ajusta si cambian los motivos | DEP-05 |

## 6. Pantallas que recibirán actualizaciones

| Pantalla | Archivo | Qué recibe |
|---|---|---|
| Cola musical | `KT/ui/screens/cola/ColaScreen.kt` (hecha, incremento 3) | `EstadoCola` completo; hoy se refresca al abrirla y tras cada operación; cambios SSE pendientes (DEP-12) |
| Detalle de canción | `KT/ui/screens/detalle/DetalleScreen.kt` | Resultado de solicitar |
| Inicio | `KT/ui/screens/inicio/InicioScreen.kt` | Hoy solo tiene el botón "Ver la cola"; un bloque "Ahora suena" en el inicio sigue sin decidirse |

## 7. Eventos analíticos

| # | Archivo | Cambio futuro | Habilita |
|---|---|---|---|
| 20 | `KT/data/eventos/Evento.kt`, `EventosRepository.kt` | Nuevos casos de `Evento` solo cuando exista el esquema; hoy: `DispositivoUnido`, `BusquedaRealizada` | DEP-14 |

## Orden sugerido al integrar
1. Contrato y fixtures (DEP-04) → 2. `ColaApi` + DTOs + mapeadores → 3. `ColaRepositoryReal` con pruebas MockWebServer → 4. `AppContainer` + selección real/falso → 5. UUID en llamadas (DEP-06) → 6. Errores/rechazos reales → 7. SSE y reconexión → 8. Pruebas con dos celulares.

## Incremento 4 — Paso 1 (confirmación de solicitud)

| # | Integración | Archivo | Estado y cambio futuro | Habilita |
|---|---|---|---|---|
| 21 | Pantalla de confirmación | `KT/ui/screens/confirmacion/ConfirmacionScreen.kt` | **Hecha.** Al integrar no cambia: solo muestra lo que traiga `SolicitudCola` (`posicion`, `totalVotos`, `esperaEstimadaSegundos`) y `ResultadoSolicitud.Aceptada.sumoVotoAExistente` | DEP-02, 08, 11 |
| 22 | Estado y evento de la confirmación | `KT/ui/screens/cola/ColaViewModel.kt` (`confirmacion`, `navegarAConfirmacion`, `confirmacionMostrada()`, `cerrarConfirmacion()`) | **Hecho.** `ColaRepositoryReal` solo debe devolver el mismo `ResultadoSolicitud.Aceptada` | DEP-02, 08 |
| 23 | Ruta de confirmación | `KT/ui/navigation/NuclearNavHost.kt`, `Destinos.CONFIRMACION` | **Hecha.** Existe solo si hay repositorio de cola (en release, hoy, no hay) | — |
| 24 | Escenario de prueba "ya estaba en la cola" | `src/debug/…/ColaRepositoryDepurable.kt` (clave `existente`) | Solo debug; no existe en release | — |
| 25 | Historial del dispositivo / "Mi participación" y barra inferior | *(aplazado al incremento 5)* | No se implementa ahora | DEP-18 |

## Incremento 4 — Paso 2 (cola destacada y navegación)

| # | Integración | Archivo | Estado y cambio futuro | Habilita |
|---|---|---|---|---|
| 26 | Solicitud destacada en la cola | `KT/ui/screens/cola/ColaViewModel.kt` (`solicitudDestacada`, `verColaDesdeConfirmacion()`, `quitarDestacado()`), `ColaScreen.kt` (`idDestacadoEnLista`), `ElementoCola.kt` (`resaltada`) | **Hecha.** Usa solo `idSolicitud` y la lista de la cola; no cambia al integrar | DEP-01, 02 |
| 27 | Botón "Buscar" en estados vacíos y navegación | `ColaScreen.kt` (`onBuscar`), `NuclearNavHost.kt` | **Hecha.** Reutiliza la ruta existente `Destinos.BUSCAR` (vuelve a la búsqueda de la pila si existe) | — |
| 28 | `launchSingleTop` hacia la cola | `NuclearNavHost.kt` | **Hecha** (Inicio, Detalle, Confirmación) | — |

## Incremento 4 — Paso 3 (estado de la canción en el Detalle)

| # | Integración | Archivo | Estado y cambio futuro | Habilita |
|---|---|---|---|---|
| 29 | Estado de una canción respecto a la cola | `KT/ui/screens/detalle/EstadoCancionEnCola.kt` (`estadoDeCancionEnCola`) | **Hecho.** Compara por `youtubeVideoId` con la cola y con `reproduccionActual`. Al integrar, la cola real debe traer ese identificador en cada solicitud y en la canción que suena | DEP-01, 04 |
| 30 | Tarjeta de estado y bloqueo de solicitudes repetidas | `KT/ui/screens/detalle/TarjetaEstadoEnCola.kt`, `DetalleScreen.kt` | **Hecho.** No cambia al integrar; el servidor sigue validando | DEP-08 |
| 31 | Carga de la cola al abrir el Detalle | `KT/ui/navigation/NuclearNavHost.kt` (`alMostrarse()`) | **Hecho.** Con SSE (DEP-12) bastaría con escuchar cambios | DEP-12 |
| 32 | Escenarios de prueba del Detalle | `src/debug/…/ColaRepositoryDepurable.kt` (`existente`, `existenteMia`, `existenteSonando`) | Solo debug; no existe en release | — |

---

## Paso 4A — Preparación para la integración real (diagnóstico y cambios)

### Qué se cambió (sin depender de contratos)
| # | Cambio | Archivo | Por qué |
|---|---|---|---|
| 33 | `AppContainer` crea la cola **después** de `retrofit` y `sesionActiva` y se las pasa a `crearColaRepository(contexto, retrofit, sesionActiva)` | `KT/NuclearApp.kt`, `src/debug/…/ColaModulo.kt`, `src/release/…/ColaModulo.kt` | El repositorio real las necesitará; antes se creaba primero y no podía recibirlas. Debug sigue devolviendo el simulado y release `null` |
| 34 | `Sesion` y `SesionActiva` conservan `idEstablecimiento` | `KT/data/sesion/ResultadoAcceso.kt`, `SesionActiva.kt`, `SesionRepository.kt`, `AccesoViewModel.kt` | El E3 ya lo entregaba (`establecimiento.id_establecimiento`) y se descartaba; el E4 podría necesitarlo (C11) |
| 35 | `ColaViewModel` se crea con clave `"cola-$token"` | `KT/ui/navigation/NuclearNavHost.kt` | `MainActivity` reinicia el flujo con cada QR, pero un ViewModel sin clave (alcance de la actividad) sobreviviría y mostraría la cola de la sesión anterior (establecimientos independientes) |

### Diagnóstico por punto
| Punto | Estado hoy | Qué falta / quién lo habilita |
|---|---|---|
| `ColaRepository` | **Suficiente** para el repositorio real: no recibe sesión ni UUID (los toma de `SesionActivaStore`). Sus resultados ya cubren éxito, rechazo y error | `TipoErrorCola` solo tiene `CONEXION` y `SERVIDOR`: falta un valor para sesión cerrada/inexistente (C9) |
| DTO y mapeadores | **No existen** (a propósito) | Lista en `contrato-integracion-pendiente.md` (C2 a C7) |
| `ColaRepositoryReal` | No existe; ubicación: `KT/data/cola/ColaRepositoryReal.kt` | Contrato C1 a C8 |
| Selección real/simulado | Debug → simulado; release → `null` | Al existir el real: release lo devuelve siempre; debug elige con una propiedad de Gradle (p. ej. `-Pnuclear.colaSimulada=true`, mismo patrón que `nuclear.backendUrl`). **No se añadió el campo ahora porque no hay nada que elegir** |
| `AppContainer` | Ordenado (ver #33) | — |
| UUID | Síncrono en `SesionActivaStore`; interceptor posible | C10 |
| Establecimiento y sesión | `idSesion`, UUID e `idEstablecimiento` en memoria (#34) | **Riesgo:** no sobreviven a la muerte del proceso (ver abajo) |
| Errores | Patrón listo (`ErrorRespuestaDto` + `IOException`/`SerializationException`) | Tabla de códigos (C8, C9) |
| SSE | No existe. OkHttp 4.12.0 disponible; `okhttp-sse:4.12.0` sería dependencia nueva (aprobación de Santiago); el cliente actual corta la lectura a 15 s | C13, C14. Propuesta paso 4B: interfaz `ColaEnVivo` (Flow de `EstadoCola`) interna de Android + simulador en debug |
| Datos simulados | Ver inventario | — |

### Inventario de dependencias de datos simulados
- **`src/main` (producción): ninguna funcional.** Solo comentarios, y el aviso "Sesión de prueba (datos simulados del backend)" de Acceso, que depende del campo `provisional` de la respuesta real del E3.
- **`src/debug`:** `data/cola/simulado/{ColaRepositoryFalso,ColaRepositoryDepurable,DatosSimulados}.kt`, `data/cola/ColaModulo.kt` y las vistas previas (`ColaPreview`, `ColaScreenPreview`, `ConfirmacionPreview`, `DetalleSolicitarPreview`).
- **`src/release`:** `ColaModulo.kt` devuelve `null` (sin cola).
- **Pruebas:** `src/testDebug/…/ColaRepositoryFalsoTest.kt` (usa el simulado); `ColaViewModelTest` usa su propio doble, sin depender de debug.
- **Para pasar a real:** crear `ColaRepositoryReal`, cambiar `crearColaRepository` de release (y de debug si se quiere elegir) y escribir sus pruebas. **No** hay que tocar `ColaViewModel`, las pantallas ni los componentes.

### Riesgo de la sesión en memoria (decisión pendiente)
`SesionActivaStore` se vacía al morir el proceso, pero Navigation Compose puede restaurar la pantalla (cola o detalle) en un proceso nuevo: la UI aparecería sin sesión y el repositorio real no podría construir sus llamadas. Opciones: **(a)** persistir la sesión en DataStore (lo mínimo que pida el contrato); **(b)** detectar la sesión vacía y llevar a la persona al acceso. Depende de cómo defina Juan Camilo la vida de una sesión (DEP-07).

### Orden de integración cuando lleguen los contratos
1. Recibir y revisar C1 a C18 y los fixtures. 2. `ColaApi` + DTO + mapeadores. 3. `ColaRepositoryReal` y sus pruebas con MockWebServer y los fixtures. 4. `crearColaRepository` (release y, si se desea, debug con propiedad). 5. UUID (C10). 6. Tabla de errores y `TipoErrorCola`. 7. Decidir la persistencia de la sesión. 8. `ColaEnVivo` y SSE (paso 4B). 9. Regresión en el TECNO contra el backend real.
