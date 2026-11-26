'use strict';
/**
 * Rutas REST del módulo web de administración y DJ (/api/admin/*).
 * Todas las rutas de operación requieren sesión válida (cookie HttpOnly o Bearer) y filtran por
 * `req.usuario.id_establecimiento` (un establecimiento nunca accede a datos de otro).
 */
const express = require('express');
const repo5 = require('./repositorio-e5');
const analitica = require('./analitica');
const { ErrorApi, manejar, iso } = require('./comun-e5');

const idEntero = (valor, nombre) => {
  const n = Number(valor);
  if (!Number.isInteger(n) || n <= 0) throw new ErrorApi(400, 'id_invalido', `${nombre} no es válido.`);
  return n;
};

function crearRouterE5({ pool, youtube, auth, sesionesAdmin, bloqueos, listas, reproductor, bonus, conectividad, ahora }) {
  const router = express.Router();
  const soloAdmin = auth.exigirRol('admin');
  const operador = auth.exigirRol('admin', 'dj');

  // ------------------------------------------------------------ autenticación
  router.post('/auth/login', manejar(async (req, res) => {
    res.json(await auth.iniciarSesion(req, res));
  }));
  router.post('/auth/logout', manejar(async (req, res) => {
    await auth.cerrarSesion(req, res);
    res.json({ ok: true });
  }));

  router.use(auth.autenticar);

  router.get('/auth/yo', operador, manejar(async (req, res) => {
    const u = req.usuario;
    res.json({
      usuario: {
        id_usuario: `USR-${u.id_usuario}`, usuario: u.usuario, nombre: u.nombre, rol: u.rol,
        id_establecimiento: u.id_establecimiento, establecimiento: u.establecimiento,
      },
    });
  }));

  // ------------------------------------------------------------ resumen general del panel
  router.get('/panel', operador, manejar(async (req, res) => {
    const idEst = req.usuario.id_establecimiento;
    const est = await repo5.obtenerEstablecimiento(pool, idEst);
    const cfg = await sesionesAdmin.asegurarEstablecimiento(idEst);
    const sesiones = await sesionesAdmin.listarSesiones(idEst);
    const horario = await sesionesAdmin.resumenHorario(pool, idEst, cfg);
    const listasResumen = await listas.listar(idEst);
    const bloqueosActivos = await bloqueos.listar(idEst);
    const sesionObj = (req.query.sesion ? sesiones.find((s) => s.id_sesion === req.query.sesion) : null)
      || sesiones.find((s) => s.id_sesion === cfg.id_sesion_principal && s.estado === 'activa')
      || sesiones.find((s) => s.estado === 'activa')
      || sesiones.find((s) => s.id_sesion === cfg.id_sesion_principal)
      || sesiones[0]
      || null;
    const rep = sesionObj ? await reproductor.estadoActual(idEst, sesionObj.id_sesion) : null;
    const activos = conectividad && sesionObj ? conectividad.contarActivos(sesionObj.id_sesion) : 0;

    res.json({
      establecimiento: est,
      configuracion: {
        id_sesion_principal: cfg.id_sesion_principal,
        modo_automatico: cfg.modo_automatico,
        pausa_manual: cfg.pausa_manual,
        pausa_motivo: cfg.pausa_motivo,
        zona_horaria: cfg.zona_horaria,
        id_lista_defecto: cfg.id_lista_defecto,
        rotacion_listas: cfg.rotacion_listas,
      },
      dispositivos_activos: activos,
      sesiones,
      horario,
      reproduccion: rep,
      bloqueos_activos: bloqueosActivos.length,
      listas: listasResumen,
    });
  }));

  // ------------------------------------------------------------ sesiones y QR
  router.get('/sesiones', operador, manejar(async (req, res) => {
    res.json({ sesiones: await sesionesAdmin.listarSesiones(req.usuario.id_establecimiento) });
  }));
  router.post('/sesiones', soloAdmin, manejar(async (req, res) => {
    res.status(201).json({ sesion: await sesionesAdmin.crearSesion(req.usuario.id_establecimiento, req.body, req.usuario) });
  }));
  router.post('/sesiones/:idSesion/activar', soloAdmin, manejar(async (req, res) => {
    res.json(await sesionesAdmin.activarSesion(req.usuario.id_establecimiento, req.params.idSesion, req.usuario));
  }));
  router.post('/sesiones/:idSesion/desactivar', soloAdmin, manejar(async (req, res) => {
    const limpiar = req.body && req.body.limpiar_cola !== undefined ? Boolean(req.body.limpiar_cola) : true;
    res.json(await sesionesAdmin.desactivarSesion(req.usuario.id_establecimiento, req.params.idSesion, req.usuario, { limpiarCola: limpiar }));
  }));
  router.patch('/sesiones/:idSesion/qr', soloAdmin, manejar(async (req, res) => {
    const activo = req.body ? req.body.activo : undefined;
    res.json(await sesionesAdmin.cambiarEstadoQr(req.usuario.id_establecimiento, req.params.idSesion, activo, req.usuario));
  }));
  router.get('/sesiones/:idSesion/qr.png', operador, manejar(async (req, res) => {
    const { png } = await sesionesAdmin.generarQrPng(req.usuario.id_establecimiento, req.params.idSesion);
    res.set('Content-Type', 'image/png').send(png);
  }));

  // ------------------------------------------------------------ horarios, pausa manual y modo automático
  router.get('/horarios', operador, manejar(async (req, res) => {
    const idEst = req.usuario.id_establecimiento;
    const cfg = await sesionesAdmin.asegurarEstablecimiento(idEst);
    res.json({
      zona_horaria: cfg.zona_horaria,
      modo_automatico: cfg.modo_automatico,
      pausa_manual: cfg.pausa_manual,
      pausa_motivo: cfg.pausa_motivo,
      ...(await sesionesAdmin.resumenHorario(pool, idEst, cfg)),
    });
  }));
  router.put('/horarios', soloAdmin, manejar(async (req, res) => {
    res.json(await sesionesAdmin.guardarHorarios(req.usuario.id_establecimiento, req.body, req.usuario));
  }));
  router.post('/horarios/excepciones', soloAdmin, manejar(async (req, res) => {
    res.status(201).json(await sesionesAdmin.guardarExcepcion(req.usuario.id_establecimiento, req.body, req.usuario));
  }));
  router.delete('/horarios/excepciones/:idExcepcion', soloAdmin, manejar(async (req, res) => {
    res.json(await sesionesAdmin.eliminarExcepcion(req.usuario.id_establecimiento, idEntero(req.params.idExcepcion, 'idExcepcion'), req.usuario));
  }));
  router.post('/establecimiento/pausa', soloAdmin, manejar(async (req, res) => {
    const b = req.body || {};
    res.json(await sesionesAdmin.fijarPausaManual(req.usuario.id_establecimiento, b.pausada, b.motivo, req.usuario));
  }));
  router.patch('/establecimiento/automatico', soloAdmin, manejar(async (req, res) => {
    res.json(await sesionesAdmin.configurarAutomatico(req.usuario.id_establecimiento, req.body, req.usuario));
  }));

  // ------------------------------------------------------------ mantenimiento
  router.get('/sesiones/:idSesion/mantenimiento', soloAdmin, manejar(async (req, res) => {
    res.json(await sesionesAdmin.obtenerMantenimiento(req.usuario.id_establecimiento, req.params.idSesion));
  }));
  router.post('/sesiones/:idSesion/mantenimiento/limpiar-cola', soloAdmin, manejar(async (req, res) => {
    const reiniciar = Boolean(req.body && req.body.reiniciar_lista);
    res.json(await sesionesAdmin.limpiarCola(req.usuario.id_establecimiento, req.params.idSesion, req.usuario, { reiniciarLista: reiniciar }));
  }));

  // ------------------------------------------------------------ reproducción (DJ + Admin)
  router.get('/sesiones/:idSesion/reproduccion', operador, manejar(async (req, res) => {
    res.json(await reproductor.estadoActual(req.usuario.id_establecimiento, req.params.idSesion));
  }));
  router.post('/sesiones/:idSesion/reproduccion/iniciar', operador, manejar(async (req, res) => {
    res.json(await reproductor.iniciar(req.usuario.id_establecimiento, req.params.idSesion, req.usuario));
  }));
  router.post('/sesiones/:idSesion/reproduccion/pausar', operador, manejar(async (req, res) => {
    res.json(await reproductor.pausar(req.usuario.id_establecimiento, req.params.idSesion, req.usuario));
  }));
  router.post('/sesiones/:idSesion/reproduccion/reanudar', operador, manejar(async (req, res) => {
    res.json(await reproductor.reanudar(req.usuario.id_establecimiento, req.params.idSesion, req.usuario));
  }));
  router.post('/sesiones/:idSesion/reproduccion/siguiente', operador, manejar(async (req, res) => {
    res.json(await reproductor.siguiente(req.usuario.id_establecimiento, req.params.idSesion, req.body, req.usuario));
  }));
  router.post('/sesiones/:idSesion/reproduccion/saltar', operador, manejar(async (req, res) => {
    res.json(await reproductor.saltar(req.usuario.id_establecimiento, req.params.idSesion, req.body, req.usuario));
  }));
  router.post('/sesiones/:idSesion/reproduccion/error', operador, manejar(async (req, res) => {
    res.json(await reproductor.reportarError(req.usuario.id_establecimiento, req.params.idSesion, req.body, req.usuario));
  }));

  // ------------------------------------------------------------ bloqueos temporales (Admin + DJ)
  router.get('/bloqueos', operador, manejar(async (req, res) => {
    res.json({ bloqueos: await bloqueos.listar(req.usuario.id_establecimiento, { incluirVencidos: req.query.todos === '1' }) });
  }));
  router.post('/bloqueos', operador, manejar(async (req, res) => {
    res.status(201).json(await bloqueos.bloquear(req.usuario.id_establecimiento, req.body, req.usuario));
  }));
  router.post('/bloqueos/:idBloqueo/desbloquear', operador, manejar(async (req, res) => {
    res.json(await bloqueos.desbloquear(req.usuario.id_establecimiento, idEntero(req.params.idBloqueo, 'idBloqueo'), req.usuario));
  }));

  // ------------------------------------------------------------ listas predeterminadas (Admin + DJ)
  router.get('/listas', operador, manejar(async (req, res) => {
    res.json(await listas.listar(req.usuario.id_establecimiento));
  }));
  router.put('/listas/configuracion/predeterminada', operador, manejar(async (req, res) => {
    res.json(await listas.configurarPredeterminada(req.usuario.id_establecimiento, req.body, req.usuario));
  }));
  router.post('/listas', operador, manejar(async (req, res) => {
    res.status(201).json(await listas.crear(req.usuario.id_establecimiento, req.body, req.usuario));
  }));
  router.get('/listas/:idLista', operador, manejar(async (req, res) => {
    res.json(await listas.detalle(req.usuario.id_establecimiento, idEntero(req.params.idLista, 'idLista')));
  }));
  router.patch('/listas/:idLista', operador, manejar(async (req, res) => {
    res.json(await listas.actualizar(req.usuario.id_establecimiento, idEntero(req.params.idLista, 'idLista'), req.body, req.usuario));
  }));
  router.delete('/listas/:idLista', operador, manejar(async (req, res) => {
    res.json(await listas.eliminar(req.usuario.id_establecimiento, idEntero(req.params.idLista, 'idLista'), req.usuario));
  }));
  router.post('/listas/:idLista/canciones', operador, manejar(async (req, res) => {
    res.status(201).json(await listas.agregarCancion(req.usuario.id_establecimiento, idEntero(req.params.idLista, 'idLista'), req.body, req.usuario));
  }));
  router.delete('/listas/:idLista/canciones/:youtubeVideoId', operador, manejar(async (req, res) => {
    res.json(await listas.quitarCancion(req.usuario.id_establecimiento, idEntero(req.params.idLista, 'idLista'), req.params.youtubeVideoId, req.usuario));
  }));
  router.put('/listas/:idLista/orden', operador, manejar(async (req, res) => {
    res.json(await listas.reordenar(req.usuario.id_establecimiento, idEntero(req.params.idLista, 'idLista'), req.body, req.usuario));
  }));

  // ------------------------------------------------------------ catálogo y registro
  router.get('/catalogo', operador, manejar(async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const locales = await repo5.buscarCatalogo(pool, q, 20);
    if (locales.length > 0 || q.length < 2 || !youtube || typeof youtube.buscar !== 'function') {
      return res.json({ resultados: locales, fuente: 'catalogo_local' });
    }
    try {
      const yt = await youtube.buscar(q, 8);
      return res.json({ resultados: yt.filter((c) => c.disponibilidad === 'disponible'), fuente: 'youtube' });
    } catch {
      return res.json({ resultados: [], fuente: 'catalogo_local' });
    }
  }));

  router.get('/registro', operador, manejar(async (req, res) => {
    const filas = await repo5.leerRegistro(pool, req.usuario.id_establecimiento, 50);
    res.json({ registros: filas.map((r) => ({ ...r, fecha: iso(r.fecha) })) });
  }));

  // ------------------------------------------------------------ analítica y pipeline de eventos
  router.get('/analitica', operador, manejar(async (req, res) => {
    const idSesion = typeof req.query.sesion === 'string' && req.query.sesion.trim() ? req.query.sesion.trim() : null;
    res.json(await analitica.obtenerTablero({
      pool,
      idEst: req.usuario.id_establecimiento,
      idSesion,
      ahora,
    }));
  }));

  router.post('/analitica/ingesta', soloAdmin, manejar(async (_req, res) => {
    res.json(await analitica.ejecutarPipeline({ pool, ahora }));
  }));

  // ------------------------------------------------------------ funciones opcionales (bonificación)
  router.put('/canciones/:youtubeVideoId/genero', operador, manejar(async (req, res) => {
    res.json(await bonus.etiquetarGenero(req.usuario.id_establecimiento, req.params.youtubeVideoId, req.body, req.usuario));
  }));

  router.get('/respaldos', operador, manejar(async (req, res) => {
    res.json(await bonus.listarRespaldos(req.usuario.id_establecimiento));
  }));
  router.post('/respaldos', soloAdmin, manejar(async (req, res) => {
    res.status(201).json(await bonus.generarRespaldo(req.usuario.id_establecimiento, 'manual', req.usuario));
  }));
  router.get('/respaldos/:idRespaldo', soloAdmin, manejar(async (req, res) => {
    const r = await bonus.obtenerRespaldo(req.usuario.id_establecimiento, idEntero(req.params.idRespaldo, 'idRespaldo'));
    res.set('Content-Disposition', `attachment; filename="respaldo-listas-${r.id_respaldo}.json"`).json(r);
  }));

  router.get('/sonido', operador, manejar(async (req, res) => {
    res.json(await bonus.leerSonido(req.usuario.id_establecimiento));
  }));
  router.put('/sonido', operador, manejar(async (req, res) => {
    res.json(await bonus.fijarSonido(req.usuario.id_establecimiento, req.body, req.usuario));
  }));
  router.post('/sonido/latido', operador, manejar(async (req, res) => {
    res.json(await bonus.registrarLatido(req.usuario.id_establecimiento));
  }));

  return router;
}

module.exports = { crearRouterE5 };
