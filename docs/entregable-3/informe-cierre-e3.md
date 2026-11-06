# Informe de cierre y auditoría — Entregable 3

**Proyecto Nuclear VII — Módulo de acceso y búsqueda para clientes (PMV).**
Elaborado el 2026-11-05 a partir del estado del repositorio (rama `develop`, último commit antes de este informe: `9eeddf1`). Todo lo que figura como probado se ejecutó; lo que no se hizo figura como pendiente. Este informe **no registra reuniones ni aprobaciones del equipo**: donde hace falta una decisión o una revisión se indica "pendiente".

## 1. Resumen ejecutivo

El núcleo funcional del E3 funciona de punta a punta en un teléfono físico (TECNO KL8, Android 14): acceso por enlace de QR, validación de sesión, búsqueda real en YouTube con autocompletado, resultados con título, canal, duración y miniatura, detalle de canción, identificación seudónima del dispositivo y envío de dos eventos de uso. Quedan sin cerrar las piezas que dependen de infraestructura que aún no existe (host público HTTPS, sesiones reales) y varias comprobaciones manuales (QR físico, tableta, usabilidad). **Ninguna historia se declara completa.**

## 2. Estado de cada historia

| Historia | Estado | Responsable principal | Resumen |
|---|---|---|---|
| B01 Acceso por QR | **Parcial** | Santiago (Android), Juan Camilo (criterios) | El QR generado decodifica a la URL correcta y la app valida el token contra el backend, pero las sesiones son simuladas y los App Links no se pudieron verificar |
| B02 Acceso sin registro ni descarga | **Parcial** | Santiago | La app y el cliente web de respaldo no piden registro ni datos personales; el cliente web funciona en Chrome del teléfono solo por HTTP local |
| B03 Búsqueda | **Verificada en dispositivo físico (backend local)** | Santiago | Búsqueda real; datos listos en 0.57–1.14 s |
| B04 Autocompletado | **Verificada funcionalmente; riesgo de cuota abierto** | Santiago, Karen (cuota/eventos) | Funciona; cada sugerencia gasta una de las 100 llamadas diarias de `search.list` |
| B05 Información y miniaturas | **Verificada en dispositivo físico** | Santiago | Miniaturas reales en lista, detalle y cliente web |
| B07 Identificación única | **Verificada en dispositivo físico** | Santiago, Karen (privacidad) | UUID persistente sin datos personales, presente en los eventos |
| B16 Integración YouTube | **Verificada en dispositivo físico (backend local)** | Santiago, Juan Camilo | Datos reales de YouTube Data API v3 por el backend; errores clasificados |

"Verificada" significa probada con datos y servicios reales, pero con el backend ejecutándose en el equipo de desarrollo y el acceso lanzado con `adb`, no con un QR escaneado.

## 3. Criterios de aceptación

Fuentes: texto del E3 y criterio 2 de la rúbrica de la guía; historias HU-01 y HU-02 y requisitos del documento del proyecto; condiciones de tecnologías mínimas de móviles.

### Guía oficial (E3) y rúbrica (criterio 2)

