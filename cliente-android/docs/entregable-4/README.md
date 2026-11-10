# Entregable 4 — Android: documentación de trabajo

Documentos del avance Android del E4 (cola, solicitud con voto automático, votación, canción en reproducción y tiempo estimado). Alcance: **solo Android**; el backend y la base de datos son de Juan Camilo.

| Documento | Para qué sirve |
|---|---|
| [`dependencias-backend.md`](dependencias-backend.md) | Lista de lo que falta con Juan Camilo (DEP-01…DEP-18), con estado y criterio de cierre, y la **lista exacta de contratos a recibir (C1…C18)** |
| [`contrato-integracion-pendiente.md`](contrato-integracion-pendiente.md) | Modelos Kotlin provisionales frente a los campos JSON esperados |
| [`mapa-integracion-android.md`](mapa-integracion-android.md) | Archivos de Android donde se conectará el backend real |
| [`historial-implementacion.md`](historial-implementacion.md) | Qué se hizo en cada incremento, decisiones y pruebas |
| [`matriz-aceptacion-e4.md`](matriz-aceptacion-e4.md) | **Validación contra el backend real con PostgreSQL (Fase 3):** resultado de 15 escenarios, matriz de aceptación del E4, H1/H3c y hallazgos |
| [`revision-analitica-e4.md`](revision-analitica-e4.md) | Revisión de los eventos analíticos que registra el backend (matriz y propuestas), hecha asumiendo el papel de Karen |
| [`accesibilidad-y-validacion.md`](accesibilidad-y-validacion.md) | Pruebas de TalkBack, letra grande y horizontal en el celular: hechas, pendientes y correcciones |

Especificación general del E4 (raíz del repositorio): `docs/entregable-4/ESPECIFICACION_TECNICA_ENTREGABLE_4.md`. Es un borrador de trabajo; sus ejemplos JSON son **ilustrativos**, no contrato.

## Estado actual (2026-11-09)

