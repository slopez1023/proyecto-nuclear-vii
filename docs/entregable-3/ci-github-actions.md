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
| **Ejecución real en GitHub** | **No realizada.** No se ha hecho `push`; hasta entonces no hay evidencia de que los workflows funcionen en los servidores de GitHub |

## Limitaciones y riesgos conocidos

- Las acciones se fijan a la etiqueta mayor (p. ej. `@v7`), no a un hash de commit: se actualizan solas con versiones menores y es una práctica aceptada, pero un fijado por hash sería más estricto.
- El paso de Android depende de que `sdkmanager` ofrezca `platforms;android-37.0` y `build-tools;36.0.0` (están instalados en el equipo de desarrollo). La primera ejecución descarga Gradle y las dependencias, por lo que tardará más.
- No hay pruebas instrumentadas ni de interfaz en CI; solo pruebas unitarias.
- Se espera que el primer `push` pueda requerir ajustes menores; en ese caso hay que documentarlos aquí.