| Criterio | Estado | Evidencia / motivo |
|---|---|---|
| Código QR único y operativo que redirige a la aplicación del establecimiento | **Parcial** | QR por sesión (`qr_token`) generado con `backend/scripts/generar-qr.js` y decodificado con un lector independiente a `https://nuclear.example.com/s/demo-activa-001` (`evidencias/qr-demo-activa-001.png`). Falta: escaneo físico y redirección real (host público) |
| Interfaz optimizada para smartphones y tabletas | **Parcial** | Verificada en teléfono (720×1600) y emulador. **Tableta no probada** |
| Caja de búsqueda con autocompletado | **Cumplido** | `inc4-dispositivo-01` |
| Integración con YouTube mostrando título, artista, duración y miniatura | **Cumplido** | `inc4-dispositivo-02`, `-03` |
| Identificación única de dispositivo | **Cumplido** | UUID en DataStore, igual entre aperturas |
| La aplicación abre sin descargas, instalaciones ni registro | **Parcial** | Sin registro: sí. Sin instalación: solo el cliente web, probado por HTTP local (`inc6-web-*`); no con un host HTTPS público ni desde un teléfono sin la app |
| Operaciones principales en menos de 2 s | **Parcial** | Datos listos en 0.57–1.14 s (10 muestras, backend local). Sin medir con backend desplegado ni percepción formal |
| Resultados provienen de la API de YouTube | **Cumplido** | Pruebas reales y capturas |
| Dispositivo identificado sin datos personales | **Cumplido** | UUID aleatorio; sin IMEI, teléfono ni ANDROID_ID |
| Legible y operable con una sola mano en teléfono | **No verificado formalmente** | Botones de 52 dp o más y texto legible en las capturas; no hubo prueba de uso con personas |
| Instrumentar eventos de uso (insumo para analítica) | **Cumplido para los eventos de E3** | `dispositivo_unido`, `busqueda_realizada` |

### HU-01 (acceso por QR) y HU-02 (búsqueda)

| Criterio | Estado |
|---|---|
| El QR identifica establecimiento y sesión | Cumplido con sesiones **simuladas** (`SES-MOCK-*`) |
| Entrar sin cuenta ni datos personales | Cumplido |
| Sesión cerrada/inexistente/QR desactivado/token inválido: aviso claro, sin solicitudes ni votos | Cumplido (4 motivos verificados en emulador); solicitudes y votos son de E4 |
| Las interacciones quedan asociadas a la sesión del QR | Cumplido: los eventos llevan `sesion_id` |
| Búsqueda en YouTube con título, canal, duración y miniatura | Cumplido |
| Estado de carga y mensaje sin resultados | Cumplido |
| Errores de red, API o cuota no bloquean la interfaz | Cumplido para red (verificado sin servidor), clave inválida (real) y cuota (solo pruebas con respuesta simulada; no se agotó la cuota real) |

## 4. Auditoría por responsabilidades

### Desarrollo y arquitectura Android (Santiago)
- Kotlin + Compose, Gradle 9.6.0, AGP 9.5.0, Kotlin 2.4.21, minSdk 26, compileSdk 37 (matriz en `versiones-android.md`).
- Capas simples (datos, pantallas, navegación), un contenedor de dependencias manual y tema tomado del prototipo de Figma, con el logo oficial.
- Pantallas del E3: acceso, QR inválido, inicio (reducida), buscar, detalle. No se implementó nada de E4–E8.
- Observaciones: queda sin uso `PantallaProvisional.kt` (del andamiaje); las sugerencias del autocompletado son títulos completos de videos, no términos de búsqueda, lo que es funcional pero poco refinado.

### Backend y comunicación (Santiago / Juan Camilo)
- Node 20 + Express: sesiones (datos simulados, validación real), búsqueda y sugerencias, eventos, cliente web de respaldo, `assetlinks.json`, generador de QR.
- La clave de YouTube solo está en `backend/.env` (ignorado por Git); Android nunca consulta YouTube.
- Limitaciones: no está desplegado; las sesiones son un archivo JSON de demostración; el almacenamiento de eventos es un archivo local.

### Requisitos y criterios de aceptación (Juan Camilo)
- Se contrastó el alcance con la guía: el E3 son 7 historias; el resto del backlog (B06, B08–B15, B17–B20) corresponde a E4–E8.
- **Contradicciones del material, pendientes de aclarar:** (a) la guía habla de plataformas low-code y de Android Studio a la vez; (b) el documento del proyecto describe una interfaz "web por QR" y una app nativa; B02 pide "sin descarga" y una app nativa exige instalación (por eso existe el cliente web de respaldo); (c) la regla de votación (2/4/6/8 canciones frente a 15 reproducciones) afecta al E4.
- La fecha oficial del E3 era el 23 de octubre de 2026 y ya pasó: pendiente confirmar el trato con el docente.

