'use strict';
require('dotenv').config({ path: require('node:path').join(__dirname, '..', '.env') });
const { crearApp } = require('./app');
const { cargarSesiones } = require('./sesiones');
const { crearClienteYoutube } = require('./youtube');
const { crearAlmacen } = require('./eventos');

const port = Number(process.env.PORT) || 3000;
if (!process.env.YOUTUBE_API_KEY) {
  console.warn('[aviso] YOUTUBE_API_KEY no configurada: /api/busqueda responderá 503 hasta definirla en backend/.env');
}

const app = crearApp({
  sesiones: cargarSesiones(),
  youtube: crearClienteYoutube({ apiKey: process.env.YOUTUBE_API_KEY }),
  almacenEventos: crearAlmacen(),
  config: {
    androidPackage: process.env.ANDROID_PACKAGE,
    androidSha256: process.env.ANDROID_SHA256_CERT,
  },
});

app.listen(port, () => console.log(`Backend Nuclear VII (E3) escuchando en http://localhost:${port}`));
