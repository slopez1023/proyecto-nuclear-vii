# Integración continua con GitHub Actions (Incremento 6)

## ¿Es un requisito del Entregable 3?

**No.** Se revisó el texto completo de la guía oficial (`GUIA_PROYECTO_NUCLEAR_MOVILES-BIGDATA_2S-2026.pdf`) buscando CI/CD, integración continua, GitHub, Actions, pipelines de despliegue, automatización y DevOps, y no hay ninguna mención. El E3 pide el módulo de acceso y búsqueda, no automatización de compilación.

Es una **mejora adicional** de calidad (ámbito de integración y calidad, Juan Camilo): detecta errores de compilación y de pruebas antes de integrar cambios y deja evidencia repetible. No bloquea la entrega del E3. No hay despliegue continuo: el backend no está desplegado y no se publica ninguna aplicación.

## Workflows

| Archivo | Se ejecuta cuando cambia | Qué hace |
|---|---|---|
| `.github/workflows/android.yml` | `cliente-android/**`, `backend/test/fixtures/**` (contrato de eventos) o el propio workflow | JDK 21, Android SDK (plataforma 37 y Build Tools 36.0.0), `./gradlew testDebugUnitTest assembleDebug`; sube los reportes de pruebas y el APK de depuración |
| `.github/workflows/backend.yml` | `backend/**` o el propio workflow | Node 20, `npm ci`, `npm test` (unitarias, HTTP y contrato de eventos con YouTube simulado) |

Ambos corren en `push` a `develop` y `main`, en `pull_request` y a mano (`workflow_dispatch`). Usan `permissions: contents: read`, cancelan ejecuciones repetidas de la misma rama y tienen límite de tiempo.

## Versiones de las acciones (verificadas el 2026-11-05)

Se consultó la API de GitHub: la última versión publicada y la existencia de la etiqueta mayor que se usa.

| Acción | Etiqueta usada | Última versión publicada |
|---|---|---|
| `actions/checkout` | `v7` | v7.0.1 |
| `actions/setup-java` | `v6` | v6.2.0 |
| `actions/setup-node` | `v7` | v7.1.0 |
| `gradle/actions/setup-gradle` | `v6` | v6.4.1 |
| `android-actions/setup-android` | `v4` | v4.0.4 |
| `actions/upload-artifact` | `v7` | v7.0.2 |

Las entradas usadas (`distribution`, `java-version`, `packages`, `node-version`, `cache`) existen en esas versiones. Las versiones de Java (21), Gradle (9.6.0), AGP (9.5.0), Kotlin (2.4.21) y SDK están en `versiones-android.md` y son las mismas con las que se compiló en el equipo de desarrollo.

## Seguridad

- Los workflows **no usan secretos** ni la `YOUTUBE_API_KEY`. Las pruebas reales contra YouTube (`npm run test:real`) no se ejecutan en CI porque consumen cuota (cupo de 100 búsquedas al día) y necesitan la clave local.
- Cada workflow incluye un paso que falla si encuentra en el repositorio algo con forma de clave de Google (`AIza` seguido de 35 caracteres), excepto en archivos `.md`.
- El APK que se sube es de depuración y apunta a `localhost`; no contiene credenciales. No se genera ni publica ningún APK de producción.

## Cómo ejecutarlos y verificarlos

1. **Automático:** al hacer `push` a `develop` o `main`, o al abrir un *pull request* que toque las rutas de la tabla, aparecen en la pestaña **Actions** del repositorio.
2. **Manual:** en **Actions**, elegir el workflow y pulsar **Run workflow**.
3. **Resultado:** el estado verde/rojo aparece junto al commit y en el PR. En el workflow de Android, los artefactos `android-reportes-de-pruebas` y `android-apk-debug` quedan descargables en la página de la ejecución.
4. **Equivalente local** (los mismos comandos que ejecuta el CI):
   ```bash
   # Backend
   cd backend && npm ci && npm test

   # Android (en Windows con antivirus que intercepta TLS, ver versiones-android.md)
   cd cliente-android && ./gradlew testDebugUnitTest assembleDebug
   ```

