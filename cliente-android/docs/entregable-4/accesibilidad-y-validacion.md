# Accesibilidad y adaptación visual — validación en el TECNO KL8

Registro de las pruebas de accesibilidad, letra grande y orientación horizontal del E4 Android (cola, votos y solicitud). Fecha: 2026-11-09. Dispositivo: TECNO KL8 (720×1600 px, 320 dpi = 360×800 dp) por USB; los emuladores `offline` no se usaron. Datos de cola **simulados** (solo debug); la búsqueda usó YouTube real.

**Cómo se probó:** capturas de pantalla y toques por ADB, más el volcado del árbol de accesibilidad (`uiautomator`). **No se escuchó la voz de TalkBack** (no es posible desde ADB).

## 1. Ajustes del celular modificados y restaurados

| Ajuste | Valor original | Durante la prueba | Estado final |
|---|---|---|---|
| `system font_scale` | 1.00002 | 1.5 y 2.0 | **Restaurado** a 1.00002 |
| `system user_rotation` | 0 | 1 (horizontal) | **Restaurado** a 0 (`accelerometer_rotation` seguía en 0, vertical bloqueado) |
| `secure enabled_accessibility_services` | vacío (sin servicios) | solo el servicio de TalkBack | **Restaurado** a vacío; verificado (ver sección 5) |
| `secure accessibility_enabled` | 0 | 1 | **Restaurado** a 0; verificado (ver sección 5) |

TalkBack se **activó temporalmente por ADB** solo para las pruebas y **se desactivó después** (sección 5). Si volviera a activarse: Ajustes → Accesibilidad → TalkBack → Desactivar.
No se concedió ni se negó ningún permiso: el diálogo de notificaciones de TalkBack se descartó con "Atrás".

## 2. Pruebas realizadas

### 2.1 Letra grande (1.5× y 2.0×) — realizada
Pantallas: Acceso, Inicio, cola (con datos, aviso de rechazo, error con "Reintentar"), detalle de canción real (con aviso de rechazo).

| Elemento | 1.5× | 2.0× |
|---|---|---|
| Títulos y nombres de canción | Se ajustan a 2–3 líneas, sin cortes | Igual |
| Artista | OK | Se cortaba ("Michael Jack…") → **corregido** (hasta 2 líneas) |
| Cantidad de votos | OK | El contador se rompía ("vot/os") → **corregido** |
| Espera estimada | "min" quedaba solo en otra línea → **corregido** | Igual → **corregido** |
| Botones | OK | "Solicitar esta canción" en 2 líneas alineado a la izquierda → **corregido** (centrado) |
| Avisos de operación | OK | Demasiado altos → **corregido** (texto más corto, ~35 % de la pantalla); se pueden cerrar y la lista se desplaza |
| Desplazamiento | OK | OK |
| Elementos que desaparezcan | Ninguno | Ninguno; en el detalle los chips de duración quedan bajo el pie hasta desplazar (el cuerpo es desplazable) |

### 2.2 Horizontal — realizada
Pantallas: Acceso, Inicio, cola (con y sin aviso), detalle de canción real y su aviso. No hay bloqueo de orientación en el manifiesto; la app funciona en ambas (la actividad se recrea y el estado de la cola se conserva).
- Distribución: contenido centrado con ancho máximo de 560 dp; cabecera y pie se desplazan en alturas cortas (diseño de `NuclearScreen`).
- Canciones, tarjeta "Ahora suena", barra de popularidad, botones de voto ("Votar", "Votaste", "Tu solicitud"): se ven completos y con objetivo táctil suficiente.
- **Problema encontrado y corregido:** el aviso de un voto quedaba al final de la lista y **no se veía al tocar "Votar"**. Ahora la cola mantiene cabecera y pie fijos (`NuclearScreen(mantenerCabeceraYPieFijos = true)`).
- En el detalle, el aviso queda visible justo sobre el botón "Solicitar".

### 2.3 TalkBack — realizada solo en parte
Realizado:
- Se activó TalkBack (exploración táctil encendida), apareció su tutorial inicial (cerrado) y un diálogo de permiso de notificaciones (descartado).
- Con TalkBack encendido, el foco (recuadro verde) aterrizó en la tarjeta de la primera solicitud de la cola.
- Árbol semántico (válido con TalkBack activo): cada tarjeta expone nodos independientes con descripciones comprensibles: "Volver", "Posición N", título, artista, "N votos", "Votar por …", "Ya votaste por …", "Solicitaste … y tu voto ya está incluido", "Espera estimada: aprox. 2 min". La canción que suena es un bloque aparte con la insignia "Ahora suena" y "Termina en: …"; las pendientes no la llevan.
- Objetivos táctiles ≥ 48 dp (botón de voto 104×48 dp, volver y cerrar 48 dp).

