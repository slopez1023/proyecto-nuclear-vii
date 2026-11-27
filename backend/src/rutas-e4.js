'use strict';
/**
 * Rutas del Entregable 4 (contrato: docs/entregable-4/propuesta-backend-e4.md, sección 6).
 * Aquí no hay SQL: las rutas validan formato y delegan en los servicios.
 */
const crypto = require('node:crypto');
const { YoutubeError } = require('./youtube');
const { crearCatalogo } = require('./catalogo');
const { crearCola } = require('./cola');
const { crearReproduccion } = require('./reproduccion');
const { crearConectividad } = require('./conectividad');
const { crearFlujo } = require('./flujo');
const { crearSimulacion } = require('./simulacion');
const repo = require('./db/repositorio');
const { ErrorApi, UUID_REGEX, VIDEO_ID_REGEX, idNumero } = require('./comun-e4');

function enviarError(res, err) {
  if (err instanceof ErrorApi) {
    const error = { codigo: err.codigo, mensaje: err.message };
    if (err.detalle !== undefined) error.detalle = err.detalle;
    return res.status(err.status).json({ error });
  }
  if (err instanceof YoutubeError) return res.status(err.status).json({ error: { codigo: err.codigo, mensaje: err.message } });
  console.error('[e4] error inesperado:', err);
  return res.status(500).json({ error: { codigo: 'error_interno', mensaje: 'Error inesperado.' } });
}

/** Envuelve un manejador async: cualquier excepción se responde con el formato de error. */
const manejar = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch((err) => enviarError(res, err));

/** X-Dispositivo-Id. Obligatoria: lanza 400 si falta o es inválida. Opcional: null si falta, 400 si es inválida. */
function leerDispositivo(req, { obligatorio }) {
  const valor = req.get('X-Dispositivo-Id');
  if (valor === undefined || valor === '') {
    if (!obligatorio) return null;
  } else if (UUID_REGEX.test(valor)) {
    return valor.toLowerCase();
  }
  throw new ErrorApi(400, 'dispositivo_id_invalido', 'Falta la cabecera X-Dispositivo-Id o no es un UUID válido.');
}