## Qué se verificó y qué no

| Verificación | Resultado |
|---|---|
| Sintaxis y estructura de los dos YAML | Correcta (cargados con un analizador YAML; disparadores, trabajos y pasos esperados) |
| Pasos del job de backend en una copia limpia del código (`npm ci` + `npm test`) | 16 de 16 pruebas pasan |
| Guardia de claves sobre el código versionado | Sin coincidencias |
| Permiso de ejecución de `gradlew` | Estaba versionado como no ejecutable (100644), lo que habría fallado en Linux; se corrigió a 100755 |
| Compilación y pruebas de Android desde una exportación limpia de lo versionado (`git archive`, sin archivos sin versionar) | BUILD SUCCESSFUL, 83 de 83 pruebas, APK de depuración generado: no faltan archivos en Git |
| **Ejecución real en GitHub** | **Realizada el 2026-11-06 tras el primer `push`: Backend correcto; Android falló en el primer intento y pasó al repetir el job fallido sin cambios** (83 de 83 pruebas). Detalle en "Primera ejecución en GitHub" |

## Limitaciones y riesgos conocidos

- Las acciones se fijan a la etiqueta mayor (p. ej. `@v7`), no a un hash de commit: se actualizan solas con versiones menores y es una práctica aceptada, pero un fijado por hash sería más estricto.
- El paso de Android depende de que `sdkmanager` ofrezca `platforms;android-37.0` y `build-tools;36.0.0` (están instalados en el equipo de desarrollo). La primera ejecución descarga Gradle y las dependencias, por lo que tardará más.
- No hay pruebas instrumentadas ni de interfaz en CI; solo pruebas unitarias.
- El workflow de Android falló en el primer intento de su primera ejecución real y pasó en el segundo sin cambiar nada; una sola ejecución exitosa no demuestra que el fallo no pueda repetirse (ver sección siguiente).

## Primera ejecución en GitHub (2026-11-06)

Se publicó `develop` (commit `ba378ef`) el 2026-11-06 a las 05:03 UTC y se activaron los dos workflows. Los datos se obtuvieron con GitHub CLI mediante consultas de solo lectura; la única acción de escritura fue el reintento autorizado del job fallido, descrito más abajo.

