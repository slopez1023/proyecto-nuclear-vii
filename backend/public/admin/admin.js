(function () {
  'use strict';

  const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const root = document.getElementById('root');

  const state = {
    usuario: null,
    panel: null,
    sesionId: null,
    tab: 'resumen',
    listaSeleccionada: null,
    detalleLista: null,
    bloqueos: [],
    mantenimiento: null,
    registro: [],
    analitica: null,
    sonido: null,
    respaldos: null,
    generos: [],
    filtros: { genero: '', duracion: '', orden: 'popularidad' },
    analiticaAlcance: 'sesion',
    catalogoResultados: [],
    ytPlayer: null,
    ytVideoCargado: null,
    ytListo: false,
    toast: null,
    display: null,
    claimTemporal: null,
    sse: null,
    sseSesionId: null,
    sseVersion: null,
    ssePerdioConexion: false,
    sseEnVuelo: false,
    ssePendiente: false,
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function fmtSeg(s) {
    if (s == null) return '--:--';
    const m = Math.floor(s / 60), r = s % 60;
    return `${m}:${r < 10 ? '0' : ''}${r}`;
  }
  function fmtFecha(iso) {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleString(); } catch { return iso; }
  }

  function showToast(msg, esError = false) {
    state.toast = { msg, esError };
    renderToast();
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => { state.toast = null; renderToast(); }, 4000);
  }
  function renderToast() {
    const prev = document.getElementById('toast-el');
    if (prev) prev.remove();
    if (!state.toast) return;
    const d = document.createElement('div');
    d.id = 'toast-el';
    d.className = 'toast' + (state.toast.esError ? ' err' : '');
    d.textContent = state.toast.msg;
    document.body.appendChild(d);
  }

  function pedirBloqueoModal(titulo) {
    return new Promise((resolve) => {
      const prev = document.getElementById('modal-bloq');
      if (prev) prev.remove();
      const wrap = document.createElement('div');
      wrap.id = 'modal-bloq';
      wrap.className = 'modal-backdrop';
      wrap.innerHTML = `
        <form id="m-bloq-form" class="modal-card">
          <div class="eyebrow">Bloqueo de contenido</div>
          <h2 style="margin-top:6px">Bloquear canción</h2>
          <p class="muted" style="margin-top:0">${esc(titulo)}</p>
          <div style="margin-top:14px">
            <label for="m-bloq-mot">Motivo del bloqueo</label>
            <input id="m-bloq-mot" value="Contenido no permitido" maxlength="300" required>
          </div>
          <div style="margin-top:12px">
            <label for="m-bloq-min">Duración (minutos)</label>
            <input id="m-bloq-min" type="number" min="1" max="43200" value="120" required>
          </div>
          <div class="row mt" style="justify-content:flex-end">
            <button type="button" id="m-bloq-cancel" class="btn">Cancelar</button>
            <button type="submit" class="btn danger">Bloquear canción</button>
          </div>
        </form>`;
      document.body.appendChild(wrap);
      const inp = document.getElementById('m-bloq-mot');
      inp.focus();
      inp.select();
      const cerrar = (val) => {
        window.removeEventListener('keydown', onKey);
        wrap.remove();
        resolve(val);
      };
      const onKey = (ev) => { if (ev.key === 'Escape') cerrar(null); };
      window.addEventListener('keydown', onKey);
      wrap.addEventListener('click', (ev) => { if (ev.target === wrap) cerrar(null); });
      document.getElementById('m-bloq-cancel').addEventListener('click', () => cerrar(null));
      document.getElementById('m-bloq-form').addEventListener('submit', (ev) => {
        ev.preventDefault();
        cerrar({
          motivo: inp.value.trim() || 'Bloqueada por operador',
          duracion_minutos: Math.max(1, Number(document.getElementById('m-bloq-min').value) || 120),
        });
      });
    });
  }

  async function api(metodo, ruta, body) {
    const headers = { 'X-Ponga-Admin': '1' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await fetch('/api/admin' + ruta, {
      method: metodo,
      headers,
      credentials: 'same-origin',
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 401 && state.usuario) {
        detenerRespaldoSonido();
        limpiarTimersDisplay();
        cerrarFlujo();
        state.usuario = null;
        state.display = null;
        render();
      }
      throw new Error((data.error && data.error.mensaje) || `Error ${res.status}`);
    }
    return data;
  }

  // ------------------------------------------------------------ YouTube IFrame API (oficial)
  window.onYouTubeIframeAPIReady = function () {
    state.ytListo = true;
    sincronizarYoutube();
  };

  function salidaExterna() {
    return Boolean(state.sonido && (state.sonido.salida === 'equipo_local' || state.sonido.salida === 'pantalla_publica'));
  }

  /** Aplica volumen/silencio del sistema de sonido al reproductor del panel (o lo silencia si la salida es el equipo del local). */
  function aplicarVolumenPanel() {
    const p = state.ytPlayer;
    if (!p || typeof p.setVolume !== 'function' || !state.sonido) return;
    try {
      p.setVolume(state.sonido.volumen);
      if (state.sonido.silenciado || salidaExterna()) p.mute(); else p.unMute();
    } catch { /* el reproductor aún no está listo */ }
  }

  let ytHost = null;
  function asegurarHostYoutube() {
    if (!ytHost) {
      ytHost = document.createElement('div');
      ytHost.id = 'yt-persist-host';
      ytHost.className = 'yt-box';
      ytHost.style.cssText = 'position:fixed;left:-9999px;top:0;width:320px;height:180px;z-index:20;pointer-events:none;opacity:0;';
      ytHost.innerHTML = '<div id="yt-player-slot"></div>';
      document.body.appendChild(ytHost);
      window.addEventListener('resize', posicionarYoutube);
      window.addEventListener('scroll', posicionarYoutube, true);
    }
    return ytHost;
  }

  function posicionarYoutube() {
    if (!ytHost) return;
    const mount = state.usuario && state.tab === 'reproduccion' ? document.getElementById('yt-mount-point') : null;
    if (!mount) {
      ytHost.style.left = '-9999px';
      ytHost.style.top = '0px';
      ytHost.style.width = '320px';
      ytHost.style.height = '180px';
      ytHost.style.opacity = '0';
      ytHost.style.pointerEvents = 'none';
      return;
    }
    const r = mount.getBoundingClientRect();
    ytHost.style.left = `${Math.round(r.left)}px`;
    ytHost.style.top = `${Math.round(r.top)}px`;
    ytHost.style.width = `${Math.round(r.width)}px`;
    ytHost.style.height = `${Math.round(r.height)}px`;
    ytHost.style.opacity = '1';
    ytHost.style.pointerEvents = 'auto';
  }

  function estacionarYoutube() {
    posicionarYoutube();
  }

  function sincronizarYoutube() {
    const cont = document.getElementById('yt-player-slot');
    if (!cont || !window.YT || !window.YT.Player) return;
    if (state.ytPlayer) {
      const iframe = typeof state.ytPlayer.getIframe === 'function' ? state.ytPlayer.getIframe() : null;
      if (!iframe || !document.body.contains(iframe)) {
        try { state.ytPlayer.destroy(); } catch { }
        state.ytPlayer = null;
        state.ytVideoCargado = null;
      }
    }
    const rep = state.panel && state.panel.reproduccion;
    const actual = rep && rep.actual;
    const vid = actual && actual.cancion ? actual.cancion.youtube_video_id : null;
    if (!vid) {
      if (state.ytPlayer && typeof state.ytPlayer.stopVideo === 'function') {
        try { state.ytPlayer.stopVideo(); } catch { }
      }
      state.ytVideoCargado = null;
      return;
    }
    if (salidaExterna()) {
      // El audio sale por el equipo conectado al sistema de sonido del local (/sonido) o pantalla pública: el panel solo controla.
      if (state.ytPlayer) {
        try { if (typeof state.ytPlayer.mute === 'function') state.ytPlayer.mute(); } catch { }
        try { if (typeof state.ytPlayer.pauseVideo === 'function') state.ytPlayer.pauseVideo(); } catch { }
      }
      return;
    }
    if (!state.ytPlayer) {
      state.ytVideoCargado = vid;
      state.ytPlayer = new window.YT.Player('yt-player-slot', {
        videoId: vid,
        playerVars: { autoplay: rep.estado_reproduccion === 'reproduciendo' ? 1 : 0, rel: 0 },
        events: {
          onReady(ev) {
            aplicarVolumenPanel();
            const est = state.panel && state.panel.reproduccion && state.panel.reproduccion.estado_reproduccion;
            if (est === 'reproduciendo' && typeof ev.target.playVideo === 'function') {
              try { ev.target.playVideo(); } catch { }
            }
          },
          onStateChange(ev) {
            if (ev.data === window.YT.PlayerState.ENDED) {
              const seg = Math.floor(state.ytPlayer.getCurrentTime ? state.ytPlayer.getCurrentTime() : 0);
              accionRep('siguiente', { segundos_reproducidos: seg });
            }
          },
          onError(ev) {
            accionRep('error', { codigo_error: `yt_error_${ev.data}`, segundos_reproducidos: 0 });
          },
        },
      });
      return;
    }
    if (state.ytVideoCargado !== vid && typeof state.ytPlayer.loadVideoById === 'function') {
      state.ytVideoCargado = vid;
      state.ytPlayer.loadVideoById(vid);
    }
    aplicarVolumenPanel();
    if (rep.estado_reproduccion === 'pausada' && typeof state.ytPlayer.pauseVideo === 'function') {
      state.ytPlayer.pauseVideo();
    } else if (rep.estado_reproduccion === 'reproduciendo' && typeof state.ytPlayer.playVideo === 'function') {
      state.ytPlayer.playVideo();
    }
  }

  function cerrarFlujo() {
    if (state.sse) {
      try { state.sse.close(); } catch { }
    }
    state.sse = null;
    state.sseSesionId = null;
    state.sseVersion = null;
    state.ssePerdioConexion = false;
    state.ssePendiente = false;
  }

  async function refrescarEnVivo() {
    if (!state.usuario) return;
    if (state.sseEnVuelo) {
      state.ssePendiente = true;
      return;
    }
    const activo = document.activeElement;
    const editandoFormulario = activo && /^(INPUT|TEXTAREA|SELECT)$/.test(activo.tagName)
      && state.tab !== 'resumen' && state.tab !== 'reproduccion';
    if (document.getElementById('modal-bloq') || editandoFormulario) {
      state.ssePendiente = true;
      setTimeout(() => { refrescarEnVivo(); }, 500);
      return;
    }
    state.sseEnVuelo = true;
    try {
      await cargarPanel();
    } catch {
      // Si falla un refresco puntual, el siguiente evento o reconexión reintenta.
    } finally {
      state.sseEnVuelo = false;
      if (state.ssePendiente) {
        state.ssePendiente = false;
        setTimeout(() => { refrescarEnVivo(); }, 150);
      }
    }
  }

  let sonidoRespaldoTimer = null;
  function detenerRespaldoSonido() {
    if (sonidoRespaldoTimer) {
      clearInterval(sonidoRespaldoTimer);
      sonidoRespaldoTimer = null;
    }
  }

  function gestionarRespaldoSonido() {
    if (!state.usuario) {
      detenerRespaldoSonido();
      return;
    }
    if (!sonidoRespaldoTimer) {
      sonidoRespaldoTimer = setInterval(async () => {
        if (!state.usuario) return detenerRespaldoSonido();
        if (state.sse && typeof EventSource === 'function' && state.sse.readyState === EventSource.OPEN) return;
        try {
          state.sonido = await api('GET', '/sonido');
          aplicarVolumenPanel();
          sincronizarYoutube();
        } catch { }
      }, 4000);
    }
  }

  function sincronizarFlujo(sesionActual) {
    gestionarRespaldoSonido();
    if (!state.usuario || !sesionActual || sesionActual.estado !== 'activa') {
      cerrarFlujo();
      return;
    }
    const idSesion = sesionActual.id_sesion;
    if (state.sse && state.sseSesionId === idSesion && state.sse.readyState !== EventSource.CLOSED) {
      return;
    }
    cerrarFlujo();
    if (typeof EventSource !== 'function') return;

    const es = new EventSource(`/api/admin/sesiones/${encodeURIComponent(idSesion)}/flujo`, { withCredentials: true });
    state.sse = es;
    state.sseSesionId = idSesion;

    es.addEventListener('open', () => {
      if (state.sse !== es) return;
      if (state.ssePerdioConexion) {
        state.ssePerdioConexion = false;
        refrescarEnVivo();
      }
    });

    es.addEventListener('estado', (ev) => {
      if (state.sse !== es) return;
      try {
        const datos = JSON.parse(ev.data);
        if (datos && typeof datos.version === 'number') {
          if (state.sseVersion === null) {
            state.sseVersion = datos.version;
            return;
          }
          if (datos.version === state.sseVersion) return;
          state.sseVersion = datos.version;
        }
      } catch { }
      refrescarEnVivo();
    });

    es.addEventListener('reproductor', (ev) => {
      if (state.sse !== es) return;
      try {
        const datos = JSON.parse(ev.data);
        if (datos && datos.sesion_id && datos.sesion_id !== state.sesionId) return;
        const actual = state.panel && state.panel.reproduccion && state.panel.reproduccion.estado_reproduccion;
        if (datos && datos.estado_reproduccion && actual === datos.estado_reproduccion) return;
      } catch { }
      refrescarEnVivo();
    });

    es.addEventListener('conectividad', (ev) => {
      if (state.sse !== es) return;
      try {
        const datos = JSON.parse(ev.data);
        if (!datos || (datos.sesion_id && datos.sesion_id !== state.sesionId)) return;
        if (typeof datos.dispositivos_activos === 'number') {
          if (state.panel) state.panel.dispositivos_activos = datos.dispositivos_activos;
          const pill = document.getElementById('pill-dispositivos');
          if (pill) pill.textContent = `Dispositivos activos: ${datos.dispositivos_activos}`;
        }
      } catch { }
    });

    es.addEventListener('sesion_cerrada', () => {
      if (state.sse !== es) return;
      cerrarFlujo();
      refrescarEnVivo();
    });

    es.addEventListener('sonido', (ev) => {
      if (state.sse !== es) return;
      try {
        const datos = JSON.parse(ev.data);
        state.sonido = Object.assign({}, state.sonido || {}, datos);
        if (datos.salida && datos.salida !== 'pantalla_publica') limpiarClaim();
        aplicarVolumenPanel();
        sincronizarYoutube();
        const volTxt = document.getElementById('snd-vol-txt');
        if (volTxt && typeof datos.volumen === 'number') volTxt.textContent = `${datos.volumen}%`;
        const sndMute = document.getElementById('snd-mute');
        if (sndMute) sndMute.textContent = datos.silenciado ? '🔇 Activar sonido' : '🔊 Silenciar';
        const sndSalida = document.getElementById('snd-salida');
        if (sndSalida && datos.salida) sndSalida.value = datos.salida;
        if (state.tab === 'reproduccion') refrescarDisplay();
      } catch { }
    });

    es.addEventListener('display_estado', () => {
      if (state.sse !== es) return;
      refrescarDisplay();
    });

    es.addEventListener('incidente_reproductor', (ev) => {
      if (state.sse !== es) return;
      try {
        const datos = JSON.parse(ev.data);
        const tit = datos.titulo || datos.youtube_video_id || 'la canción actual';
        const cod = datos.codigo_error || 'error';
        showToast(`Pantalla pública reportó ${cod} en "${tit}". Usa Saltar o Bloquear si corresponde.`, true);
      } catch { }
    });

    es.addEventListener('error', () => {
      if (state.sse !== es) return;
      state.ssePerdioConexion = true;
      if (es.readyState === EventSource.CLOSED) {
        state.sse = null;
        state.sseSesionId = null;
      }
    });
  }

  let claimTimer = null;
  let leaseVenceTimer = null;

  function limpiarClaim() {
    state.claimTemporal = null;
    if (claimTimer) {
      clearInterval(claimTimer);
      claimTimer = null;
    }
  }

  function limpiarTimersDisplay() {
    limpiarClaim();
    if (leaseVenceTimer) {
      clearTimeout(leaseVenceTimer);
      leaseVenceTimer = null;
    }
  }

  function programarVencimientoLease() {
    if (leaseVenceTimer) {
      clearTimeout(leaseVenceTimer);
      leaseVenceTimer = null;
    }
    const d = state.display;
    if (!state.usuario || !d || !d.lease_vigente || !d.lease_expira_en) return;
    const diff = new Date(d.lease_expira_en).getTime() - Date.now();
    const ms = diff > 0 ? diff + 600 : 25_000;
    leaseVenceTimer = setTimeout(() => { refrescarDisplay(); }, ms);
  }

  function sincronizarClaimTemporal() {
    const ct = state.claimTemporal;
    if (!ct) return;
    const d = state.display;
    if (ct.idSesion !== state.sesionId || ct.expiraEnMs <= Date.now() || (d && d.estado_control === 'control_autorizado')) {
      limpiarClaim();
      return;
    }
    if (!claimTimer) {
      claimTimer = setInterval(() => {
        if (!state.claimTemporal || state.claimTemporal.expiraEnMs <= Date.now()) {
          limpiarClaim();
          if (state.tab === 'reproduccion') render();
          return;
        }
        const el = document.getElementById('disp-claim-ttl');
        if (el) {
          const seg = Math.max(0, Math.ceil((state.claimTemporal.expiraEnMs - Date.now()) / 1000));
          el.textContent = `Expira en ${seg} s`;
        }
      }, 1000);
    }
  }

  async function copiarTexto(texto, mensajeOk) {
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(texto);
        showToast(mensajeOk);
        return;
      }
    } catch { }
    const ta = document.createElement('textarea');
    ta.value = texto;
    ta.style.cssText = 'position:fixed;left:-9999px;top:0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); showToast(mensajeOk); }
    catch { showToast('No se pudo copiar automáticamente.', true); }
    finally { ta.remove(); }
  }

  async function refrescarDisplay() {
    if (!state.usuario || !state.sesionId) return;
    try {
      state.display = await api('GET', `/sesiones/${encodeURIComponent(state.sesionId)}/display`);
      sincronizarClaimTemporal();
      programarVencimientoLease();
      if (state.tab === 'reproduccion') render();
    } catch { }
  }

  async function cargarPanel() {
    const q = state.sesionId ? `?sesion=${encodeURIComponent(state.sesionId)}` : '';
    state.panel = await api('GET', '/panel' + q);
    state.sonido = await api('GET', '/sonido').catch(() => state.sonido);
    const activas = state.panel.sesiones.filter((s) => s.estado === 'activa');
    if (activas.length === 0) {
      state.sesionId = null;
    } else if (!activas.some((s) => s.id_sesion === state.sesionId)) {
      state.sesionId = activas[0].id_sesion;
      state.panel = await api('GET', `/panel?sesion=${encodeURIComponent(state.sesionId)}`);
    }
    const sesionDisplay = state.sesionId || (state.panel.sesiones[0] && state.panel.sesiones[0].id_sesion) || null;
    state.display = sesionDisplay
      ? await api('GET', `/sesiones/${encodeURIComponent(sesionDisplay)}/display`).catch(() => null)
      : null;
    sincronizarClaimTemporal();
    programarVencimientoLease();
    if (state.tab === 'bloqueos') state.bloqueos = (await api('GET', '/bloqueos')).bloqueos;
    if (state.tab === 'mantenimiento') {
      state.mantenimiento = (state.usuario.rol === 'admin' && state.sesionId)
        ? await api('GET', `/sesiones/${state.sesionId}/mantenimiento`)
        : null;
      state.registro = (await api('GET', '/registro')).registros;
    }
    if (state.tab === 'listas') {
      if (state.listaSeleccionada) state.detalleLista = await api('GET', `/listas/${state.listaSeleccionada}`);
      try {
        const rg = await fetch('/api/catalogo/generos');
        if (rg.ok) state.generos = (await rg.json()).generos || [];
      } catch { /* el filtro de género queda sin opciones */ }
    }
    if (state.tab === 'analitica') {
      state.respaldos = await api('GET', '/respaldos').catch(() => state.respaldos);
    }
    if (state.tab === 'analitica') {
      const sesionFiltro = state.analiticaAlcance === 'sesion' && state.sesionId ? state.sesionId : null;
      const qs = sesionFiltro ? `?sesion=${encodeURIComponent(sesionFiltro)}` : '';
      state.analitica = await api('GET', '/analitica' + qs);
    }
    render();
    sincronizarYoutube();
    gestionarAutoRefrescoAnalitica();
  }

  let analiticaTimer = null;
  function gestionarAutoRefrescoAnalitica() {
    if (state.usuario && state.tab === 'analitica') {
      if (!analiticaTimer) {
        analiticaTimer = setInterval(() => {
          if (state.usuario && state.tab === 'analitica') cargarPanel().catch(() => { });
        }, 5000);
      }
    } else if (analiticaTimer) {
      clearInterval(analiticaTimer);
      analiticaTimer = null;
    }
  }

  async function accionRep(accion, body = {}) {
    if (!state.sesionId) return;
    try {
      await api('POST', `/sesiones/${encodeURIComponent(state.sesionId)}/reproduccion/${accion}`, body);
      await cargarPanel();
    } catch (e) {
      showToast(e.message, true);
    }
  }

  // ------------------------------------------------------------ Renderizado
  function renderLogin() {
    root.innerHTML = `
      <div class="login-wrap">
        <form id="login-form" class="login-card">
          <div class="brand-logo">
            <div class="brand-box"><img src="/ponga-logo.png" alt="PONGA"></div>
            <div>
              <div class="eyebrow">Panel operativo</div>
              <div class="muted">Administración y DJ</div>
            </div>
          </div>
          <h1 style="margin-top:20px">Iniciar sesión</h1>
          <p class="muted">Ingresa con tus credenciales de administrador o DJ del establecimiento.</p>
          <div style="margin-top:16px">
            <label for="u">Usuario</label>
            <input id="u" autocomplete="username" required placeholder="admin o dj">
          </div>
          <div style="margin-top:12px">
            <label for="p">Clave</label>
            <input id="p" type="password" autocomplete="current-password" required placeholder="••••••••">
          </div>
          <button class="btn primary" style="width:100%;margin-top:18px" type="submit">Entrar al panel</button>
          <p class="muted" style="margin-top:14px;font-size:.78rem">Los clientes participan únicamente desde la aplicación móvil mediante el código QR.</p>
        </form>
      </div>`;
    document.getElementById('login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const res = await api('POST', '/auth/login', {
          usuario: document.getElementById('u').value.trim(),
          clave: document.getElementById('p').value,
        });
        state.usuario = res.usuario;
        state.tab = state.usuario.rol === 'dj' ? 'reproduccion' : 'resumen';
        await cargarPanel();
      } catch (err) {
        showToast(err.message, true);
      }
    });
  }

  const ICONOS_TAB = {
    resumen: '<svg class="nav-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
    reproduccion: '<svg class="nav-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><polygon points="10 8 16 12 10 16 10 8"/></svg>',
    sesiones: '<svg class="nav-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14v7M14 20h7"/></svg>',
    horarios: '<svg class="nav-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/></svg>',
    listas: '<svg class="nav-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>',
    bloqueos: '<svg class="nav-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><line x1="5.6" y1="5.6" x2="18.4" y2="18.4"/></svg>',
    analitica: '<svg class="nav-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="20" x2="20" y2="20"/><rect x="6" y="12" width="3" height="6" rx="1"/><rect x="11" y="7" width="3" height="11" rx="1"/><rect x="16" y="10" width="3" height="8" rx="1"/></svg>',
    mantenimiento: '<svg class="nav-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.6.79 1 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
  };

  function tabsDisponibles() {
    const esAdmin = state.usuario.rol === 'admin';
    const todos = [
      { id: 'resumen', label: 'Resumen' },
      { id: 'reproduccion', label: 'Control DJ' },
      { id: 'sesiones', label: 'Sesiones y QR', admin: true },
      { id: 'horarios', label: 'Horarios y Pausa', admin: true },
      { id: 'listas', label: 'Listas por defecto' },
      { id: 'bloqueos', label: 'Bloqueos' },
      { id: 'analitica', label: 'Analítica', admin: true },
      { id: 'mantenimiento', label: 'Mantenimiento', admin: true },
    ];
    return todos.filter((t) => !t.admin || esAdmin);
  }

  function render() {
    estacionarYoutube();
    if (!state.usuario) return renderLogin();
    const p = state.panel;
    if (!p) { root.innerHTML = '<main class="main"><p>Cargando panel…</p></main>'; return; }

    const esAdmin = state.usuario.rol === 'admin';
    const sesionesActivas = p.sesiones.filter((s) => s.estado === 'activa');
    const sesionActual = sesionesActivas.find((s) => s.id_sesion === state.sesionId) || sesionesActivas[0] || null;
    const rep = sesionActual ? p.reproduccion : null;
    const estadoSesion = sesionActual ? sesionActual.estado.toUpperCase() : 'SIN SESIÓN ACTIVA';

    root.innerHTML = `
      <div class="shell">
        <aside class="sidebar">
          <div class="brand-logo">
            <div class="brand-box"><img src="/ponga-logo.png" alt="PONGA"></div>
          </div>
          <div>
            <div class="eyebrow">${esc(p.establecimiento ? p.establecimiento.nombre : '')}</div>
            <div class="muted">${esc(state.usuario.nombre)} · <strong>${esc(state.usuario.rol.toUpperCase())}</strong></div>
          </div>
          <div>
            <label for="sel-sesion">Sesión activa</label>
            ${sesionesActivas.length ? `
              <select id="sel-sesion">
                ${sesionesActivas.map((s) => `<option value="${esc(s.id_sesion)}" ${s.id_sesion === sesionActual.id_sesion ? 'selected' : ''}>${esc(s.id_sesion)}</option>`).join('')}
              </select>` : `
              <select id="sel-sesion" disabled>
                <option value="">Sin sesión activa</option>
              </select>`}
          </div>
          <nav class="nav">
            ${tabsDisponibles().map((t) => `<button data-tab="${t.id}" class="${state.tab === t.id ? 'active' : ''}">${ICONOS_TAB[t.id] || ''}<span>${esc(t.label)}</span></button>`).join('')}
          </nav>
          <div style="margin-top:auto">
            <button id="btn-refrescar" class="btn sm" style="width:100%;margin-bottom:8px">Actualizar datos</button>
            <button id="btn-salir" class="btn sm danger" style="width:100%">Cerrar sesión</button>
          </div>
        </aside>

        <main class="main">
          <div class="topbar">
            <div>
              <div class="eyebrow">${esc(p.establecimiento ? p.establecimiento.nombre : '')} · ${esc(estadoSesion)}</div>
              <h1>${esc(tabsDisponibles().find((t) => t.id === state.tab)?.label || 'Panel')}</h1>
            </div>
            <div class="row">
              <span class="pill ${sesionActual ? 'ok' : 'err'}"><span class="dot"></span>${sesionActual ? 'Sesión activa' : 'Sesión: ninguna'}</span>
              <span class="pill ${sesionActual && sesionActual.qr_estado === 'activo' ? 'ok' : 'warn'}"><span class="dot"></span>QR ${esc(sesionActual ? sesionActual.qr_estado : 'inactivo')}</span>
              ${p.configuracion.pausa_manual ? '<span class="pill warn"><span class="dot"></span>Pausa manual</span>' : ''}
              <span id="pill-dispositivos" class="pill accent">Dispositivos activos: ${p.dispositivos_activos}</span>
              ${p.dispositivos_estado && p.dispositivos_estado.inactivos_recientes > 0
        ? `<span id="pill-inactivos" class="pill warn" title="Dispositivos con actividad reciente dentro de los últimos 30 min">Inactivos recientes: ${p.dispositivos_estado.inactivos_recientes}</span>`
        : ''}
            </div>
          </div>
          <div id="tab-content"></div>
        </main>
      </div>`;

    document.getElementById('sel-sesion').addEventListener('change', async (e) => {
      if (!e.target.value) return;
      state.sesionId = e.target.value;
      limpiarTimersDisplay();
      await cargarPanel();
    });
    document.querySelectorAll('.nav button[data-tab]').forEach((b) => b.addEventListener('click', async () => {
      state.tab = b.dataset.tab;
      await cargarPanel();
    }));
    document.getElementById('btn-refrescar').addEventListener('click', () => cargarPanel());
    document.getElementById('btn-salir').addEventListener('click', async () => {
      detenerRespaldoSonido();
      limpiarTimersDisplay();
      cerrarFlujo();
      await api('POST', '/auth/logout');
      if (state.ytPlayer && typeof state.ytPlayer.destroy === 'function') { try { state.ytPlayer.destroy(); } catch { } }
      state.ytPlayer = null;
      state.ytVideoCargado = null;
      state.usuario = null;
      state.panel = null;
      state.display = null;
      render();
    });

    sincronizarFlujo(sesionActual);

    const cont = document.getElementById('tab-content');
    if (state.tab === 'resumen') renderResumen(cont, p, sesionActual, rep, esAdmin);
    else if (state.tab === 'reproduccion') renderReproduccion(cont, p, rep);
    else if (state.tab === 'sesiones') renderSesiones(cont, p);
    else if (state.tab === 'horarios') renderHorarios(cont, p);
    else if (state.tab === 'listas') renderListas(cont, p);
    else if (state.tab === 'bloqueos') renderBloqueos(cont);
    else if (state.tab === 'analitica') renderAnalitica(cont);
    else if (state.tab === 'mantenimiento') renderMantenimiento(cont, sesionActual);
  }

  const ETQ_JORNADA_PROG = {
    abierta: { cls: 'ok', texto: 'Abierta (automática)' },
    omitida_sesion_manual: { cls: 'warn', texto: 'Omitida por sesión manual activa' },
    cerrada_auto: { cls: '', texto: 'Cerrada automáticamente' },
    cerrada_manual: { cls: '', texto: 'Cerrada manualmente' },
  };

  function renderResumen(cont, p, s, rep, esAdmin) {
    const ev = p.horario.evaluacion_actual;
    const actual = rep && rep.actual;
    const dev = p.dispositivos_estado || { activos: p.dispositivos_activos || 0, inactivos_recientes: 0, desconectados: 0 };
    const jp = p.jornada_programada;
    const jpEtq = jp ? (ETQ_JORNADA_PROG[jp.estado] || { cls: '', texto: jp.estado }) : null;
    cont.innerHTML = `
      <div class="grid-4">
        <div class="card"><div class="muted">Estado de sesión</div><div class="stat-val">${esc(s ? s.estado : '—')}</div></div>
        <div class="card"><div class="muted">Código QR</div><div class="stat-val">${esc(s ? s.qr_estado : '—')}</div></div>
        <div class="card"><div class="muted">Horario actual (${esc(ev.hora_local)})</div><div class="stat-val">${ev.abierto ? 'Abierto' : 'Cerrado'}</div></div>
        <div class="card"><div class="muted">Bloqueos vigentes</div><div class="stat-val">${p.bloqueos_activos}</div></div>
      </div>

      <div class="grid-2 mt">
        <div class="card">
          <div class="between">
            <h2>Ahora suena</h2>
            <span class="pill ${rep && rep.estado_reproduccion === 'reproduciendo' ? 'ok' : 'warn'}"><span class="dot"></span>${esc(rep ? rep.estado_reproduccion : 'detenida')}</span>
          </div>
          ${actual ? `
            <div class="song-row">
              <img class="song-thumb" src="${esc(actual.cancion.url_miniatura || '')}" alt="">
              <div>
                <div class="song-title">${esc(actual.cancion.titulo)}</div>
                <div class="song-meta">${esc(actual.cancion.artista_canal)} · ${fmtSeg(actual.cancion.duracion_segundos)} · ${actual.fuente === 'solicitud' ? `Solicitud (${actual.total_votos} votos)` : `Lista: ${esc(actual.lista_nombre)}`}</div>
              </div>
            </div>` : '<p class="muted">No hay ninguna canción en reproducción.</p>'}
          <div class="row mt">
            <button class="btn primary" id="go-dj">Ir a Control DJ</button>
            ${esAdmin && s && s.qr_estado === 'activo' && !s.desactivado_permanente ? `<button class="btn warn" id="toggle-qr">Desactivar QR</button>` : ''}
          </div>
        </div>

        <div class="card">
          <h2>Operación rápida</h2>
          <p class="muted">Modo automático por horario: <strong>${p.configuracion.modo_automatico ? 'Activado' : 'Manual'}</strong></p>
          <p class="muted">Lista predeterminada: <strong>${esc((p.listas.listas.find((l) => l.es_predeterminada) || {}).nombre || 'Sin asignar')}</strong></p>
          <p class="muted">Cola en espera: <strong>${rep ? rep.cola.length : 0}</strong> canciones solicitadas</p>
          <p class="muted">Dispositivos: <strong>${dev.activos}</strong> activos · <strong>${dev.inactivos_recientes}</strong> inactivos recientes · <strong>${dev.desconectados}</strong> desconectados</p>
          ${jp ? `<p class="muted">Última jornada (${esc(jp.fecha_jornada)}): <span class="pill ${jpEtq.cls}">${esc(jpEtq.texto)}</span>${jp.id_sesion ? ` · <strong>${esc(jp.id_sesion)}</strong>` : ''}${jp.codigo_acceso ? ` · Código <strong>${esc(jp.codigo_acceso)}</strong>` : ''}</p>` : ''}
        </div>
      </div>`;

    document.getElementById('go-dj').addEventListener('click', () => { state.tab = 'reproduccion'; cargarPanel(); });
    const tqr = document.getElementById('toggle-qr');
    if (tqr) tqr.addEventListener('click', async () => {
      try {
        await api('PATCH', `/sesiones/${encodeURIComponent(s.id_sesion)}/qr`, { activo: false });
        await cargarPanel();
      } catch (e) { showToast(e.message, true); }
    });
  }

  function estadoSalidaSoundPill(sonido, disp) {
    if (!sonido) return { cls: 'accent', txt: 'Suena en este panel' };
    if (sonido.salida === 'equipo_local') {
      return sonido.salida_conectada
        ? { cls: 'ok', txt: 'Equipo del local conectado' }
        : { cls: 'err', txt: 'Equipo del local sin conexión' };
    }
    if (sonido.salida === 'pantalla_publica') {
      return disp && disp.lease_vigente
        ? { cls: 'ok', txt: 'Pantalla pública con control autorizado' }
        : { cls: 'warn', txt: 'Pantalla pública sin control' };
    }
    return { cls: 'accent', txt: 'Suena en este panel' };
  }

  function badgesDisplay(d) {
    if (!d) return { conCls: '', conTxt: 'Sin información', ctlCls: '', ctlTxt: 'Sin control' };
    let conCls = 'warn';
    let conTxt = 'Pantalla creada · Sin conexión';
    if (d.sesion_estado !== 'activa') {
      conCls = 'err';
      conTxt = 'Sesión cerrada';
    } else if (d.estado_pantalla === 'pantalla_revocada') {
      conCls = 'err';
      conTxt = 'Pantalla revocada';
    } else if (!d.existe) {
      conCls = '';
      conTxt = 'Sin pantalla creada';
    } else if (d.sse_conectada) {
      conCls = 'ok';
      conTxt = 'Pantalla conectada (SSE)';
    }

    let ctlCls = '';
    let ctlTxt = 'Sin control';
    if (d.estado_control === 'control_autorizado') {
      ctlCls = 'ok';
      ctlTxt = 'Control autorizado';
    } else if (d.estado_control === 'control_perdido') {
      ctlCls = 'err';
      ctlTxt = 'Control perdido';
    } else if (d.estado_control === 'control_liberado') {
      ctlCls = 'warn';
      ctlTxt = 'Control liberado';
    }
    return { conCls, conTxt, ctlCls, ctlTxt };
  }

  function renderDisplayCardHtml(d) {
    const badges = badgesDisplay(d);
    const cerrada = !d || d.sesion_estado !== 'activa';
    const urlCompleta = d && d.ruta_publica ? `${window.location.origin}${d.ruta_publica}` : '';
    const ct = state.claimTemporal && state.claimTemporal.idSesion === (d && d.id_sesion) ? state.claimTemporal : null;
    const ttlSeg = ct ? Math.max(0, Math.ceil((ct.expiraEnMs - Date.now()) / 1000)) : 0;
    const salidaEsTv = Boolean(state.sonido && state.sonido.salida === 'pantalla_publica');
    const puedeLiberar = Boolean(d && d.existe && (d.lease_vigente || d.claim_pendiente || d.estado_control === 'control_autorizado' || d.estado_control === 'control_perdido'));

    return `
      <div class="card mt" id="card-display-publica">
        <div class="between">
          <div>
            <h2>Pantalla Pública (TV)</h2>
            <p class="muted" style="margin:0">Vista 16:9 para televisor o proyector. El enlace es independiente del QR de clientes.</p>
          </div>
          <div class="row">
            <span id="disp-pill-conexion" class="pill ${badges.conCls}"><span class="dot"></span>${esc(badges.conTxt)}</span>
            <span id="disp-pill-control" class="pill ${badges.ctlCls}"><span class="dot"></span>${esc(badges.ctlTxt)}</span>
          </div>
        </div>

        <div class="display-grid mt">
          <div class="display-subcard">
            <h3 style="margin:0">Enlace de visualización</h3>
            ${cerrada ? '<p class="muted">La sesión está cerrada. Activa una nueva sesión en <strong>Sesiones y QR</strong> para habilitar una pantalla pública.</p>' : (
        d.existe ? `
                <div class="display-url-row">
                  <input id="disp-url" type="text" readonly value="${esc(urlCompleta)}" aria-label="Enlace público del televisor">
                  <button class="btn sm" id="btn-disp-copiar" type="button">Copiar enlace</button>
                </div>
                <div class="row">
                  <a class="btn sm primary" id="btn-disp-abrir" href="${esc(d.ruta_publica)}" target="_blank" rel="noopener">Abrir pantalla pública</a>
                  <button class="btn sm" id="btn-disp-regenerar" type="button">Regenerar enlace</button>
                  <button class="btn sm danger" id="btn-disp-revocar" type="button">Revocar</button>
                </div>
              ` : `
                <p class="muted">${d.estado_pantalla === 'pantalla_revocada'
          ? 'El enlace anterior fue revocado y dejó de responder. Crea uno nuevo cuando lo necesites.'
          : 'Aún no has creado un enlace público para esta sesión.'}</p>
                <div class="row">
                  <button class="btn primary" id="btn-disp-crear" type="button">${d.estado_pantalla === 'pantalla_revocada' ? 'Crear nuevo enlace' : 'Crear pantalla pública'}</button>
                </div>
              `
      )}
          </div>

          <div class="display-subcard">
            <h3 style="margin:0">Autorización de audio y control del TV</h3>
            <p class="muted" style="margin:0">Solo un televisor autorizado puede reproducir audio y reportar el avance de canciones. El código temporal debe introducirse en la pantalla pública.</p>
            ${!cerrada && !salidaEsTv ? `
              <div class="row">
                <span class="pill warn"><span class="dot"></span>La salida actual no apunta al TV</span>
                <button class="btn sm" id="btn-disp-activar-salida" type="button">Cambiar salida a pantalla pública</button>
              </div>
            ` : ''}
            ${!cerrada ? `
              <div class="row">
                <button class="btn primary" id="btn-disp-claim" type="button" ${d.existe ? '' : 'disabled'}>Generar código de vinculación</button>
                <button class="btn warn" id="btn-disp-liberar" type="button" ${puedeLiberar ? '' : 'disabled'}>Liberar control</button>
              </div>
            ` : ''}
            ${ct && ttlSeg > 0 ? `
              <div class="claim-box" id="disp-claim-box">
                <div class="between">
                  <strong style="font-size:.86rem">Código temporal (un solo uso)</strong>
                  <span class="muted" id="disp-claim-ttl">Expira en ${ttlSeg} s</span>
                </div>
                <div class="claim-code mt" id="disp-claim-code">${esc(ct.codigo)}</div>
                <p class="muted" style="margin:8px 0">Ingrésalo en <em>Activar reproducción y audio en pantalla</em> en el TV. No se guarda en almacenamiento local.</p>
                <div class="row">
                  <button class="btn sm" id="btn-disp-copiar-claim" type="button">Copiar código</button>
                  <button class="btn sm" id="btn-disp-ocultar-claim" type="button">Ocultar</button>
                </div>
              </div>
            ` : ''}
          </div>
        </div>
      </div>`;
  }

  function enlazarDisplayCard() {
    const idSesion = state.sesionId;
    if (!idSesion) return;
    const bCrear = document.getElementById('btn-disp-crear');
    if (bCrear) bCrear.addEventListener('click', async () => {
      try {
        state.display = await api('POST', `/sesiones/${encodeURIComponent(idSesion)}/display`, {});
        showToast('Pantalla pública lista');
        render();
      } catch (e) { showToast(e.message, true); }
    });
    const bCopiar = document.getElementById('btn-disp-copiar');
    if (bCopiar) bCopiar.addEventListener('click', () => {
      const inp = document.getElementById('disp-url');
      if (inp) copiarTexto(inp.value, 'Enlace público copiado');
    });
    const bRegen = document.getElementById('btn-disp-regenerar');
    if (bRegen) bRegen.addEventListener('click', async () => {
      try {
        limpiarClaim();
        state.display = await api('POST', `/sesiones/${encodeURIComponent(idSesion)}/display/regenerar`, {});
        programarVencimientoLease();
        showToast('Enlace regenerado; el anterior quedó revocado');
        render();
      } catch (e) { showToast(e.message, true); }
    });
    const bRev = document.getElementById('btn-disp-revocar');
    if (bRev) bRev.addEventListener('click', async () => {
      try {
        limpiarClaim();
        state.display = await api('DELETE', `/sesiones/${encodeURIComponent(idSesion)}/display`);
        programarVencimientoLease();
        showToast('Pantalla pública revocada');
        render();
      } catch (e) { showToast(e.message, true); }
    });
    const bActSal = document.getElementById('btn-disp-activar-salida');
    if (bActSal) bActSal.addEventListener('click', async () => {
      try {
        state.sonido = await api('PUT', '/sonido', { salida: 'pantalla_publica' });
        aplicarVolumenPanel();
        showToast('Salida cambiada a pantalla pública');
        await cargarPanel();
      } catch (e) { showToast(e.message, true); }
    });
    const bClaim = document.getElementById('btn-disp-claim');
    if (bClaim) bClaim.addEventListener('click', async () => {
      try {
        const res = await api('POST', `/sesiones/${encodeURIComponent(idSesion)}/display/autorizar-control`, {});
        state.claimTemporal = {
          idSesion,
          codigo: res.claim_code,
          expiraEnMs: Date.now() + ((Number(res.ttl_segundos) || 120) * 1000),
        };
        await refrescarDisplay();
        showToast('Código temporal generado');
      } catch (e) { showToast(e.message, true); }
    });
    const bCopClaim = document.getElementById('btn-disp-copiar-claim');
    if (bCopClaim) bCopClaim.addEventListener('click', () => {
      if (state.claimTemporal) copiarTexto(state.claimTemporal.codigo, 'Código temporal copiado');
    });
    const bOcultarClaim = document.getElementById('btn-disp-ocultar-claim');
    if (bOcultarClaim) bOcultarClaim.addEventListener('click', () => {
      limpiarClaim();
      render();
    });
    const bLib = document.getElementById('btn-disp-liberar');
    if (bLib) bLib.addEventListener('click', async () => {
      try {
        await api('POST', `/sesiones/${encodeURIComponent(idSesion)}/display/liberar-control`, {});
        limpiarClaim();
        showToast('Control del televisor liberado');
        await refrescarDisplay();
      } catch (e) { showToast(e.message, true); }
    });
  }

  function renderReproduccion(cont, p, rep) {
    if (!rep) {
      cont.innerHTML = `<div class="card"><p class="muted">No hay ninguna sesión activa. Crea y activa una sesión en <strong>Sesiones y QR</strong> para iniciar la reproducción.</p></div>${state.display ? renderDisplayCardHtml(state.display) : ''}`;
      return;
    }
    const actual = rep.actual;
    const pillSnd = estadoSalidaSoundPill(state.sonido, state.display);
    cont.innerHTML = `
      <div class="grid-2">
        <div class="card">
          <div class="between">
            <h2>Reproductor YouTube</h2>
            <span class="pill ${rep.estado_reproduccion === 'reproduciendo' ? 'ok' : 'warn'}"><span class="dot"></span>${esc(rep.estado_reproduccion)}</span>
          </div>
          <div id="yt-mount-point" class="yt-box mt" style="border-color:transparent;background:transparent"></div>
          ${actual ? `
            <div class="between mt">
              <div>
                <div class="song-title">${esc(actual.cancion.titulo)}</div>
                <div class="song-meta">${esc(actual.cancion.artista_canal)} · ${fmtSeg(actual.cancion.duracion_segundos)} · ${actual.fuente === 'solicitud' ? `Solicitud de cliente (${actual.total_votos} votos)` : `Continuidad automática (${esc(actual.lista_nombre)})`}</div>
              </div>
              <button class="btn sm danger" data-bloq-yt="${esc(actual.cancion.youtube_video_id)}" data-bloq-tit="${esc(actual.cancion.titulo)}" data-bloq-actual="1">Bloquear</button>
            </div>` : '<p class="muted mt">Sin canción sonando. Pulsa Iniciar para reproducir la cola o la lista predeterminada.</p>'}
          <div class="row mt">
            ${rep.estado_reproduccion === 'reproduciendo'
        ? '<button class="btn primary" id="rep-toggle" data-acc="pausar" title="Pausar">⏸ Pausar</button>'
        : (rep.estado_reproduccion === 'pausada'
          ? '<button class="btn success" id="rep-toggle" data-acc="reanudar" title="Reanudar">▶ Reanudar</button>'
          : '<button class="btn primary" id="rep-toggle" data-acc="iniciar" title="Iniciar">▶ Iniciar</button>')}
            <button class="btn warn" id="rep-saltar" title="Saltar a la siguiente" ${actual ? '' : 'disabled'}>⏭ Saltar</button>
          </div>
          ${state.sonido ? `
            <div class="mt" style="padding-top:14px;border-top:1px solid var(--line)">
              <div class="between">
                <h3 style="margin:0">Sistema de sonido del local</h3>
                <span class="pill ${pillSnd.cls}"><span class="dot"></span>${esc(pillSnd.txt)}</span>
              </div>
              <div class="row mt">
                <button class="btn sm" id="snd-mute" title="Silenciar o activar el sonido">${state.sonido.silenciado ? '🔇 Activar sonido' : '🔊 Silenciar'}</button>
                <input id="snd-vol" type="range" min="0" max="100" value="${state.sonido.volumen}" style="flex:1;min-width:120px;padding:0">
                <span class="pill" id="snd-vol-txt">${state.sonido.volumen}%</span>
              </div>
              <div class="row mt">
                <select id="snd-salida" style="flex:1;min-width:180px">
                  <option value="panel" ${state.sonido.salida === 'panel' ? 'selected' : ''}>Salida: este panel</option>
                  <option value="equipo_local" ${state.sonido.salida === 'equipo_local' ? 'selected' : ''}>Salida: equipo del local (/sonido)</option>
                  <option value="pantalla_publica" ${state.sonido.salida === 'pantalla_publica' ? 'selected' : ''}>Salida: pantalla pública (TV)</option>
                </select>
                <a class="btn sm" href="/sonido" target="_blank" rel="noopener">Abrir salida del local</a>
              </div>
              <p class="muted" style="margin:8px 0 0">Solo la salida elegida reproduce el audio del local (este panel, <code>/sonido</code> o la pantalla pública).</p>
            </div>` : ''}
        </div>

        <div class="card">
          <div class="between">
            <h2>Cola de solicitudes (${rep.cola.length})</h2>
            <span class="muted">Ordenada por votos</span>
          </div>
          ${rep.cola.length ? rep.cola.map((s) => `
            <div class="song-row">
              <img class="song-thumb" src="${esc(s.cancion.url_miniatura || '')}" alt="">
              <div style="flex:1">
                <div class="song-title">#${s.posicion} · ${esc(s.cancion.titulo)}</div>
                <div class="song-meta">${esc(s.cancion.artista_canal)} · ${fmtSeg(s.cancion.duracion_segundos)}</div>
              </div>
              <span class="pill accent">${s.total_votos} votos</span>
              <button class="btn sm danger" data-bloq-yt="${esc(s.cancion.youtube_video_id)}" data-bloq-tit="${esc(s.cancion.titulo)}">Bloquear</button>
            </div>`).join('') : '<p class="muted">No hay solicitudes pendientes. Al iniciar o terminar una canción sonará automáticamente la lista predeterminada.</p>'}

          <h3 class="mt">Historial reciente</h3>
          ${rep.historial_reciente.slice(0, 6).map((h) => `
            <div class="song-meta" style="padding:4px 0;border-bottom:1px solid var(--line)">
              ${esc(h.cancion.titulo)} · <strong>${esc(h.resultado)}</strong> (${h.fuente === 'solicitud' ? 'solicitud' : 'lista'})
            </div>`).join('') || '<p class="muted">Aún no hay reproducciones registradas.</p>'}
        </div>
      </div>
      ${renderDisplayCardHtml(state.display)}`;

    const tog = document.getElementById('rep-toggle');
    if (tog) tog.addEventListener('click', () => accionRep(tog.dataset.acc));
    document.getElementById('rep-saltar').addEventListener('click', () => accionRep('saltar'));
    const sndMute = document.getElementById('snd-mute');
    if (sndMute) {
      const guardarSonido = async (cambios) => {
        try {
          state.sonido = await api('PUT', '/sonido', cambios);
          aplicarVolumenPanel();
          if ('salida' in cambios) await cargarPanel();
        } catch (e) { showToast(e.message, true); }
      };
      sndMute.addEventListener('click', async () => {
        await guardarSonido({ silenciado: !state.sonido.silenciado });
        sndMute.textContent = state.sonido && state.sonido.silenciado ? '🔇 Activar sonido' : '🔊 Silenciar';
      });
      const vol = document.getElementById('snd-vol');
      vol.addEventListener('input', () => {
        document.getElementById('snd-vol-txt').textContent = `${vol.value}%`;
        if (state.sonido) state.sonido.volumen = Number(vol.value);
        aplicarVolumenPanel();
      });
      vol.addEventListener('change', () => guardarSonido({ volumen: Number(vol.value) }));
      document.getElementById('snd-salida').addEventListener('change', (e) => guardarSonido({ salida: e.target.value }));
    }
    enlazarDisplayCard();
    cont.querySelectorAll('[data-bloq-yt]').forEach((b) => b.addEventListener('click', async () => {
      const datos = await pedirBloqueoModal(b.dataset.bloqTit);
      if (!datos) return;
      try {
        await api('POST', '/bloqueos', {
          youtube_video_id: b.dataset.bloqYt,
          motivo: datos.motivo,
          duracion_minutos: datos.duracion_minutos,
        });
        showToast('Canción bloqueada');
        if (b.dataset.bloqActual === '1') {
          await accionRep('saltar');
        } else {
          await cargarPanel();
        }
      } catch (e) { showToast(e.message, true); }
    }));
    asegurarHostYoutube();
    requestAnimationFrame(posicionarYoutube);
    sincronizarYoutube();
  }

  function estadoAccesoInfo(s) {
    if (s.desactivado_permanente) return { clase: 'err', texto: 'Acceso revocado' };
    if (!s.codigo_acceso) return { clase: '', texto: 'Sesión creada antes del acceso por código: solo QR' };
    if (s.estado === 'activa' && s.qr_estado === 'activo') return { clase: 'ok', texto: 'Acceso habilitado' };
    return { clase: 'warn', texto: 'Acceso en pausa / fuera de horario' };
  }

  function codigoAccesoHtml(codigo, desactivado) {
    if (!codigo) {
      return '<div class="muted">Sin código de 6 dígitos asociado (solo QR).</div>';
    }
    const digitos = String(codigo).split('');
    const cajas = digitos.map((d, i) => (
      `${i === 3 ? '<span class="codigo-sep" aria-hidden="true">·</span>' : ''}<span>${esc(d)}</span>`
    )).join('');
    return `<div class="codigo-acceso${desactivado ? ' codigo-revocado' : ''}" aria-label="Código de acceso ${esc(codigo)}">${cajas}</div>`;
  }

  function imprimirTarjetaAcceso(s) {
    const win = window.open('', '_blank', 'width=560,height=740');
    if (!win) {
      showToast('Permite las ventanas emergentes para imprimir la tarjeta.', true);
      return;
    }
    const qrSrc = `/api/admin/sesiones/${encodeURIComponent(s.id_sesion)}/qr.png`;
    const codigoFmt = s.codigo_acceso ? `${s.codigo_acceso.slice(0, 3)} ${s.codigo_acceso.slice(3)}` : '';
    const vigencia = estadoAccesoInfo(s).texto;
    win.document.write(`<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>Acceso ${esc(s.id_sesion)} — PONGA PUES</title>
<style>
  body { margin:0; padding:32px; font-family:Manrope,system-ui,sans-serif; background:#f7f8fc; color:#11131c; display:flex; justify-content:center; }
  .sheet { background:#fff; border:2px solid #252b3a; border-radius:20px; padding:28px; max-width:420px; width:100%; text-align:center; }
  .logo { width:72px; height:72px; object-fit:contain; }
  h1 { margin:8px 0 4px; font-size:1.35rem; letter-spacing:.04em; }
  .sub { color:#4a5164; font-size:.92rem; margin:0 0 18px; }
  .qr { width:240px; height:240px; border:1px solid #d7dce8; border-radius:14px; padding:10px; background:#fff; }
  .cod-label { margin:18px 0 6px; font-size:.78rem; font-weight:800; letter-spacing:.08em; text-transform:uppercase; color:#5a4ae3; }
  .cod { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:2.3rem; font-weight:800; letter-spacing:.18em; background:#f1effe; border:1px solid #8b7cff; border-radius:12px; padding:10px 14px; }
  .meta { margin-top:16px; font-size:.82rem; color:#576075; }
  @media print { body { background:#fff; padding:0; } .sheet { border:1px solid #000; } }
</style></head><body>
  <div class="sheet">
    <img class="logo" src="/ponga-logo.png" alt="PONGA PUES">
    <h1>PONGA PUES</h1>
    <p class="sub">Escanea el código QR o ingresa el código de 6 dígitos en la aplicación.</p>
    <img class="qr" src="${esc(qrSrc)}" alt="QR ${esc(s.id_sesion)}">
    ${codigoFmt ? `<div class="cod-label">Código de acceso</div><div class="cod">${esc(codigoFmt)}</div>` : ''}
    <div class="meta">Sesión: <strong>${esc(s.id_sesion)}</strong> · ${esc(vigencia)}</div>
  </div>
  <script>window.addEventListener('load', () => { setTimeout(() => window.print(), 180); });</script>
</body></html>`);
    win.document.close();
  }

  function tarjetaSesionHtml(s) {
    const acc = estadoAccesoInfo(s);
    return `
      <div class="card">
        <div class="between">
          <div>
            <div class="eyebrow">${esc(s.id_sesion)}</div>
            <div class="muted">Token QR: <code>${esc(s.qr_token)}</code></div>
          </div>
          <div class="row">
            <span class="pill ${s.estado === 'activa' ? 'ok' : 'err'}"><span class="dot"></span>${esc(s.estado)}</span>
            <span class="pill ${s.qr_estado === 'activo' ? 'ok' : 'warn'}"><span class="dot"></span>QR ${esc(s.qr_estado)}</span>
          </div>
        </div>
        <div class="acceso-sesion-box mt">
          <div class="between">
            <span class="eyebrow">ACCESO A LA SESIÓN</span>
            <span class="pill ${acc.clase}"><span class="dot"></span>${esc(acc.texto)}</span>
          </div>
          <div class="row mt" style="align-items:flex-start">
            ${s.estado === 'activa' || !s.desactivado_permanente
        ? `<img class="qr-preview" src="/api/admin/sesiones/${encodeURIComponent(s.id_sesion)}/qr.png" alt="QR ${esc(s.id_sesion)}">`
        : ''}
            <div style="flex:1;min-width:210px">
              <div class="muted">Sesión: <code>${esc(s.id_sesion)}</code></div>
              <div class="mt-sm">
                <div class="muted" style="margin-bottom:6px">Código numérico (6 dígitos)</div>
                ${codigoAccesoHtml(s.codigo_acceso, s.desactivado_permanente)}
              </div>
              <p class="muted mt-sm">URL para app móvil:<br><code>${esc(s.qr_url)}</code></p>
              <div class="row mt-sm">
                ${s.codigo_acceso
        ? `<button class="btn sm" type="button" data-copiar-codigo="${esc(s.codigo_acceso)}">Copiar código</button>`
        : ''}
                <button class="btn sm" type="button" data-copiar-qr="${esc(s.qr_url)}">Copiar enlace QR</button>
                ${!s.desactivado_permanente
        ? `<button class="btn sm" type="button" data-imprimir-acceso="${esc(s.id_sesion)}">Imprimir tarjeta</button>`
        : ''}
              </div>
            </div>
          </div>
        </div>
        <div class="between mt">
          <p class="muted" style="margin:0">Pendientes en cola: <strong>${s.pendientes}</strong> · Históricas: <strong>${s.solicitudes_historicas}</strong></p>
          <div class="row">
            ${s.estado === 'activa'
        ? `
                <button class="btn sm danger" data-des="${esc(s.id_sesion)}">Cerrar sesión</button>
                ${!s.desactivado_permanente && s.qr_estado === 'activo'
          ? `<button class="btn sm" data-qr="${esc(s.id_sesion)}" data-qract="0">Desactivar QR</button>`
          : '<span class="pill warn">QR desactivado (no reutilizable)</span>'}
              `
        : (s.desactivado_permanente
          ? '<span class="pill err">Cerrada permanentemente</span>'
          : `<button class="btn sm success" data-act="${esc(s.id_sesion)}">Activar sesión y QR</button>`)}
          </div>
        </div>
      </div>`;
  }

  function renderSesiones(cont, p) {
    const vigentes = p.sesiones.filter((s) => s.estado === 'activa' || !s.desactivado_permanente);
    const cerradas = p.sesiones.filter((s) => s.estado !== 'activa' && s.desactivado_permanente);
    const bloqueadoPorHorario = p.configuracion.modo_automatico && !p.horario.evaluacion_actual.abierto;
    cont.innerHTML = `
      ${bloqueadoPorHorario ? `
        <div class="card" style="border-color:var(--warning);margin-bottom:16px">
          <div class="between">
            <div>
              <div class="eyebrow" style="color:var(--warning)">Modo automático activo · Fuera de horario (${esc(p.horario.evaluacion_actual.hora_local)})</div>
              <p class="muted" style="margin:6px 0 0">El planificador cierra automáticamente las sesiones cada 15 s fuera del horario configurado. Ajusta el horario o desactiva el modo automático si deseas operar manualmente.</p>
            </div>
            <button id="btn-desactivar-auto-rapido" class="btn warn sm">Desactivar modo automático</button>
          </div>
        </div>` : ''}
      <div class="card">
        <h2>Crear nueva sesión musical</h2>
        <form id="f-nueva-sesion" class="row">
          <div style="flex:1;min-width:180px"><input id="ns-id" placeholder="ID opcional (ej. SES-VIERNES)"></div>
          <div style="flex:1;min-width:180px"><input id="ns-token" placeholder="Token QR opcional (8-64 chars)"></div>
          <label class="row" style="gap:6px;margin:0;cursor:pointer">
            <input id="ns-activar" type="checkbox" checked style="width:18px;height:18px">
            <span>Activar al crear</span>
          </label>
          <button class="btn primary" type="submit">Crear sesión</button>
        </form>
      </div>
      <div class="grid-2 mt">
        ${vigentes.length ? vigentes.map(tarjetaSesionHtml).join('') : '<div class="card"><p class="muted">No hay sesiones activas. Crea una nueva sesión arriba.</p></div>'}
      </div>
      ${cerradas.length ? `
        <details class="card mt">
          <summary style="cursor:pointer;font-weight:700">Historial de sesiones cerradas / QR desactivados (${cerradas.length})</summary>
          <div class="grid-2 mt">
            ${cerradas.map(tarjetaSesionHtml).join('')}
          </div>
        </details>` : ''}`;

    const btnAutoRapido = document.getElementById('btn-desactivar-auto-rapido');
    if (btnAutoRapido) btnAutoRapido.addEventListener('click', async () => {
      try {
        await api('PATCH', '/establecimiento/automatico', { modo_automatico: false });
        showToast('Modo automático desactivado');
        await cargarPanel();
      } catch (err) { showToast(err.message, true); }
    });

    document.getElementById('f-nueva-sesion').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const body = {};
        const id = document.getElementById('ns-id').value.trim();
        const tk = document.getElementById('ns-token').value.trim();
        if (id) body.id_sesion = id;
        if (tk) body.qr_token = tk;
        const creada = await api('POST', '/sesiones', body);
        const activarAlCrear = document.getElementById('ns-activar').checked;
        if (activarAlCrear && creada && creada.sesion) {
          await api('POST', `/sesiones/${encodeURIComponent(creada.sesion.id_sesion)}/activar`);
          state.sesionId = creada.sesion.id_sesion;
        }
        showToast(activarAlCrear ? 'Sesión creada y activada' : 'Sesión creada (cerrada)');
        await cargarPanel();
      } catch (err) { showToast(err.message, true); }
    });
    cont.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', async () => {
      try {
        await api('POST', `/sesiones/${encodeURIComponent(b.dataset.act)}/activar`);
        state.sesionId = b.dataset.act;
        await cargarPanel();
      } catch (e) { showToast(e.message, true); }
    }));
    cont.querySelectorAll('[data-des]').forEach((b) => b.addEventListener('click', async () => {
      try {
        await api('POST', `/sesiones/${encodeURIComponent(b.dataset.des)}/desactivar`, { limpiar_cola: true });
        if (state.sesionId === b.dataset.des) state.sesionId = null;
        await cargarPanel();
      } catch (e) { showToast(e.message, true); }
    }));
    cont.querySelectorAll('[data-qr]').forEach((b) => b.addEventListener('click', async () => {
      try { await api('PATCH', `/sesiones/${encodeURIComponent(b.dataset.qr)}/qr`, { activo: b.dataset.qract === '1' }); await cargarPanel(); } catch (e) { showToast(e.message, true); }
    }));
    cont.querySelectorAll('[data-copiar-codigo]').forEach((b) => b.addEventListener('click', () => {
      copiarTexto(b.dataset.copiarCodigo, 'Código de acceso copiado');
    }));
    cont.querySelectorAll('[data-copiar-qr]').forEach((b) => b.addEventListener('click', () => {
      copiarTexto(b.dataset.copiarQr, 'Enlace QR copiado');
    }));
    cont.querySelectorAll('[data-imprimir-acceso]').forEach((b) => b.addEventListener('click', () => {
      const ses = (p.sesiones || []).find((x) => x.id_sesion === b.dataset.imprimirAcceso);
      if (ses) imprimirTarjetaAcceso(ses);
    }));
  }

  function renderHorarios(cont, p) {
    const mapH = new Map(p.horario.horarios.map((h) => [h.dia_semana, h]));
    const sesionesDisponibles = p.sesiones.filter((s) => s.estado === 'activa' || !s.desactivado_permanente);
    const jp = p.jornada_programada;
    const jpEtq = jp ? (ETQ_JORNADA_PROG[jp.estado] || { cls: '', texto: jp.estado }) : null;
    cont.innerHTML = `
      <div class="grid-2">
        <div class="card">
          <div class="between">
            <h2>Automatización y Pausa manual</h2>
            <span class="pill ${p.horario.evaluacion_actual.abierto ? 'ok' : 'err'}"><span class="dot"></span>${esc(p.horario.evaluacion_actual.hora_local)} · ${p.horario.evaluacion_actual.abierto ? 'En horario' : 'Fuera de horario'}</span>
          </div>
          <div class="row mt">
            <div style="flex:1">
              <label for="cfg-ses">Sesión principal (opcional: se crea automática al abrir)</label>
              ${sesionesDisponibles.length ? `
                <select id="cfg-ses"><option value="">Creación automática al abrir</option>${sesionesDisponibles.map((s) => `<option value="${esc(s.id_sesion)}" ${s.id_sesion === p.configuracion.id_sesion_principal ? 'selected' : ''}>${esc(s.id_sesion)} (${esc(s.estado)})</option>`).join('')}</select>` : `
                <select id="cfg-ses"><option value="">Creación automática al abrir</option></select>`}
            </div>
            <button id="btn-auto" class="btn ${p.configuracion.modo_automatico ? 'warn' : 'primary'}">
              ${p.configuracion.modo_automatico ? 'Desactivar modo automático' : 'Activar modo automático'}
            </button>
          </div>
          ${jp ? `
            <div class="mt" style="padding:10px 12px;border-radius:10px;background:var(--surface2);border:1px solid var(--line)">
              <div class="between">
                <span class="muted">Jornada programada (${esc(jp.fecha_jornada)})</span>
                <span class="pill ${jpEtq.cls}">${esc(jpEtq.texto)}</span>
              </div>
              <div class="muted" style="margin-top:6px;font-size:.86rem">
                ${jp.id_sesion ? `Sesión: <strong>${esc(jp.id_sesion)}</strong>` : 'Sin sesión automática creada'}
                ${jp.codigo_acceso ? ` · Código 6 dígitos: <strong>${esc(jp.codigo_acceso)}</strong>` : ''}
                ${jp.motivo_estado ? ` · ${esc(jp.motivo_estado)}` : ''}
              </div>
            </div>` : ''}
          <div class="row mt">
            <input id="pausa-motivo" style="flex:1" placeholder="Motivo de pausa manual (opcional)" value="${esc(p.configuracion.pausa_motivo || '')}">
            <button id="btn-pausa" class="btn ${p.configuracion.pausa_manual ? 'success' : 'warn'}">
              ${p.configuracion.pausa_manual ? 'Reanudar QR' : 'Pausa manual del QR'}
            </button>
          </div>
        </div>

        <div class="card">
          <h2>Agregar excepción</h2>
          <form id="f-exc" class="row">
            <input id="ex-fecha" type="date" required style="flex:1">
            <select id="ex-cerrado" style="width:130px"><option value="1">Cerrado</option><option value="0">Horario especial</option></select>
            <input id="ex-ap" type="time" value="18:00" style="width:140px">
            <input id="ex-ci" type="time" value="02:00" style="width:140px">
            <input id="ex-mot" placeholder="Motivo" style="flex:1">
            <button class="btn primary" type="submit">Guardar</button>
          </form>
          <div class="mt">
            ${p.horario.excepciones.map((e) => `
              <div class="between" style="padding:6px 0;border-bottom:1px solid var(--line)">
                <span><strong>${esc(e.fecha)}</strong> · ${e.cerrado ? 'Cerrado' : `${e.apertura} - ${e.cierre}`} ${e.motivo ? `(${esc(e.motivo)})` : ''}</span>
                <button class="btn sm danger" data-delex="${e.id_excepcion}">Quitar</button>
              </div>`).join('') || '<p class="muted">Sin excepciones configuradas.</p>'}
          </div>
        </div>
      </div>

      <form id="f-horarios" class="card mt">
        <div class="between">
          <h2>Horario semanal</h2>
          <button class="btn primary" type="submit">Guardar horarios</button>
        </div>
        <table>
          <thead><tr><th>Día</th><th>Activo</th><th>Apertura</th><th>Cierre</th></tr></thead>
          <tbody>
            ${DIAS.map((nombre, d) => {
      const h = mapH.get(d) || { activo: d >= 4, apertura: '18:00', cierre: '02:00' };
      return `<tr>
                <td>${nombre}</td>
                <td><input type="checkbox" data-dia="${d}" class="h-act" ${h.activo ? 'checked' : ''} style="width:20px;height:20px"></td>
                <td><input type="time" data-dia="${d}" class="h-ap" value="${esc(h.apertura)}"></td>
                <td><input type="time" data-dia="${d}" class="h-ci" value="${esc(h.cierre)}"></td>
              </tr>`;
    }).join('')}
          </tbody>
        </table>
      </form>`;

    document.getElementById('cfg-ses').addEventListener('change', async (e) => {
      if (!e.target.value) return;
      try {
        await api('PATCH', '/establecimiento/automatico', { id_sesion_principal: e.target.value });
        showToast('Sesión principal actualizada');
        await cargarPanel();
      } catch (err) { showToast(err.message, true); }
    });
    document.getElementById('btn-auto').addEventListener('click', async () => {
      const idSel = document.getElementById('cfg-ses').value || null;
      try {
        const body = { modo_automatico: !p.configuracion.modo_automatico };
        if (idSel) body.id_sesion_principal = idSel;
        await api('PATCH', '/establecimiento/automatico', body);
        await cargarPanel();
      } catch (e) { showToast(e.message, true); }
    });
    document.getElementById('btn-pausa').addEventListener('click', async () => {
      try {
        await api('POST', '/establecimiento/pausa', {
          pausada: !p.configuracion.pausa_manual,
          motivo: document.getElementById('pausa-motivo').value.trim() || null,
        });
        await cargarPanel();
      } catch (e) { showToast(e.message, true); }
    });
    document.getElementById('f-horarios').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const horarios = DIAS.map((_, d) => ({
          dia_semana: d,
          activo: cont.querySelector(`.h-act[data-dia="${d}"]`).checked,
          apertura: cont.querySelector(`.h-ap[data-dia="${d}"]`).value,
          cierre: cont.querySelector(`.h-ci[data-dia="${d}"]`).value,
        }));
        await api('PUT', '/horarios', { horarios });
        showToast('Horarios actualizados');
        await cargarPanel();
      } catch (err) { showToast(err.message, true); }
    });
    document.getElementById('f-exc').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await api('POST', '/horarios/excepciones', {
          fecha: document.getElementById('ex-fecha').value,
          cerrado: document.getElementById('ex-cerrado').value === '1',
          apertura: document.getElementById('ex-ap').value,
          cierre: document.getElementById('ex-ci').value,
          motivo: document.getElementById('ex-mot').value.trim() || null,
        });
        await cargarPanel();
      } catch (err) { showToast(err.message, true); }
    });
    cont.querySelectorAll('[data-delex]').forEach((b) => b.addEventListener('click', async () => {
      try { await api('DELETE', `/horarios/excepciones/${b.dataset.delex}`); await cargarPanel(); } catch (e) { showToast(e.message, true); }
    }));
  }

  function renderListas(cont, p) {
    cont.innerHTML = `
      <div class="grid-2">
        <div class="card">
          <div class="between">
            <h2>Listas predeterminadas</h2>
            <button id="btn-rot" class="btn sm">${p.listas.rotacion_listas ? 'Rotación: ON' : 'Rotación: OFF'}</button>
          </div>
          <form id="f-lista" class="row mt">
            <input id="ln-nom" placeholder="Nombre de la lista" required style="flex:1">
            <button class="btn primary" type="submit">Crear lista</button>
          </form>
          <div class="mt">
            ${p.listas.listas.map((l) => `
              <div class="song-row between">
                <div>
                  <div class="song-title">${esc(l.nombre)} ${l.es_predeterminada ? '<span class="pill ok">Predeterminada</span>' : ''}</div>
                  <div class="song-meta">${l.total_canciones} canciones · ${fmtSeg(l.duracion_total_segundos)}</div>
                </div>
                <div class="row">
                  <button class="btn sm" data-verl="${l.id_lista}">Abrir</button>
                  ${!l.es_predeterminada ? `<button class="btn sm primary" data-defl="${l.id_lista}">Usar por defecto</button>` : ''}
                </div>
              </div>`).join('') || '<p class="muted">No hay listas creadas.</p>'}
          </div>
        </div>

        <div class="card">
          <div class="between">
            <h2>${state.detalleLista ? esc(state.detalleLista.nombre) : 'Detalle de lista'}</h2>
            ${state.detalleLista ? `<span class="pill">${state.detalleLista.canciones.length} canciones</span>` : ''}
          </div>
          ${state.detalleLista ? `
            <form id="f-buscar-yt" class="row mt">
              <input id="yt-q" placeholder="Buscar canción o artista en YouTube..." value="${esc(state.busquedaYt || '')}" minlength="2" required style="flex:1;min-width:200px">
              <button class="btn primary" type="submit">Buscar</button>
            </form>
            ${state.catalogoResultados.length ? `
              <div class="mt" style="max-height:260px;overflow:auto;display:flex;flex-direction:column;gap:8px">
                ${state.catalogoResultados.map((c) => `
                  <div class="song-row">
                    <img class="song-thumb" src="${esc(c.url_miniatura || '')}" alt="">
                    <div style="flex:1;min-width:0">
                      <div class="song-title">${esc(c.titulo)}</div>
                      <div class="song-meta">${esc(c.artista_canal)} · ${fmtSeg(c.duracion_segundos)}${c.genero ? ` · ${esc(c.genero)}` : ''}${c.total_votos ? ` · ${c.total_votos} votos` : ''}</div>
                    </div>
                    <button class="btn sm success" data-addyt="${esc(c.youtube_video_id)}">+ Agregar</button>
                  </div>`).join('')}
              </div>` : ''}
            <div class="mt">
              ${state.detalleLista.canciones.map((c, idx) => `
                <div class="song-row">
                  <div style="flex:1">
                    <div class="song-title">${c.posicion}. ${esc(c.titulo)}</div>
                    <div class="song-meta">${esc(c.artista_canal)} · ${fmtSeg(c.duracion_segundos)}</div>
                  </div>
                  <button class="btn sm" data-subir="${idx}" ${idx === 0 ? 'disabled' : ''}>↑</button>
                  <button class="btn sm danger" data-quit="${esc(c.youtube_video_id)}">Quitar</button>
                </div>`).join('') || '<p class="muted">Lista vacía.</p>'}
            </div>` : '<p class="muted">Selecciona una lista para ver o editar sus canciones.</p>'}
        </div>
      </div>`;

    const fl = document.getElementById('f-lista');
    if (fl) fl.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const nueva = await api('POST', '/listas', { nombre: document.getElementById('ln-nom').value.trim() });
        state.listaSeleccionada = nueva.id_lista;
        await cargarPanel();
      } catch (err) { showToast(err.message, true); }
    });
    const rot = document.getElementById('btn-rot');
    if (rot) rot.addEventListener('click', async () => {
      try { await api('PUT', '/listas/configuracion/predeterminada', { rotacion_listas: !p.listas.rotacion_listas }); await cargarPanel(); } catch (e) { showToast(e.message, true); }
    });
    cont.querySelectorAll('[data-verl]').forEach((b) => b.addEventListener('click', async () => {
      state.listaSeleccionada = Number(b.dataset.verl);
      await cargarPanel();
    }));
    cont.querySelectorAll('[data-defl]').forEach((b) => b.addEventListener('click', async () => {
      try { await api('PUT', '/listas/configuracion/predeterminada', { id_lista_defecto: Number(b.dataset.defl) }); await cargarPanel(); } catch (e) { showToast(e.message, true); }
    }));
    const fbyt = document.getElementById('f-buscar-yt');
    if (fbyt) fbyt.addEventListener('submit', async (e) => {
      e.preventDefault();
      const q = document.getElementById('yt-q').value.trim();
      state.busquedaYt = q;
      try {
        const res = await fetch('/api/busqueda?q=' + encodeURIComponent(q));
        if (res.ok) {
          const data = await res.json();
          state.catalogoResultados = (data.resultados || []).filter((c) => c.disponibilidad === 'disponible');
          if (!state.catalogoResultados.length) showToast('Sin resultados disponibles en YouTube', true);
          render();
          return;
        }
        const local = await api('GET', '/catalogo?q=' + encodeURIComponent(q));
        state.catalogoResultados = local.resultados || [];
        if (!state.catalogoResultados.length) showToast('Sin resultados (configura YOUTUBE_API_KEY para buscar en YouTube)', true);
        render();
      } catch (err) { showToast(err.message, true); }
    });
    cont.querySelectorAll('[data-addyt]').forEach((b) => b.addEventListener('click', async () => {
      try {
        await api('POST', `/listas/${state.listaSeleccionada}/canciones`, { youtube_video_id: b.dataset.addyt });
        showToast('Canción agregada a la lista');
        await cargarPanel();
      } catch (e) { showToast(e.message, true); }
    }));
    cont.querySelectorAll('[data-quit]').forEach((b) => b.addEventListener('click', async () => {
      try { await api('DELETE', `/listas/${state.listaSeleccionada}/canciones/${encodeURIComponent(b.dataset.quit)}`); await cargarPanel(); } catch (e) { showToast(e.message, true); }
    }));
    cont.querySelectorAll('[data-subir]').forEach((b) => b.addEventListener('click', async () => {
      const idx = Number(b.dataset.subir);
      const ids = state.detalleLista.canciones.map((c) => c.youtube_video_id);
      [ids[idx - 1], ids[idx]] = [ids[idx], ids[idx - 1]];
      try { await api('PUT', `/listas/${state.listaSeleccionada}/orden`, { orden: ids }); await cargarPanel(); } catch (e) { showToast(e.message, true); }
    }));
  }

  function renderBloqueos(cont) {
    cont.innerHTML = `
      <div class="card">
        <h2>Bloquear canción temporalmente</h2>
        <form id="f-bloq" class="row">
          <input id="bl-yt" placeholder="youtube_video_id (11 chars)" required style="width:210px">
          <input id="bl-mot" placeholder="Motivo del bloqueo" required style="flex:1">
          <input id="bl-min" type="number" min="1" max="43200" value="120" style="width:120px" title="Minutos">
          <button class="btn danger" type="submit">Bloquear</button>
        </form>
      </div>
      <div class="card mt">
        <h2>Contenido bloqueado</h2>
        ${state.bloqueos.map((b) => `
          <div class="song-row between">
            <div>
              <div class="song-title">${esc(b.cancion.titulo)} (${esc(b.cancion.youtube_video_id)})</div>
              <div class="song-meta">Motivo: ${esc(b.motivo)} · Hasta: ${fmtFecha(b.hasta)}</div>
            </div>
            ${b.vigente ? `<button class="btn sm success" data-unbloq="${b.id_bloqueo}">Permitir de nuevo</button>` : '<span class="pill">Finalizado</span>'}
          </div>`).join('') || '<p class="muted">No hay canciones bloqueadas actualmente.</p>'}
      </div>`;

    const fb = document.getElementById('f-bloq');
    if (fb) fb.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await api('POST', '/bloqueos', {
          youtube_video_id: document.getElementById('bl-yt').value.trim(),
          motivo: document.getElementById('bl-mot').value.trim(),
          duracion_minutos: Number(document.getElementById('bl-min').value),
        });
        showToast('Canción bloqueada');
        await cargarPanel();
      } catch (err) { showToast(err.message, true); }
    });
    cont.querySelectorAll('[data-unbloq]').forEach((b) => b.addEventListener('click', async () => {
      try { await api('POST', `/bloqueos/${b.dataset.unbloq}/desbloquear`); await cargarPanel(); } catch (e) { showToast(e.message, true); }
    }));
  }

  function renderAnalitica(cont) {
    const a = state.analitica;
    if (!a) { cont.innerHTML = '<div class="card"><p class="muted">Cargando indicadores…</p></div>'; return; }
    const ind = a.indicadores;
    const pop = a.popularidad || [];
    const maxVotos = Math.max(1, ...pop.map((x) => x.total_votos || x.total_solicitudes || 0));
    const temp = a.participacion_temporal || [];
    const maxEv = Math.max(1, ...temp.map((x) => x.eventos));
    const puntosSvg = temp.length > 1
      ? temp.map((t, i) => {
        const x = 44 + (i * 416) / (temp.length - 1);
        const y = 142 - (t.eventos / maxEv) * 114;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      }).join(' ')
      : (temp.length === 1 ? `44,${(142 - (temp[0].eventos / maxEv) * 114).toFixed(1)} 460,${(142 - (temp[0].eventos / maxEv) * 114).toFixed(1)}` : '');
    const hm = a.mapa_calor || null;
    const hmMax = hm && hm.max_interacciones ? hm.max_interacciones : 0;
    const nivelCelda = (n) => {
      if (!n || !hmMax) return 0;
      const ratio = n / hmMax;
      if (ratio >= 0.75) return 4;
      if (ratio >= 0.50) return 3;
      if (ratio >= 0.25) return 2;
      return 1;
    };
    const periodoTexto = hm && hm.periodo
      ? `Del ${fmtFecha(hm.periodo.desde)} al ${fmtFecha(hm.periodo.hasta)} (${esc(hm.zona_horaria || 'America/Bogota')})`
      : 'Sin período con actividad registrada';
    const respaldos = (state.respaldos && state.respaldos.respaldos) || [];

    cont.innerHTML = `
      <div class="between">
        <div>
          <div class="eyebrow">Acceso de administrador</div>
          <h2 style="font-size:1.35rem;margin:4px 0">Analítica</h2>
          <p class="muted" style="margin:0">Participación del público, canciones más solicitadas y copias de seguridad.</p>
        </div>
        <div class="row">
          <select id="an-alcance" style="width:auto">
            <option value="establecimiento" ${state.analiticaAlcance === 'establecimiento' ? 'selected' : ''}>Todo el establecimiento</option>
            <option value="sesion" ${state.analiticaAlcance === 'sesion' ? 'selected' : ''}>Sesión actual (${esc(state.sesionId || 'N/A')})</option>
          </select>
        </div>
      </div>

      <!-- Primera sección: indicadores generales -->
      <div class="grid-4 mt">
        <div class="card">
          <div class="kpi-head"><div class="kpi-icon">♪</div><span class="kpi-dots">···</span></div>
          <div class="muted">Solicitudes</div>
          <div class="kpi-num">${ind.total_solicitudes}</div>
          <div class="muted">${ind.solicitudes_rechazadas} rechazadas</div>
        </div>
        <div class="card">
          <div class="kpi-head"><div class="kpi-icon">✓</div><span class="kpi-dots">···</span></div>
          <div class="muted">Votos válidos</div>
          <div class="kpi-num">${ind.votos_validos}</div>
          <div class="muted">Votos aceptados en cola</div>
        </div>
        <div class="card">
          <div class="kpi-head"><div class="kpi-icon">⚠</div><span class="kpi-dots">···</span></div>
          <div class="muted">Votos rechazados</div>
          <div class="kpi-num">${ind.votos_rechazados}</div>
          <div class="muted">No incrementan popularidad</div>
        </div>
        <div class="card">
          <div class="kpi-head"><div class="kpi-icon">▶</div><span class="kpi-dots">···</span></div>
          <div class="muted">Reproducciones</div>
          <div class="kpi-num">${ind.reproducciones_totales}</div>
          <div class="muted">${ind.reproducciones_exitosas} completadas</div>
        </div>
      </div>

      <!-- Segunda sección: comportamiento musical -->
      <div class="grid-2 mt">
        <div class="card">
          <div class="between">
            <div>
              <div class="eyebrow">¿Qué contenido recibió más apoyo?</div>
              <h2 style="margin:4px 0 0">Popularidad de solicitudes</h2>
              <div class="muted" style="font-size:.76rem">Eje Y: votos recibidos · Eje X: canciones Top 5</div>
            </div>
            <span class="pill">Votos por canción</span>
          </div>
          ${pop.length ? `
            <div class="chart-bars-wrap chart-with-y">
              <div class="chart-y-axis" title="Votos">
                <span>${maxVotos}</span>
                <span>${Math.round(maxVotos / 2)}</span>
                <span>0</span>
              </div>
              <div class="chart-bars" style="flex:1">
                ${pop.map((c) => {
      const v = c.total_votos || c.total_solicitudes || 0;
      const h = Math.max(12, Math.round((v / maxVotos) * 125));
      return `
                    <div class="chart-col" title="${esc(c.titulo)}: ${v} votos (${c.total_solicitudes} solicitudes)">
                      <span class="chart-val">${v}</span>
                      <div class="chart-bar" style="height:${h}px"></div>
                      <span class="chart-lbl">${esc(c.titulo)}</span>
                    </div>`;
    }).join('')}
              </div>
            </div>
            <div class="chart-legend">
              ${pop.map((c) => `
                <div class="chart-leg-item">
                  <span class="chart-leg-name"><span class="chart-leg-dot"></span>${esc(c.titulo)}</span>
                  <strong>${c.total_votos || c.total_solicitudes || 0} votos</strong>
                </div>`).join('')}
            </div>` : '<p class="muted mt">Aún no hay solicitudes registradas para graficar.</p>'}
        </div>

        <div class="card" style="display:flex;flex-direction:column;justify-content:space-between">
          <div>
            <div class="eyebrow">Destacada del período</div>
            <h2 style="margin:4px 0 0">Canción más popular</h2>
            ${ind.cancion_mas_popular ? `
              <div class="song-row mt">
                <div class="kpi-icon" style="width:44px;height:44px;font-size:1.25rem">★</div>
                <div>
                  <div class="song-title">${esc(ind.cancion_mas_popular.titulo)}</div>
                  <div class="song-meta">${esc(ind.cancion_mas_popular.artista_canal || 'Artista no especificado')}</div>
                  <div class="row mt" style="gap:8px">
                    <span class="pill accent">${ind.cancion_mas_popular.total_votos} votos</span>
                    <span class="pill">${ind.cancion_mas_popular.total_solicitudes} solicitudes</span>
                  </div>
                </div>
              </div>` : '<p class="muted mt">Todavía no hay canciones con votos suficientes en este alcance.</p>'}
          </div>
          <p class="muted" style="margin-top:16px;font-size:.82rem">Basado en votos confirmados dentro del alcance seleccionado.</p>
        </div>
      </div>

      <!-- Tercera sección: participación -->
      <div class="card mt">
        <div class="between">
          <div>
            <div class="eyebrow">¿Cuándo hubo mayor participación?</div>
            <h2 style="margin:4px 0 0">Participación temporal (cada 5 min)</h2>
            <div class="muted" style="font-size:.76rem">Eje Y: interacciones de clientes · Eje X: intervalos de 5 minutos</div>
          </div>
          <span class="pill accent">Intervalos de 5 min</span>
        </div>
        ${temp.length ? `
          <div class="chart-bars-wrap" style="padding-top:8px">
            <svg class="chart-svg" viewBox="0 0 480 175" preserveAspectRatio="none">
              <defs>
                <linearGradient id="an-grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="rgba(139,124,255,0.32)" />
                  <stop offset="100%" stop-color="rgba(139,124,255,0)" />
                </linearGradient>
              </defs>
              <line x1="36" y1="18" x2="36" y2="145" stroke="var(--line-strong)" stroke-width="1.2" />
              <line x1="36" y1="145" x2="466" y2="145" stroke="var(--line-strong)" stroke-width="1.2" />
              <text x="30" y="28" text-anchor="end" fill="var(--muted)" font-size="11">${maxEv}</text>
              <text x="30" y="88" text-anchor="end" fill="var(--muted)" font-size="11">${Math.round(maxEv / 2)}</text>
              <text x="30" y="145" text-anchor="end" fill="var(--muted)" font-size="11">0</text>
              <polygon fill="url(#an-grad)" points="${puntosSvg} 460,145 44,145" />
              <polyline fill="none" stroke="var(--accent-strong)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" points="${puntosSvg}" />
              ${temp.map((t, i) => {
                const x = temp.length > 1 ? 44 + (i * 416) / (temp.length - 1) : 252;
                const y = 142 - (t.eventos / maxEv) * 114;
                const mostrarEtiqueta = temp.length <= 7 || i % 2 === 0 || i === temp.length - 1;
                const rango = t.hora_fin ? `${t.hora} – ${t.hora_fin}` : t.hora;
                return `
                  <g class="temp-pt" data-rango="${esc(rango)}" data-eventos="${t.eventos}" style="cursor:pointer">
                    <title>${esc(rango)}: ${t.eventos} interacciones</title>
                    <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="12" fill="transparent" />
                    <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4.5" fill="var(--accent-strong)" />
                    <text x="${x.toFixed(1)}" y="${Math.max(14, y - 9).toFixed(1)}" text-anchor="middle" fill="var(--text)" font-size="10.5" font-weight="700">${t.eventos}</text>
                    ${mostrarEtiqueta ? `<text x="${x.toFixed(1)}" y="164" text-anchor="middle" fill="var(--muted)" font-size="10">${esc(t.hora)}</text>` : ''}
                  </g>`;
              }).join('')}
            </svg>
          </div>
          <div id="an-temp-detalle" class="chart-detail-bar">Pasa el cursor o selecciona un punto para ver el detalle del intervalo de 5 minutos.</div>`
          : '<p class="muted mt">Aún no hay participación de clientes registrada en este período.</p>'}
      </div>

      <div class="card mt">
        <div class="between">
          <div>
            <div class="eyebrow">Patrones por día y franja horaria</div>
            <h2 style="margin:4px 0 0">Mapa de calor de participación</h2>
            <div class="muted" style="font-size:.78rem">${periodoTexto}</div>
          </div>
          <span class="pill">${hm ? hm.total_interacciones : 0} interacciones</span>
        </div>
        ${hm && hm.total_interacciones > 0 ? `
          <div class="heatmap-wrap">
            <div class="heatmap-grid">
              <div></div>
              ${(hm.franjas || []).map((f) => `<div class="heatmap-head" title="${esc(f.etiqueta)}">${esc(f.corta)}</div>`).join('')}
              ${(hm.dias || []).map((diaNombre, idxDia) => {
                const diaIso = idxDia + 1;
                const celdasDia = (hm.celdas || []).filter((c) => c.dia_iso === diaIso);
                return `
                  <div class="heatmap-day">${esc(diaNombre)}</div>
                  ${celdasDia.map((c) => {
                    const lv = nivelCelda(c.interacciones);
                    return `<button type="button" class="heatmap-cell lv-${lv}" data-dia="${esc(c.dia_nombre)}" data-franja="${esc(c.franja_etiqueta)}" data-interacciones="${c.interacciones}" title="${esc(c.dia_nombre)} · ${esc(c.franja_etiqueta)}: ${c.interacciones} interacciones">${c.interacciones > 0 ? c.interacciones : ''}</button>`;
                  }).join('')}`;
              }).join('')}
            </div>
          </div>
          <div id="an-heatmap-detalle" class="chart-detail-bar">Selecciona o pasa el cursor sobre una celda para consultar el día, la franja horaria y el total de interacciones.</div>
          <div class="heatmap-footer">
            <span>Cada celda agrupa 2 horas de actividad real registrada.</span>
            <span class="heatmap-scale">
              Menor
              <span class="heatmap-swatch lv-0"></span>
              <span class="heatmap-swatch lv-1"></span>
              <span class="heatmap-swatch lv-2"></span>
              <span class="heatmap-swatch lv-3"></span>
              <span class="heatmap-swatch lv-4"></span>
              Mayor
            </span>
          </div>`
          : '<p class="muted mt">Aún no hay suficientes interacciones registradas para construir el mapa de calor en este alcance.</p>'}
      </div>

      <!-- Cuarta sección: indicadores complementarios -->
      <div class="grid-3 mt">
        <div class="card">
          <div class="muted">Usuarios únicos participantes</div>
          <div class="stat-val">${ind.usuarios_unicos}</div>
          <div class="muted">Dispositivos participantes en el alcance</div>
        </div>
        <div class="card">
          <div class="muted">Tiempo de espera promedio</div>
          <div class="stat-val">${ind.espera_promedio_segundos != null ? fmtSeg(ind.espera_promedio_segundos) : '—'}</div>
          <div class="muted">Máximo: ${ind.espera_maxima_segundos != null ? fmtSeg(ind.espera_maxima_segundos) : '—'}</div>
        </div>
        <div class="card">
          <div class="muted">Cumplimiento lista por defecto</div>
          <div class="stat-val">${ind.cumplimiento_lista.porcentaje}%</div>
          <div class="muted">${ind.cumplimiento_lista.exitosas_lista}/${ind.cumplimiento_lista.total_lista} de lista · ${ind.cumplimiento_lista.de_solicitud} de solicitud</div>
        </div>
      </div>

      <!-- Copias de seguridad -->
      <div class="card mt">
        <div class="between">
          <div>
            <div class="eyebrow">Respaldo administrativo</div>
            <h2 style="margin:4px 0 0">Copias de seguridad</h2>
            <p class="muted" style="margin:4px 0 0">Consulta y descarga copias de seguridad de la información musical de tu establecimiento (respaldo automático cada ${state.respaldos ? state.respaldos.intervalo_horas : 24} h).</p>
          </div>
          <button id="rs-generar" class="btn primary">Generar copia de seguridad</button>
        </div>
        <table class="mt">
          <thead><tr><th>Fecha y hora</th><th>Origen</th><th>Información respaldada</th><th>Estado</th><th>Acción</th></tr></thead>
          <tbody>
            ${respaldos.map((r) => `
              <tr>
                <td>${fmtFecha(r.generado_en)}</td>
                <td><span class="pill ${r.origen === 'automatico' ? 'ok' : 'accent'}">${r.origen === 'automatico' ? 'Automático' : 'Manual'}</span></td>
                <td>${r.total_canciones} canciones${r.total_listas != null ? ` · ${r.total_listas} listas` : ''}</td>
                <td><span class="pill ok"><span class="dot"></span>Completada</span></td>
                <td>
                  <div class="backup-actions">
                    <a class="btn sm primary" href="/api/admin/respaldos/${r.id_respaldo}/pdf" download>Descargar informe</a>
                    <a class="btn sm" href="/api/admin/respaldos/${r.id_respaldo}" download title="Respaldo técnico para restauración">JSON técnico</a>
                  </div>
                </td>
              </tr>`).join('') || '<tr><td colspan="5" class="muted">Aún no hay copias de seguridad registradas. Se generará la primera automáticamente.</td></tr>'}
          </tbody>
        </table>
      </div>

      <div class="card mt">
        <h2>Historial de canciones reproducidas</h2>
        <table>
          <thead><tr><th>Canción</th><th>Fuente</th><th>Votos</th><th>Espera</th><th>Resultado</th><th>Inicio</th></tr></thead>
          <tbody>
            ${(a.historial_reproducciones || []).map((h) => `
              <tr>
                <td><strong>${esc(h.titulo)}</strong><div class="muted">${esc(h.artista_canal)}</div></td>
                <td><span class="pill ${h.fuente === 'solicitud' ? 'accent' : ''}">${h.fuente === 'solicitud' ? 'Solicitud' : 'Lista por defecto'}</span></td>
                <td>${h.total_votos}</td>
                <td>${h.espera_segundos != null ? fmtSeg(h.espera_segundos) : '—'}</td>
                <td><span class="pill ${h.resultado === 'exitosa' ? 'ok' : 'err'}">${esc(h.resultado)}</span></td>
                <td>${fmtFecha(h.inicio_en)}</td>
              </tr>`).join('') || '<tr><td colspan="6" class="muted">Aún no hay reproducciones registradas.</td></tr>'}
          </tbody>
        </table>
      </div>`;

    document.getElementById('an-alcance').addEventListener('change', async (e) => {
      state.analiticaAlcance = e.target.value;
      await cargarPanel();
    });

    const tempDetalle = document.getElementById('an-temp-detalle');
    if (tempDetalle) {
      cont.querySelectorAll('.temp-pt').forEach((el) => {
        const mostrar = () => {
          tempDetalle.innerHTML = `Intervalo <strong>${esc(el.dataset.rango)}</strong>: <strong>${esc(el.dataset.eventos)}</strong> interacciones registradas.`;
        };
        el.addEventListener('mouseenter', mostrar);
        el.addEventListener('click', mostrar);
      });
    }

    const hmDetalle = document.getElementById('an-heatmap-detalle');
    if (hmDetalle) {
      cont.querySelectorAll('.heatmap-cell').forEach((el) => {
        const mostrar = () => {
          hmDetalle.innerHTML = `<strong>${esc(el.dataset.dia)}</strong> · Franja <strong>${esc(el.dataset.franja)}</strong>: <strong>${esc(el.dataset.interacciones)}</strong> interacciones (${periodoTexto}).`;
        };
        el.addEventListener('mouseenter', mostrar);
        el.addEventListener('focus', mostrar);
        el.addEventListener('click', mostrar);
      });
    }

    const btnRespaldo = document.getElementById('rs-generar');
    btnRespaldo.addEventListener('click', async () => {
      btnRespaldo.disabled = true;
      showToast('Iniciando generación de copia de seguridad…');
      try {
        const r = await api('POST', '/respaldos');
        showToast(`Copia de seguridad completada (${r.total_canciones} canciones respaldadas)`);
        await cargarPanel();
      } catch (e) {
        btnRespaldo.disabled = false;
        showToast(e.message, true);
      }
    });
  }

  const TRADUCCIONES_ACTIVIDAD = {
    sesion_iniciada: { icon: '▶', texto: 'Se inició una sesión musical' },
    sesion_creada: { icon: '✦', texto: 'Se creó una nueva sesión' },
    sesion_cerrada: { icon: '■', texto: 'Se cerró la sesión musical' },
    horario_actualizado: { icon: '◷', texto: 'Se actualizaron los horarios' },
    horario_excepcion_actualizada: { icon: '◷', texto: 'Se actualizó una fecha especial en los horarios' },
    horario_excepcion_eliminada: { icon: '◷', texto: 'Se eliminó una fecha especial de los horarios' },
    jornada_automatica_omitida: { icon: '⚙', texto: 'Se omitió la apertura automática porque ya existía una sesión manual' },
    modo_automatico_actualizado: { icon: '⚙', texto: 'Se actualizó la configuración del modo automático' },
    pausa_manual_iniciada: { icon: '⏸', texto: 'Se pausó temporalmente el código de acceso' },
    pausa_manual_finalizada: { icon: '▶', texto: 'Se reanudó el código de acceso' },
    qr_activado: { icon: '◈', texto: 'Se activó el código QR de acceso' },
    qr_desactivado: { icon: '◈', texto: 'Se desactivó el código QR de acceso' },
    mantenimiento_cola: { icon: '🧹', texto: 'Se realizó limpieza de solicitudes pendientes' },
    respaldo_listas_generado: { icon: '💾', texto: 'Se generó una copia de seguridad musical' },
    lista_creada: { icon: '♫', texto: 'Se creó una lista musical' },
    lista_actualizada: { icon: '♫', texto: 'Se actualizó una lista musical' },
    lista_eliminada: { icon: '♫', texto: 'Se eliminó una lista musical' },
    lista_cancion_agregada: { icon: '♫', texto: 'Se agregó una canción a una lista musical' },
    lista_cancion_quitada: { icon: '♫', texto: 'Se quitó una canción de una lista musical' },
    lista_predeterminada_actualizada: { icon: '♫', texto: 'Se actualizó la lista musical por defecto' },
    bloqueo_creado: { icon: '⊘', texto: 'Se bloqueó una canción en el establecimiento' },
    bloqueo_levantado: { icon: '✓', texto: 'Se habilitó nuevamente una canción bloqueada' },
    display_creado: { icon: '▣', texto: 'Se vinculó una pantalla pública' },
    display_revocado: { icon: '▣', texto: 'Se desvinculó la pantalla pública' },
  };

  function traducirEventoActividad(r) {
    const t = TRADUCCIONES_ACTIVIDAD[r.accion];
    if (t) return t;
    return { icon: '•', texto: 'Se realizó una actualización operativa en el establecimiento' };
  }

  function abrirModalConfirmacion({ titulo, mensaje, detalle, textoConfirmar, claseConfirmar = 'warn', alConfirmar }) {
    const previo = document.getElementById('modal-confirm-mant');
    if (previo) previo.remove();
    const wrap = document.createElement('div');
    wrap.id = 'modal-confirm-mant';
    wrap.className = 'modal-backdrop';
    wrap.innerHTML = `
      <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="mc-titulo">
        <h2 id="mc-titulo" style="margin:0 0 8px">${esc(titulo)}</h2>
        <p class="muted" style="margin:0 0 10px">${esc(mensaje)}</p>
        ${detalle ? `<p style="margin:0 0 16px;font-size:.88rem;color:var(--text2)">${esc(detalle)}</p>` : ''}
        <div class="row" style="justify-content:flex-end">
          <button type="button" class="btn" id="mc-cancelar">Cancelar</button>
          <button type="button" class="btn ${esc(claseConfirmar)}" id="mc-confirmar">${esc(textoConfirmar)}</button>
        </div>
      </div>`;
    document.body.appendChild(wrap);
    const cerrar = () => wrap.remove();
    document.getElementById('mc-cancelar').addEventListener('click', cerrar);
    wrap.addEventListener('click', (ev) => { if (ev.target === wrap) cerrar(); });
    document.getElementById('mc-confirmar').addEventListener('click', async () => {
      cerrar();
      await alConfirmar();
    });
  }

  function renderMantenimiento(cont, s) {
    const m = state.mantenimiento;
    const p = state.panel || {};
    const resumenSol = (m && m.resumen_solicitudes) || {};
    const pendientes = resumenSol.pendiente ?? 0;
    const listaInfo = m && m.lista_predeterminada;
    const cancionesLista = listaInfo ? listaInfo.total_canciones : 0;
    const estadoLista = listaInfo ? listaInfo.estado_actual : 'Sin lista asignada';
    const eventosOrdenados = (state.registro || []).slice().sort((a, b) => Date.parse(b.fecha) - Date.parse(a.fecha));

    cont.innerHTML = `
      <!-- Encabezado y estado general -->
      <div class="grid-3">
        <div class="card">
          <div class="muted">Sesión activa</div>
          <div class="stat-val" style="font-size:1.2rem">${s && s.estado === 'activa' ? 'Activa y en operación' : 'Sin sesión activa'}</div>
          <div class="muted">${s && s.estado === 'activa' ? 'El establecimiento está recibiendo participación' : 'Activa una sesión para gestionar solicitudes'}</div>
        </div>
        <div class="card">
          <div class="muted">Código de acceso disponible</div>
          <div class="stat-val" style="font-size:1.2rem">${s && s.qr_estado === 'activo' ? 'Disponible' : 'No disponible'}</div>
          <div class="muted">${s && s.qr_estado === 'activo' ? 'QR y código listos para los clientes' : 'El acceso de clientes está pausado o cerrado'}</div>
        </div>
        <div class="card">
          <div class="muted">Dispositivos conectados</div>
          <div class="stat-val">${p.dispositivos_activos ?? 0}</div>
          <div class="muted">Clientes conectados en tiempo real</div>
        </div>
      </div>

      <div class="grid-2 mt">
        <!-- Gestión de solicitudes -->
        <div class="card">
          <div class="eyebrow">Control operativo</div>
          <h2 style="margin:4px 0 6px">Gestión de solicitudes</h2>
          <p class="muted" style="margin:0">Administra las solicitudes pendientes de reproducción y prepara la lista musical cuando sea necesario.</p>

          <div class="maint-kpis">
            <div class="maint-kpi">
              <div class="muted" style="font-size:.78rem">Solicitudes pendientes</div>
              <div class="val">${pendientes}</div>
            </div>
            <div class="maint-kpi">
              <div class="muted" style="font-size:.78rem">Canciones en lista</div>
              <div class="val">${cancionesLista}</div>
            </div>
            <div class="maint-kpi">
              <div class="muted" style="font-size:.78rem">Estado actual de la lista</div>
              <div class="val" style="font-size:1.05rem;text-transform:capitalize">${esc(estadoLista)}</div>
            </div>
          </div>

          <div class="row mt">
            <button id="btn-limpiar" class="btn warn" ${s ? '' : 'disabled'}>Limpiar solicitudes pendientes</button>
            <button id="btn-limpiar-todo" class="btn danger" ${s ? '' : 'disabled'}>Reiniciar lista musical</button>
          </div>
          <p class="muted mt" style="font-size:.8rem">Las estadísticas históricas, votos confirmados y reproducciones completadas siempre se conservan.</p>
        </div>

        <!-- Actividad reciente -->
        <div class="card">
          <div class="between">
            <div>
              <div class="eyebrow">Historial operativo</div>
              <h2 style="margin:4px 0 0">Actividad reciente</h2>
            </div>
            <span class="pill">${eventosOrdenados.slice(0, 12).length} eventos</span>
          </div>
          <div class="activity-list">
            ${eventosOrdenados.slice(0, 12).map((r) => {
              const info = traducirEventoActividad(r);
              const esAdmin = Boolean(r.usuario);
              return `
                <div class="activity-item">
                  <div class="activity-icon ${esAdmin ? '' : 'sistema'}">${info.icon}</div>
                  <div style="flex:1;min-width:0">
                    <div style="font-weight:600;font-size:.9rem">${esc(info.texto)}</div>
                    <div class="activity-meta">
                      <span class="pill ${esAdmin ? 'accent' : ''}">${esAdmin ? `Administrador (${esc(r.usuario)})` : 'Sistema'}</span>
                      <span>${fmtFecha(r.fecha)}</span>
                    </div>
                  </div>
                </div>`;
            }).join('') || '<p class="muted mt">No hay actividad reciente registrada.</p>'}
          </div>
        </div>
      </div>`;

    document.getElementById('btn-limpiar').addEventListener('click', () => {
      if (!s) return;
      abrirModalConfirmacion({
        titulo: 'Limpiar solicitudes pendientes',
        mensaje: `Se retirarán únicamente las ${pendientes} solicitudes pendientes de la sesión actual.`,
        detalle: 'El historial de solicitudes anteriores, los votos y las reproducciones completadas se conservarán intactos.',
        textoConfirmar: 'Sí, limpiar pendientes',
        claseConfirmar: 'warn',
        alConfirmar: async () => {
          try {
            const r = await api('POST', `/sesiones/${encodeURIComponent(s.id_sesion)}/mantenimiento/limpiar-cola`, { reiniciar_lista: false });
            showToast(`Se retiraron ${r.solicitudes_retiradas} solicitudes pendientes (historial conservado)`);
            await cargarPanel();
          } catch (e) { showToast(e.message, true); }
        },
      });
    });

    document.getElementById('btn-limpiar-todo').addEventListener('click', () => {
      if (!s) return;
      abrirModalConfirmacion({
        titulo: 'Reiniciar lista musical',
        mensaje: `Esta acción retirará las ${pendientes} solicitudes pendientes y reiniciará el orden de reproducción de la lista musical por defecto desde el inicio.`,
        detalle: 'Consecuencia: las canciones pendientes saldrán de la cola actual y la lista predeterminada volverá a su primera canción. Los votos y reproducciones históricas no se eliminan.',
        textoConfirmar: 'Sí, reiniciar lista musical',
        claseConfirmar: 'danger',
        alConfirmar: async () => {
          try {
            const r = await api('POST', `/sesiones/${encodeURIComponent(s.id_sesion)}/mantenimiento/limpiar-cola`, { reiniciar_lista: true });
            showToast(`Solicitudes limpiadas (${r.solicitudes_retiradas}) y lista musical reiniciada`);
            await cargarPanel();
          } catch (e) { showToast(e.message, true); }
        },
      });
    });
  }

  // Arranque: comprobar si ya hay cookie de sesión válida
  api('GET', '/auth/yo').then((r) => {
    state.usuario = r.usuario;
    state.tab = state.usuario.rol === 'dj' ? 'reproduccion' : 'resumen';
    return cargarPanel();
  }).catch(() => renderLogin());
})();
