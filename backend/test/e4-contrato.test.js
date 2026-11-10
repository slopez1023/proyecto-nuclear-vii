'use strict';
/**
 * E4 — Prueba de contrato: test/fixtures/contrato-e4.json contiene peticiones y respuestas EXACTAS del
 * contrato (sección 6 de la propuesta), en el estilo de eventos-e3.json, para que Android las use como
 * datos de prueba. Aquí se reproduce la historia (reloj fijado en cada paso) y cada respuesta real debe
 * ser idéntica al fixture.
 *
 * Si el contrato cambia A PROPÓSITO: ACTUALIZAR_CONTRATO=1 npm test -- test/e4-contrato.test.js
 * reescribe el fixture; revisa el diff y avisa a Android.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { crearEntorno, abrirFlujo } = require('./helpers/e4');

const RUTA = path.join(__dirname, 'fixtures', 'contrato-e4.json');
const ACTUALIZAR = process.env.ACTUALIZAR_CONTRATO === '1';

const D_3F2B = '3f2b8c1e-9d4a-4e6b-8a1c-0b5d7e9f1a2b'; // mismo UUID que eventos-e3.json
const D_7A91 = '7a91d4e2-5c3b-4f08-9b6e-2d4c8a0e1f33';
const D_OTRO_1 = '0c1d2e3f-4a5b-4c6d-8e7f-8091a2b3c4d5';
const D_OTRO_2 = 'b5c6d7e8-f9a0-4b1c-9d2e-3f4a5b6c7d8e';
const D_OTRO_3 = 'e1f2a3b4-c5d6-4e7f-a8b9-c0d1e2f3a4b5';
const TOKEN = 'token-reproductor-de-prueba';

const CATALOGO = [
  { youtube_video_id: 'Zi_XLOBDo_Y', titulo: 'Billie Jean', artista_canal: 'Michael Jackson', duracion_segundos: 294, url_miniatura: 'https://i.ytimg.com/vi/Zi_XLOBDo_Y/mqdefault.jpg' },
  { youtube_video_id: 'fJ9rUzIMcZQ', titulo: 'Bohemian Rhapsody', artista_canal: 'Queen Official', duracion_segundos: 355, url_miniatura: 'https://i.ytimg.com/vi/fJ9rUzIMcZQ/mqdefault.jpg' },
  { youtube_video_id: 'NrgmdOz227I', titulo: 'Yesterday', artista_canal: 'The Beatles', duracion_segundos: 125, url_miniatura: null },
];

/** Historia de la sesión SES-MOCK-001 (la misma de la sección 6.1 de la propuesta). */
const sol = (sesion = 'SES-MOCK-001') => `/api/sesiones/${sesion}/solicitudes`;
const PASOS = [
  ['solicitar_billie_jean', '2026-11-10T20:13:00.000Z', 'POST', sol(), { 'X-Dispositivo-Id': D_OTRO_1 }, { youtube_video_id: 'Zi_XLOBDo_Y' }],
  ['reproductor_iniciar', '2026-11-10T20:14:00.000Z', 'POST', '/api/sesiones/SES-MOCK-001/reproduccion/iniciar', { 'X-Reproductor-Token': TOKEN }, {}],
  ['solicitar_creada', '2026-11-10T20:15:03.000Z', 'POST', sol(), { 'X-Dispositivo-Id': D_3F2B }, { youtube_video_id: 'fJ9rUzIMcZQ' }],
  ['solicitar_yesterday', '2026-11-10T20:15:10.000Z', 'POST', sol(), { 'X-Dispositivo-Id': D_OTRO_2 }, { youtube_video_id: 'NrgmdOz227I' }],
  ['error_intervalo_no_cumplido', '2026-11-10T20:15:30.000Z', 'POST', sol(), { 'X-Dispositivo-Id': D_3F2B }, { youtube_video_id: 'NrgmdOz227I' }],
  ['votar_manual', '2026-11-10T20:16:40.000Z', 'POST', '/api/sesiones/SES-MOCK-001/solicitudes/SOL-2/votos', { 'X-Dispositivo-Id': D_7A91 }, undefined],
  ['estado_cola', '2026-11-10T20:16:40.000Z', 'GET', '/api/sesiones/SES-MOCK-001/cola', { 'X-Dispositivo-Id': D_7A91 }, undefined],
  ['estado_cola_publica', '2026-11-10T20:16:40.000Z', 'GET', '/api/sesiones/SES-MOCK-001/cola', {}, undefined],
  ['error_voto_duplicado', '2026-11-10T20:16:45.000Z', 'POST', '/api/sesiones/SES-MOCK-001/solicitudes/SOL-2/votos', { 'X-Dispositivo-Id': D_7A91 }, undefined],
  ['error_solicitud_no_votable', '2026-11-10T20:16:50.000Z', 'POST', '/api/sesiones/SES-MOCK-001/solicitudes/SOL-1/votos', { 'X-Dispositivo-Id': D_OTRO_2 }, undefined],
  ['solicitar_voto_sumado_en_reproduccion', '2026-11-10T20:17:00.000Z', 'POST', sol(), { 'X-Dispositivo-Id': D_OTRO_3 }, { youtube_video_id: 'Zi_XLOBDo_Y' }],
  ['reproductor_siguiente_exitosa', '2026-11-10T20:18:54.000Z', 'POST', '/api/sesiones/SES-MOCK-001/reproduccion/siguiente', { 'X-Reproductor-Token': TOKEN }, { resultado: 'exitosa', segundos_reproducidos: 294 }],
  ['reproductor_siguiente_fallida', '2026-11-10T20:19:06.000Z', 'POST', '/api/sesiones/SES-MOCK-001/reproduccion/siguiente', { 'X-Reproductor-Token': TOKEN }, { resultado: 'fallida', segundos_reproducidos: 12, codigo_error: 'video_no_reproducible' }],
  ['error_dispositivo_id_invalido', '2026-11-10T20:19:10.000Z', 'POST', sol(), {}, { youtube_video_id: 'fJ9rUzIMcZQ' }],
  ['error_cancion_invalida', '2026-11-10T20:19:10.000Z', 'POST', sol(), { 'X-Dispositivo-Id': D_OTRO_1 }, { youtube_video_id: 'corto' }],
  ['error_cancion_no_permitida', '2026-11-10T20:19:10.000Z', 'POST', sol(), { 'X-Dispositivo-Id': D_OTRO_1 }, { youtube_video_id: 'NOEMBEBIBLE' }],
  ['error_sesion_cerrada', '2026-11-10T20:19:10.000Z', 'POST', sol('SES-MOCK-002'), { 'X-Dispositivo-Id': D_OTRO_1 }, { youtube_video_id: 'fJ9rUzIMcZQ' }],
  ['reproductor_siguiente_cola_vacia', '2026-11-10T20:21:11.000Z', 'POST', '/api/sesiones/SES-MOCK-001/reproduccion/siguiente', { 'X-Reproductor-Token': TOKEN }, { resultado: 'exitosa', segundos_reproducidos: 125 }],
  ['error_reproductor_sin_reproduccion', '2026-11-10T20:21:20.000Z', 'POST', '/api/sesiones/SES-MOCK-001/reproduccion/siguiente', { 'X-Reproductor-Token': TOKEN }, { resultado: 'exitosa' }],
];