function tokenValido(recibido, esperado) {
  if (typeof recibido !== 'string') return false;
  const a = Buffer.from(recibido);
  const b = Buffer.from(esperado);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Monta las rutas del E4 y crea sus servicios.
 * @param {import('express').Express} app
 * @param {{pool:object, youtube:object, almacenEventos:object, ahora?:()=>number, conectividad?:object,
 *          config?:{reproductorToken?:string, simulacionHabilitada?:boolean},
 *          temporizadores?:object, aleatorio?:()=>number}} deps
 */
function montarRutasE4(app, { pool, youtube, almacenEventos, ahora = Date.now, conectividad, config = {}, temporizadores = {}, aleatorio }) {
  const con = conectividad || crearConectividad({ ahora, programar: temporizadores.programar });
  const catalogo = crearCatalogo({ pool, youtube, ahora });
  if (typeof youtube.alObtenerVideos === 'function') youtube.alObtenerVideos((items) => catalogo.guardarVideos(items));

  // Avisos de cambio: se resuelven después de crear flujo y simulación.
  let flujo = null;
  let simulacion = null;
  const alCambiar = (idSesion) => {
    if (flujo) flujo.notificarSesion(idSesion);
    if (simulacion) simulacion.alCambiar(idSesion);
  };

  const cola = crearCola({ pool, catalogo, conectividad: con, ahora, almacenEventos, alCambiar });
  const reproduccion = crearReproduccion({ pool, cola, ahora, almacenEventos, alCambiar });
  flujo = crearFlujo({
    pool, cola, conectividad: con, ahora,
    programarIntervalo: temporizadores.programarIntervalo, cancelarIntervalo: temporizadores.cancelarIntervalo,
  });

  // Cambio de rango de dispositivos activos en la sesión: nueva versión (solo si está activa) y reenvío.
  con.alCambiarRango((idSesion) => {
    repo.incrementarVersionSesionActiva(pool, idSesion)
      .then((v) => { if (v !== null) return flujo.notificarSesion(idSesion); })
      .catch((err) => console.error('[conectividad] no se pudo avisar el cambio de rango:', err.message));
  });

  // Cambio de conteo neto en la sesión: evento SSE independiente para el panel DJ sin incrementar version_cola.
  con.alCambiarConteo((idSesion, activos, intervalo) => {
    flujo.notificarEvento(idSesion, 'conectividad', {
      dispositivos_activos: activos,
      intervalo_canciones: intervalo,
    });
  });

  // ------------------------------------------------------------ cliente (Android y vista pública)

  // C1. Estado de la cola
  app.get('/api/sesiones/:idSesion/cola', manejar(async (req, res) => {
    const uuid = leerDispositivo(req, { obligatorio: false });
    const sesion = await cola.obtenerSesionActiva(req.params.idSesion);
    const idDispositivo = uuid ? await cola.registrarDispositivo(uuid, sesion.id_sesion) : null;
    res.json(await cola.estadoCola(sesion.id_sesion, idDispositivo));
  }));

  // C2. Flujo SSE (los errores previos se responden como JSON normal)
  app.get('/api/sesiones/:idSesion/cola/flujo', manejar(async (req, res) => {
    const uuid = leerDispositivo(req, { obligatorio: false });
    const sesion = await cola.obtenerSesionActiva(req.params.idSesion);
    const idDispositivo = uuid ? await cola.registrarDispositivo(uuid, sesion.id_sesion) : null;
    flujo.abrir(req, res, { sesion, uuid, idDispositivo });
  }));

  // C2b. Latido explícito de dispositivo (actualiza ultima_actividad sin duplicar registro)
  app.post('/api/sesiones/:idSesion/latido', manejar(async (req, res) => {
    const uuid = leerDispositivo(req, { obligatorio: true });
    const sesion = await cola.obtenerSesionActiva(req.params.idSesion);
    const idDispositivo = await cola.registrarDispositivo(uuid, sesion.id_sesion);
    res.json({ ok: true, id_dispositivo: idDispositivo, sesion_id: sesion.id_sesion, timestamp: ahora() });
  }));

  // C3. Solicitar una canción (P1: voto automático)
  app.post('/api/sesiones/:idSesion/solicitudes', manejar(async (req, res) => {
    const uuid = leerDispositivo(req, { obligatorio: true });
    await cola.obtenerSesionActiva(req.params.idSesion);
    const id = req.body && req.body.youtube_video_id;
    if (typeof id !== 'string' || !VIDEO_ID_REGEX.test(id)) {
      throw new ErrorApi(400, 'cancion_invalida', 'youtube_video_id falta o no tiene un formato válido.');
    }
    const r = await cola.solicitar({ idSesion: req.params.idSesion, uuid, youtubeVideoId: id });
    res.status(r.status).json(r.cuerpo);
  }));

  // C4. Voto manual (P2). Los votos son definitivos: no hay cambio ni retiro.
  const rutaVotos = '/api/sesiones/:idSesion/solicitudes/:idSolicitud/votos';
  app.post(rutaVotos, manejar(async (req, res) => {
    const uuid = leerDispositivo(req, { obligatorio: true });
    const r = await cola.votar({ idSesion: req.params.idSesion, idSolicitud: idNumero('SOL', req.params.idSolicitud), uuid });
    res.status(r.status).json(r.cuerpo);
  }));
  app.all(rutaVotos, (_req, res) => res.set('Allow', 'POST').status(405).end());

  // ------------------------------------------------------------ reproductor (R1, R2). No los llama Android.

  // Protección mínima del E4 (NO es la autenticación del E5): sin REPRODUCTOR_TOKEN las rutas no existen,
  // y con un token distinto tampoco se revelan (404).
  const exigirReproductor = (req, res, next) => {
    if (!config.reproductorToken || !tokenValido(req.get('X-Reproductor-Token'), config.reproductorToken)) return next('route');
    return next();
  };
  // En el E4 no hay reproductor real: con la simulación habilitada, lo que llega por R1/R2 es simulación.
  const origen = () => (config.simulacionHabilitada ? 'simulacion' : 'reproductor');

  app.post('/api/sesiones/:idSesion/reproduccion/iniciar', exigirReproductor, manejar(async (req, res) => {
    res.json(await reproduccion.iniciar(req.params.idSesion, origen()));
  }));
  app.post('/api/sesiones/:idSesion/reproduccion/siguiente', exigirReproductor, manejar(async (req, res) => {
    res.json(await reproduccion.siguiente(req.params.idSesion, req.body, origen()));
  }));

  // ------------------------------------------------------------ simulación (niveles 2 y 3)

  if (config.simulacionHabilitada) {
    simulacion = crearSimulacion({
      reproduccion, cola, conectividad: con, aleatorio,
      programar: temporizadores.programar, cancelar: temporizadores.cancelar,
    });
    app.post('/api/simulacion/sesiones/:idSesion/auto', manejar(async (req, res) => {
      res.json(await simulacion.configurarAuto(req.params.idSesion, req.body));
    }));
    app.post('/api/simulacion/establecimientos/:idEstablecimiento/dispositivos-activos-virtuales', manejar(async (req, res) => {
      const idEst = req.params.idEstablecimiento;
      const sesionObjetivo = req.body && typeof req.body.id_sesion === 'string' ? req.body.id_sesion : null;
      if (sesionObjetivo) {
        return res.json(simulacion.fijarVirtuales(sesionObjetivo, req.body, { idEstablecimiento: idEst }));
      }
      const { rows } = await pool.query(
        `SELECT id_sesion FROM sesion WHERE id_establecimiento = $1 AND estado = 'activa' AND qr_estado = 'activo'`,
        [idEst],
      );
      let respuesta = simulacion.fijarVirtuales(idEst, req.body, { idEstablecimiento: idEst, soloValidar: true });
      for (const r of rows) respuesta = simulacion.fijarVirtuales(r.id_sesion, req.body, { idEstablecimiento: idEst });
      res.json(respuesta);
    }));
  }

  async function cerrar() {
    if (simulacion) await simulacion.detener();
    await flujo.cerrar();
  }

  return { cola, reproduccion, catalogo, flujo, simulacion, conectividad: con, cerrar };
}

module.exports = { montarRutasE4, leerDispositivo };