| Workflow | Resultado | Duración | Ejecución |
|---|---|---|---|
| Backend | **Correcto** (`success`) | ~17 s | [42166116879](https://github.com/slopez1023/proyecto-nuclear-vii/actions/runs/42166116879) |
| Android, intento 1 | **Fallido** (`failure`) | ~81 s | [42166116989](https://github.com/slopez1023/proyecto-nuclear-vii/actions/runs/42166116989) |
| Android, intento 2 (reintento del job fallido, sin cambios) | **Correcto** (`success`) | ~5 min | misma ejecución, intento 2 |

### Backend: correcto
Todos los pasos terminaron bien: `checkout`, guardia de claves, `setup-node`, `npm ci` y `npm test`. Es el resultado esperado según la simulación local en copia limpia.

### Android, intento 1: fallido
- Pasos correctos: `checkout`, guardia de claves, `setup-java`, `setup-android`, `setup-gradle` y la descarga de Gradle 9.6.0.
- **Paso fallido:** "Pruebas unitarias y APK de depuración" (`./gradlew testDebugUnitTest assembleDebug`), a los ~46 s, antes de compilar nada. Por eso no se subió el APK (paso omitido) y no hay reportes de pruebas que subir.
- Error textual de Gradle:
  ```
  Build file '.../cliente-android/build.gradle.kts' line: 2
  Plugin [id: 'org.jetbrains.kotlin.plugin.compose', version: '2.4.21', apply: false] was not found in any of the following sources:
  - Plugin Repositories (could not resolve plugin artifact 'org.jetbrains.kotlin.plugin.compose:org.jetbrains.kotlin.plugin.compose.gradle.plugin:2.4.21')
    Searched in the following repositories: Google, MavenRepo, Gradle Central Plugin Repository
  BUILD FAILED in 46s
  ```

### Diagnóstico

**Hechos comprobados**
- El plugin `org.jetbrains.kotlin.plugin.compose` 2.4.21 existe: se publicó el 2026-10-08 y el 2026-11-06 responde HTTP 200 en `repo.maven.apache.org`, `repo1.maven.org` y `plugins.gradle.org`. No es un problema de propagación reciente.
- Una exportación limpia de `develop` con la caché de Gradle vacía, en el equipo de desarrollo, termina con `BUILD SUCCESSFUL`: el plugin se descarga de `repo.maven.apache.org` y se resuelve. La configuración de repositorios de `settings.gradle.kts` (Google, Maven Central, Gradle Plugin Portal) es correcta.
- El mensaje "was not found in any of the following sources" no distingue entre un artefacto inexistente y una descarga que falla por red: ya apareció antes en este proyecto cuando el problema real era TLS interceptado.
- El registro del runner no incluye el detalle de las peticiones HTTP, porque Gradle se ejecutó sin `--info`.

**Causa raíz: no determinada.** La hipótesis más probable es un fallo de red del runner hacia Maven Central o el Plugin Portal en ese momento (transitorio o por límite de peticiones), pero no está confirmada: el registro del intento 1 no incluye detalle de la petición.

### Android, intento 2: correcto
Se repitió únicamente el job fallido con `gh run rerun 42166116989 --failed`, sin modificar código, workflows, dependencias ni versiones. Mismo commit (`ba378ef`).

- **Resultado:** `completed / success`, del 2026-11-06 05:22:53 al 05:28:00 UTC (unos 5 minutos). Todos los pasos terminaron bien.
- **Gradle:** `BUILD SUCCESSFUL in 4m 38s`, 45 tareas (44 ejecutadas, 1 desde caché). Resolvió el plugin que había fallado y ejecutó `testDebugUnitTest` y `assembleDebug` con la plataforma 37 y las Build Tools 36 que configura `setup-android` (el paso terminó bien; no se inspeccionó si descargó los paquetes o ya estaban instalados).
- **Pruebas en GitHub** (leídas del artefacto `android-reportes-de-pruebas`): **83 pruebas, 0 fallos, 0 errores, 0 omitidas**, en 9 clases. Eso incluye `EventosRepositoryTest`, que lee el contrato compartido `backend/test/fixtures/eventos-e3.json`, por lo que la lectura de ese archivo entre carpetas también funciona en Linux.
- **Artefactos generados:** `android-reportes-de-pruebas` (~29 KB, vence el 2027-02-04) y `android-apk-debug` (~14 MB, vence el 2026-11-13).

### Conclusión sobre el fallo del intento 1

El fallo de resolución del plugin `org.jetbrains.kotlin.plugin.compose` fue **aparentemente transitorio**: el mismo commit y la misma configuración pasaron al repetir el job. **La causa no está comprobada.** El registro del intento 1 no incluye el detalle de la petición HTTP, así que no se puede afirmar si fue un problema de red del runner, un límite de peticiones u otra causa. No se pudo descartar que vuelva a ocurrir.

Lo que sí se comprobó antes del reintento: el plugin existe y es accesible en los tres repositorios configurados, y una exportación limpia de `develop` con la caché vacía compila en el equipo de desarrollo.

### Siguiente paso recomendado (pendiente de autorización)
- Mejora opcional para diagnosticar un futuro fallo: añadir `--stacktrace --info` al comando de Gradle del workflow, o un reintento automático del paso, si el fallo reaparece. No se aplicó ningún cambio.
- Observar las siguientes ejecuciones (por ejemplo, la del próximo `push`) antes de dar el CI por estable.

### Estado del CI
- **Backend:** correcto.
- **Android:** correcto en el segundo intento del job; falló en el primero por un error de resolución de plugin de causa no comprobada.
- No hay evidencia de estabilidad (una sola ejecución con un intento fallido y uno correcto). Se mantiene como mejora adicional del E3, no como requisito.