- Rama: `feature/e4-android-frontend`.
- Hecho: modelos provisionales, `ColaRepository`, repositorio falso (solo debug) y componentes visuales (`ElementoCola`, `BotonVoto`, `ContadorVotos`, `TarjetaAhoraSuena`, `TiempoEstimado`, `MensajeOperacion`). `ColaViewModel`, pantalla de cola, solicitud desde el detalle y navegación (incremento 3, **validado en el TECNO KL8** con datos simulados). 285 pruebas unitarias JVM (incluye los pasos 1 a 3 y 4A y las Fases 1 a 4 de la integración) y 4 instrumentadas en el teléfono. Letra grande (1.5× y 2.0×) y horizontal **verificados en el celular y corregidos** (incremento 3b). TalkBack se usó temporalmente y **ya está desactivado** (verificado). **Pendiente, sin realizar:** prueba manual de TalkBack (escucha de anuncios y orden por gestos; ver `accesibilidad-y-validacion.md`). Ver el historial.
- **Integración real con el backend (Fases 1 a 3).** Existen `ColaRepositoryReal` (cola, solicitar, votar), `ColaEnVivoSse` (tiempo real), la cabecera `X-Dispositivo-Id` y la sesión persistida y validada. **Release usa siempre el repositorio real;** debug usa los datos simulados salvo `-Pnuclear.colaReal=true`. Las Fases 1 y 2 se probaron con servidores simulados; **la Fase 3 la validó contra el backend E4 real con PostgreSQL 16** (con las reservas de abajo).
- **Escenarios de prueba en el celular (solo debug):** se cambian sin recompilar escribiendo el archivo `files/cola_simulada.txt` de la app (ver `ColaRepositoryDepurable`). Claves: `estado` (`normal`, `vacia`, `sonando`), `existente`, `existenteMia` y `existenteSonando` (un `youtube_video_id` real: la tercera solicitud simulada —de otra persona—, la primera —de este dispositivo— o la canción que suena pasan a ser esa canción, para probar los estados del Detalle y "la canción ya estaba en la cola"), `errorConsulta`, `errorOperacion` (`CONEXION` o `SERVIDOR`), `rechazoSolicitud`, `rechazoVoto` (un `MotivoRechazoOperacion`) y `latenciaMs`.
- Incremento 4, **paso 1 hecho**: pantalla de confirmación de solicitud (nueva frente a canción existente), con "Ver cola" y "Seguir explorando"; validada en el TECNO KL8 en vertical con datos simulados. 
- Incremento 4, **paso 2 hecho**: la cola resalta y se desplaza a "Tu solicitud" al llegar desde la confirmación, botón "Buscar una canción" en los estados vacíos y `launchSingleTop` en la navegación hacia la cola. Confirmación validada a 1.5×, 2.0× y horizontal. 
- Incremento 4, **paso 3 hecho**: el Detalle de una canción muestra si ya está en la cola (posición, votos y espera si existen), si fue solicitada por este dispositivo o si suena ahora, y no ofrece solicitudes repetidas (acción principal: "Ver la cola"). Es solo una pista con la última cola recibida; el servidor sigue decidiendo. Validado en el TECNO KL8 en vertical. 
- Incremento 4, **paso 4A hecho (preparación para la integración real)**: diagnóstico de la arquitectura, `AppContainer` listo para recibir el repositorio real, `idEstablecimiento` conservado y ViewModel de la cola aislado por sesión. **No se creó repositorio real, endpoints, DTO ni SSE.** La lista exacta de contratos que se necesitan de Juan Camilo (C1 a C18) está en `dependencias-backend.md`. **Los pasos siguientes no se han iniciado.**
- **Fase 1 de la integración hecha (2026-11-09):** API, DTO, mapeadores, interceptor del UUID, `ColaRepositoryReal`, `EstadoCola` con versión y `mi_votacion`, `esMia` y `yaVoto` por separado, recuperación tras timeouts (consulta la cola, no repite). Probada en el TECNO KL8 contra un servidor local de fixtures. *(Pendientes de entonces: el SSE y la sesión persistida se hicieron en la Fase 2; la validación con el backend y PostgreSQL, en la Fase 3.)*
- **Fase 2 hecha (2026-11-10):** SSE real (cliente propio sobre OkHttp, con reconexión y la regla de versiones), flujo abierto solo en primer plano, sesión persistida en DataStore y **validada con el servidor** al recuperarla, y revisión de analítica del backend. Probada en el TECNO KL8 contra un servidor local de fixtures con SSE (no el backend). **`okhttp-sse` autorizada pero no instalable en este equipo** (certificado): se usó lector propio. *(La validación con el backend real y PostgreSQL se hizo en la Fase 3.)*
- **Fase 3 hecha (2026-11-10): validación contra el backend real con PostgreSQL 16.** 110 pruebas del backend en verde; 15 escenarios en el TECNO KL8: **11 completos** (1 a 5, 8, 9 y 11 a 14) y **4 parciales** (6, 7, 10 y 15); ninguno fallido ni sin ejecutar. **Sin segundo teléfono** (el segundo dispositivo fue HTTP), TalkBack y tableta sin probar, y lint de release sin ejecutar (certificado). **El E4 funciona de extremo a extremo con reservas explícitas:** ver `matriz-aceptacion-e4.md`, sección 7. **Limitaciones de la Fase 3 (RESUELTAS en la Fase 4; ver la línea de la Fase 4):** **H1** (con pocos dispositivos la cola puede dejar a todos sin voto), **H3c** (pedir la canción que suena suma voto, votarla da 409), **F1** (la búsqueda da por «disponibles» transmisiones en vivo que el catálogo rechaza), **F2** (acceso con datos simulados frente a sesión en BD: rebote silencioso a Acceso) y **F3** (el catálogo aceptó una transmisión de 4,7 h y un video de recetas). **No se probó:** dos teléfonos físicos, TalkBack, tableta ni el lint de Release.
- **Fase 4 hecha (2026-11-10): cierre y estabilización.** Se resolvieron H1, H3c, F1, F2, F3, F4 y F5 y se implementaron A1, A2, A3 (`cola_vacia`), A5, A6 y A7, con el equipo no disponible (el asistente asumió los roles de backend, Android y analítica; decisiones y justificación en `matriz-aceptacion-e4.md`, sección 8). **Backend: 125/125 pruebas contra PostgreSQL 16; Android: 285 JVM y 4 instrumentadas en el TECNO**; validado en el teléfono contra el backend real. **Sigue sin poder hacerse:** dos teléfonos físicos, TalkBack, tableta, pruebas de Compose (dependencia no descargable) y el lint de Release (certificado).
- Dependencias con Juan Camilo: 18 registradas; con el contrato recibido, 15 quedan **resueltas por contrato** (DEP-01 a DEP-13, DEP-16 y DEP-17), 2 parciales (DEP-14 y DEP-15) y DEP-18 pendiente (aplazada). De la lista C1 a C18: 14 resueltas y 4 parciales (C9, C15, C17, C18). Detalle en `dependencias-backend.md`.

