# Matriz de versiones del cliente Android (Entregable 3)

Verificada el 2026-11-05 contra las notas de versión oficiales de AGP y contra Google Maven.

| Componente | Versión | Justificación |
|---|---|---|
| JDK (Gradle) | Temurin 21.0.6 (instalado) | AGP 9.5 exige mínimo JDK 17; 21 es compatible. El bytecode se genera para Java 17 (`compileOptions`). |
| Gradle | 9.6.0 | Es el mínimo y la versión por defecto de AGP 9.5.0. Ya estaba en la caché local. |
| Android Gradle Plugin | 9.5.0 | Publicado en Google Maven y estable. Soporta hasta API 37, que es la plataforma instalada (`android-37.0`). Las versiones 9.1 y 9.4 en caché no cubren API 37. |
| SDK Build Tools | 36.0.0 (instalado) | Mínimo requerido por AGP 9.5.0. |
| compileSdk / targetSdk | 37 | Plataforma instalada. |
| minSdk | 26 | Fuentes variables (Manrope) y `java.time`; cubre prácticamente todos los móviles actuales. |
| Kotlin | 2.4.21 | Estable. AGP 9 trae soporte integrado de Kotlin, por eso no se aplica `org.jetbrains.kotlin.android`. |
| Compose Compiler | plugin `org.jetbrains.kotlin.plugin.compose` 2.4.21 | Debe coincidir con la versión de Kotlin. |
| Compose BOM | 2026.09.00 | Última estable. |
| Activity Compose | 1.13.0 | Última estable (1.14 solo alpha). |
| Navigation Compose | 2.10.2 | Última estable. |
| Lifecycle (runtime/viewmodel compose) | 2.11.0 | Última estable (2.12 solo alpha). |
| core-ktx | 1.17.0 | Versión fijada sin comprobar si hay una más reciente. |
| JUnit | 4.13.2 | Pruebas unitarias locales. |

Las dependencias de red (Retrofit, serialización, Coil), DataStore y de pruebas de ViewModel se añadirán en los incrementos 3 y 4.

## Nota de entorno (equipo de Santiago)

En el equipo de desarrollo, Gradle no podía descargar plugins porque el antivirus (Avast) intercepta TLS con un certificado que el JDK no incluye. Solución local, sin tocar el repositorio:

```bash
./gradlew -Dorg.gradle.jvmargs="-Xmx2g -Djavax.net.ssl.trustStoreType=Windows-ROOT" testDebugUnitTest assembleDebug
```

Android Studio usa el almacén de Windows automáticamente. GitHub Actions no necesita esta opción.

## Pendiente de verificar

`core-ktx` 1.17.0 y el comportamiento de la fuente variable en un dispositivo real (solo se comprobó que compila).