async function reproducirHistoria(e) {
  e.activos(2); // "2 dispositivos activos" del ejemplo (rango 1–10 → intervalo 2)
  e.youtube.videos.NOEMBEBIBLE = {
    id: 'NOEMBEBIBLE',
    snippet: { title: 'x', channelTitle: 'y', categoryId: '10', liveBroadcastContent: 'none', thumbnails: {} },
    contentDetails: { duration: 'PT3M' },
    status: { embeddable: false, privacyStatus: 'public' },
  };
  const casos = {};
  for (const [nombre, en, metodo, ruta, cabeceras, cuerpo] of PASOS) {
    e.reloj.t = Date.parse(en);
    const r = await e.pedir(metodo, ruta, { cabeceras, cuerpo });
    casos[nombre] = {
      peticion: { en, metodo, ruta, cabeceras, ...(cuerpo !== undefined ? { cuerpo } : {}) },
      respuesta: { status: r.status, cuerpo: r.body },
    };
  }
  // Primer mensaje del flujo SSE para el dispositivo 7a91 (mismo JSON que GET /cola)
  e.reloj.t = Date.parse('2026-11-10T20:21:30.000Z');
  const f = await abrirFlujo(e.url, { dispositivo: D_7A91 });
  await f.esperarEstado();
  const m = f.mensajes.find((x) => x.event === 'estado');
  await f.cerrar();
  casos.flujo_primer_mensaje = {
    peticion: { en: '2026-11-10T20:21:30.000Z', metodo: 'GET', ruta: '/api/sesiones/SES-MOCK-001/cola/flujo',
      cabeceras: { Accept: 'text/event-stream', 'X-Dispositivo-Id': D_7A91 } },
    respuesta: { status: 200, lineas: [`retry: ${f.mensajes[0].retry}`, '', ...m.lineas] },
  };
  return casos;
}

test('las respuestas reales coinciden exactamente con test/fixtures/contrato-e4.json', { timeout: 30_000 }, async () => {
  const e = await crearEntorno({ catalogo: CATALOGO, token: TOKEN });
  let casos;
  try { casos = await reproducirHistoria(e); } finally { await e.cerrar(); }

  if (ACTUALIZAR) {
    const fixture = {
      _aviso: 'Contrato del Entregable 4 (propuesta del Backend, sección 6). Peticiones y respuestas EXACTAS producidas por el backend real, '
        + 'en orden, sobre una base vacía con reloj fijado en "peticion.en". Lo usan test/e4-contrato.test.js y, cuando Santiago apruebe el '
        + 'contrato, las pruebas de Android. 2 dispositivos activos (simulados). Catálogo: Billie Jean (294 s), Bohemian Rhapsody (355 s), Yesterday (125 s).',
      casos,
    };
    fs.writeFileSync(RUTA, JSON.stringify(fixture, null, 2) + '\n', 'utf8');
  }
  const fixture = JSON.parse(fs.readFileSync(RUTA, 'utf8'));
  assert.deepEqual(Object.keys(casos), Object.keys(fixture.casos));
  for (const [nombre, caso] of Object.entries(fixture.casos)) {
    assert.deepEqual(casos[nombre], caso, nombre);
  }
});

test('el fixture cubre el contrato: cada respuesta de error tiene { error: { codigo, mensaje } }', () => {
  const { casos } = JSON.parse(fs.readFileSync(RUTA, 'utf8'));
  for (const [nombre, caso] of Object.entries(casos)) {
    if (!nombre.startsWith('error_')) continue;
    assert.ok(caso.respuesta.status >= 400, nombre);
    assert.equal(typeof caso.respuesta.cuerpo.error.codigo, 'string', nombre);
    assert.equal(typeof caso.respuesta.cuerpo.error.mensaje, 'string', nombre);
  }
  assert.equal(casos.solicitar_creada.respuesta.status, 201);
  assert.equal(casos.solicitar_voto_sumado_en_reproduccion.respuesta.status, 200);
  assert.deepEqual(Object.keys(casos.estado_cola.respuesta.cuerpo),
    ['sesion_id', 'version', 'generado_en', 'reproduccion_actual', 'reglas_votacion', 'mi_votacion', 'cola']);
});
