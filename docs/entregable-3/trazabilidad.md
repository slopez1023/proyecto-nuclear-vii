# Matriz de trazabilidad — Entregable 3

Alcance (guía oficial, E3): QR único y operativo, interfaz para smartphone y tablet, búsqueda con autocompletado, integración con YouTube (título, artista, duración, miniatura) e identificación única de dispositivo. Historias: B01, B02, B03, B04, B05, B07, B16.

"Completa" solo se usa cuando se verificó con datos y servicios reales. Última actualización: tras la validación en emulador del incremento 4.

| Historia | Requisito (guía / rúbrica) | Implementación | Pruebas | Evidencia | Estado | Limitaciones |
|---|---|---|---|---|---|---|
| B01 Acceso por QR | QR único que redirige a la app; validación de sesión | `backend/src/sesiones.js`, `backend/scripts/generar-qr.js`, `data/TokenQr.kt`, `SesionRepository.kt`, pantallas `acceso/` | 12 backend, 34 Android (token, repositorio, ViewModel) | `evidencias/inc3-*.png` | **Parcial** | Sesiones MOCK; App Links sin verificar (host placeholder); sin QR físico escaneado |
| B02 Sin registro ni descarga | Abre sin descargas, instalaciones ni registro | App sin registro; cliente web `backend/public/index.html` | Ruta `/s/:token` probada por HTTP | — | **Parcial** | Cliente web no validado en un navegador de teléfono sin la app |
| B07 Identificación única | ID sin datos personales | `DispositivoRepository.kt` (UUID en DataStore) | 4 unitarias + comprobado en emulador | UUID idéntico en 2 aperturas | **Parcial** | Aún no se envía en eventos (incremento 5); se pierde al borrar datos |
| B03 Búsqueda | Resultados desde YouTube, <2 s | `BusquedaRepository.kt`, `BuscarViewModel.kt`, `BuscarScreen.kt` | 14 repositorio + 13 ViewModel; búsqueda real en emulador | `inc4-02`, `inc4-03`, `inc4-05`, `inc4-06` | **Parcial** | Tiempo medido en la app 0.7–1.1 s (sin miniaturas); ver "Miniaturas" |
| B04 Autocompletado | Caja de búsqueda con autocompletado | Debounce 450 ms, 3+ caracteres, `/api/busqueda/sugerencias` | 13 ViewModel (tiempo virtual); real en emulador | `inc4-02` | **Parcial** | Cuesta cuota de YouTube (100 u. por consulta); decisión pendiente del equipo |
| B05 Información y miniaturas | Título, artista, duración y miniatura | `CancionItem.kt`, `DetalleScreen.kt`, Coil | Parseo y formato de duración; detalle comprobado en emulador | `inc4-03`, `inc4-04` | **Parcial** | **Las miniaturas no se pudieron ver cargadas** en el emulador (TLS interceptado por el antivirus) |
| B16 Integración YouTube | Búsqueda con YouTube Data API v3, errores explícitos | `backend/src/youtube.js` | 14 backend (mock) + 3 **reales** contra YouTube | Salida de `npm run test:real`; resultados reales visibles en `inc4-03` | **Parcial** | Datos reales llegan y se muestran en Android; falta ver miniaturas; cuota diaria ~100 búsquedas |

Pendiente para pasar a "Completa": host público HTTPS con App Links verificados, cliente web probado sin la app, sesiones reales (E5), miniaturas visibles en un entorno con TLS válido y decisión sobre la cuota.
