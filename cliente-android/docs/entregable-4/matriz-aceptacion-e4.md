# Matriz de aceptación del E4 — validación contra el backend real (Fase 3)

> **ACTUALIZADO en la Fase 4 (cierre y estabilización).** Las secciones 1 a 7 son la validación de la Fase 3 **con el backend anterior**; los puntos H1, H3c y F1 a F5 se **resolvieron** después (sección 8, con la nueva validación y el nuevo veredicto). Las filas de la sección 3 se actualizaron; la sección 2 conserva lo que se vio en la Fase 3.
>
> Fecha: 2026-11-10 · Rama `feature/e4-android-frontend` (con el merge del backend E4) · Sin commits ni push.
> **Qué se probó contra qué:** app Android (debug con `-Pnuclear.colaReal=true`, repositorio y SSE reales) en el **TECNO KL8** → **backend E4 real** (`node src/server.js`, rama `feature/e4-backend`) → **PostgreSQL 16** (contenedor `ponga-postgres`, puerto 5433). El YouTube de la búsqueda es **real** (clave de `backend/.env`, no mostrada).
> **Limitaciones de la prueba (importantes):** (1) **no había un segundo teléfono**: los «otros dispositivos» son clientes HTTP (curl) con UUID propio; (2) la reproducción la avanzó la **simulación** del backend (`REPRODUCTOR_TOKEN` de prueba), no un reproductor; (3) no se probó TalkBack, tableta ni letra grande contra el backend real; (4) las variables del backend (`DATABASE_URL`, `CATALOGO_SEMILLA`, `SIMULACION_HABILITADA`, `REPRODUCTOR_TOKEN`) se pasaron **solo al proceso**; `backend/.env` no se abrió ni se modificó.

## 1. Entorno antes y después

| Elemento | Antes | Durante la validación | Al terminar |
|---|---|---|---|
| Docker Desktop | **apagado** (motor sin iniciar) | iniciado | **cerrado** (`docker desktop stop`) |
| Contenedor `ponga-postgres` / volumen `backend_ponga-pgdata` / imagen `postgres:16` | no existían | creados con `npm run db:up` (descarga de `postgres:16`) | contenedor **detenido, no eliminado**; imagen y volumen **conservados** (con los datos de prueba) |
| Puerto 3000 | `node src/server.js` PID 26404 (**backend del E3**, arrancado el 6-nov) | detenido (comprobé que seguía siendo ese comando) y sustituido por el backend E4 | backend E4 detenido; **backend E3 levantado de nuevo** desde una copia de `develop` (PID 43620; no es idéntico al original, ver historial) |
| `adb reverse` | `tcp:3000 tcp:3000` | igual | igual |
| `backend/node_modules` | sin `pg` | `npm install` (añadió 14 paquetes; `git status` del backend sin cambios) | se conserva |
| `backend/.env` | solo `YOUTUBE_API_KEY` con valor | intacto | intacto |
| Otros contenedores (`eventia-*`, `olap_*`…) | detenidos | `eventia-*` se iniciaron solos con Docker Desktop (no son del proyecto; no se tocaron) | detenidos al cerrar Docker Desktop |
| Ajustes del celular | letra 1.00002, rotación 0, TalkBack sin servicios | sin cambios | sin cambios |

## 2. Resultado de los 15 escenarios

**Resumen: 11 completos (1 a 5, 8, 9 y 11 a 14), 4 parciales (6, 7, 10 y 15), 0 pendientes y 0 fallidos.** «Completo» significa que se ejecutó de extremo a extremo con la app y el backend reales **en un solo teléfono**; no implica que se haya probado con dos teléfonos. **Ejecutado** = lo hice y lo vi. **Parcial** = una parte no se pudo ejecutar. Capturas en el directorio temporal de la sesión (`dev/f3_*.png`), no versionadas.

