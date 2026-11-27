(function () {
  'use strict';
  /**
   * Pantalla Pública de Reproducción (FASE 3 + FASE 4 — Autoridad exclusiva con lease).
   * - Consume /estado y /flujo proyectados sin exponer datos internos.
   * - Mantiene una única instancia de YT.Player; recarga al cambiar video o reproduccion_uid.
   * - Cuando salida === 'pantalla_publica', exige claim_code y renueva lease cada 10s (expira a los 25s).
   * - Watchdog automático: si pasan 25s sin confirmación del servidor o si pierde autoridad,
   *   silencia y pausa el reproductor de inmediato, descarta controlToken y detiene avances.
   */
  const cfg = (typeof window !== 'undefined' && window.__PONGA_DISPLAY_CFG__) || {};
  const LEASE_RENEW_MS = Number(cfg.leaseRenewMs) || 10_000;
  const LEASE_TIMEOUT_MS = Number(cfg.leaseTimeoutMs) || 25_000;
  const WATCHDOG_TICK_MS = Number(cfg.watchdogTickMs) || 1_000;

  const D = {
    token: extraerToken(),
    estado: null,
    player: null,
    ytListo: false,
    vid: null,
    repUid: null,
    audioDesbloqueado: false,
    es: null,
    ssePerdio: false,
    errorYt: '',
    falloFatal: false,
    controlToken: null,
    ultimoLatidoOkMs: 0,
    latidoTimer: null,
    watchdogTimer: null,
    latidoEnVuelo: false,
    reportesEnviados: new Set(),
    motivoPerdida: '',
  };

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));

  function extraerToken() {
    const m = window.location.pathname.match(/\/public\/([^/]+)\/?$/);
    return m ? decodeURIComponent(m[1]) : '';
  }

  function leaseVigente() {
    return Boolean(
      D.controlToken
      && D.ultimoLatidoOkMs > 0
      && (Date.now() - D.ultimoLatidoOkMs) < LEASE_TIMEOUT_MS,
    );
  }

  function puedeEmitirAudio() {
    const s = D.estado && D.estado.sonido;
    return Boolean(
      s
      && s.salida === 'pantalla_publica'
      && !s.silenciado
      && D.audioDesbloqueado
      && leaseVigente(),
    );
  }

  function aplicarAudio() {
    const p = D.player;
    const s = D.estado && D.estado.sonido;
    if (!p || typeof p.setVolume !== 'function' || !s) return;
    try {
      p.setVolume(typeof s.volumen === 'number' ? s.volumen : 80);
      if (puedeEmitirAudio()) p.unMute();
      else p.mute();
    } catch { /* el reproductor aún no está listo */ }
  }

  function detenerTimersLease() {
    if (D.latidoTimer) {
      clearInterval(D.latidoTimer);
      D.latidoTimer = null;
    }
    if (D.watchdogTimer) {
      clearInterval(D.watchdogTimer);
      D.watchdogTimer = null;
    }
  }

  /** Descarta inmediatamente la autoridad local, silencia y pausa el reproductor. */
  function perderAutoridad(motivo = '') {
    detenerTimersLease();
    D.controlToken = null;
    D.ultimoLatidoOkMs = 0;
    D.audioDesbloqueado = false;
    D.latidoEnVuelo = false;
    if (motivo) D.motivoPerdida = motivo;
    if (D.player) {
      try { if (typeof D.player.mute === 'function') D.player.mute(); } catch {}
      try { if (typeof D.player.pauseVideo === 'function') D.player.pauseVideo(); } catch {}
    }
    renderAudio();
    renderEstado();
  }

  async function enviarLatido() {
    if (!D.controlToken || D.latidoEnVuelo || D.falloFatal) return;
    D.latidoEnVuelo = true;
    try {
      const res = await fetch(`/api/public/${encodeURIComponent(D.token)}/latido`, {
        method: 'POST',
        cache: 'no-store',
        headers: { 'X-Display-Control': D.controlToken },
      });
      if (res.status === 401 || res.status === 403 || res.status === 404 || res.status === 409) {
        const errData = await res.json().catch(() => ({}));
        perderAutoridad((errData.error && errData.error.mensaje) || 'La autoridad de control dejó de estar vigente.');
        return;
      }
      if (!res.ok) return;
      const data = await res.json().catch(() => null);
      if (data && data.vigente === true && data.salida === 'pantalla_publica') {
        D.ultimoLatidoOkMs = Date.now();
      } else {
        perderAutoridad('La salida de audio ya no corresponde a esta pantalla.');
      }
    } catch {
      // Sin confirmación del servidor: el watchdog silenciará y detendrá a los 25 s.
    } finally {
      D.latidoEnVuelo = false;
    }
  }

  function iniciarCicloLease() {
    detenerTimersLease();
    D.ultimoLatidoOkMs = Date.now();
    D.latidoTimer = setInterval(() => {
      enviarLatido().catch(() => {});
    }, LEASE_RENEW_MS);
    D.watchdogTimer = setInterval(() => {
      if (!D.controlToken) {
        detenerTimersLease();
        return;
      }
      if ((Date.now() - D.ultimoLatidoOkMs) >= LEASE_TIMEOUT_MS) {
        perderAutoridad('Se agotó el tiempo sin confirmación del servidor (control detenido).');
      }
    }, WATCHDOG_TICK_MS);
  }

  async function reportarEventoReproduccion(tipo, codigoError = null) {
    if (!leaseVigente()) return;
    const est = D.estado;
    if (!est || !est.sonido || est.sonido.salida !== 'pantalla_publica') return;
    if (!est.sesion || est.sesion.estado !== 'activa' || est.estado_reproduccion !== 'reproduciendo') return;
    const uid = est.actual && est.actual.reproduccion_uid;
    if (!uid) return;

    const clave = `${uid}:${tipo}`;
    if (D.reportesEnviados.has(clave)) return;
    D.reportesEnviados.add(clave);

    const payload = tipo === 'error'
      ? { tipo: 'error', reproduccion_uid: uid, codigo_error: codigoError }
      : { tipo: 'ended', reproduccion_uid: uid };

    try {
      const res = await fetch(`/api/public/${encodeURIComponent(D.token)}/reproduccion/avanzar`, {
        method: 'POST',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
          'X-Display-Control': D.controlToken,
        },
        body: JSON.stringify(payload),
      });
      if (res.status === 401 || res.status === 403) {
        perderAutoridad('La autorización de control expiró.');
        return;
      }
      if (res.status === 409) {
        const errData = await res.json().catch(() => ({}));
        const cod = errData.error && errData.error.codigo;
        if (cod === 'salida_no_autorizada' || cod === 'sesion_cerrada') {
          perderAutoridad((errData.error && errData.error.mensaje) || 'Control invalidado.');
        } else if (cod === 'reproduccion_en_curso') {
          // Permitir reintento posterior si el reproductor reportó antes de tiempo.
          D.reportesEnviados.delete(clave);
        }
      }
    } catch {
      // Fallo de red transitorio; si continúa, el watchdog detendrá el reproductor.
    }
  }

  window.onYouTubeIframeAPIReady = function () {
    D.ytListo = true;
    sincronizarPlayer();
  };

  function sincronizarPlayer() {
    const est = D.estado;
    if (!est) return;
    const sesionCerrada = !est.sesion || est.sesion.estado !== 'activa';
    const vid = !sesionCerrada && est.actual ? est.actual.youtube_video_id : null;
    const repUid = !sesionCerrada && est.actual ? (est.actual.reproduccion_uid || vid) : null;
    const modoTvSinAutoridad = Boolean(est.sonido && est.sonido.salida === 'pantalla_publica' && !leaseVigente());

    if (!vid) {
      if (D.player && typeof D.player.stopVideo === 'function') {
        try { D.player.stopVideo(); } catch {}
      }
      D.vid = null;
      D.repUid = null;
      return;
    }

    if (!D.ytListo || !window.YT || !window.YT.Player) return;

    if (!D.player) {
      D.vid = vid;
      D.repUid = repUid;
      D.player = new window.YT.Player('yt-display-slot', {
        videoId: vid,
        playerVars: { autoplay: 1, controls: 0, rel: 0, playsinline: 1, modestbranding: 1 },
        events: {
          onReady() {
            aplicarAudio();
            const rep = D.estado && D.estado.estado_reproduccion;
            const sinAut = Boolean(D.estado && D.estado.sonido && D.estado.sonido.salida === 'pantalla_publica' && !leaseVigente());
            try {
              if (sinAut || rep === 'pausada') D.player.pauseVideo();
              else if (rep === 'reproduciendo') D.player.playVideo();
            } catch {}
          },
          onStateChange(ev) {
            if (window.YT && window.YT.PlayerState && ev.data === window.YT.PlayerState.ENDED) {
              reportarEventoReproduccion('ended');
            }
          },
          onError(ev) {
            D.errorYt = `No se pudo cargar el video en el reproductor (código ${ev.data}).`;
            renderEstado();
            reportarEventoReproduccion('error', `yt_error_${ev.data}`);
          },
        },
      });
      return;
    }

    if (D.vid !== vid || D.repUid !== repUid) {
      D.vid = vid;
      D.repUid = repUid;
      D.errorYt = '';
      if (typeof D.player.loadVideoById === 'function') D.player.loadVideoById(vid);
    }

    aplicarAudio();
    try {
      if (modoTvSinAutoridad || est.estado_reproduccion === 'pausada') {
        if (typeof D.player.pauseVideo === 'function') D.player.pauseVideo();
      } else if (est.estado_reproduccion === 'reproduciendo' && typeof D.player.playVideo === 'function') {
        D.player.playVideo();
      }
    } catch {}
  }

  function fijarPill(pillId, txtId, clase, texto) {
    const pill = $(pillId);
    const txt = $(txtId);
    if (pill) pill.className = `tv-pill ${clase}`;
    if (txt) txt.textContent = texto;
  }

  function renderAudio() {
    const s = D.estado && D.estado.sonido;
    const cerrada = !D.estado || !D.estado.sesion || D.estado.sesion.estado !== 'activa';
    const btn = $('btn-activar-audio');
    if (!s) {
      if (btn) btn.hidden = true;
      fijarPill('tv-audio-pill', 'tv-audio-txt', 'muted', 'Audio silenciado');
      return;
    }
    if (s.salida === 'panel') {
      if (btn) btn.hidden = true;
      fijarPill('tv-audio-pill', 'tv-audio-txt', 'muted', 'Audio en consola DJ');
      return;
    }
    if (s.salida === 'equipo_local') {
      if (btn) btn.hidden = true;
      fijarPill('tv-audio-pill', 'tv-audio-txt', 'muted', 'Audio en equipo del local');
      return;
    }
    // salida === 'pantalla_publica'
    if (leaseVigente()) {
      if (btn) btn.hidden = true;
      if (s.silenciado) {
        fijarPill('tv-audio-pill', 'tv-audio-txt', 'warn', 'Control activo · Silenciado por DJ');
      } else {
        fijarPill('tv-audio-pill', 'tv-audio-txt', 'ok', `Control activo · ${s.volumen}%`);
      }
      return;
    }
    if (btn) btn.hidden = cerrada;
    fijarPill(
      'tv-audio-pill',
      'tv-audio-txt',
      'warn',
      D.motivoPerdida ? 'Control detenido · Requiere autorización' : 'Pantalla sin autorización',
    );
  }

  function renderEstado() {
    const est = D.estado;
    if (!est) return;

    $('tv-est-nombre').textContent = (est.establecimiento && est.establecimiento.nombre) || 'PONGA';
    renderAudio();

    const cerrada = !est.sesion || est.sesion.estado !== 'activa';
    const rep = est.estado_reproduccion || 'detenida';
    const actual = !cerrada ? est.actual : null;

    if (cerrada) {
      fijarPill('tv-estado-pill', 'tv-estado-txt', 'err', 'Sesión cerrada');
    } else if (rep === 'reproduciendo') {
      fijarPill('tv-estado-pill', 'tv-estado-txt', 'ok', 'En vivo');
    } else if (rep === 'pausada') {
      fijarPill('tv-estado-pill', 'tv-estado-txt', 'warn', 'En pausa');
    } else {
      fijarPill('tv-estado-pill', 'tv-estado-txt', 'accent', 'En espera');
    }

    const ov = $('tv-overlay');
    if (cerrada) {
      ov.hidden = false;
      $('tv-overlay-badge').textContent = 'Sesión finalizada';
      $('tv-overlay-title').textContent = 'Gracias por acompañarnos';
      $('tv-overlay-sub').textContent = 'La sesión musical de este establecimiento ha terminado.';
    } else if (D.errorYt) {
      ov.hidden = false;
      $('tv-overlay-badge').textContent = 'Aviso de reproducción';
      $('tv-overlay-title').textContent = 'Video no disponible';
      $('tv-overlay-sub').textContent = D.errorYt;
    } else if (!actual) {
      ov.hidden = false;
      $('tv-overlay-badge').textContent = 'En espera';
      $('tv-overlay-title').textContent = 'La pista está libre';
      $('tv-overlay-sub').textContent = 'Esperando próximas canciones';
    } else if (D.motivoPerdida && est.sonido && est.sonido.salida === 'pantalla_publica' && !leaseVigente()) {
      ov.hidden = false;
      $('tv-overlay-badge').textContent = 'Control perdido';
      $('tv-overlay-title').textContent = 'Reproducción silenciada';
      $('tv-overlay-sub').textContent = D.motivoPerdida;
    } else if (rep === 'pausada') {
      ov.hidden = false;
      $('tv-overlay-badge').textContent = 'Pausa';
      $('tv-overlay-title').textContent = 'Reproducción en pausa';
      $('tv-overlay-sub').textContent = actual.titulo || '';
    } else {
      ov.hidden = true;
    }

    if (actual) {
      $('tv-now-fuente').textContent = actual.fuente === 'solicitud'
        ? 'Ahora suena · Solicitud'
        : `Ahora suena · ${actual.lista_nombre || 'Música del local'}`;
      $('tv-now-titulo').textContent = actual.titulo || 'Sin título';
      $('tv-now-artista').textContent = actual.artista_canal || '';
      const v = $('tv-now-votos');
      if (actual.fuente === 'solicitud') {
        v.hidden = false;
        v.textContent = `${actual.total_votos || 0} ${actual.total_votos === 1 ? 'voto' : 'votos'}`;
      } else {
        v.hidden = true;
      }
    } else {
      $('tv-now-fuente').textContent = cerrada ? 'Sesión cerrada' : 'Sin reproducción';
      $('tv-now-titulo').textContent = cerrada ? 'Sesión finalizada' : 'La pista está libre';
      $('tv-now-artista').textContent = cerrada ? '' : 'Esperando próximas canciones';
      $('tv-now-votos').hidden = true;
    }

    const cola = !cerrada && Array.isArray(est.cola) ? est.cola : [];
    const proximas = cola.slice(0, 3);
    $('tv-queue-count').textContent = cola.length > 0 ? `${cola.length} en cola` : '';
    const lista = $('tv-queue-list');
    if (proximas.length === 0) {
      lista.innerHTML = '<div class="tv-queue-empty">La pista está libre — Esperando próximas canciones</div>';
    } else {
      lista.innerHTML = proximas.map((item) => {
        const c = item.cancion || {};
        const thumb = c.url_miniatura
          ? `<img class="tv-q-thumb" src="${esc(c.url_miniatura)}" alt="">`
          : '<div class="tv-q-thumb"></div>';
        return `<article class="tv-queue-item">
          <span class="tv-q-pos">#${Number(item.posicion) || 1}</span>
          ${thumb}
          <div class="tv-q-info">
            <div class="tv-q-tit">${esc(c.titulo || '')}</div>
            <div class="tv-q-art">${esc(c.artista_canal || '')}</div>
          </div>
          <span class="tv-q-votos">${Number(item.total_votos) || 0}</span>
        </article>`;
      }).join('');
    }
  }

  function mostrarNoDisponible(titulo, subtitulo) {
    D.falloFatal = true;
    perderAutoridad(subtitulo);
    cerrarSse();
    fijarPill('tv-estado-pill', 'tv-estado-txt', 'err', 'No disponible');
    fijarPill('tv-sse-pill', 'tv-sse-txt', 'err', 'Desconectado');
    $('tv-overlay').hidden = false;
    $('tv-overlay-badge').textContent = 'Pantalla no disponible';
    $('tv-overlay-title').textContent = titulo;
    $('tv-overlay-sub').textContent = subtitulo;
  }

  async function cargarEstado() {
    if (!D.token) {
      mostrarNoDisponible('Enlace inválido', 'Esta pantalla pública no tiene un token válido.');
      return null;
    }
    const res = await fetch(`/api/public/${encodeURIComponent(D.token)}/estado`, { cache: 'no-store' });
    if (res.status === 404) {
      mostrarNoDisponible('Pantalla no disponible', 'El enlace fue revocado o no existe.');
      return null;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    D.estado = data;
    if (D.controlToken && (!data.sonido || data.sonido.salida !== 'pantalla_publica' || !data.sesion || data.sesion.estado !== 'activa')) {
      perderAutoridad('La sesión o la salida de audio dejó de autorizar esta pantalla.');
    }
    renderEstado();
    sincronizarPlayer();
    return data;
  }

  function cerrarSse() {
    if (D.es) {
      try { D.es.close(); } catch {}
      D.es = null;
    }
  }

  function conectarSse() {
    if (D.falloFatal || !D.token || typeof EventSource !== 'function') return;
    if (D.estado && D.estado.sesion && D.estado.sesion.estado !== 'activa') return;
    cerrarSse();

    const es = new EventSource(`/api/public/${encodeURIComponent(D.token)}/flujo`);
    D.es = es;

    es.addEventListener('open', () => {
      if (D.es !== es) return;
      fijarPill('tv-sse-pill', 'tv-sse-txt', 'ok', 'Conectado');
      if (D.ssePerdio) {
        D.ssePerdio = false;
        cargarEstado().catch(() => {});
        // Nunca auto-reclamar control al reconectar; si queda lease local vigente, validarlo con el servidor.
        if (D.controlToken && leaseVigente()) enviarLatido().catch(() => {});
      }
    });

    es.addEventListener('estado', (ev) => {
      if (D.es !== es) return;
      try {
        D.estado = JSON.parse(ev.data);
        if (D.controlToken && (!D.estado.sonido || D.estado.sonido.salida !== 'pantalla_publica' || !D.estado.sesion || D.estado.sesion.estado !== 'activa')) {
          perderAutoridad('La salida de audio ya no está asignada a la pantalla pública.');
        }
        renderEstado();
        sincronizarPlayer();
      } catch {}
    });

    es.addEventListener('reproductor', (ev) => {
      if (D.es !== es || !D.estado) return;
      try {
        const rep = JSON.parse(ev.data);
        D.estado.estado_reproduccion = rep.estado_reproduccion;
        D.estado.pausada_en = rep.pausada_en ?? null;
        renderEstado();
        sincronizarPlayer();
      } catch {}
    });

    es.addEventListener('sonido', (ev) => {
      if (D.es !== es || !D.estado) return;
      try {
        const sonido = JSON.parse(ev.data);
        D.estado.sonido = sonido;
        if (D.controlToken && (!sonido || sonido.salida !== 'pantalla_publica')) {
          perderAutoridad('El DJ cambió la salida de audio fuera de la pantalla pública.');
        }
        renderAudio();
        aplicarAudio();
        sincronizarPlayer();
      } catch {}
    });

    es.addEventListener('control_display', (ev) => {
      if (D.es !== es) return;
      try {
        const datos = JSON.parse(ev.data);
        if (datos && datos.liberado && D.controlToken) {
          perderAutoridad('El control fue liberado desde el panel DJ.');
        }
      } catch {}
    });

    es.addEventListener('sesion_cerrada', () => {
      if (D.es !== es) return;
      cerrarSse();
      if (D.controlToken) perderAutoridad('La sesión fue cerrada.');
      if (D.estado && D.estado.sesion) D.estado.sesion.estado = 'cerrada';
      if (D.estado) {
        D.estado.estado_reproduccion = 'detenida';
        D.estado.actual = null;
        D.estado.cola = [];
      }
      renderEstado();
      sincronizarPlayer();
      fijarPill('tv-sse-pill', 'tv-sse-txt', 'muted', 'Finalizada');
    });

    es.addEventListener('error', () => {
      if (D.es !== es) return;
      D.ssePerdio = true;
      fijarPill('tv-sse-pill', 'tv-sse-txt', 'warn', 'Reconectando…');
    });
  }

  function abrirModalClaim() {
    const modal = $('claim-modal');
    const input = $('claim-input');
    const err = $('claim-error');
    if (err) {
      err.hidden = true;
      err.textContent = '';
    }
    if (input) input.value = '';
    if (modal) modal.hidden = false;
    if (input) input.focus();
  }

  function cerrarModalClaim() {
    const modal = $('claim-modal');
    const input = $('claim-input');
    if (input) input.value = '';
    if (modal) modal.hidden = true;
  }

  $('btn-activar-audio').addEventListener('click', abrirModalClaim);
  $('claim-cancel').addEventListener('click', cerrarModalClaim);

  $('claim-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = $('claim-input');
    const errEl = $('claim-error');
    const btn = $('claim-submit');
    const codigo = input ? input.value.trim() : '';
    if (!codigo) return;
    if (btn) btn.disabled = true;
    try {
      const res = await fetch(`/api/public/${encodeURIComponent(D.token)}/reproduccion/reclamar`, {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claim_code: codigo }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (input) input.value = '';
        if (errEl) {
          errEl.textContent = (data.error && data.error.mensaje) || `No se pudo autorizar (${res.status}).`;
          errEl.hidden = false;
        }
        return;
      }
      cerrarModalClaim();
      D.controlToken = data.control_token;
      D.audioDesbloqueado = true;
      D.motivoPerdida = '';
      iniciarCicloLease();
      renderAudio();
      renderEstado();
      aplicarAudio();
      sincronizarPlayer();
    } catch {
      if (errEl) {
        errEl.textContent = 'No se pudo conectar con el servidor.';
        errEl.hidden = false;
      }
    } finally {
      if (btn) btn.disabled = false;
    }
  });

  cargarEstado()
    .then((est) => { if (est && est.sesion && est.sesion.estado === 'activa') conectarSse(); })
    .catch(() => {
      fijarPill('tv-sse-pill', 'tv-sse-txt', 'warn', 'Reconectando…');
      setTimeout(() => { cargarEstado().then((est) => { if (est) conectarSse(); }).catch(() => {}); }, 3000);
    });
})();
