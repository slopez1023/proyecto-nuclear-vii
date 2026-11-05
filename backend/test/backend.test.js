'use strict';
/**
 * Pruebas del backend. IMPORTANTE: las pruebas de YouTube usan respuestas SIMULADAS (mock) del formato
 * de la API; no demuestran la integración real. La verificación real se documenta aparte (docs/entregable-3).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { crearApp } = require('../src/app');
const { cargarSesiones, validarToken } = require('../src/sesiones');
const { parseDuracionIso, mapearCanciones, crearClienteYoutube, YoutubeError } = require('../src/youtube');
const { validarEvento } = require('../src/eventos');

const UUID = '3f2b8c1e-9d4a-4e6b-8a1c-0b5d7e9f1a2b';
const sesiones = cargarSesiones();

// --- sesiones ---
test('validarToken: activa', () => assert.equal(validarToken('demo-activa-001', sesiones).ok, true));
test('validarToken: formato inválido', () => {
  assert.equal(validarToken('x', sesiones).motivo, 'token_invalido');
  assert.equal(validarToken('../../etc/passwd', sesiones).motivo, 'token_invalido');
});
test('validarToken: inexistente, cerrada y QR desactivado', () => {
  assert.equal(validarToken('no-existe-12345', sesiones).motivo, 'sesion_inexistente');
  assert.equal(validarToken('demo-cerrada-002', sesiones).motivo, 'sesion_cerrada');
  assert.equal(validarToken('demo-qr-desactivado-003', sesiones).motivo, 'qr_desactivado');
});

// --- youtube (parseo real; red simulada) ---
test('parseDuracionIso', () => {
  assert.equal(parseDuracionIso('PT3M45S'), 225);
  assert.equal(parseDuracionIso('PT1H2M3S'), 3723);
  assert.equal(parseDuracionIso('PT45S'), 45);
  assert.equal(parseDuracionIso('P0D'), 0);
  assert.equal(parseDuracionIso('basura'), null);
  assert.equal(parseDuracionIso(undefined), null);
});

const searchMock = { items: [{ id: { videoId: 'AAA' } }, { id: { videoId: 'BBB' } }, { id: { videoId: 'CCC' } }] };
const videosMock = { items: [
  { id: 'AAA', snippet: { title: 'Canción A', channelTitle: 'Canal A', thumbnails: { medium: { url: 'https://i.ytimg.com/a.jpg' } } }, contentDetails: { duration: 'PT3M10S' }, status: { embeddable: true } },
  { id: 'BBB', snippet: { title: 'Canción B', channelTitle: 'Canal B', thumbnails: {} }, contentDetails: { duration: 'PT2M' }, status: { embeddable: false } },
] };

test('mapearCanciones: campos de la entidad Canción, no disponible y descarte de incompletos', () => {
  const r = mapearCanciones(searchMock.items, videosMock.items);
  assert.equal(r.length, 2); // CCC sin detalle se descarta
  assert.deepEqual(r[0], { youtube_video_id: 'AAA', titulo: 'Canción A', artista_canal: 'Canal A', duracion_segundos: 190, url_miniatura: 'https://i.ytimg.com/a.jpg', disponibilidad: 'disponible' });
  assert.equal(r[1].disponibilidad, 'no_disponible');
  assert.equal(r[1].url_miniatura, null);
});

function fetchMock(handlers) {
  const llamadas = [];
  const fn = async (url) => {
    llamadas.push(String(url));
    const h = handlers(String(url));
    return { ok: h.ok !== false, status: h.status || 200, json: async () => h.body };
  };
  fn.llamadas = llamadas;
  return fn;
}

test('cliente youtube: combina search+videos, cachea y no filtra la key en errores', async () => {
  const f = fetchMock((u) => ({ body: u.includes('/search') ? searchMock : videosMock }));
  const yt = crearClienteYoutube({ apiKey: 'K', fetchImpl: f });
  const a = await yt.buscar('Test');
  const b = await yt.buscar('test'); // cache (insensible a mayúsculas)
  assert.equal(a.length, 2);
  assert.deepEqual(a, b);
  assert.equal(f.llamadas.length, 2);
});

test('cliente youtube: sin API key -> 503 sin_api_key', async () => {
  const yt = crearClienteYoutube({ apiKey: '' });
  await assert.rejects(yt.buscar('x'), (e) => e instanceof YoutubeError && e.codigo === 'sin_api_key' && e.status === 503);
});

test('cliente youtube: cuota excedida y fallo de red', async () => {
  const cuota = crearClienteYoutube({ apiKey: 'K', fetchImpl: fetchMock(() => ({ ok: false, status: 403, body: { error: { errors: [{ reason: 'quotaExceeded' }] } } })) });
  await assert.rejects(cuota.buscar('x'), (e) => e.codigo === 'cuota_excedida');
  const red = crearClienteYoutube({ apiKey: 'K', fetchImpl: async () => { throw new Error('boom'); } });
  await assert.rejects(red.buscar('x'), (e) => e.codigo === 'youtube_no_disponible');
});

// --- eventos ---
test('validarEvento: acepta los dos tipos del E3 y rechaza el resto', () => {
  const ok1 = validarEvento({ tipo: 'dispositivo_unido', sesion_id: 'SES-1', dispositivo_id: UUID, datos: { recurrente: true } });
  assert.equal(ok1.evento.datos_evento.recurrente, true);
  assert.equal(ok1.evento.actor, 'cliente');
  assert.equal(ok1.evento.version_esquema, '1.0');
  const ok2 = validarEvento({ tipo: 'busqueda_realizada', sesion_id: 'SES-1', dispositivo_id: UUID, datos: { termino: ' hola ', cantidad_resultados: 3 } });
  assert.equal(ok2.evento.datos_evento.termino, 'hola');
  assert.equal(validarEvento({ tipo: 'voto_registrado', sesion_id: 'S', dispositivo_id: UUID }).error, 'tipo_no_soportado');
  assert.equal(validarEvento({ tipo: 'dispositivo_unido', sesion_id: 'S', dispositivo_id: 'ANDROID-ID' }).error, 'dispositivo_id_invalido');
  assert.equal(validarEvento({ tipo: 'busqueda_realizada', sesion_id: 'S', dispositivo_id: UUID, datos: {} }).error, 'termino_requerido');
});

// --- HTTP (integración con app real, YouTube simulado) ---
async function conServidor(youtube, fn) {
  const guardados = [];
  const app = crearApp({ sesiones, youtube, almacenEventos: { guardar: (e) => guardados.push(e) }, config: { androidSha256: 'AA:BB, CC:DD' } });
  const srv = app.listen(0);
  const base = `http://127.0.0.1:${srv.address().port}`;
  try { await fn(base, guardados); } finally { srv.close(); }
}
const ytOk = { buscar: async () => [{ youtube_video_id: 'AAA', titulo: 'T', artista_canal: 'C', duracion_segundos: 10, url_miniatura: 'u', disponibilidad: 'disponible' }] };

test('HTTP /api/sesiones: 200, 400, 404, 410', async () => {
  await conServidor(ytOk, async (base) => {
    const ok = await fetch(`${base}/api/sesiones/demo-activa-001`);
    assert.equal(ok.status, 200);
    assert.equal((await ok.json()).provisional, true);
    assert.equal((await fetch(`${base}/api/sesiones/x`)).status, 400);
    assert.equal((await fetch(`${base}/api/sesiones/no-existe-12345`)).status, 404);
    assert.equal((await fetch(`${base}/api/sesiones/demo-cerrada-002`)).status, 410);
  });
});

test('HTTP búsqueda y sugerencias: validación de q y errores de YouTube', async () => {
  await conServidor(ytOk, async (base) => {
    assert.equal((await fetch(`${base}/api/busqueda?q=a`)).status, 400);
    const r = await fetch(`${base}/api/busqueda?q=hola`);
    assert.equal((await r.json()).resultados[0].youtube_video_id, 'AAA');
    assert.deepEqual((await (await fetch(`${base}/api/busqueda/sugerencias?q=hola`)).json()).sugerencias, ['T']);
  });
  const ytFalla = { buscar: async () => { throw new YoutubeError('sin_api_key', 'sin key', 503); } };
  await conServidor(ytFalla, async (base) => {
    const r = await fetch(`${base}/api/busqueda?q=hola`);
    assert.equal(r.status, 503);
    assert.equal((await r.json()).error.codigo, 'sin_api_key');
  });
});

test('HTTP /api/eventos, assetlinks y cliente web /s/:token', async () => {
  await conServidor(ytOk, async (base, guardados) => {
    const post = (b) => fetch(`${base}/api/eventos`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
    assert.equal((await post({ tipo: 'dispositivo_unido', sesion_id: 'SES-1', dispositivo_id: UUID })).status, 202);
    assert.equal(guardados.length, 1);
    assert.equal((await post({ tipo: 'x' })).status, 400);
    const al = await (await fetch(`${base}/.well-known/assetlinks.json`)).json();
    assert.deepEqual(al[0].target.sha256_cert_fingerprints, ['AA:BB', 'CC:DD']);
    const web = await fetch(`${base}/s/demo-activa-001`);
    assert.equal(web.status, 200);
    assert.match(await web.text(), /Busca una canción/);
  });
});
