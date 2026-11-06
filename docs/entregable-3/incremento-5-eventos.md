# Incremento 5 — Instrumentación de eventos (B07 y requisito de instrumentación del E3)

La guía exige "instrumentar la aplicación para capturar eventos de uso" y preparar el insumo para la capa analítica. Este incremento solo cubre los **dos eventos de E3** definidos en el documento del proyecto (sec. XVI). No hay pipeline, tablero ni procesamiento Big Data (E6, responsable: Karen).

## Eventos

| Evento | Cuándo se emite | Datos | Quién lo emite |
|---|---|---|---|
| `dispositivo_unido` | Una vez cada vez que el QR se valida con éxito (la sesión existe y está activa) | `recurrente`: `true` si el dispositivo ya se había unido antes a alguna sesión | `AccesoViewModel` |
| `busqueda_realizada` | Una búsqueda aceptada por el servidor, incluso con 0 resultados. **No** se emite para errores, consultas de menos de 2 caracteres ni para el autocompletado | `termino` (recortado), `cantidad_resultados`, `desde_cache` (la app la sirvió de su caché) | `BuscarViewModel` |

Campos comunes: `evento_id` y `fecha_hora` (UTC) los pone el backend al aceptar el evento; la app envía `tipo`, `sesion_id`, `dispositivo_id` (UUID seudónimo de B07) y `datos`. El backend añade `actor: "cliente"` y `version_esquema: "1.0"` y lo guarda en `backend/data/eventos.jsonl` (ignorado por Git). Cuerpos exactos en `backend/test/fixtures/eventos-e3.json`.

**Propuesta para revisión de Karen:** el nombre y los campos de los eventos son los del documento del proyecto, pero el campo `recurrente` (ya se unió a alguna sesión antes) y el criterio de "búsqueda aceptada" son interpretaciones de este incremento. Confirmar o ajustar.

## Cómo funciona

- `EventosRepository` envía `POST /api/eventos` en su propio alcance de corrutinas, sin bloquear la interfaz. Es de **mejor esfuerzo**: un intento por evento, sin reintentos ni cola persistente. Sin red, el evento se pierde; la entrega confiable queda para el pipeline (E6).
- Los fallos de envío nunca llegan a la interfaz.
- `SesionActivaStore` (en memoria) guarda `idSesion` y UUID al unirse, para que la pantalla de búsqueda pueda armar sus eventos.
- `DispositivoRepository.marcarUnion()` guarda en DataStore si el dispositivo ya se unió (atómico).

## Privacidad

- El `dispositivo_id` es el UUID aleatorio de B07: no contiene IMEI, teléfono, ANDROID_ID ni datos personales.
- `termino` es texto libre que escribe el usuario; podría contener datos personales si el usuario los escribe. Está recortado a 100 caracteres en el backend. Queda como punto a revisar en gobernanza (Karen).
- El backend solo acepta estos dos tipos de evento y rechaza identificadores que no sean UUID.

## Pruebas ejecutadas

| Suite | Resultado | Tipo |
|---|---|---|
| Backend `npm test` | **16/16** | Incluye prueba de contrato de eventos contra la app Express real (2 nuevas) |
| Android `testDebugUnitTest` | **83/83**, BUILD SUCCESSFUL | 18 nuevas respecto al incremento 4 |
| `EventosRepositoryTest` (6) | Pasan | Cuerpos idénticos al fixture del contrato, POST a `/api/eventos` (servidor simulado), rechazo 400, servidor caído sin excepción, envío en segundo plano |
| `AccesoViewModelTest` (+4) | Pasan | Evento al unirse, `recurrente` en la segunda unión, nada si no hay sesión válida, un solo evento tras reintentar |
| `BuscarViewModelTest` (+6) | Pasan | Evento con término y cantidad, 0 resultados, `desde_cache`, sin evento en error, sin evento por autocompletado, sin sesión activa |
| `DispositivoRepositoryTest` (+2) | Pasan | `marcarUnion` y su persistencia al reabrir |

Contrato compartido: el mismo `backend/test/fixtures/eventos-e3.json` lo verifican las pruebas de Android (lo que la app **produce**) y las del backend (lo que acepta y guarda).

Nota de entorno: para las pruebas del ViewModel se usa un DataStore en memoria (`DataStoreEnMemoria`), porque el DataStore con archivo falla en Windows si se escribe dos veces seguidas (`rename` sobre un archivo existente). En Android real y en Linux no ocurre.

## Prueba real en el teléfono (TECNO KL8, Android 14)

Backend local con YouTube real, enlace de acceso lanzado con `adb`, flujo: unirse → buscar "Queen" → repetir "Queen" → buscar "Q" (1 carácter) → cerrar y volver a unirse.

Eventos recibidos y guardados por el backend (identificadores truncados):

```
{"evento_id": "7a58beef…", "tipo": "dispositivo_unido", "fecha_hora": "2026-11-06T04:15:38.952Z", "sesion_id": "SES-MOCK-001", "actor": "cliente", "dispositivo_id": "0ef6dcdc…", "version_esquema": "1.0", "datos_evento": {"recurrente": false}}
{"evento_id": "ed2f2458…", "tipo": "busqueda_realizada", "fecha_hora": "2026-11-06T04:17:21.286Z", "sesion_id": "SES-MOCK-001", "actor": "cliente", "dispositivo_id": "0ef6dcdc…", "version_esquema": "1.0", "datos_evento": {"termino": "Queen", "cantidad_resultados": 10, "desde_cache": false}}
{"evento_id": "e1909fd5…", "tipo": "busqueda_realizada", "fecha_hora": "2026-11-06T04:17:30.203Z", "sesion_id": "SES-MOCK-001", "actor": "cliente", "dispositivo_id": "0ef6dcdc…", "version_esquema": "1.0", "datos_evento": {"termino": "Queen", "cantidad_resultados": 10, "desde_cache": true}}
{"evento_id": "171d4d2d…", "tipo": "dispositivo_unido", "fecha_hora": "2026-11-06T04:17:50.761Z", "sesion_id": "SES-MOCK-001", "actor": "cliente", "dispositivo_id": "0ef6dcdc…", "version_esquema": "1.0", "datos_evento": {"recurrente": true}}
```

Resultado: 4 eventos. La búsqueda inválida de 1 carácter no generó nada; la segunda "Queen" salió de la caché de la app (`desde_cache: true`, sin gastar cuota); la segunda unión salió como `recurrente: true` con el mismo UUID. Captura: `evidencias/inc5-dispositivo-busqueda-queen.png`.

Cuota gastada en esta prueba: 1 llamada `search.list` real (más 1 unidad de `videos.list`), porque se evitó el autocompletado.

## Limitaciones

- Entrega de mejor esfuerzo (sin cola persistente).
- La sesión es MOCK (`SES-MOCK-001`), así que `sesion_id` y el vínculo con un establecimiento real no son definitivos.
- El archivo `eventos.jsonl` es almacenamiento local de desarrollo, no la base analítica.
- No hay eventos de rechazo (`solicitud_rechazada`, etc.) porque pertenecen a E4.
