'use strict';
(function () {
  const btn1 = document.getElementById('btn-descarga');
  const btn2 = document.getElementById('btn-descarga-2');
  const heroMeta = document.getElementById('hero-meta');
  const estadoAviso = document.getElementById('estado-aviso');
  const metaVersion = document.getElementById('meta-version');
  const metaTamano = document.getElementById('meta-tamano');
  const metaFecha = document.getElementById('meta-fecha');
  const metaAndroid = document.getElementById('meta-android');
  const metaSha = document.getElementById('meta-sha');
  const btnCopiarSha = document.getElementById('btn-copiar-sha');

  function formatMb(bytes) {
    if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes <= 0) return 'No disponible';
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB (${bytes.toLocaleString('es-CO')} bytes)`;
  }

  function fijarBotones(habilitado, texto) {
    [btn1, btn2].forEach((b) => {
      if (!b) return;
      b.textContent = texto;
      if (habilitado) {
        b.classList.remove('is-disabled');
        b.setAttribute('aria-disabled', 'false');
        b.setAttribute('href', '/descargar/app.apk');
      } else {
        b.classList.add('is-disabled');
        b.setAttribute('aria-disabled', 'true');
        b.removeAttribute('href');
      }
    });
  }

  function fijarEstado(clase, texto) {
    estadoAviso.className = `status-box ${clase}`;
    estadoAviso.textContent = texto;
  }

  async function cargarMetadatos() {
    try {
      const resp = await fetch('/api/descarga', { cache: 'no-store' });
      const data = await resp.json().catch(() => null);
      if (!resp.ok || !data) {
        fijarBotones(false, 'Disponible pronto');
        heroMeta.textContent = 'Paquete en preparación.';
        fijarEstado('warn', (data && data.error && data.error.mensaje) || 'La descarga pública del APK aún no está publicada.');
        metaVersion.textContent = 'Pendiente de publicación';
        metaTamano.textContent = 'Pendiente de publicación';
        metaFecha.textContent = 'Pendiente de publicación';
        metaSha.textContent = 'Pendiente de publicación';
        return;
      }

      const ver = data.version_name
        ? `v${data.version_name}${data.version_code != null ? ` (código ${data.version_code})` : ''}`
        : 'Sin versión';
      metaVersion.textContent = ver;
      metaTamano.textContent = formatMb(data.tamano_bytes);
      metaFecha.textContent = data.fecha_publicacion || 'Pendiente';
      metaAndroid.textContent = data.android_minimo || 'Android 8.0 (API 26)';
      metaSha.textContent = data.sha256 || 'No disponible';

      if (data.sha256 && btnCopiarSha) {
        btnCopiarSha.disabled = false;
        btnCopiarSha.addEventListener('click', async () => {
          try {
            await navigator.clipboard.writeText(data.sha256);
            btnCopiarSha.textContent = 'Copiado';
            setTimeout(() => { btnCopiarSha.textContent = 'Copiar'; }, 1800);
          } catch {}
        });
      }

      if (data.publicado) {
        fijarBotones(true, 'DESCARGAR PONGA PUES');
        heroMeta.textContent = `${ver} · ${formatMb(data.tamano_bytes)}`;
        fijarEstado('ok', 'Paquete oficial verificado y listo para descargar.');
      } else {
        fijarBotones(false, 'Disponible pronto');
        heroMeta.textContent = `${ver} · Compilada, pendiente de publicación pública.`;
        fijarEstado('warn', 'El paquete ya fue compilado, pero el enlace de descarga público todavía está deshabilitado.');
      }
    } catch {
      fijarBotones(false, 'Error al consultar');
      heroMeta.textContent = 'No se pudo comprobar la versión disponible.';
      fijarEstado('err', 'Error de red al consultar los metadatos de descarga. Recarga la página.');
    }
  }

  cargarMetadatos();
})();
