'use strict';
/**
 * Landing page pública y distribución controlada del APK vía GitHub Releases (Fase 7).
 */
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');

const PREFIJO_RELEASE_PERMITIDO = 'https://github.com/slopez1023/proyecto-nuclear-vii/releases/download/';
const RUTA_MANIFIESTO_DEFECTO = path.join(__dirname, '..', 'data', 'descarga', 'apk.json');
const DIR_PUBLICO_DEFECTO = path.join(__dirname, '..', 'public', 'descargar');

function leerManifiesto(ruta) {
  try {
    const crudo = fs.readFileSync(ruta, 'utf8');
    const obj = JSON.parse(crudo);
    return obj && typeof obj === 'object' ? obj : null;
  } catch (err) {
    if (err && err.code === 'ENOENT') return null;
    console.error('[descarga] manifiesto inválido:', err.message);
    return null;
  }
}

function urlReleaseValida(url) {
  return typeof url === 'string' && url.startsWith(PREFIJO_RELEASE_PERMITIDO);
}

function montarDescarga(app, {
  rutaManifiesto = RUTA_MANIFIESTO_DEFECTO,
  dirPublico = DIR_PUBLICO_DEFECTO,
} = {}) {
  app.get('/descargar', (_req, res) => {
    res.set(
      'Content-Security-Policy',
      "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; font-src 'self'",
    );
    res.sendFile(path.join(dirPublico, 'index.html'));
  });

  app.get('/api/descarga', (_req, res) => {
    const m = leerManifiesto(rutaManifiesto);
    if (!m) {
      return res.status(503).json({
        error: {
          codigo: 'descarga_no_disponible',
          mensaje: 'Los metadatos de descarga aún no están disponibles.',
        },
      });
    }
    const urlOk = urlReleaseValida(m.url_descarga);
    const publicado = m.publicado === true && urlOk;
    return res.json({
      publicado,
      version_name: m.version_name || null,
      version_code: m.version_code ?? null,
      tamano_bytes: m.tamano_bytes ?? null,
      sha256: m.sha256 || null,
      fecha_publicacion: m.fecha_publicacion || null,
      min_sdk: m.min_sdk ?? 26,
      android_minimo: m.android_minimo || 'Android 8.0 (API 26)',
      url_descarga: publicado ? m.url_descarga : null,
    });
  });

  app.get('/descargar/app.apk', (_req, res) => {
    res.set('Cache-Control', 'no-store');
    const m = leerManifiesto(rutaManifiesto);
    if (m && m.publicado === true && urlReleaseValida(m.url_descarga)) {
      return res.redirect(302, m.url_descarga);
    }
    return res.status(503).type('html').send(
      '<!doctype html><html lang="es"><head><meta charset="utf-8">'
      + '<meta name="viewport" content="width=device-width,initial-scale=1">'
      + '<title>PONGA PUES — APK en preparación</title></head>'
      + '<body style="font-family:system-ui,sans-serif;background:#090a0f;color:#f6f7fb;padding:32px;text-align:center">'
      + '<h1>PONGA PUES</h1>'
      + '<p>El paquete APK aún no se encuentra publicado o el enlace oficial está en preparación.</p>'
      + '<p><a href="/descargar" style="color:#a69cff">Volver a la página de descarga</a></p>'
      + '</body></html>',
    );
  });

  app.use('/descargar', express.static(dirPublico));
}

module.exports = {
  PREFIJO_RELEASE_PERMITIDO,
  RUTA_MANIFIESTO_DEFECTO,
  montarDescarga,
};