| # | Escenario | Resultado | Evidencia y observaciones |
|---|---|---|---|
| 1 | Acceso mediante QR | ✅ Ejecutado | Enlace `…/s/demo-activa-001` → Acceso → Entrar → Inicio. El servidor registró el dispositivo (`dispositivo_sesion`) y los eventos del E3 |
| 2 | Recuperación de sesión | ✅ Ejecutado | Con la cola abierta, `kill -9` del proceso y relanzado: Navigation restauró la cola y la app **validó la sesión con el servidor** antes de mostrarla; el flujo se reabrió |
| 3 | Consulta de cola | ✅ Ejecutado | Cola vacía («La cola está vacía») y con datos reales (reproducción actual, posiciones, votos, esperas) |
| 4 | Solicitud de canción nueva | ✅ Ejecutado | Búsqueda real → Detalle → «Solicitar»: `201 solicitud_creada`, SOL-1 pendiente, «Solicitud registrada», posición #1, «menos de 1 min» (espera 0) |
| 5 | Voto automático | ✅ Ejecutado | «Incluye tu voto automático», 1 voto; en PostgreSQL el voto de SOL-1 tiene `origen = solicitud` |
| 6 | Pedir una canción que ya está en cola | ⚠️ Parcial | **Backend real ✅** (HTTP): `200 voto_sumado`, SOL-3 pasó a 2 votos y subió de posición; el voto es `origen = solicitud` (no manual). **UI ❌ no provocable:** la app no ofrece «Solicitar» para una canción ya en cola (muestra «En la cola» o «Solicitada por ti»); la pantalla «Tu voto se sumó» solo está probada en JVM |
| 7 | Pedir la canción que está sonando | ⚠️ Parcial | **Backend ✅**: `200 voto_sumado`, la solicitud sigue `en_reproduccion`, `posicion` nula. **UI:** «Ahora suena» aparece sola (✅); pedirla desde la app no se ofrece (igual que el 6) |
| 8 | Voto manual permitido | ✅ Ejecutado | Tras sonar 2 canciones ajenas, `mi_votacion.puede_votar` pasó a verdadero y aparecieron los botones «Votar». Voto sobre SOL-4: `201`, «Voto registrado», «Votaste», 2 votos; en BD `origen = manual`. El otro botón pasó a «Aún no» |
| 9 | Rechazo por intervalo | ✅ Ejecutado | Pedir otra canción justo después de solicitar: `409 intervalo_no_cumplido`, «Todavía no puedes pedir otra canción… Faltan 2 canciones por sonar»; no se creó nada (1 solicitud en BD) y quedó el evento `solicitud_rechazada` |
| 10 | Rechazo por voto duplicado | ⚠️ Parcial | **Backend ✅**: `409 voto_duplicado` (dos casos: pedir y votar con el UUID del teléfono por HTTP). **UI ❌:** la app bloquea el botón («Votaste»), así que el mensaje solo se probó en JVM |
| 11 | Sesión cerrada | ✅ Ejecutado | Cerré `SES-MOCK-001` en BD (`UPDATE`, restaurado a `activa`): `410 sesion_cerrada`; el teléfono, con el flujo abierto, volvió a **Acceso** al reconectar. **Observación:** ver F2 |
| 12 | Canción no disponible | ✅ Ejecutado | Transmisión «24/7 Live» (el buscador la da por «disponible»): `422 cancion_no_permitida` (`en_vivo`), «Canción no disponible… Prueba con otra», sin crear nada. Ver F1 |
| 13 | Actualizaciones SSE | ✅ Ejecutado | Otro dispositivo pidió y votó canciones: el teléfono, sin tocar nada, mostró las canciones nuevas, el contador de votos y el **reordenamiento** (la de 2 votos pasó a la posición 1), y «Ahora suena» al iniciar la reproducción |
| 14 | Reconexión tras perder el servidor | ✅ Ejecutado | Detuve el backend con el flujo abierto: la app conservó la cola. Al reiniciarlo (la versión siguió creciendo desde la BD: 17 → 18) un voto de otro dispositivo apareció en el teléfono sin acción: reconectó sola |
| 15 | Actualización simultánea desde dos dispositivos | ⚠️ Parcial | **No hubo segundo teléfono.** Con dos clientes HTTP en paralelo: dos solicitudes simultáneas de la misma canción nueva → `201` + `200` y **una sola** solicitud en BD; dos votos simultáneos a la misma solicitud → `201` + `201`, 3 votos en BD y 3 en la pantalla del teléfono |

Además, **ejecutado**: rangos de intervalo con los dispositivos virtuales de la simulación (11 → intervalo 4; 30 → 4; 60 → 6; restaurado a 0); `solicitud_no_votable` al votar la que suena (H3c); `404 solicitud_inexistente`; **H1** reproducido (sección 4). **No ejecutado:** rango de 8 (más de 60 dispositivos; lo cubren las pruebas del backend), reproductor real, dos teléfonos, tableta.