### Calidad y pruebas (Juan Camilo)

| Suite | Resultado | Naturaleza |
|---|---|---|
| Android `testDebugUnitTest` | 83 de 83 | Unitarias; repositorios con servidor HTTP simulado (MockWebServer) |
| Backend `npm test` | 17 de 17 | Unitarias, HTTP, contrato de eventos; YouTube simulado |
| Backend `npm run test:real` | 3 de 3 | YouTube **real** (búsqueda, sin resultados, clave inválida) |
| Compilación desde exportación limpia de lo versionado | Correcta | Reproduce lo que hará el CI |
| Prueba en teléfono físico | Correcta | Flujo completo con YouTube real |
| Prueba en emulador | Correcta salvo miniaturas | Las miniaturas fallaban por TLS interceptado en el equipo de desarrollo |
| GitHub Actions | **No ejecutado** | Sin `push`; ver `ci-github-actions.md` |

No hay pruebas instrumentadas de interfaz ni pruebas de usabilidad con usuarios.

### Eventos y tratamiento de datos (Karen)
- Implementados solo `dispositivo_unido` y `busqueda_realizada`, con los nombres del documento del proyecto. Verificado en teléfono con 6 eventos guardados (4 desde la app, 2 desde el cliente web).
- El envío es de mejor esfuerzo: sin red el evento se pierde. No existe pipeline, tablero ni procesamiento (E6).
- **Pendiente de revisión de Karen:** el significado de `recurrente`, el criterio de "búsqueda aceptada" y la conservación del término de búsqueda.

### Privacidad y gobernanza (Karen)
- El identificador es un UUID aleatorio, sin datos personales, sin permisos sensibles y sin IMEI ni ANDROID_ID.
- **Riesgo:** el término de búsqueda es texto libre y puede contener datos personales si el usuario los escribe. Se recorta a 100 caracteres, pero no se filtra.
- El UUID es seudónimo, no anónimo (la propia política del proyecto lo distingue). Plazos de conservación, eliminación y consentimiento siguen sin definir en el documento del proyecto.
- El archivo local `backend/data/eventos.jsonl` (ignorado por Git) contiene eventos de las pruebas con el UUID del teléfono usado.

### Documentación y trazabilidad (Juan Camilo)
- `docs/entregable-3/`: `versiones-android.md`, `incremento-3-acceso.md`, `incremento-4-busqueda.md`, `incremento-5-eventos.md`, `ci-github-actions.md`, `trazabilidad.md` y este informe.
- Falta un README de ejecución para quien reciba el repositorio (el actual tiene una línea) y la documentación del contrato de la API en un solo lugar (está repartida entre los documentos de incremento).

### Evidencias disponibles (`docs/entregable-3/evidencias/`)
`inc3-*` (acceso, QR desactivado, sesión inexistente), `inc4-01…06` (emulador), `inc4-dispositivo-01…05` (teléfono físico), `inc5-dispositivo-busqueda-queen.png`, `inc6-web-acceso-chrome.png`, `inc6-web-resultados-chrome.png`, `qr-demo-activa-001.png`. Eventos de la prueba real transcritos en `incremento-5-eventos.md`.

## 5. Defectos y riesgos pendientes

