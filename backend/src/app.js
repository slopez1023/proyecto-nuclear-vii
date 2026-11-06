'use strict';
const path = require('node:path');
const express = require('express');
const { validarToken } = require('./sesiones');
const { validarEvento } = require('./eventos');
const { YoutubeError } = require('./youtube');

const MIN_Q = 2;
const MAX_Q = 100;

// Código HTTP por motivo de rechazo del QR (sesion_cerrada y qr_desactivado: 410 Gone)
const STATUS_POR_MOTIVO = {
  token_invalido: 400,
  sesion_inexistente: 404,
  sesion_cerrada: 410,
  qr_desactivado: 410,
};

/**
 * Crea la app Express. Todas las dependencias se inyectan para poder probarla sin red.
 * @param {{sesiones:object[], youtube:{buscar:Function}, almacenEventos:{guardar:Function}, config?:object}} deps
 */
function crearApp({ sesiones, youtube, almacenEventos, config = {} }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '10kb' }));

  const errorJson = (res, status, codigo, mensaje) => res.status(status).json({ error: { codigo, mensaje } });

  function leerConsulta(req, res) {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (q.length < MIN_Q || q.length > MAX_Q) {
      errorJson(res, 400, 'consulta_invalida', `q debe tener entre ${MIN_Q} y ${MAX_Q} caracteres.`);
      return null;
    }
    return q;
  }

  function manejarYoutube(res, err) {
    if (err instanceof YoutubeError) return errorJson(res, err.status, err.codigo, err.message);
    return errorJson(res, 500, 'error_interno', 'Error inesperado.');
  }

  // B01: validación del QR/sesión
  app.get('/api/sesiones/:token', (req, res) => {
    const r = validarToken(req.params.token, sesiones);
    if (!r.ok) {
      return errorJson(res, STATUS_POR_MOTIVO[r.motivo], r.motivo, 'Acceso no disponible para este código QR.');
    }
    const { sesion } = r;
    res.json({
      id_sesion: sesion.id_sesion,
      establecimiento: sesion.establecimiento,
      estado: sesion.estado,
      provisional: true, // fuente de sesiones simulada (data/sesiones.mock.json)
    });
  });

  // B03/B05/B16: búsqueda vía YouTube
  app.get('/api/busqueda', async (req, res) => {
    const q = leerConsulta(req, res);
    if (q === null) return;
    try {
      res.json({ resultados: await youtube.buscar(q, 10) });
    } catch (err) {
      manejarYoutube(res, err);
    }
  });

  // B04: autocompletado (títulos sugeridos a partir de resultados de YouTube)
  app.get('/api/busqueda/sugerencias', async (req, res) => {
    const q = leerConsulta(req, res);
    if (q === null) return;
    try {
      const canciones = await youtube.buscar(q, 5);
      const sugerencias = [...new Set(canciones.map((c) => c.titulo))];
      res.json({ sugerencias });
    } catch (err) {
      manejarYoutube(res, err);
    }
  });

  // Instrumentación (dispositivo_unido, busqueda_realizada)
  app.post('/api/eventos', (req, res) => {
    const r = validarEvento(req.body);
    if (r.error) return errorJson(res, 400, r.error, 'Evento inválido.');
    almacenEventos.guardar(r.evento);
    res.status(202).json({ evento_id: r.evento.evento_id });
  });

  // Android App Links (requiere host HTTPS público para la verificación de dominio)
  app.get('/.well-known/assetlinks.json', (_req, res) => {
    const huellas = (config.androidSha256 || '').split(',').map((s) => s.trim()).filter(Boolean);
    res.json([{
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: config.androidPackage || 'co.edu.cue.nuclear.cliente',
        sha256_cert_fingerprints: huellas,
      },
    }]);
  });

  // Cliente web de respaldo (B02): la URL del QR abre esta página sin instalar ni registrarse
  const publico = path.join(__dirname, '..', 'public');
  app.get('/s/:token', (_req, res) => res.sendFile(path.join(publico, 'index.html')));
  app.use(express.static(publico));

  return app;
}

module.exports = { crearApp, MIN_Q, MAX_Q };
