'use strict';
/**
 * Entorno de pruebas del E4: base real (schema propio), app Express real en un puerto libre, reloj
 * inyectado, temporizadores falsos, YouTube falso y almacén de eventos en memoria.
 * Ninguna prueba depende de Date.now() ni de setTimeout reales para la lógica.
 */
const { once } = require('node:events');
const { crearApp } = require('../../src/app');
const { cargarSesiones } = require('../../src/sesiones');
const { crearConectividad } = require('../../src/conectividad');
const { cargarCatalogoSemilla } = require('../../src/db');
const { crearBaseDePrueba } = require('./db');

const INICIO = Date.UTC(2026, 10, 10, 20, 0, 0); // 2026-11-10T20:00:00.000Z
const SESION = 'SES-MOCK-001';
const ESTABLECIMIENTO = 'EST-MOCK-001';
const TOKEN = 'token-reproductor-de-prueba';

/** Canciones del catálogo de pruebas: ids de 11 caracteres "CANCION_001"…, 200 s cada una salvo indicación. */
const cancion = (n) => `CANCION_${String(n).padStart(3, '0')}`;
const CATALOGO = Array.from({ length: 40 }, (_, i) => ({
  youtube_video_id: cancion(i + 1),
  titulo: `Canción ${i + 1}`,
  artista_canal: `Artista ${i + 1}`,
  duracion_segundos: 200,
  url_miniatura: null,
}));

/** UUID v4 válido y determinista para el dispositivo n. */
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function crearReloj(inicio = INICIO) {
  const reloj = { t: inicio, ahora: () => reloj.t, avanzar: (ms = 1000) => { reloj.t += ms; return reloj.t; } };
  return reloj;
}

/** Temporizadores falsos: guardan las funciones; la prueba decide cuándo ejecutarlas. */
function crearTemporizadores() {
  let siguienteId = 1;
  const pendientes = new Map();
  const intervalos = new Map();
  return {
    pendientes,
    programar: (fn, ms) => { const id = siguienteId++; pendientes.set(id, { fn, ms }); return id; },
    cancelar: (id) => pendientes.delete(id),
    programarIntervalo: (fn, ms) => { const id = siguienteId++; intervalos.set(id, { fn, ms }); return id; },
    cancelarIntervalo: (id) => intervalos.delete(id),
    /** Ejecuta (y quita) los temporizadores programados hasta ahora. Devuelve sus resultados. */
    async ejecutarPendientes() {
      const lista = [...pendientes.entries()];
      pendientes.clear();
      return Promise.all(lista.map(([, t]) => t.fn()));
    },
    dispararIntervalos() { for (const t of intervalos.values()) t.fn(); },
  };
}

/** YouTube falso: `videos` es un mapa id → item crudo de videos.list. */
function crearYoutubeFalso(videos = {}) {
  const llamadas = [];
  return {
    llamadas,
    videos,
    fallo: null,
    buscar: async () => [],
    async obtenerVideo(id) {
      llamadas.push(id);
      if (this.fallo) throw this.fallo;
      return videos[id] || null;
    },
  };
}