**No se pudo completar (y por qué):**
| Prueba | Motivo |
|---|---|
| Recorrer los elementos con el gesto "siguiente" y verificar el orden de lectura | Los deslizamientos y atajos enviados por ADB no mueven el foco de TalkBack (probado: deslizar a la derecha, Alt+→ y Tab) |
| Escuchar los anuncios (votos, estados "Votaste" / "Tu solicitud" / "Votando…", avisos de confirmación y rechazo) | No se puede oír la voz desde el computador; los registros de TalkBack no incluyen el texto hablado |
| Comprobar que los avisos se anuncian solos al aparecer | Mismo motivo (están marcados como región activa, `liveRegion = Polite`, pero no se verificó el anuncio) |
| Verificar que los botones se anuncian como "botón" y que doble toque los activa | Requiere gestos de TalkBack |

### Lista para la prueba manual con TalkBack (PENDIENTE: no se ha realizado)
TalkBack está desactivado. Esta lista queda como pendiente para una ocasión futura; **las comprobaciones de abajo no se han hecho y no deben darse por cumplidas**. Para repetirla hay que volver a activar TalkBack (con autorización) y desactivarlo al terminar.
Con TalkBack activo (un dedo: tocar = explorar; **doble toque** = activar; deslizar a la derecha/izquierda = siguiente/anterior; dos dedos = desplazar):
1. En la cola, deslizar a la derecha desde el principio y anotar el orden: Volver → "Cola de reproducción" (¿lo anuncia como encabezado?) → "Ahora suena" / título / artista / "Termina en…" → "En espera" → por solicitud: posición, título, artista, votos, botón, espera.
2. ¿Se entiende cuántos votos tiene cada canción ("3 votos")?
3. ¿Se distingue la canción que suena de las pendientes?
4. En una pendiente sin voto: ¿dice "Votar por …" y "botón"? Doble toque: ¿se anuncia "Votando" y luego "Voto registrado"/el rechazo?
5. En "Votaste" y "Tu solicitud": ¿dice que ya votó, y no ofrece acción?
6. ¿El aviso de confirmación/rechazo se anuncia solo al aparecer? ¿Se alcanza el botón de cerrar ("Cerrar aviso")?
7. En el detalle: ¿se anuncian "Solicitar esta canción" y "Ver la cola"?
8. ¿Hay algo importante al que no se pueda llegar?
Anotar lo que falle; se corrige en el siguiente paso.

## 3. Problemas encontrados y correcciones

| # | Problema | Dónde | Corrección |
|---|---|---|---|
| 1 | "Espera estimada: aprox. 2 min" se partía letra por letra con el botón de voto al lado (1.0×) | `ElementoCola`, `TiempoEstimado` | La espera va en su propia línea; etiqueta y valor en un solo texto con espacios duros (la unidad no queda huérfana) |
| 2 | Contador "3 votos" roto y cortado con "Tu solicitud" al lado (2.0×) | `ElementoCola` | `FlowRow`: el botón baja a la línea siguiente cuando no cabe; el contador no se parte |
| 3 | Artista cortado a una línea (2.0×) | `ElementoCola`, `TarjetaAhoraSuena` | Hasta 2 líneas |
| 4 | Aviso de intervalo demasiado largo (2.0×) | `MensajeOperacion` | Texto más corto ("Espera a que suenen más canciones." + cuántas faltan) |
| 5 | Texto de botón en dos líneas alineado a la izquierda | `BotonPrincipal`, `BotonSecundario` | Texto centrado |
| 6 | Aviso de voto invisible en horizontal | `NuclearScreen`, `ColaScreen` | Nuevo parámetro `mantenerCabeceraYPieFijos` (solo lo usa la cola) |
| 7 | (de la ronda anterior) aviso fuera de pantalla al desplazar, y aviso viejo arrastrado a la cola | `ColaScreen`, `NuclearNavHost` | Pie fijo; se limpia al navegar |

## 4. Observaciones no corregidas
- **Buscar en horizontal (E3):** el teclado ocupa toda la pantalla y tapa sugerencias/resultados hasta cerrarlo. Es comportamiento previo del E3, fuera del alcance del E4.
- **Detalle en horizontal:** la miniatura 16:9 ocupa casi toda la altura; título, botones y avisos quedan bajo el pliegue (se alcanzan al desplazar). Diseño del E3.
- **Texto de error del servidor al cargar la cola** dice "No pudimos completar la operación" (comparte texto con las operaciones).
- **Tableta (Lenovo TB336FU):** no probada.
- **Letra grande / horizontal en las pantallas de Acceso y QR inválido:** Acceso verificado; QR inválido no revisado en esta ronda.

## 5. Desactivación de TalkBack y estado final del celular (2026-11-09)