## 3. Matriz de aceptación del E4

Estados: **Cumple** (probado contra el backend real), **Cumple parcial** (probado en parte), **Pendiente**.

| Requisito | Evidencia | Resultado | Estado | Observaciones |
|---|---|---|---|---|
| Acceso por QR sin registro, con UUID único | Escenario 1; eventos E3 en el servidor | Entra y se registra el dispositivo | **Cumple** | El acceso (E3) valida contra el mock JSON, no contra la BD (F2) |
| Ver la cola con canción actual, posición, votos y espera | Escenarios 3, 4, 13; pantalla | Datos del servidor, sin recalcular en Android | **Cumple** | |
| Solicitar una canción con voto automático atómico | Escenarios 4–5; BD | 1 solicitud + 1 voto `solicitud` | **Cumple** | |
| Regla del intervalo (rechazo y mensaje) | Escenario 9; evento `solicitud_rechazada` | `409` con canciones restantes | **Cumple** | |
| Voto manual sobre solicitud ajena pendiente | Escenario 8; BD | `201`, origen `manual` | **Cumple** | |
| Un voto por dispositivo y solicitud | Escenario 10 | `409 voto_duplicado` | **Cumple parcial** | UI: el botón lo impide; el mensaje solo en JVM |
| Canción ya en cola o sonando: no se duplica, se suma voto | Escenarios 6–7 | `200 voto_sumado` | **Cumple parcial** | La app no ofrece esa acción por diseño; la pantalla de confirmación de ese caso solo en JVM |
| Orden por votos con desempate por antigüedad | Escenarios 13, 15 | Reordena en vivo | **Cumple** | |
| Canción en reproducción visible | Escenarios 7, 13 | «Ahora suena», tiempo restante | **Cumple** | La reproducción es simulada (E5 trae el reproductor) |
| Tiempo estimado de espera | Escenarios 4, 13 | «menos de 1 min», «aprox. N min» a partir de segundos | **Cumple** | No se verificó la exactitud frente a la reproducción real |
| Actualización en tiempo real (SSE) | Escenarios 13, 14 | Cambios sin acción; reconexión; versiones | **Cumple** | Estado completo en cada mensaje; sin duplicados al ir a segundo plano (Fase 2) |
| Intervalo por rangos de dispositivos activos (2/4/6/8) | Fase 3: 11→4, 60→6; Fase 4: 61→8 y 100→8 con los virtuales | Los cuatro rangos ejecutados | **Cumple** | El intervalo y las canciones que faltan ya se muestran en la app (F4) |
| Validación del catálogo | Escenario 12 + Fase 4 (F1/F3) | `422` con motivo; la búsqueda ya marca lo mismo; tope de 20 min | **Cumple** | Regla única en búsqueda y catálogo |
| Sesión cerrada / expirada | Escenario 11 + Fase 4 | El flujo avisa (`sesion_cerrada`), el QR se rechaza y la app explica | **Cumple** | Sin segundo teléfono |
| Recuperación tras cerrar la app | Escenario 2 | Sesión validada y cola restaurada | **Cumple** | |
| Eventos analíticos de solicitud, voto y reproducción | 34 eventos reales (Fase 3) y 125 pruebas del backend (Fase 4) | Sobre con establecimiento; voto sumado distinguible; `cola_vacia` | **Cumple** | A4 y dos eventos de A3 diferidos al E5 con justificación (ver `revision-analitica-e4.md`, sección 8) |
| Consistencia con varios dispositivos | Escenario 15 (HTTP) | Sin duplicados ni votos perdidos | **Cumple parcial** | Sin segundo teléfono |
| Pruebas automáticas Android | 285 JVM, 0 fallos; 4 instrumentadas en el TECNO | Pasan | **Cumple parcial** | Instrumentadas ejecutadas con `am instrument`; sin pruebas de Compose (dependencia no descargable) |
| Pruebas automáticas backend | 125 pruebas con PostgreSQL 16 | 125/125 | **Cumple** | |
| Accesibilidad (TalkBack, letra grande, horizontal) | Fases anteriores (solo letra grande y horizontal con datos simulados) | TalkBack **sin probar** | **Pendiente** | Requisito de la guía |
| Tabletas | — | No probado | **Pendiente** | Lenovo sin probar |
| Compilación release con lint | `lintVitalAnalyzeRelease` | **Falla por certificado** (`PKIX`), ambiental | **Pendiente** | Compila sin esas tareas; el lint de release no se ejecutó |