## Funcionalidad pendiente (decidida por Santiago)

- **Incremento 5:** barra inferior de Figma (Inicio, Buscar, Cola, Mi actividad) y pantalla **"Mi participación"** (solicitudes y votos de este dispositivo). Aplazadas; no se rehace la navegación ni se implementa el historial del dispositivo hasta entonces. "Mi participación" necesita datos que hoy no existen (DEP-18).
- **Elegibilidad de voto:** `mi_votacion` ya está en el modelo y `puede_votar` solo se usa como ayuda visual (botón «Aún no»); el servidor valida siempre.
- **Encabezado "Actualización automática":** no se usa mientras no exista SSE real; las actualizaciones simuladas de debug se identificarán como simuladas.
- **Pruebas instrumentadas** (`ui-test-junit4`, `connectedDebugAndroidTest` en el TECNO): autorizadas, aún no añadidas (paso 7).

## Entorno de validación (permanente)

**El entorno principal de pruebas es el celular Android físico conectado por cable USB.** No se usa el emulador de Android Studio como entorno principal.

Reglas:
1. Antes de cualquier prueba en dispositivo se verifica con `adb devices` que el celular esté conectado y autorizado. Si no lo está, se informa y **no** se presentan pruebas físicas como realizadas.
2. La app se instala y abre en el celular; las revisiones visuales, de navegación, estados, mensajes y toque se hacen ahí, considerando su pantalla, densidad y tamaño de texto reales.
3. La accesibilidad se revisa en el dispositivo (incluido TalkBack si está disponible). No se afirma que se probó si no se ejecutó.
4. Una compilación exitosa o una vista previa de Compose **no** es evidencia de funcionamiento visual.
5. Cada informe separa estos tipos de prueba, sin mezclar sus resultados: unitarias JVM · compilación · vistas previas de Compose · instrumentadas · manuales en dispositivo físico · accesibilidad.
6. Cada incremento indica si fue validado en el dispositivo físico, qué se probó y qué quedó pendiente.

Dispositivo detectado el 2026-11-09: `TECNO_KL8` (serie `13159704AH000977`). Los emuladores `emulator-5554/5556` aparecían `offline` y no se usan.

## Reglas para mantener esta documentación

Al cerrar cada incremento:
0. Indicar si se validó en el celular físico (ver "Entorno de validación").
1. Añadir una entrada a `historial-implementacion.md`.
2. Actualizar el estado de las dependencias en `dependencias-backend.md` (con fecha).
3. Registrar decisiones técnicas nuevas y cualquier cambio que afecte la integración (también en el mapa y en el contrato).
4. **No borrar pendientes sin resolver.**
5. **No marcar una dependencia como RESUELTA porque exista una estructura provisional**: solo cuando el backend (o un contrato escrito y acordado) cumpla su criterio.
6. Cuando Juan Camilo entregue información, actualizar los documentos conservando el historial de decisiones.

## Convenciones

- Nombres en español, igual que el resto del proyecto (`CancionItem`, `EstadoVacio`).
- Los datos simulados viven solo en `src/debug` y no existen en la versión release.
- La interfaz muestra lo que entrega el repositorio: no suma votos ni reordena por su cuenta.