TalkBack se desactivó a petición de Santiago, de forma selectiva y verificada por ADB. Procedimiento:
1. Se comprobó que `13159704AH000977` (TECNO KL8) estaba conectado y autorizado.
2. Se leyó el estado **antes** de cambiar nada: `enabled_accessibility_services` = solo TalkBack (`com.google.android.marvin.talkback/…TalkBackService`), `accessibility_enabled` = 1, `touch_exploration_enabled` = 1; `accessibility_shortcut_target_service` vacío, `accessibility_button_targets` = null, sin magnificación; **ningún otro servicio habilitado**.
3. Como TalkBack era el único servicio de la lista (y el valor original estaba vacío), se quitó solo ese valor (`settings delete secure enabled_accessibility_services`, 1 fila) y se puso `accessibility_enabled` = 0. No se tocó ningún otro ajuste de accesibilidad.

**Verificación posterior:**
| Comprobación | Resultado |
|---|---|
| `enabled_accessibility_services` | vacío (`null`, como al inicio) |
| `accessibility_enabled` | 0 |
| `touch_exploration_enabled` | 0 |
| `dumpsys accessibility`: servicios habilitados / enlazados | ninguno / ninguno; `touchExplorationEnabled=false` |
| `system font_scale` | 1.00002 (original) |
| `system accelerometer_rotation` / `user_rotation` | 0 / 0 (originales: vertical bloqueado) |
| Respuesta táctil | **Un solo toque** en la flecha de volver de la cola la activó y volvió a Inicio, sin recuadro de foco de TalkBack (con TalkBack habría solo explorado el elemento) |

Con esto el celular quedó en el estado inicial en tamaño de fuente, orientación y accesibilidad. No se modificó ningún otro ajuste. (Quedan en el dispositivo la app de depuración instalada y, si se hubiera usado, el archivo de escenarios simulados de la app, que se borró.)

### Resumen honesto de TalkBack
- **Hecho:** activación temporal; el foco inicial aterrizó en la primera tarjeta de la cola; revisión del árbol semántico y de las descripciones de accesibilidad; objetivos táctiles ≥ 48 dp.
- **NO completado:** orden de navegación por gestos; escucha de los anuncios (votos, estados, confirmaciones y rechazos); anuncio automático de avisos; anuncio de botones y activación por doble toque. **La prueba manual de TalkBack sigue PENDIENTE.**

## 6. Pantalla de confirmación de solicitud (incremento 4, paso 1) — sin validar en accesibilidad
- **Hecho:** revisión del árbol semántico en el TECNO (títulos, "Incluye tu voto automático.", "Posición actual", "1 voto", "Espera estimada: …", botones "Ver cola" y "Seguir explorando"); la zona de estado se marcó como región activa (`liveRegion = Polite`) y el título como encabezado.
- **NO probado en el paso 1:** TalkBack, letra grande y horizontal. Letra grande y horizontal se validaron después, en el paso 2 (sección 7).
- **TalkBack (anuncio al aparecer, orden de lectura): sigue PENDIENTE.**

## 7. Pantalla de confirmación y cola destacada: letra grande y horizontal (incremento 4, paso 2)
Realizado en el TECNO KL8 por USB (2026-11-09), con autorización expresa de Santiago, datos de cola simulados y búsqueda real.

| Prueba | Resultado |
|---|---|
| Confirmación a **1.5×** (solicitud nueva y canción existente) | Todo se alcanza desplazando. **Problema encontrado:** los botones fijos tapaban parcialmente "Posición actual" y la espera → **corregido** (con letra > 1.3× los botones pasan al final del contenido). |
| Confirmación a **2.0×** (nueva y existente) | Título, canción, "Incluye tu voto automático.", posición, votos, espera y botones completos al desplazar. El título de la canción se recorta a 2 líneas con "…". |
| Confirmación en **horizontal** | Se desplaza completa; botones alcanzables. |
| Cola con la solicitud destacada, en **horizontal** | La lista llega desplazada a la solicitud resaltada y se ve completa. |
| Cola con estados vacíos y botón "Buscar una canción" | Probada a 1.0× en vertical; a letra grande y horizontal **no** se probó. |

**Ajustes restaurados y verificados:** `font_scale` 1.00002, `accelerometer_rotation` 0, `user_rotation` 0, TalkBack sin servicios (`accessibility_enabled` 0, `touch_exploration_enabled` 0). Hubo una desconexión de ADB durante la prueba (ver el historial); no afectó a los ajustes finales.

**No probado (pendiente):** TalkBack (confirmación, cola resaltada, botones de los estados vacíos, descripción "Tu última solicitud"); rotación estando en la cola con el resalte activo; estados vacíos a letra grande y horizontal; tableta Lenovo.

## 8. Estado de la canción en el Detalle (incremento 4, paso 3) — sin validar en accesibilidad
- **Hecho:** validación funcional en el TECNO KL8 en vertical y letra 1.0× (ver el historial).
- **NO probado:** TalkBack (anuncio de la tarjeta y de los botones "Ver la cola" / "Solicitar esta canción"), letra grande y horizontal en la tarjeta nueva, y el recorte de la miniatura (2:1) con esos tamaños. Se conservan como **pendientes** para la validación final.