| Id | Tipo | Descripción | Impacto |
|---|---|---|---|
| R1 | Riesgo | `search.list` tiene un cupo propio de 100 llamadas al día; el autocompletado gasta del mismo cupo | Un piloto con varios usuarios lo agotaría; hay mensaje de error claro |
| R2 | Limitación | Sesiones simuladas | B01 no puede cerrarse; el módulo real es de E5 |
| R3 | Limitación | Sin host público HTTPS: App Links sin verificar y QR apuntando a un host de ejemplo | El QR de demostración no abre nada fuera de la red local |
| R4 | Limitación | Backend sin desplegar | Los tiempos medidos no incluyen red real hacia un servidor |
| R5 | Defecto menor | Sugerencias = títulos completos de videos | Autocompletado poco pulido |
| R6 | Limitación | Eventos de mejor esfuerzo | Pueden perderse sin red |
| R7 | Riesgo | Término de búsqueda en eventos | Posible dato personal escrito por el usuario |
| R8 | Limitación | Tableta y usabilidad a una mano / baja iluminación sin probar | Criterios de rúbrica sin evidencia |
| R9 | Higiene del repositorio | Siete commits tienen un `Co-Authored-By` que nombra a la herramienta usada para programar | Si el equipo no desea esa referencia en el historial, hay que reescribirlo **antes del primer `push`** (requiere su autorización) |
| R10 | Higiene del repositorio | `CLAUDE.md` en la raíz (sin versionar) hace referencia a la herramienta | Decidir si se versiona o se excluye |
| R11 | Higiene del repositorio | `PantallaProvisional.kt` sin uso | Eliminable con autorización |

## 6. Limitaciones del entorno

- El antivirus del equipo de desarrollo intercepta el tráfico HTTPS: el JDK de Gradle y el emulador rechazan su certificado. Se resolvió pasando una opción a Gradle y probando las miniaturas en un teléfono físico. No se modificó el antivirus ni se instalaron certificados.
- Disco lleno durante una prueba (el emulador necesita ~3.5 GB libres).
- En Windows, DataStore con archivo falla si se escribe dos veces seguidas en pruebas; se usa un DataStore en memoria en esas pruebas.
- Las lecturas de pantalla de `uiautomator` son lentas en el emulador; los tiempos se midieron con un cronómetro interno temporal (ya retirado del código).
- Sin conexión a GitHub: los workflows solo se validaron de forma local.

## 7. Pendientes obligatorios antes de presentar

1. **Escanear un QR físico** con la cámara del teléfono apuntando a una URL alcanzable (por ejemplo, la IP del PC en la misma red Wi-Fi o un host público) y registrar el resultado. Sin esto "QR operativo" no tiene evidencia real.
2. **Aclarar con el docente** la plataforma esperada (nativa o low-code) y el tratamiento de la fecha vencida del E3.
3. **Probar en tableta** o declarar explícitamente que no se probó.
4. **Prueba de usabilidad** a una mano y con poca luz con al menos algunas personas, o declarar que no se hizo.
5. **Revisión de Karen** sobre eventos y privacidad (sección 4).
6. **Decidir qué hacer con R9 y R10** antes de subir el código a GitHub.
7. **Ejecutar los workflows en GitHub** tras el primer `push` y anotar el resultado en `ci-github-actions.md`.
8. **Ratificar con el equipo** la decisión de mantener el autocompletado remoto pese a R1.

## 8. Mejoras opcionales (no bloquean el E3)

- Desplegar el backend y publicar un host HTTPS para verificar App Links y cerrar B01/B02.
- Sugerencias de autocompletado más cortas (términos en lugar de títulos).
- Cola local de eventos con reintentos (o dejarlo al pipeline de E6).
- README de ejecución y documento único del contrato de la API.
- Pruebas instrumentadas de interfaz.
- Fijar las acciones de GitHub por hash de commit.

## 9. Recomendación final

**El entregable es presentable como demostración funcional con limitaciones declaradas, pero no como cerrado.** El flujo central (búsqueda real con autocompletado, miniaturas, detalle, identificación seudónima y eventos) está verificado en un teléfono físico. No debe presentarse como completo el acceso por QR (B01) ni el acceso sin descarga (B02) mientras no existan sesiones reales, un host público y un QR escaneado.

Para llegar a la presentación en buen estado se recomienda, en este orden: pendiente 1 (QR físico en red local), pendiente 2 (aclarar plataforma y fecha), pendientes 3 y 4 (tableta y usabilidad, o declararlos), pendiente 5 (Karen) y pendiente 6 (historial de commits). Con eso, B03, B05, B07 y B16 podrían presentarse como verificadas y B01, B02 y B04 con sus reservas explícitas.