async function crearEntorno({ simulacion = true, token = TOKEN, catalogo = CATALOGO, videos, aleatorio = () => 1 } = {}) {
  const base = await crearBaseDePrueba();
  const reloj = crearReloj();
  const temporizadores = crearTemporizadores();
  const conectividad = crearConectividad({ ahora: reloj.ahora, programar: temporizadores.programar });
  const eventos = [];
  const youtube = crearYoutubeFalso(videos);
  await cargarCatalogoSemilla(base.pool, catalogo, reloj.ahora());

  const app = crearApp({
    sesiones: cargarSesiones(),
    youtube,
    almacenEventos: { guardar: (e) => eventos.push(e) },
    db: base.pool,
    ahora: reloj.ahora,
    conectividad,
    temporizadores,
    aleatorio,
    config: { reproductorToken: token, simulacionHabilitada: simulacion },
  });
  const srv = app.listen(0);
  await once(srv, 'listening');
  const url = `http://127.0.0.1:${srv.address().port}`;

  async function pedir(metodo, ruta, { dispositivo, cuerpo, cabeceras = {} } = {}) {
    const headers = { ...cabeceras };
    if (dispositivo) headers['X-Dispositivo-Id'] = dispositivo;
    if (cuerpo !== undefined) headers['Content-Type'] = 'application/json';
    const r = await fetch(`${url}${ruta}`, { method: metodo, headers, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) });
    const texto = await r.text();
    let json = null;
    try { json = texto ? JSON.parse(texto) : null; } catch { json = texto; }
    return { status: r.status, body: json, headers: r.headers };
  }

  const reproductor = { 'X-Reproductor-Token': token };
  const e = {
    app, srv, url, base, pool: base.pool, reloj, temporizadores, conectividad, eventos, youtube, pedir,
    servicios: app.locals.e4,
    solicitar: (disp, videoId, sesion = SESION) => pedir('POST', `/api/sesiones/${sesion}/solicitudes`, { dispositivo: disp, cuerpo: { youtube_video_id: videoId } }),
    votar: (disp, idSolicitud, sesion = SESION) => pedir('POST', `/api/sesiones/${sesion}/solicitudes/${idSolicitud}/votos`, { dispositivo: disp }),
    cola: (disp, sesion = SESION) => pedir('GET', `/api/sesiones/${sesion}/cola`, { dispositivo: disp }),
    iniciar: (sesion = SESION) => pedir('POST', `/api/sesiones/${sesion}/reproduccion/iniciar`, { cabeceras: reproductor, cuerpo: {} }),
    siguiente: (resultado = 'exitosa', extra = {}, sesion = SESION) => pedir('POST', `/api/sesiones/${sesion}/reproduccion/siguiente`,
      { cabeceras: reproductor, cuerpo: { resultado, segundos_reproducidos: 200, ...extra } }),
    /** mi_votacion actual del dispositivo. */
    async miVotacion(disp, sesion = SESION) { return (await e.cola(disp, sesion)).body.mi_votacion; },
    /** Fija los dispositivos activos de la sesión con dispositivos virtuales. */
    activos: (n, sesion = SESION) => conectividad.fijarVirtuales(sesion, n),
    async cerrar() {
      await app.locals.e4.cerrar();
      srv.closeAllConnections?.();
      await new Promise((res) => srv.close(res));
      await base.cerrar();
    },
  };
  return e;
}

/** Cliente SSE mínimo sobre fetch: acumula mensajes y permite esperar uno que cumpla una condición. */
async function abrirFlujo(url, { dispositivo, sesion = SESION } = {}) {
  const ctrl = new AbortController();
  const headers = { Accept: 'text/event-stream' };
  if (dispositivo) headers['X-Dispositivo-Id'] = dispositivo;
  const r = await fetch(`${url}/api/sesiones/${sesion}/cola/flujo`, { headers, signal: ctrl.signal });
  const mensajes = [];
  const esperas = [];
  let buffer = '';
  let terminado = false;

  const revisar = () => {
    for (let i = esperas.length - 1; i >= 0; i--) {
      const m = mensajes.find(esperas[i].pred);
      if (m) { esperas[i].resolve(m); esperas.splice(i, 1); }
    }
  };

  const leer = (async () => {
    if (!r.body || !(r.headers.get('content-type') || '').includes('text/event-stream')) return;
    const decoder = new TextDecoder();
    try {
      for await (const trozo of r.body) {
        buffer += decoder.decode(trozo, { stream: true });
        let corte;
        while ((corte = buffer.indexOf('\n\n')) >= 0) {
          const bloque = buffer.slice(0, corte);
          buffer = buffer.slice(corte + 2);
          const m = { lineas: bloque.split('\n') };
          for (const l of m.lineas) {
            if (l.startsWith(':')) m.comentario = l.slice(1).trim();
            else if (l.startsWith('retry: ')) m.retry = Number(l.slice(7));
            else if (l.startsWith('id: ')) m.id = l.slice(4);
            else if (l.startsWith('event: ')) m.event = l.slice(7);
            else if (l.startsWith('data: ')) m.data = JSON.parse(l.slice(6));
          }
          mensajes.push(m);
          revisar();
        }
      }
    } catch { /* abortado o servidor cerrado */ }
    terminado = true;
  })();

  return {
    respuesta: r,
    mensajes,
    estados: () => mensajes.filter((m) => m.event === 'estado').map((m) => m.data),
    terminado: () => terminado,
    /** Se cumple cuando el servidor termina el flujo (o la prueba lo aborta). */
    fin: leer,
    /** Espera un mensaje que cumpla `pred` (el timeout lo pone la prueba con { timeout }). */
    esperar(pred) {
      const m = mensajes.find(pred);
      if (m) return Promise.resolve(m);
      return new Promise((resolve) => esperas.push({ pred, resolve }));
    },
    esperarEstado(pred = () => true) { return this.esperar((m) => m.event === 'estado' && pred(m.data)).then((m) => m.data); },
    async cerrar() { ctrl.abort(); await leer; },
  };
}

module.exports = {
  INICIO, SESION, ESTABLECIMIENTO, TOKEN, CATALOGO, cancion, uuid,
  crearReloj, crearTemporizadores, crearYoutubeFalso, crearEntorno, abrirFlujo,
};
