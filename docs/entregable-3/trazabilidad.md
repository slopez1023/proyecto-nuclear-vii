# Matriz de trazabilidad — Entregable 3

Alcance (guía oficial, E3): QR único y operativo, interfaz para smartphone y tablet, búsqueda con autocompletado, integración con YouTube (título, artista, duración, miniatura) e identificación única de dispositivo. Historias: B01, B02, B03, B04, B05, B07, B16.

"Completa" se reserva para cuando además haya despliegue y flujo real de QR; mientras tanto "Verificada en dispositivo físico" indica datos y servicios reales con backend local. Última actualización: tras la validación en dispositivo físico (TECNO KL8, Android 14) del incremento 4.

| Historia | Requisito (guía / rúbrica) | Implementación | Pruebas | Evidencia | Estado | Limitaciones |
|---|---|---|---|---|---|---|
| B01 Acceso por QR | QR único que redirige a la app; validación de sesión | `backend/src/sesiones.js`, `backend/scripts/generar-qr.js`, `data/TokenQr.kt`, `SesionRepository.kt`, pantallas `acceso/` | 12 backend, 34 Android (token, repositorio, ViewModel) | `evidencias/inc3-*.png` | **Parcial** | Sesiones MOCK; App Links sin verificar (host placeholder); sin QR físico escaneado |
| B02 Sin registro ni descarga | Abre sin descargas, instalaciones ni registro | App sin registro; cliente web `backend/public/index.html` | Ruta `/s/:token` probada por HTTP | — | **Parcial** | Cliente web no validado en un navegador de teléfono sin la app |
| B07 Identificación única | ID sin datos personales | `DispositivoRepository.kt` (UUID en DataStore) | 4 unitarias + comprobado en emulador | UUID idéntico en 2 aperturas | **Parcial** | Aún no se envía en eventos (incremento 5); se pierde al borrar datos |
| B03 Búsqueda | Resultados desde YouTube, <2 s | `BusquedaRepository.kt`, `BuscarViewModel.kt`, `BuscarScreen.kt` | 14 repositorio + 13 ViewModel; búsqueda real en teléfono | `evidencias/inc4-dispositivo-02`, `-04`, `-05`; `inc4-05`, `inc4-06` (emulador) | **Verificada en dispositivo físico (backend local)** | Backend local; datos listos en 0.57–1.14 s (10 muestras); sin validar con backend desplegado |
| B04 Autocompletado | Caja de búsqueda con autocompletado | Debounce 450 ms, 3+ caracteres, `/api/busqueda/sugerencias` | 13 ViewModel (tiempo virtual); real en teléfono | `inc4-dispositivo-01` | **Verificada funcionalmente; riesgo de cuota abierto** | Cada consulta cuesta 100 u. de cuota (~100 búsquedas/día); decisión pendiente del equipo |
| B05 Información y miniaturas | Título, artista, duración y miniatura | `CancionItem.kt`, `DetalleScreen.kt`, Coil | Parseo y formato de duración; verificado en teléfono | `inc4-dispositivo-02`, `-03` | **Verificada en dispositivo físico (backend local)** | En el emulador las miniaturas fallaban por TLS interceptado por el antivirus; en el teléfono cargan bien |
| B16 Integración YouTube | Búsqueda con YouTube Data API v3, errores explícitos | `backend/src/youtube.js` | 14 backend (mock) + 3 **reales** contra YouTube | `npm run test:real`; `inc4-dispositivo-02`, `-03` | **Verificada en dispositivo físico (backend local)** | Sin despliegue; cuota diaria limitada; validación de disponibilidad y reproducción son de E4+ |

Pendiente para B01, B02 y B07: host público HTTPS con App Links verificados, QR físico escaneado, cliente web probado sin la app, sesiones reales (E5) y envío del ID en eventos (incremento 5). Para B04: decisión sobre la cuota. Para B03/B16: probar con un backend desplegado.
