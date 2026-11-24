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
    analiticaAlcance: 'establecimiento',
    catalogoResultados: [],
    ytPlayer: null,
    ytVideoCargado: null,
    ytListo: false,
    toast: null,
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
        state.usuario = null;
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

  function sincronizarYoutube() {
    const cont = document.getElementById('yt-player-slot');
    if (!cont || !window.YT || !window.YT.Player) return;
    if (state.ytPlayer) {
      const iframe = typeof state.ytPlayer.getIframe === 'function' ? state.ytPlayer.getIframe() : null;
      if (!iframe || !document.body.contains(iframe)) {
        try { state.ytPlayer.destroy(); } catch {}
        state.ytPlayer = null;
        state.ytVideoCargado = null;
      }
    }
    const rep = state.panel && state.panel.reproduccion;
    const actual = rep && rep.actual;
    const vid = actual && actual.cancion ? actual.cancion.youtube_video_id : null;
    if (!vid) {
      if (state.ytPlayer && typeof state.ytPlayer.stopVideo === 'function') {
        try { state.ytPlayer.stopVideo(); } catch {}
      }
      state.ytVideoCargado = null;
      return;
    }
    if (!state.ytPlayer) {
      state.ytVideoCargado = vid;
      state.ytPlayer = new window.YT.Player('yt-player-slot', {
        videoId: vid,
        playerVars: { autoplay: rep.estado_reproduccion === 'reproduciendo' ? 1 : 0, rel: 0 },
        events: {
          onReady(ev) {
            const est = state.panel && state.panel.reproduccion && state.panel.reproduccion.estado_reproduccion;
            if (est === 'reproduciendo' && typeof ev.target.playVideo === 'function') {
              try { ev.target.playVideo(); } catch {}
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
    if (rep.estado_reproduccion === 'pausada' && typeof state.ytPlayer.pauseVideo === 'function') {
      state.ytPlayer.pauseVideo();
    } else if (rep.estado_reproduccion === 'reproduciendo' && typeof state.ytPlayer.playVideo === 'function') {
      state.ytPlayer.playVideo();
    }
  }

  async function cargarPanel() {
    const q = state.sesionId ? `?sesion=${encodeURIComponent(state.sesionId)}` : '';
    state.panel = await api('GET', '/panel' + q);
    const actualEnLista = state.panel.sesiones.find((s) => s.id_sesion === state.sesionId);
    const primeraActiva = state.panel.sesiones.find((s) => s.estado === 'activa');
    if ((!actualEnLista || (actualEnLista.estado !== 'activa' && primeraActiva)) && primeraActiva) {
      state.sesionId = primeraActiva.id_sesion;
      state.panel = await api('GET', `/panel?sesion=${encodeURIComponent(state.sesionId)}`);
    } else if (!state.sesionId && state.panel.reproduccion) {
      state.sesionId = state.panel.reproduccion.id_sesion;
    } else if (!state.sesionId && state.panel.sesiones[0]) {
      state.sesionId = state.panel.sesiones[0].id_sesion;
    }
    if (state.tab === 'bloqueos') state.bloqueos = (await api('GET', '/bloqueos')).bloqueos;
    if (state.tab === 'mantenimiento' && state.sesionId) {
      if (state.usuario.rol === 'admin') state.mantenimiento = await api('GET', `/sesiones/${state.sesionId}/mantenimiento`);
      state.registro = (await api('GET', '/registro')).registros;
    }
    if (state.tab === 'listas' && state.listaSeleccionada) {
      state.detalleLista = await api('GET', `/listas/${state.listaSeleccionada}`);
    }
    if (state.tab === 'analitica') {
      const qs = state.analiticaAlcance === 'sesion' && state.sesionId ? `?sesion=${encodeURIComponent(state.sesionId)}` : '';
      state.analitica = await api('GET', '/analitica' + qs);
    }
    render();
    sincronizarYoutube();
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
    if (!state.usuario) return renderLogin();
    const p = state.panel;
    if (!p) { root.innerHTML = '<main class="main"><p>Cargando panel…</p></main>'; return; }

    const esAdmin = state.usuario.rol === 'admin';
    const sesionActual = p.sesiones.find((s) => s.id_sesion === state.sesionId) || p.sesiones[0];
    const rep = p.reproduccion;
    const estadoSesion = sesionActual ? sesionActual.estado.toUpperCase() : 'SIN SESIÓN';

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
            <select id="sel-sesion">
              ${p.sesiones.map((s) => `<option value="${esc(s.id_sesion)}" ${s.id_sesion === state.sesionId ? 'selected' : ''}>${esc(s.id_sesion)} (${esc(s.estado)})</option>`).join('')}
            </select>
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
              <span class="pill ${sesionActual && sesionActual.estado === 'activa' ? 'ok' : 'err'}"><span class="dot"></span>Sesión ${esc(sesionActual ? sesionActual.estado : 'n/a')}</span>
              <span class="pill ${sesionActual && sesionActual.qr_estado === 'activo' ? 'ok' : 'warn'}"><span class="dot"></span>QR ${esc(sesionActual ? sesionActual.qr_estado : 'n/a')}</span>
              ${p.configuracion.pausa_manual ? '<span class="pill warn"><span class="dot"></span>Pausa manual</span>' : ''}
              <span class="pill accent">Dispositivos activos: ${p.dispositivos_activos}</span>
            </div>
          </div>
          <div id="tab-content"></div>
        </main>
      </div>`;

    document.getElementById('sel-sesion').addEventListener('change', async (e) => {
      state.sesionId = e.target.value;
      await cargarPanel();
    });
    document.querySelectorAll('.nav button[data-tab]').forEach((b) => b.addEventListener('click', async () => {
      state.tab = b.dataset.tab;
      await cargarPanel();
    }));
    document.getElementById('btn-refrescar').addEventListener('click', () => cargarPanel());
    document.getElementById('btn-salir').addEventListener('click', async () => {
      await api('POST', '/auth/logout');
      state.usuario = null;
      state.panel = null;
      render();
    });

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

  function renderResumen(cont, p, s, rep, esAdmin) {
    const ev = p.horario.evaluacion_actual;
    const actual = rep && rep.actual;
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

  function renderReproduccion(cont, p, rep) {
    if (!rep) { cont.innerHTML = '<div class="card"><p>Selecciona una sesión.</p></div>'; return; }
    const actual = rep.actual;
    cont.innerHTML = `
      <div class="grid-2">
        <div class="card">
          <div class="between">
            <h2>Reproductor YouTube</h2>
            <span class="pill ${rep.estado_reproduccion === 'reproduciendo' ? 'ok' : 'warn'}"><span class="dot"></span>${esc(rep.estado_reproduccion)}</span>
          </div>
          <div class="yt-box mt"><div id="yt-player-slot"></div></div>
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
            <button class="btn danger" id="rep-error" title="Reportar fallo de reproducción" ${actual ? '' : 'disabled'}>⚠ Reportar error</button>
          </div>
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
      </div>`;

    const tog = document.getElementById('rep-toggle');
    if (tog) tog.addEventListener('click', () => accionRep(tog.dataset.acc));
    document.getElementById('rep-saltar').addEventListener('click', () => accionRep('saltar'));
    document.getElementById('rep-error').addEventListener('click', () => accionRep('error', { codigo_error: 'reportado_por_dj', segundos_reproducidos: 0 }));
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
    sincronizarYoutube();
  }

  function tarjetaSesionHtml(s) {
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
        <div class="row mt">
          ${s.estado === 'activa' || !s.desactivado_permanente
            ? `<img class="qr-preview" src="/api/admin/sesiones/${encodeURIComponent(s.id_sesion)}/qr.png" alt="QR ${esc(s.id_sesion)}">`
            : ''}
          <div style="flex:1;min-width:180px">
            <p class="muted">URL para app móvil:<br><code>${esc(s.qr_url)}</code></p>
            <p class="muted">Pendientes en cola: <strong>${s.pendientes}</strong> · Históricas: <strong>${s.solicitudes_historicas}</strong></p>
            <div class="row mt">
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
        </div>
      </div>`;
  }

  function renderSesiones(cont, p) {
    const vigentes = p.sesiones.filter((s) => s.estado === 'activa' || !s.desactivado_permanente);
    const cerradas = p.sesiones.filter((s) => s.estado !== 'activa' && s.desactivado_permanente);
    cont.innerHTML = `
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
  }

  function renderHorarios(cont, p) {
    const mapH = new Map(p.horario.horarios.map((h) => [h.dia_semana, h]));
    cont.innerHTML = `
      <div class="grid-2">
        <div class="card">
          <div class="between">
            <h2>Automatización y Pausa manual</h2>
            <span class="pill ${p.horario.evaluacion_actual.abierto ? 'ok' : 'err'}"><span class="dot"></span>${esc(p.horario.evaluacion_actual.hora_local)} · ${p.horario.evaluacion_actual.abierto ? 'En horario' : 'Fuera de horario'}</span>
          </div>
          <div class="row mt">
            <div style="flex:1">
              <label for="cfg-ses">Sesión principal</label>
              <select id="cfg-ses">${p.sesiones.map((s) => `<option value="${esc(s.id_sesion)}" ${s.id_sesion === p.configuracion.id_sesion_principal ? 'selected' : ''}>${esc(s.id_sesion)} (${esc(s.estado)})</option>`).join('')}</select>
            </div>
            <button id="btn-auto" class="btn ${p.configuracion.modo_automatico ? 'warn' : 'primary'}">
              ${p.configuracion.modo_automatico ? 'Desactivar modo automático' : 'Activar modo automático'}
            </button>
          </div>
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
            <input id="ex-ap" value="18:00" style="width:95px" placeholder="HH:MM">
            <input id="ex-ci" value="02:00" style="width:95px" placeholder="HH:MM">
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
      try {
        await api('PATCH', '/establecimiento/automatico', { id_sesion_principal: e.target.value });
        showToast('Sesión principal actualizada');
        await cargarPanel();
      } catch (err) { showToast(err.message, true); }
    });
    document.getElementById('btn-auto').addEventListener('click', async () => {
      try {
        await api('PATCH', '/establecimiento/automatico', {
          modo_automatico: !p.configuracion.modo_automatico,
          id_sesion_principal: document.getElementById('cfg-ses').value,
        });
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
          <h2>${state.detalleLista ? esc(state.detalleLista.nombre) : 'Detalle de lista'}</h2>
          ${state.detalleLista ? `
            <form id="f-buscar-yt" class="row mt">
              <input id="yt-q" placeholder="Buscar canción o artista en YouTube..." value="${esc(state.busquedaYt || '')}" minlength="2" required style="flex:1">
              <button class="btn primary" type="submit">Buscar</button>
            </form>
            ${state.catalogoResultados.length ? `
              <div class="mt" style="max-height:260px;overflow:auto;display:flex;flex-direction:column;gap:8px">
                ${state.catalogoResultados.map((c) => `
                  <div class="song-row">
                    <img class="song-thumb" src="${esc(c.url_miniatura || '')}" alt="">
                    <div style="flex:1;min-width:0">
                      <div class="song-title">${esc(c.titulo)}</div>
                      <div class="song-meta">${esc(c.artista_canal)} · ${fmtSeg(c.duracion_segundos)}</div>
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
        const x = 20 + (i * 440) / (temp.length - 1);
        const y = 140 - (t.eventos / maxEv) * 110;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      }).join(' ')
      : (temp.length === 1 ? `20,${(140 - (temp[0].eventos / maxEv) * 110).toFixed(1)} 460,${(140 - (temp[0].eventos / maxEv) * 110).toFixed(1)}` : '');
    const uc = a.pipeline.ultima_corrida || {};

    cont.innerHTML = `
      <div class="between">
        <div>
          <div class="eyebrow">Acceso de administrador</div>
          <h2 style="font-size:1.35rem;margin:4px 0">Analítica</h2>
          <p class="muted" style="margin:0">Interpreta participación, popularidad y comportamiento operativo.</p>
        </div>
        <div class="row">
          <select id="an-alcance" style="width:auto">
            <option value="establecimiento" ${state.analiticaAlcance === 'establecimiento' ? 'selected' : ''}>Todo el establecimiento</option>
            <option value="sesion" ${state.analiticaAlcance === 'sesion' ? 'selected' : ''}>Sesión actual (${esc(state.sesionId || 'N/A')})</option>
          </select>
          <button id="an-ingesta" class="btn primary">Ejecutar pipeline</button>
        </div>
      </div>

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
          <div class="muted">Confirmados por regla E4</div>
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
          <div class="muted">${ind.reproducciones_exitosas} eventos operativos válidos</div>
        </div>
      </div>

      <div class="grid-2 mt">
        <div class="card">
          <div class="between">
            <div>
              <div class="eyebrow">¿Qué contenido recibió más apoyo?</div>
              <h2 style="margin:4px 0 0">Popularidad de solicitudes</h2>
            </div>
            <span class="pill">Datos derivados</span>
          </div>
          ${pop.length ? `
            <div class="chart-bars-wrap">
              <div class="chart-bars">
                ${pop.map((c) => {
                  const v = c.total_votos || c.total_solicitudes || 0;
                  const h = Math.max(12, Math.round((v / maxVotos) * 125));
                  return `
                    <div class="chart-col" title="${esc(c.titulo)} (${v} votos)">
                      <span class="chart-val">${v}</span>
                      <div class="chart-bar" style="height:${h}px"></div>
                    </div>`;
                }).join('')}
              </div>
            </div>
            <div class="chart-legend">
              ${pop.map((c) => `
                <div class="chart-leg-item">
                  <span class="chart-leg-name"><span class="chart-leg-dot"></span>${esc(c.titulo)}</span>
                  <strong>${c.total_votos || c.total_solicitudes || 0}</strong>
                </div>`).join('')}
            </div>` : '<p class="muted mt">Aún no hay solicitudes registradas para graficar.</p>'}
        </div>

        <div class="card">
          <div class="between">
            <div>
              <div class="eyebrow">¿Cuándo hubo mayor participación?</div>
              <h2 style="margin:4px 0 0">Participación temporal</h2>
            </div>
            <span class="pill">Datos derivados</span>
          </div>
          ${temp.length ? `
            <div class="chart-bars-wrap" style="padding-top:8px">
              <svg class="chart-svg" viewBox="0 0 480 165" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="an-grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="rgba(139,124,255,0.28)" />
                    <stop offset="100%" stop-color="rgba(139,124,255,0)" />
                  </linearGradient>
                </defs>
                <polygon fill="url(#an-grad)" points="${puntosSvg} 460,155 20,155" />
                <polyline fill="none" stroke="var(--accent-strong)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" points="${puntosSvg}" />
                ${temp.map((t, i) => {
                  const x = temp.length > 1 ? 20 + (i * 440) / (temp.length - 1) : 240;
                  const y = 140 - (t.eventos / maxEv) * 110;
                  return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" fill="var(--accent-strong)" />`;
                }).join('')}
              </svg>
            </div>
            <div class="between muted" style="font-size:.76rem;margin-top:8px">
              ${temp.map((t) => `<span>${esc(t.hora)} <strong>${t.eventos}</strong></span>`).join('')}
            </div>` : '<p class="muted mt">Sin eventos temporales registrados aún.</p>'}
        </div>
      </div>

      <div class="grid-4 mt">
        <div class="card">
          <div class="muted">Canción más popular</div>
          <div class="stat-val" style="font-size:1.05rem">${ind.cancion_mas_popular ? esc(ind.cancion_mas_popular.titulo) : 'Sin datos'}</div>
          <div class="muted">${ind.cancion_mas_popular ? `${ind.cancion_mas_popular.total_votos} votos · ${ind.cancion_mas_popular.total_solicitudes} sol.` : '—'}</div>
        </div>
        <div class="card">
          <div class="muted">Usuarios únicos participantes</div>
          <div class="stat-val">${ind.usuarios_unicos}</div>
          <div class="muted">Dispositivos anonimizados</div>
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

      <div class="grid-2 mt">
        <div class="card">
          <div class="between">
            <h2>Pipeline de ingesta, limpieza y almacenamiento</h2>
            <span class="pill ok"><span class="dot"></span>Activo</span>
          </div>
          <p class="muted">Última corrida: ${fmtFecha(uc.ejecutado_en)}</p>
          <div class="grid-3 mt">
            <div class="song-row"><div><div class="muted">Leídos (JSONL)</div><strong>${uc.leidos ?? 0}</strong></div></div>
            <div class="song-row"><div><div class="muted">Válidos / Nuevos</div><strong>${uc.validos ?? 0} / ${uc.insertados ?? 0}</strong></div></div>
            <div class="song-row"><div><div class="muted">Descartados / Dup.</div><strong>${uc.descartados ?? 0} / ${uc.duplicados ?? 0}</strong></div></div>
          </div>
          <h3 class="mt">Corridas recientes</h3>
          <table>
            <thead><tr><th>Fecha</th><th>Leídos</th><th>Válidos</th><th>Dup.</th><th>Desc.</th></tr></thead>
            <tbody>
              ${(a.pipeline.corridas_recientes || []).map((c) => `
                <tr>
                  <td>${fmtFecha(c.ejecutado_en)}</td>
                  <td>${c.leidos}</td>
                  <td>${c.validos}</td>
                  <td>${c.duplicados}</td>
                  <td>${c.descartados}</td>
                </tr>`).join('') || '<tr><td colspan="5" class="muted">Sin corridas registradas.</td></tr>'}
            </tbody>
          </table>
        </div>

        <div class="card">
          <div class="between">
            <h2>Evidencia de anonimización</h2>
            <span class="pill ${a.anonimizacion.cumple_privacidad ? 'ok' : 'err'}"><span class="dot"></span>${a.anonimizacion.cumple_privacidad ? '0 UUIDs crudos' : 'Alerta'}</span>
          </div>
          <p class="muted">Método: <strong>${esc(a.anonimizacion.metodo)}</strong> · Eventos anonimizados: <strong>${a.anonimizacion.total_anonimizados}</strong></p>
          <table>
            <thead><tr><th>Dispositivo anonimizado</th><th>Tipo</th><th>Actor</th><th>Fecha</th></tr></thead>
            <tbody>
              ${(a.anonimizacion.muestra || []).map((m) => `
                <tr>
                  <td><code>${esc(m.dispositivo_hash)}</code></td>
                  <td>${esc(m.tipo)}</td>
                  <td>${esc(m.actor)}</td>
                  <td>${fmtFecha(m.fecha_hora)}</td>
                </tr>`).join('') || '<tr><td colspan="4" class="muted">Sin eventos con dispositivo en este alcance.</td></tr>'}
            </tbody>
          </table>
        </div>
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
    document.getElementById('an-ingesta').addEventListener('click', async () => {
      try {
        const r = await api('POST', '/analitica/ingesta');
        showToast(`Pipeline ejecutado: ${r.insertados} nuevos, ${r.duplicados} duplicados, ${r.descartados} descartados`);
        await cargarPanel();
      } catch (e) { showToast(e.message, true); }
    });
  }

  function renderMantenimiento(cont, s) {
    const m = state.mantenimiento;
    cont.innerHTML = `
      <div class="grid-2">
        <div class="card">
          <h2>Limpieza de cola y preparación (${esc(s ? s.id_sesion : '')})</h2>
          <p class="muted">Retira únicamente las solicitudes pendientes de la sesión actual. Todo el historial de solicitudes y reproducciones se conserva en la base de datos.</p>
          <div class="row mt">
            <button id="btn-limpiar" class="btn warn">Limpiar cola pendiente</button>
            <button id="btn-limpiar-todo" class="btn danger">Limpiar cola y reiniciar lista</button>
          </div>
          ${m ? `<pre class="muted mt" style="white-space:pre-wrap">${esc(JSON.stringify(m.resumen_solicitudes, null, 2))}</pre>` : ''}
        </div>
        <div class="card">
          <h2>Registro de auditoría reciente</h2>
          ${state.registro.slice(0, 12).map((r) => `
            <div style="padding:6px 0;border-bottom:1px solid var(--line);font-size:.84rem">
              <strong>${esc(r.accion)}</strong> · ${esc(r.usuario || 'Sistema')} · <span class="muted">${fmtFecha(r.fecha)}</span>
            </div>`).join('') || '<p class="muted">Sin registros.</p>'}
        </div>
      </div>`;

    document.getElementById('btn-limpiar').addEventListener('click', async () => {
      try { const r = await api('POST', `/sesiones/${encodeURIComponent(s.id_sesion)}/mantenimiento/limpiar-cola`, { reiniciar_lista: false }); showToast(`Retiradas ${r.solicitudes_retiradas} solicitudes (historial conservado)`); await cargarPanel(); } catch (e) { showToast(e.message, true); }
    });
    document.getElementById('btn-limpiar-todo').addEventListener('click', async () => {
      try { const r = await api('POST', `/sesiones/${encodeURIComponent(s.id_sesion)}/mantenimiento/limpiar-cola`, { reiniciar_lista: true }); showToast(`Cola limpia (${r.solicitudes_retiradas}) y lista reiniciada`); await cargarPanel(); } catch (e) { showToast(e.message, true); }
    });
  }

  // Arranque: comprobar si ya hay cookie de sesión válida
  api('GET', '/auth/yo').then((r) => {
    state.usuario = r.usuario;
    state.tab = state.usuario.rol === 'dj' ? 'reproduccion' : 'resumen';
    return cargarPanel();
  }).catch(() => renderLogin());
})();