## 4. H1 y H3c — comportamiento real

**H1 — «bloqueo cuando participan pocos dispositivos» (reproducido en vivo).** Con 2 dispositivos nuevos (HA y HB) que solo se piden canciones el uno al otro: cada uno pide una, suenan y terminan, y con **cola vacía y nada sonando** ambos quedan con `puede_votar = false` (`contadas 1 de 2`; pedir otra da `409 intervalo_no_cumplido`, «Faltan 1»). Se desbloquean **solo** cuando un **tercer** dispositivo pide una canción que suena y termina (`contadas 2 de 2`). Con muchos dispositivos activos en el mismo establecimiento no se nota (en la prueba, 7 dispositivos con más de 3 reproducciones contadas se recuperaron todos). **Riesgo:** en un bar con pocas personas (≤ el intervalo vigente) la cola puede detenerse sin que nadie pueda pedir; no hay regla de respaldo. **No se cambió nada.**
**Casos de prueba que dependen de la decisión:** la prueba «dos celulares» del cierre del E4; C-«cola vacía y nada suena»; cualquier demo con ≤ 2 teléfonos. Con la decisión **(a)** (aceptarlo) la demo debe usar la simulación o 3 o más dispositivos; con **(b)** (regla de respaldo) hay que añadir casos al backend y a Android (el texto «Aún no» podría dejar de ser cierto).
**Decide el equipo:** (a) aceptar y documentar, (b) regla de respaldo, (c) otra.

**H3c — votar la canción que suena (reproducido en vivo).** Pedirla **sí** suma voto (`200 voto_sumado`, `posicion` nula, `origen = solicitud`); votarla (`/votos`) da **`409 solicitud_no_votable`**. En Android no se manifiesta: el botón de votar solo se ofrece en solicitudes pendientes y el Detalle de una canción que suena no ofrece solicitarla.
**Riesgo:** incoherencia entre pedir y votar la misma canción; si se decide «permitir ambos», Android tendría que mostrar el botón en la que suena y manejar `posicion` nula. **Casos de prueba que dependen:** `e4-solicitudes` (H3c) del backend y los casos 7 y 10 de esta matriz. **Decide el equipo:** dejarlo, permitir ambos o impedir ambos.

## 5. Hallazgos de la validación

| # | Hallazgo | Responsable sugerido | Gravedad |
|---|---|---|---|
| F1 | **La búsqueda y el catálogo no coinciden:** `GET /api/busqueda` da `disponibilidad: "disponible"` a transmisiones en vivo (duración 0) y la app muestra «Disponible para reproducir»; al solicitar, el catálogo las rechaza con `422 en_vivo`. La persona ve «Canción no disponible» tras pulsar | Juan Camilo (que la búsqueda use la misma regla) o Android (ocultar duración 0) | Media |
| F2 | **El acceso (E3) y la sesión del E4 salen de fuentes distintas:** `GET /api/sesiones/{token}` valida contra `sesiones.mock.json`; el E4, contra la tabla `sesion`. Con la sesión cerrada en BD, el QR sigue aceptándose y la app **rebota a Acceso sin explicación** al entrar. Desaparece cuando exista el módulo de sesiones (E5) | Juan Camilo; Android puede mostrar un aviso «La sesión ya no está activa» | Media |
| F3 | **El catálogo aceptó** una transmisión de 16 821 s (4,7 h, «24/7 Live Radio») y un **video de recetas** («Arroz suelto con zanahoria», SOL-11). No verifiqué su categoría en YouTube: puede ser un filtro de categoría que no se aplica o categorías mal asignadas por el creador | Juan Camilo (revisar; quizá un tope de duración) | Media |
| F4 | Android no muestra el intervalo ni las canciones que faltan para votar de forma permanente: solo el botón «Aún no» y, al rechazar, «Faltan N» | Android (opcional) | Baja |
| F5 | El flujo SSE no avisa del cierre de sesión: la app lo detecta al reconectar o en la siguiente operación | Juan Camilo (evento de cierre) | Baja |
| F6 | Con la simulación, `dispositivos_activos` cuenta solo flujos SSE abiertos: los clientes HTTP sin flujo no cuentan (coherente con el contrato) | — | Informativo |

## 6. Estado final del entorno

