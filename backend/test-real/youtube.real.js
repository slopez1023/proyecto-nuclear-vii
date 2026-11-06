'use strict';
/**
 * Prueba REAL contra YouTube Data API v3 usando la clave de backend/.env (no usa mocks).
 * No forma parte de `npm test` (consume cuota: ~101 unidades por búsqueda). Ejecutar con:  npm run test:real
 * Nunca imprime la clave. Se omite si YOUTUBE_API_KEY no está configurada.
 */
require('dotenv').config({ path: require('node:path').join(__dirname, '..', '.env') });
const test = require('node:test');
const assert = require('node:assert/strict');
const { crearClienteYoutube } = require('../src/youtube');

const apiKey = process.env.YOUTUBE_API_KEY;

test('búsqueda real: devuelve canciones con los campos de la entidad Canción', { skip: !apiKey && 'YOUTUBE_API_KEY no configurada' }, async () => {
  const yt = crearClienteYoutube({ apiKey });
  const canciones = await yt.buscar('Queen Bohemian Rhapsody', 5);

  assert.ok(canciones.length > 0, 'debe haber resultados');
  for (const c of canciones) {
    assert.match(c.youtube_video_id, /^[A-Za-z0-9_-]{11}$/);
    assert.ok(c.titulo && c.artista_canal, 'título y canal presentes');
    assert.ok(Number.isInteger(c.duracion_segundos) && c.duracion_segundos > 0, 'duración en segundos');
    assert.match(c.url_miniatura, /^https:\/\/i\.ytimg\.com\//);
    assert.ok(['disponible', 'no_disponible'].includes(c.disponibilidad));
  }
});

test('búsqueda real sin resultados devuelve lista vacía', { skip: !apiKey && 'YOUTUBE_API_KEY no configurada' }, async () => {
  const yt = crearClienteYoutube({ apiKey });
  assert.deepEqual(await yt.buscar('zzqxjkwvv9843ppq', 5), []);
});

test('clave inválida real se clasifica como api_key_invalida', async () => {
  const yt = crearClienteYoutube({ apiKey: 'clave-falsa-de-prueba' });
  await assert.rejects(yt.buscar('hola', 1), (e) => e.codigo === 'api_key_invalida' && e.status === 503);
});
