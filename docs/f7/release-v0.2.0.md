# Release PONGA PUES v0.2.0 (`versionCode = 2`)

## Metadatos del paquete verificado
- **Archivo sugerido para GitHub Release (`v0.2.0`):** `ponga-pues-0.2.0.apk`
- **Copia local temporal generada (fuera del repositorio):** `C:\Users\JASBLEIDY\.gemini\antigravity\brain\126fa65e-007e-4c10-8a04-81803825e7d1\scratch\release\ponga-pues-0.2.0.apk`
- **Application ID:** `co.edu.cue.nuclear.cliente`
- **Versión:** `0.2.0` (`versionCode = 2`)
- **Nombre visible:** `PONGA PUES`
- **SDK mínimo / objetivo:** `minSdk 26` (Android 8.0) / `targetSdk 37`
- **Tamaño real:** `36723861` bytes (~35.02 MB)
- **SHA-256 del APK:** `42ae97303460ee09b80e99f22a227b95ea47afdc25f7196a1e5c607f7e780ee5`
- **BACKEND_URL compilada:** `https://proyecto-nuclear-vii-production.up.railway.app/`
- **Host App Link compilado:** `proyecto-nuclear-vii-production.up.railway.app`

## Firma y huella digital para App Links (`ANDROID_SHA256_CERT`)
- **Keystore privado (fuera del repositorio):** `%USERPROFILE%\.ponga-pues\ponga-pues-release.jks` (respaldar de forma segura; **NO subir a Git**).
- **DN del certificado:** `CN=PONGA PUES, O=Proyecto Nuclear VII, C=CO`
- **SHA-256 del certificado (formato para Railway `ANDROID_SHA256_CERT`):**
  ```text
  F4:0A:CC:18:BC:50:47:F2:66:3B:CA:42:D1:43:9E:4E:3F:E3:84:50:38:1B:42:65:DD:C3:3E:12:65:21:7F:F5
  ```
- **Nota de compatibilidad:** mientras no se actualice `ANDROID_SHA256_CERT` en Railway con la huella anterior, la verificación automática de Android App Links (`autoVerify`) con esta firma fallará al abrir URLs desde la cámara externa; sin embargo, el escáner QR integrado dentro de PONGA PUES y el ingreso por código de 6 dígitos funcionan directamente sin depender de `assetlinks.json`.

## Aviso obligatorio para instalaciones previas
> Las instalaciones previas firmadas con clave de desarrollo (*debug*) utilizan un certificado distinto y **deben desinstalarse manualmente** antes de instalar `ponga-pues-0.2.0.apk`.

## Pasos autorizados pendientes para publicar el Release
1. Subir el tag/release `v0.2.0` en GitHub (`https://github.com/slopez1023/proyecto-nuclear-vii/releases`) adjuntando `ponga-pues-0.2.0.apk` desde la ruta scratch indicada arriba.
2. Verificar que la URL pública resultante coincida exactamente con:
   `https://github.com/slopez1023/proyecto-nuclear-vii/releases/download/v0.2.0/ponga-pues-0.2.0.apk`
3. Cambiar `"publicado": false` a `"publicado": true` en `backend/data/descarga/apk.json` (o ejecutar `node backend/scripts/generar-manifiesto-apk.js <rutaApk> 0.2.0 2 <urlRelease> --publicado`).
4. Cuando autorices actualizar producción en Railway:
   - Actualizar `ANDROID_SHA256_CERT` si deseas habilitar App Links para esta firma *release*.
   - Hacer `git push` / PR hacia `develop` para disparar el autodeploy y la ejecución de migraciones (`107_f7_codigo_acceso.sql`).