Restaurado como indica la tabla de la sección 1. Detalle y diferencias en `historial-implementacion.md` (sección «Fase 3», «Restauración del entorno»).

## 7. ¿Se puede declarar el E4 funcionalmente terminado?

**Sí, con reservas explícitas.** El flujo completo (QR → buscar → solicitar con voto automático → ver la cola en vivo → votar → rechazos → reproducción → recuperación y reconexión) **funciona de extremo a extremo contra el backend real con PostgreSQL**, con 276 + 110 pruebas automáticas en verde. **No se puede declarar el E4 cerrado del todo** mientras estén abiertos: (1) la prueba **con dos teléfonos reales** (no había segundo teléfono); (2) **TalkBack y tableta** (requisito de la guía); (3) la decisión de **H1** (afecta a la demo con pocos teléfonos); (4) **F1–F3** del backend; (5) la confirmación de **Karen** y las decisiones **A1/A2**; (6) el **lint de release** (fallo ambiental). Ningún bloqueo impide usar el sistema; los puntos (1), (2) y (6) son de **verificación pendiente**, el (3) es una **decisión de negocio** y el resto son **mejoras acordadas con el backend**.

---

## 8. Cierre y estabilización (Fase 4, 2026-11-10)

> Por instrucción de Santiago, el asistente asumió los roles de **Juan Camilo** (backend), **Santiago** (Android) y **Karen** (analítica) porque ninguno estaba disponible, y tomó las decisiones. **Son decisiones técnicas del asistente, no aprobaciones personales de nadie.**

### 8.1 Decisiones y justificación

| Tema | Decisión | Alternativas descartadas | Por qué |
|---|---|---|---|
| **H1** bloqueo con pocos dispositivos | **Regla de inactividad:** si no suena nada y no hay nada en espera, `puede_votar = true` aunque no se cumpla el intervalo. El resto de la regla no cambia | (a) Aceptar el bloqueo; (c) contar también las canciones propias o bajar el intervalo según participantes | El intervalo existe para que nadie acapare una cola ocupada; con la cola vacía y nada sonando no hay a quién proteger y el bloqueo detiene el sistema (se reprodujo en la Fase 3). Es la opción (b) de la propuesta de Juan Camilo, la de menor impacto: no toca el contador ni los rangos, los votos siguen siendo definitivos y tras pedir el intervalo vuelve a aplicarse |
| **H3c** votar la que suena | **Se acepta** el voto manual sobre `en_reproduccion` (201); `reproducida`/`fallida` siguen dando 409 | Prohibir ambas vías (contradice la decisión 1B, ya tomada por el equipo: pedir una canción que suena suma voto) | Hace coherentes las dos vías y elimina un 409 injusto cuando el voto llega justo al empezar la canción. Android **no** ofrece votar lo que ya suena (no cambia el orden), así que la experiencia no cambia |
| **F1** búsqueda ≠ catálogo | La búsqueda usa **la misma función** que el catálogo (`motivoNoPermitido`) | Ocultar en Android las canciones de duración 0 | Una sola regla evita que se vuelvan a desalinear; Android ya oculta «Solicitar» para `no_disponible` |
| **F3** catálogo | Tope de **20 min** (`demasiado_larga`, configurable) y duración 0 = `sin_duracion`. Migración aditiva `002` | No hacer nada | Una canción de 4,7 h bloquearía la cola de un bar. **Corrección:** el video de recetas era categoría **música (10) según YouTube** (lo consulté con la API): el filtro de categoría funciona; no es un defecto del catálogo |
| **F2** acceso ≠ sesión E4 | `GET /api/sesiones/{token}` lee de **PostgreSQL** cuando hay base; Android, al terminar la sesión, muestra «La sesión de este establecimiento ya terminó» | Mantener el mock | Una sola fuente de verdad. Aditivo (misma respuesta) |
| **F5** aviso de cierre | El flujo SSE envía `event: sesion_cerrada` y termina (en cada ping de 10 s o al enviar un estado); Android lo trata como sesión no disponible | Esperar a la siguiente operación | La persona se entera en segundos, no al pulsar algo. Aditivo |
| **F4** intervalo visible | Android muestra «Ya puedes pedir…» / «Podrás pedir otra canción o votar cuando suenen N canciones más» en la cola y en el Detalle | Dejar solo el botón «Aún no» | Evita pulsar para recibir un rechazo. Solo repite lo que dice `mi_votacion` |
| **A1, A2, A5, A6, A7** | Implementados (ver `revision-analitica-e4.md`, sección 8) | — | Baratos, aditivos, sin impacto en Android |
| **A3** | Solo `cola_vacia` en el E4; `cola_modificada` y `rango_dispositivos_cambiado` → E5 | — | `cola_vacia` es el síntoma de H1; los otros dos necesitan eventos de establecimiento (sin sesión) y un modelo de cola que llega con el reproductor |
| **A4** | → E5 | Implementarlo ahora | La BD ya guarda la última conexión y desconexión; el pipeline (Karen/E5) puede leerla. Un evento por flujo abierto/cerrado generaría ruido con las reconexiones |

