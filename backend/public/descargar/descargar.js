'use strict';
(function () {
  const btn1 = document.getElementById('btn-descarga');
  const heroMeta = document.getElementById('hero-meta');
  const estadoAviso = document.getElementById('estado-aviso');

  function fijarBoton(habilitado, texto) {
    if (!btn1) return;
    btn1.textContent = texto;
    if (habilitado) {
      btn1.classList.remove('is-disabled');
      btn1.setAttribute('aria-disabled', 'false');
      btn1.setAttribute('href', '/descargar/app.apk');
    } else {
      btn1.classList.add('is-disabled');
      btn1.setAttribute('aria-disabled', 'true');
      btn1.removeAttribute('href');
    }
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
        fijarBoton(false, 'Descarga en preparación');
        heroMeta.textContent = 'Aplicación oficial para Android';
        fijarEstado('warn', (data && data.error && data.error.mensaje) || 'La descarga pública de la aplicación aún no está habilitada.');
        return;
      }

      if (data.publicado) {
        fijarBoton(true, 'DESCARGAR PONGA PUES');
        heroMeta.textContent = 'Aplicación oficial para Android · Instalación directa y segura';
        fijarEstado('ok', 'Aplicación oficial lista para descargar en tu celular Android.');
      } else {
        fijarBoton(false, 'Descarga en preparación');
        heroMeta.textContent = 'Aplicación oficial para Android';
        fijarEstado('warn', 'La aplicación está lista y pendiente de habilitar su descarga pública.');
      }
    } catch {
      fijarBoton(false, 'Error al consultar');
      heroMeta.textContent = 'No se pudo comprobar la disponibilidad.';
      fijarEstado('err', 'Error de red al consultar la descarga. Recarga la página.');
    }
  }

  cargarMetadatos();
})();
