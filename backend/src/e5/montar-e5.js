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
    pool, flujo: e4.flujo, ahora, emisor, publicBaseUrl: config.publicBaseUrl || 'http://localhost:3000',
  });
  const bloqueos = crearBloqueos({ pool, catalogo: e4.catalogo, flujo: e4.flujo, ahora, emisor });
  const listas = crearListas({ pool, catalogo: e4.catalogo, ahora, emisor });
  const reproductor = crearReproductor({ pool, cola: e4.cola, flujo: e4.flujo, ahora, emisor });
  const planificador = crearPlanificador({
    pool, sesionesAdmin, reproductor, ahora, intervaloMs: config.intervaloPlanificadorMs || 15_000,
  });

  const router = crearRouterE5({
    pool, youtube, auth, sesionesAdmin, bloqueos, listas, reproductor, conectividad: e4.conectividad, ahora,
  });
  app.use('/api/admin', router);

  // Panel web del E5 (administrador y DJ), separado del cliente de respaldo (public/index.html)
  const dirAdmin = path.join(__dirname, '..', '..', 'public', 'admin');
  app.get('/admin', (_req, res) => res.sendFile(path.join(dirAdmin, 'index.html')));
  app.use('/admin', express.static(dirAdmin));

  const servicios = { auth, sesionesAdmin, bloqueos, listas, reproductor, planificador, emisor };
  app.locals.e5 = servicios;
  return servicios;
}

module.exports = { montarE5 };