### 8.2 Validación posterior a los cambios (backend E4 real + PostgreSQL 16 + TECNO KL8)

| Verificación | Resultado | Cómo |
|---|---|---|
| **F1** búsqueda de transmisiones en vivo y de 4,7 h | ✅ `no_disponible`; en el teléfono, «No disponible» y sin botón «Solicitar» | Búsqueda real de YouTube y pantalla |
| **H1** pedir con la cola inactiva sin cumplir el intervalo | ✅ El teléfono pidió una canción justo después de terminar la suya: `201`, `por_inactividad: true`, `mi_votacion` con `canciones_restantes 0`. Con algo sonando el intervalo siguió bloqueando (el Detalle mostraba «cuando suenen 2 canciones más») | Teléfono + backend real + evento en el JSONL |
| **F4** aviso del intervalo | ✅ Visible en la cola y en el Detalle (captura) | Pantalla |
| **Cierre de sesión por SSE** | ✅ Con la sesión cerrada en la BD, la app mostró «Acceso no disponible — La sesión de este establecimiento ya terminó» a los **3 s** | Teléfono |
| **F2** QR de una sesión cerrada | ✅ Se rechaza en Acceso con la misma explicación (ya no entra y rebota) | Teléfono |
| **Rango de 8** | ✅ 61 y 100 dispositivos activos virtuales → intervalo 8 | Simulación del backend |
| **H3c** votar la que suena | ✅ `201` (pruebas del backend y casos del fixture); no ejecutado por la UI porque la app no lo ofrece | Pruebas + fixture |
| **A1/A2** en eventos reales | ✅ `version_esquema 1.2`, `id_establecimiento`, `sumado_a_existente`, `estado_solicitud`, `por_inactividad` | JSONL del backend |
| **Pruebas del backend** | ✅ **125/125** contra PostgreSQL 16 (+15 nuevas) | `npm test` |
| **Pruebas JVM de Android** | ✅ **285/285** (+9) | `testDebugUnitTest` |
| **Pruebas instrumentadas** | ✅ **4/4** en el TECNO (DataStore real, contexto, arranque de la actividad con App Link y ciclo de vida) | `am instrument` |
| **Fixture** | ✅ 33 casos (antes 20): 404, 405, 410, 422, 503, voto sumado, SSE con cambios y cierre | `e4-contrato.test.js` |

### 8.3 Lo que sigue sin poder hacerse

| Pendiente | Motivo |
|---|---|
| **Dos teléfonos físicos** | Solo hay un teléfono; el segundo dispositivo fue HTTP (carreras comprobadas en la BD) |
| **TalkBack y tableta** | TalkBack nunca se ha probado; la tableta Lenovo no está disponible |
| **Pruebas de Compose** (`ui-test-junit4`) | La dependencia no se puede descargar (error de certificado `PKIX`) |
| **`connectedDebugAndroidTest` de Gradle** | Necesita descargar `gradle-work-action` (mismo error); se ejecutó el mismo APK de pruebas con `adb shell am instrument` |
| **Lint de Release** | `lintVitalAnalyzeRelease` falla por el mismo certificado; sin esas tareas compila |
| **Reproductor real** | Es del E5; la reproducción se simuló |

### 8.4 Veredicto actualizado

**El E4 está funcionalmente terminado y estable contra el backend real.** Los defectos y decisiones abiertos de la Fase 3 (H1, H3c, F1, F2, F3, F4, F5, A1, A2) están resueltos, con pruebas y validación en el teléfono. Lo que queda es **verificación que el entorno no permite** (dos teléfonos, TalkBack, tableta, pruebas de Compose, lint de Release) y mejoras de analítica diferidas al E5 con justificación. Ver «Riesgos residuales» en el informe de la fase.
