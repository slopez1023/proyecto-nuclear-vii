# Entregable 4 — Android: documentación de trabajo

Documentos del avance Android del E4 (cola, solicitud con voto automático, votación, canción en reproducción y tiempo estimado). Alcance: **solo Android**; el backend y la base de datos son de Juan Camilo.

| Documento | Para qué sirve |
|---|---|
| [`dependencias-backend.md`](dependencias-backend.md) | Lista de lo que falta con Juan Camilo (DEP-01…DEP-18), con estado y criterio de cierre, y la **lista exacta de contratos a recibir (C1…C18)** |
| [`contrato-integracion-pendiente.md`](contrato-integracion-pendiente.md) | Modelos Kotlin provisionales frente a los campos JSON esperados |
| [`mapa-integracion-android.md`](mapa-integracion-android.md) | Archivos de Android donde se conectará el backend real |
| [`historial-implementacion.md`](historial-implementacion.md) | Qué se hizo en cada incremento, decisiones y pruebas |
| [`accesibilidad-y-validacion.md`](accesibilidad-y-validacion.md) | Pruebas de TalkBack, letra grande y horizontal en el celular: hechas, pendientes y correcciones |

Especificación general del E4 (raíz del repositorio): `docs/entregable-4/ESPECIFICACION_TECNICA_ENTREGABLE_4.md`. Es un borrador de trabajo; sus ejemplos JSON son **ilustrativos**, no contrato.

## Estado actual (2026-11-09)

- Rama: `feature/e4-android-frontend`.
- Hecho: modelos provisionales, `ColaRepository`, repositorio falso (solo debug) y componentes visuales (`ElementoCola`, `BotonVoto`, `ContadorVotos`, `TarjetaAhoraSuena`, `TiempoEstimado`, `MensajeOperacion`). `ColaViewModel`, pantalla de cola, solicitud desde el detalle y navegación (incremento 3, **validado en el TECNO KL8** con datos simulados). 173 pruebas unitarias JVM (incluye los pasos 1 a 3 y 4A del incremento 4). Letra grande (1.5× y 2.0×) y horizontal **verificados en el celular y corregidos** (incremento 3b). TalkBack se usó temporalmente y **ya está desactivado** (verificado). **Pendiente, sin realizar:** prueba manual de TalkBack (escucha de anuncios y orden por gestos; ver `accesibilidad-y-validacion.md`). Ver el historial.
- **No existe ninguna integración real con el backend.** La cola, las solicitudes y los votos usan datos simulados que **solo existen en la variante debug**. En release no hay repositorio de cola y la app no ofrece esas funciones.
- **Escenarios de prueba en el celular (solo debug):** se cambian sin recompilar escribiendo el archivo `files/cola_simulada.txt` de la app (ver `ColaRepositoryDepurable`). Claves: `estado` (`normal`, `vacia`, `sonando`), `existente`, `existenteMia` y `existenteSonando` (un `youtube_video_id` real: la tercera solicitud simulada —de otra persona—, la primera —de este dispositivo— o la canción que suena pasan a ser esa canción, para probar los estados del Detalle y "la canción ya estaba en la cola"), `errorConsulta`, `errorOperacion` (`CONEXION` o `SERVIDOR`), `rechazoSolicitud`, `rechazoVoto` (un `MotivoRechazoOperacion`) y `latenciaMs`.
- Incremento 4, **paso 1 hecho**: pantalla de confirmación de solicitud (nueva frente a canción existente), con "Ver cola" y "Seguir explorando"; validada en el TECNO KL8 en vertical con datos simulados. 
- Incremento 4, **paso 2 hecho**: la cola resalta y se desplaza a "Tu solicitud" al llegar desde la confirmación, botón "Buscar una canción" en los estados vacíos y `launchSingleTop` en la navegación hacia la cola. Confirmación validada a 1.5×, 2.0× y horizontal. 
- Incremento 4, **paso 3 hecho**: el Detalle de una canción muestra si ya está en la cola (posición, votos y espera si existen), si fue solicitada por este dispositivo o si suena ahora, y no ofrece solicitudes repetidas (acción principal: "Ver la cola"). Es solo una pista con la última cola recibida; el servidor sigue decidiendo. Validado en el TECNO KL8 en vertical. 
- Incremento 4, **paso 4A hecho (preparación para la integración real)**: diagnóstico de la arquitectura, `AppContainer` listo para recibir el repositorio real, `idEstablecimiento` conservado y ViewModel de la cola aislado por sesión. **No se creó repositorio real, endpoints, DTO ni SSE.** La lista exacta de contratos que se necesitan de Juan Camilo (C1 a C18) está en `dependencias-backend.md`. **Los pasos siguientes no se han iniciado.**
- Dependencias con Juan Camilo: 18 registradas, **todas PENDIENTE**.

## Funcionalidad pendiente (decidida por Santiago)

- **Incremento 5:** barra inferior de Figma (Inicio, Buscar, Cola, Mi actividad) y pantalla **"Mi participación"** (solicitudes y votos de este dispositivo). Aplazadas; no se rehace la navegación ni se implementa el historial del dispositivo hasta entonces. "Mi participación" necesita datos que hoy no existen (DEP-18).
- **Elegibilidad de voto ("Puedes votar" / "Esperando nueva oportunidad"):** **no se incluye** ningún modelo provisional. DEP-16 sigue pendiente hasta que Juan Camilo confirme contrato, reglas y datos.
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
