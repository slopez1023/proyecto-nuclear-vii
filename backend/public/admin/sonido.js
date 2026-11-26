(function () {
  'use strict';
  /**
   * Salida de sonido del local: página para el equipo conectado al amplificador / parlantes.
   * Reproduce la canción actual de la sesión, aplica el volumen y el silencio fijados por el DJ y avanza sola al terminar.
   * Solo suena cuando el DJ elige la salida "equipo_local" en el panel; si no, queda en espera.
   */
  const root = document.getElementById('root');
  const S = { usuario: null, sonido: null, panel: null, player: null, vid: null, listo: false, desbloqueado: false, avanzando: false, error: '' };
  let timer = null;

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = (id) => document.getElementById(id);

  async function api(metodo, ruta, body) {
    const headers = { 'X-Ponga-Admin': '1' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await fetch('/api/admin' + ruta, { method: metodo, headers, credentials: 'same-origin', body: body === undefined ? undefined : JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const e = new Error((data.error && data.error.mensaje) || `Error ${res.status}`);
      e.status = res.status;
      throw e;
    }
    return data;
  }

  window.onYouTubeIframeAPIReady = function () { S.listo = true; sincronizar(); };

  function renderLogin() {
    if (timer) { clearInterval(timer); timer = null; }
    S.player = null;
    S.vid = null;
    root.innerHTML = `
      <form id="f" class="login-card">
        <div class="eyebrow">Salida de sonido</div>
        <h1 style="margin-top:8px">Conectar este equipo</h1>
        <p class="muted">Inicia sesión como DJ o administrador para que este equipo reproduzca la música del local.</p>
        <div style="margin-top:14px"><label for="u">Usuario</label><input id="u" required autocomplete="username"></div>
        <div style="margin-top:12px"><label for="p">Clave</label><input id="p" type="password" required autocomplete="current-password"></div>
        ${S.error ? `<p class="muted" style="color:var(--danger)">${esc(S.error)}</p>` : ''}
        <button class="btn primary" style="width:100%;margin-top:16px" type="submit">Conectar</button>
      </form>`;
    $('f').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const r = await api('POST', '/auth/login', { usuario: $('u').value.trim(), clave: $('p').value });
        S.usuario = r.usuario;
        S.error = '';
        iniciar();
      } catch (err) { S.error = err.message; renderLogin(); }
    });
  }

  function renderBase() {
    root.innerHTML = `
      <div class="card sonido-card">
        <div class="between">
          <div>
            <div class="eyebrow">Salida de sonido del local</div>
            <h1 id="st-local" style="margin-top:6px">PONGA</h1>
          </div>
          <div class="sonido-big">
            <span id="st-pill" class="pill warn"><span class="dot"></span><span id="st-pill-txt">Conectando…</span></span>
            <span id="st-vol" class="pill accent">Volumen —</span>
          </div>
        </div>
        <div id="st-caja" class="yt-box mt"><div id="yt-slot"></div></div>
        <div id="st-titulo" class="sonido-now">Sin canción sonando</div>
        <div id="st-meta" class="muted"></div>
        <div class="row mt">
          <span id="st-audio"></span>
          <span id="st-estado" class="muted"></span>
        </div>
      </div>`;
  }

  function actualizarVista() {
    if (!$('st-pill')) return;
    const rep = S.panel && S.panel.reproduccion;
    const actual = rep && rep.actual;
    const activa = S.sonido && S.sonido.salida === 'equipo_local';
    $('st-local').textContent = S.panel && S.panel.establecimiento ? S.panel.establecimiento.nombre : 'PONGA';
    $('st-pill').className = `pill ${activa ? 'ok' : 'warn'}`;
    $('st-pill-txt').textContent = activa ? 'Esta salida está activa' : 'En espera (el DJ usa la salida del panel)';
    $('st-vol').textContent = `Volumen ${S.sonido ? (S.sonido.silenciado ? 'silenciado' : S.sonido.volumen + '%') : '—'}`;
    $('st-caja').style.opacity = activa ? '1' : '.35';
    $('st-titulo').textContent = actual ? actual.cancion.titulo : 'Sin canción sonando';
    $('st-meta').textContent = actual
      ? `${actual.cancion.artista_canal} · ${actual.fuente === 'solicitud' ? 'Solicitud de cliente' : 'Continuidad automática'}`
      : 'El DJ puede iniciar la reproducción desde su panel.';
    $('st-estado').textContent = `Estado: ${rep ? rep.estado_reproduccion : 'detenida'}`;
    const zona = $('st-audio');
    if (S.desbloqueado) {
      zona.innerHTML = '<span class="pill ok"><span class="dot"></span>Audio habilitado</span>';
    } else if (!zona.querySelector('button')) {
      zona.innerHTML = '<button id="btn-audio" class="btn primary">Habilitar audio en este equipo</button>';
      $('btn-audio').addEventListener('click', () => { S.desbloqueado = true; actualizarVista(); sincronizar(true); });
    }
  }

  function aplicarVolumen() {
    if (!S.player || typeof S.player.setVolume !== 'function' || !S.sonido) return;
    try {
      S.player.setVolume(S.sonido.volumen);
      if (S.sonido.silenciado) S.player.mute(); else S.player.unMute();
    } catch { /* el reproductor aún no está listo */ }
  }

  async function avanzar(accion, body) {
    const rep = S.panel && S.panel.reproduccion;
    if (!rep || S.avanzando) return;
    S.avanzando = true;
    try {
      await api('POST', `/sesiones/${encodeURIComponent(rep.id_sesion)}/reproduccion/${accion}`, body);
    } catch { /* el DJ puede haberlo avanzado antes */ }
    S.avanzando = false;
    tick();
  }

  function sincronizar(forzar) {
    if (!$('yt-slot') && !S.player) return;
    if (!S.listo || !window.YT || !window.YT.Player) return;
    const rep = S.panel && S.panel.reproduccion;
    const vid = rep && rep.actual && rep.actual.cancion ? rep.actual.cancion.youtube_video_id : null;
    const activa = S.sonido && S.sonido.salida === 'equipo_local' && S.desbloqueado;
    if (!vid || !activa) {
      if (S.player && typeof S.player.pauseVideo === 'function') { try { S.player.pauseVideo(); } catch {} }
      return;
    }
    if (!S.player) {
      S.vid = vid;
      S.player = new window.YT.Player('yt-slot', {
        videoId: vid,
        playerVars: { autoplay: 1, rel: 0 },
        events: {
          onReady: () => { aplicarVolumen(); if (rep.estado_reproduccion === 'reproduciendo') S.player.playVideo(); },
          onStateChange: (ev) => {
            if (ev.data === window.YT.PlayerState.ENDED && S.sonido && S.sonido.salida === 'equipo_local') {
              avanzar('siguiente', { segundos_reproducidos: Math.floor(S.player.getCurrentTime ? S.player.getCurrentTime() : 0) });
            }
          },
          onError: (ev) => {
            if (S.sonido && S.sonido.salida === 'equipo_local') avanzar('error', { codigo_error: `yt_error_${ev.data}`, segundos_reproducidos: 0 });
          },
        },
      });
      return;
    }
    if (S.vid !== vid || forzar) { S.vid = vid; S.player.loadVideoById(vid); }
    aplicarVolumen();
    if (rep.estado_reproduccion === 'pausada') S.player.pauseVideo();
    else if (rep.estado_reproduccion === 'reproduciendo') S.player.playVideo();
  }

  async function tick() {
    try {
      const [sonido, panel] = await Promise.all([api('GET', '/sonido'), api('GET', '/panel')]);
      S.sonido = sonido;
      S.panel = panel;
      api('POST', '/sonido/latido').catch(() => {});
      actualizarVista();
      sincronizar();
    } catch (err) {
      if (err.status === 401) { S.usuario = null; renderLogin(); }
    }
  }

  function iniciar() {
    renderBase();
    tick();
    if (timer) clearInterval(timer);
    timer = setInterval(tick, 3000);
  }

  api('GET', '/auth/yo').then((r) => { S.usuario = r.usuario; iniciar(); }).catch(renderLogin);
})();
