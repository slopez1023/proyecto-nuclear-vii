# Incremento 4 — Búsqueda, autocompletado, detalle e integración YouTube (B03, B04, B05, B16)

## Estado real de cada historia

| Historia | Estado | Verificado | Falta |
|---|---|---|---|
| B16 Integración con YouTube | **Parcial (backend verificado)** | Pruebas reales contra YouTube Data API v3 con la clave de `backend/.env`: llegan `youtube_video_id`, título, canal, duración y miniatura, y el backend los entrega por `/api/busqueda`. Clave inválida real se clasifica como `api_key_invalida`. | No se vio el resultado real en la app Android (ver "Bloqueo"). La validación de disponibilidad y la reproducción son de entregables posteriores. |
| B03 Búsqueda de canciones | **Parcial** | Android → `GET /api/busqueda` implementado; estados de carga, vacío y error; 14 pruebas del repositorio con servidor simulado y 13 del ViewModel. Backend verificado con YouTube real. | Falta la prueba de extremo a extremo en dispositivo/emulador y la medición de <2 s. |
| B04 Autocompletado | **Parcial** | Espera 450 ms tras la última tecla, solo con 3+ caracteres, descarta respuestas viejas; probado con tiempo virtual. Backend devuelve sugerencias reales. | Misma prueba pendiente en dispositivo. Ver riesgo de cuota abajo. |
| B05 Información y miniaturas | **Parcial** | Resultados y detalle muestran título, canal, duración, miniatura (Coil) y el ID de YouTube (en el detalle). | No se vieron miniaturas reales renderizadas en pantalla. |

## Bloqueo: disco lleno, sin prueba en emulador

Al intentar la prueba de extremo a extremo, el disco `C:` estaba al 100 %. Arrancar el emulador `Pixel_10_ProyectoNuclear` escribe unos 3.2 GB en `~/.android/avd/Pixel_10_ProyectoNuclear.avd/userdata-qemu.img.qcow2`, lo que agotó el espacio. Lo detuve a tiempo y no borré nada del AVD. Con más de 8 GB libres se puede ejecutar la prueba (pasos abajo). El archivo de usuario del AVD podría haber quedado inconsistente por el corte; si el emulador no arranca, usar *Cold Boot* o *Wipe Data* desde Android Studio.

## Riesgo de cuota (decisión para el equipo)

La API oficial cobra **100 unidades por cada `search.list`** y la cuota diaria por defecto es de 10 000, es decir, unas **100 búsquedas al día por clave**. El autocompletado usa también `search.list`, por lo que cada sugerencia consume una búsqueda. Mitigaciones implementadas: mínimo 3 caracteres, espera de 450 ms, caché de 5 minutos en backend y en la app. Aun así, un piloto con varios usuarios agotaría la cuota. Opciones a decidir con Juan Camilo: solicitar ampliación de cuota a Google, desactivar el autocompletado remoto, o usar una fuente de sugerencias distinta (el endpoint de sugerencias de Google no es oficial y no se usó).

## Qué se hizo

- Backend: `clasificarError` traduce los errores de YouTube a códigos estables (`cuota_excedida`, `api_key_invalida`, `youtube_no_autorizado`, `youtube_error`) sin incluir URL ni clave en los mensajes. Prueba real opcional en `backend/test-real/youtube.real.js` (`npm run test:real`, consume cuota).
- Android: `BusquedaApi`/`BusquedaRepository` (caché con vencimiento, errores no cacheados), `BuscarViewModel`, pantallas Inicio, Buscar y Detalle, componente `CancionItem` y miniaturas con Coil.
- La app solo habla con el backend; la clave nunca está en Android.
- Mensajes de error: sin conexión y error de servidor ofrecen "Reintentar"; cuota agotada, servicio no disponible y consulta inválida no lo ofrecen porque reintentar no sirve.

## Pruebas ejecutadas

| Suite | Resultado | Tipo |
|---|---|---|
| Backend `npm test` | 14/14 | Unitarias e integración HTTP, YouTube **simulado** |
| Backend `npm run test:real` | 3/3 | **YouTube real**: búsqueda con campos válidos, búsqueda sin resultados, clave inválida |
| Android `testDebugUnitTest` | 65/65, 0 fallos | `BusquedaRepositoryTest` 14 (MockWebServer), `BuscarViewModelTest` 13, `CancionTest` 4, más las del incremento 3 |
| Android `assembleDebug` | BUILD SUCCESSFUL | Compilación |

Búsqueda real realizada por el backend local: "Bohemian Rhapsody Queen" → 10 resultados con ID, título, canal, duración en segundos y miniatura `https://i.ytimg.com/...`. "Shakira" → 5 sugerencias.

## Seguridad de la clave

- `backend/.env` está en `.gitignore`, no está trackeado y la clave no aparece en ningún otro archivo del repositorio ni en el historial.
- `backend/.env.example` no tiene valor.
- Los mensajes de error no incluyen la clave (hay una prueba para eso).

## Cómo completar la prueba de extremo a extremo

```bash
# 1) Liberar espacio en C: (al menos 8 GB) y abrir el emulador
cd backend && npm start
adb reverse tcp:3000 tcp:3000
cd ../cliente-android && ./gradlew installDebug
adb shell am start -a android.intent.action.VIEW -d "https://nuclear.example.com/s/demo-activa-001" co.edu.cue.nuclear.cliente
# Entrar → Buscar una canción → escribir "Queen" (aparecen sugerencias) → buscar → tocar un resultado
```
