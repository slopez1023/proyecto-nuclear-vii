'use strict';
/**
 * Capa de integración del Entregable 5 sobre una app Express creada por `crearApp()` (E3/E4).
 * Reutiliza los servicios ya montados en `app.locals.e4` (`cola`, `catalogo`, `flujo`, `conectividad`)
 * sin modificar `src/app.js` ni `src/rutas-e4.js`.
 */
const path = require('node:path');
const express = require('express');
const { crearEmisorE5 } = require('./eventos-e5');
const { crearAuth } = require('./auth');
const { crearSesionesAdmin } = require('./sesiones-admin');
const { crearBloqueos } = require('./bloqueos');
const { crearListas } = require('./listas');
const { crearReproductor } = require('./reproductor');
const { crearPlanificador } = require('./planificador');
const { crearRouterE5 } = require('./rutas-e5');
const { crearBonus } = require('./bonus');
const { crearDisplayServicio } = require('./display');
const { montarRutasPublicas } = require('./rutas-public');
const { manejar, ErrorApi, idNumero } = require('./comun-e5');
const { leerDispositivo } = require('../rutas-e4');
const { crearLimitadorIntentos, crearResolutorCodigo } = require('./codigo-acceso');
const repo5 = require('./repositorio-e5');

function montarE5(app, { pool, youtube, almacenEventos, ahora = Date.now, config = {} }) {
  const e4 = app.locals.e4;
  if (!e4) throw new Error('El módulo E5 requiere que el E4 (PostgreSQL) esté montado en app.locals.e4.');

  if (typeof e4.cola.setValidadorBloqueos === 'function') {
    e4.cola.setValidadorBloqueos(async (client, idEst, idCancion, t) => {
      const ids = await repo5.idsBloqueados(client, idEst, t);
      return ids.has(idCancion);
    });
  }

  const emisor = crearEmisorE5({ almacenEventos, ahora });
  const auth = crearAuth({ pool, ahora, cookieSegura: Boolean(config.cookieSegura) });
  const sesionesAdmin = crearSesionesAdmin({
    pool, flujo: e4.flujo, ahora, emisor,
    publicBaseUrl: config.publicBaseUrl || 'http://localhost:3000',
    generarCodigo: config.generarCodigo,
  });
  const limitadorCodigo = config.limitadorCodigo || crearLimitadorIntentos({ ahora });
  const resolutorCodigo = config.resolutorCodigo || crearResolutorCodigo({
    pool,
    limitador: limitadorCodigo,
    esperar: config.esperarCodigo,
    registrar: config.registrarCodigo,
  });
  const bloqueos = crearBloqueos({ pool, catalogo: e4.catalogo, flujo: e4.flujo, ahora, emisor });
  const listas = crearListas({ pool, catalogo: e4.catalogo, ahora, emisor });
  const reproductor = crearReproductor({ pool, cola: e4.cola, flujo: e4.flujo, ahora, emisor });
  const bonus = crearBonus({
    pool, e4, flujo: e4.flujo, ahora, emisor,
    intervaloRespaldoMs: config.intervaloRespaldoMs || 24 * 60 * 60 * 1000,
    carpetaRespaldos: config.carpetaRespaldos,
  });
  const display = crearDisplayServicio({ pool, flujo: e4.flujo, ahora, emisor });
  const planificador = crearPlanificador({
    pool, sesionesAdmin, reproductor, bonus, ahora, intervaloMs: config.intervaloPlanificadorMs || 15_000,
  });

  // Ingreso alternativo por código de 6 dígitos hacia la misma sesión del QR (sin revelar metadatos internos)
  app.post('/api/sesiones/acceso-codigo', manejar(async (req, res) => {
    const codigo = req.body && req.body.codigo;
    let dispositivo = null;
    try {
      dispositivo = leerDispositivo(req, { obligatorio: false });
    } catch {
      dispositivo = null;
    }
    const r = await resolutorCodigo.resolver({ codigo, ip: req.ip, dispositivo });
    if (!r.ok) {
      if (r.status === 429) {
        res.set('Retry-After', String(r.reintentarEnS));
        return res.status(429).json({
          error: { codigo: r.codigoError, mensaje: r.mensaje, reintentar_en_s: r.reintentarEnS },
        });
      }
      return res.status(r.status).json({ error: { codigo: r.codigoError, mensaje: r.mensaje } });
    }
    return res.json({ qr_token: r.qr_token });
  }));

  // Funciones opcionales para el cliente (sin autenticación de personal: usan el UUID del dispositivo como el E4)
  app.post('/api/sesiones/:idSesion/solicitudes/:idSolicitud/cambiar-voto', manejar(async (req, res) => {
    const uuid = leerDispositivo(req, { obligatorio: true });
    const origen = idNumero('SOL', req.params.idSolicitud);
    const destino = idNumero('SOL', req.body && req.body.nueva_solicitud_id);
    if (origen === null || destino === null) {
      throw new ErrorApi(400, 'solicitud_invalida', 'idSolicitud y nueva_solicitud_id deben tener el formato SOL-n.');
    }
    res.json(await bonus.cambiarVoto({ idSesion: req.params.idSesion, uuid, idSolicitudOrigen: origen, idSolicitudDestino: destino }));
  }));
  app.get('/api/catalogo/explorar', manejar(async (req, res) => {
    res.json(await bonus.explorarCatalogo(req.query));
  }));
  app.get('/api/catalogo/generos', manejar(async (_req, res) => {
    res.json(await bonus.listarGeneros());
  }));

  const router = crearRouterE5({
    pool, youtube, auth, sesionesAdmin, bloqueos, listas, reproductor, bonus, display, flujo: e4.flujo, conectividad: e4.conectividad, ahora,
  });
  app.use('/api/admin', router);
  montarRutasPublicas(app, { display, reproductor, bonus, flujo: e4.flujo });

  // Panel web del E5 (administrador y DJ), separado del cliente de respaldo (public/index.html)
  const dirAdmin = path.join(__dirname, '..', '..', 'public', 'admin');
  app.get('/admin', (_req, res) => res.sendFile(path.join(dirAdmin, 'index.html')));
  app.get('/sonido', (_req, res) => res.sendFile(path.join(dirAdmin, 'sonido.html')));
  app.use('/admin', express.static(dirAdmin));

  const servicios = { auth, sesionesAdmin, bloqueos, listas, reproductor, bonus, display, planificador, emisor, resolutorCodigo };
  app.locals.e5 = servicios;
  return servicios;
}

module.exports = { montarE5 };
