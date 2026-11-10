'use strict';
/**
 * E4 — Pruebas unitarias (sin base de datos ni red): reglas puras, tiempo estimado, catálogo,
 * conectividad, eventos de servidor, cliente de YouTube y compatibilidad con el E3.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  intervaloPorActivos, calcularMiVotacion, restanteActual, esperasEstimadas, idTexto, idNumero, iso,
} = require('../src/comun-e4');
const { evaluarVideo } = require('../src/catalogo');
const { validarCuerpoSiguiente } = require('../src/reproduccion');
const { validarCuerpoAuto } = require('../src/simulacion');
const { crearConectividad } = require('../src/conectividad');
const { crearEventoServidor, registrarEventoServidor, TIPOS } = require('../src/eventos');
const { crearClienteYoutube } = require('../src/youtube');
const { crearApp } = require('../src/app');
const { cargarSesiones } = require('../src/sesiones');
const { crearReloj, crearTemporizadores } = require('./helpers/e4');

test('intervaloPorActivos: rangos 1–10, 11–30, 31–60, >60 y fronteras', () => {
  const casos = [[0, 2], [1, 2], [10, 2], [11, 4], [30, 4], [31, 6], [60, 6], [61, 8], [1000, 8]];
  for (const [n, intervalo] of casos) assert.equal(intervaloPorActivos(n), intervalo, `${n}`);
});

test('calcularMiVotacion: nunca votó (H4), por debajo, justo y por encima del intervalo', () => {
  assert.deepEqual(calcularMiVotacion({ ultimoVoto: null, contadas: 0 }, 4),
    { puede_votar: true, intervalo_canciones: 4, reproducciones_contadas: 0, canciones_restantes: 0 });
  assert.deepEqual(calcularMiVotacion({ ultimoVoto: 1, contadas: 1 }, 2),
    { puede_votar: false, intervalo_canciones: 2, reproducciones_contadas: 1, canciones_restantes: 1 });
  assert.equal(calcularMiVotacion({ ultimoVoto: 1, contadas: 2 }, 2).puede_votar, true);
  assert.equal(calcularMiVotacion({ ultimoVoto: 1, contadas: 5 }, 2).canciones_restantes, 0);
});

test('tiempo estimado: restante (truncado, nunca negativo) y esperas acumuladas', () => {
  assert.equal(restanteActual(null, 0), 0);
  assert.equal(restanteActual({ duracion_segundos: 294, inicio_en: 0 }, 160_999), 134);
  assert.equal(restanteActual({ duracion_segundos: 294, inicio_en: 0 }, 999_999), 0);
  assert.equal(restanteActual({ duracion_segundos: null, inicio_en: 0 }, 0), null);
  assert.deepEqual(esperasEstimadas(134, [{ duracion_segundos: 355 }, { duracion_segundos: 125 }, { duracion_segundos: 10 }]), [134, 489, 614]);
  assert.deepEqual(esperasEstimadas(0, [{ duracion_segundos: 10 }, { duracion_segundos: null }, { duracion_segundos: 5 }]), [0, 10, null]);
  assert.deepEqual(esperasEstimadas(null, [{ duracion_segundos: 10 }]), [null]);
  assert.deepEqual(esperasEstimadas(5, []), []);
});

test('identificadores opacos y fechas ISO', () => {
  assert.equal(idTexto('SOL', 42), 'SOL-42');
  assert.equal(idTexto('SOL', null), null);
  assert.equal(idNumero('SOL', 'SOL-42'), 42);
  for (const malo of ['VOT-42', 'SOL-', 'SOL-4a', 'sol-1', '', undefined, 'SOL-1;DROP']) assert.equal(idNumero('SOL', malo), null);
  assert.equal(iso(Date.UTC(2026, 10, 10, 20, 15, 3)), '2026-11-10T20:15:03.000Z');
});

const item = (cambios = {}) => ({
  id: 'ABCDEFGHIJK',
  snippet: { title: 'T', channelTitle: 'C', categoryId: '10', liveBroadcastContent: 'none', thumbnails: { medium: { url: 'm' } }, ...cambios.snippet },
  contentDetails: { duration: 'PT2M5S', ...cambios.contentDetails },
  status: { embeddable: true, privacyStatus: 'public', ...cambios.status },
});

test('evaluarVideo: comprobaciones del catálogo en orden y fila resultante', () => {
  assert.deepEqual(evaluarVideo(item()), {
    youtube_video_id: 'ABCDEFGHIJK', titulo: 'T', artista_canal: 'C', duracion_segundos: 125, url_miniatura: 'm',
    disponibilidad: 'disponible', motivo_no_permitida: null,
  });
  assert.equal(evaluarVideo(item({ snippet: { categoryId: '24' } })).motivo_no_permitida, 'no_musica');
  assert.equal(evaluarVideo(item({ status: { embeddable: false } })).motivo_no_permitida, 'no_embebible');
  assert.equal(evaluarVideo(item({ status: { privacyStatus: 'private' } })).motivo_no_permitida, 'no_publico');
  assert.equal(evaluarVideo(item({ snippet: { liveBroadcastContent: 'upcoming' } })).motivo_no_permitida, 'en_vivo');
  assert.equal(evaluarVideo(item({ contentDetails: { duration: 'basura' } })).motivo_no_permitida, 'sin_duracion');
  // el primero que falla manda
  assert.equal(evaluarVideo(item({ snippet: { categoryId: '1' }, status: { embeddable: false } })).motivo_no_permitida, 'no_musica');
});

test('validarCuerpoSiguiente y validarCuerpoAuto', () => {
  assert.deepEqual(validarCuerpoSiguiente({ resultado: 'exitosa', segundos_reproducidos: 294 }), { resultado: 'exitosa', segundos: 294, codigoError: null });
  assert.deepEqual(validarCuerpoSiguiente({ resultado: 'fallida', codigo_error: 'x' }), { resultado: 'fallida', segundos: null, codigoError: 'x' });
  assert.equal(validarCuerpoSiguiente({ resultado: 'exitosa', codigo_error: 'ignorado' }).codigoError, null);
  assert.throws(() => validarCuerpoSiguiente(null), (e) => e.codigo === 'resultado_invalido');
  assert.deepEqual(validarCuerpoAuto({ activo: false }), { activo: false });
  assert.deepEqual(validarCuerpoAuto({ activo: true }), { activo: true, factor_tiempo: 1, probabilidad_fallo: 0 });
  assert.throws(() => validarCuerpoAuto({ activo: true, factor_tiempo: Infinity }), (e) => e.codigo === 'cuerpo_invalido');
});

test('conectividad: conexiones múltiples, gracia de 20 s, virtuales y aviso solo al cambiar de rango', async () => {
  const reloj = crearReloj(0);
  const t = crearTemporizadores();
  const con = crearConectividad({ ahora: reloj.ahora, programar: t.programar });
  const avisos = [];
  con.alCambiarRango((est) => avisos.push(est));
  con.conectar('E1', 'a');
  con.conectar('E1', 'a');
  con.conectar('E2', 'b');
  assert.equal(con.contarActivos('E1'), 1);
  assert.equal(con.contarActivos('E2'), 1);
  con.desconectar('E1', 'a');
  assert.equal(con.contarActivos('E1'), 1); // aún tiene otra conexión
  con.desconectar('E1', 'a');
  reloj.avanzar(19_999);
  assert.equal(con.contarActivos('E1'), 1);
  reloj.avanzar(1);
  assert.equal(con.contarActivos('E1'), 0);
  con.desconectar('E1', 'a'); // de más: no rompe
  assert.deepEqual(avisos, []); // 0–1 activos: siempre intervalo 2
  con.fijarVirtuales('E1', 10);
  assert.deepEqual(avisos, []);
  con.conectar('E1', 'c'); // 11 → intervalo 4
  assert.deepEqual(avisos, ['E1']);
  con.conectar('E1', 'd'); // 12: mismo rango, sin aviso
  assert.deepEqual(avisos, ['E1']);
  con.desconectar('E1', 'c');
  con.desconectar('E1', 'd');
  reloj.avanzar(20_001);
  await t.ejecutarPendientes(); // al vencer la gracia vuelve a 10 → intervalo 2
  assert.deepEqual(avisos, ['E1', 'E1']);
});

test('eventos de servidor: sobre completo; tipo desconocido falla; registrar nunca lanza', () => {
  const e = crearEventoServidor({ tipo: 'voto_registrado', sesion_id: 'S', id_establecimiento: 'E', dispositivo_id: 'u', datos_evento: { a: 1 } },
    () => new Date(Date.UTC(2026, 0, 1)));
  assert.deepEqual(Object.keys(e).sort(), ['actor', 'datos_evento', 'dispositivo_id', 'evento_id', 'fecha_hora', 'id_establecimiento', 'sesion_id', 'tipo', 'version_esquema']);
  assert.equal(e.id_establecimiento, 'E');
  assert.equal(e.actor, 'servidor');
  assert.equal(e.version_esquema, '1.2');
  assert.equal(e.fecha_hora, '2026-01-01T00:00:00.000Z');
  assert.throws(() => crearEventoServidor({ tipo: 'dispositivo_unido', sesion_id: 'S', datos_evento: {} }));
  assert.doesNotThrow(() => registrarEventoServidor({ guardar() { throw new Error('x'); } }, { tipo: 'voto_registrado', sesion_id: 'S', datos_evento: {} }));
  // Los tipos que acepta POST /api/eventos (E3) no cambian.
  assert.deepEqual([...TIPOS], ['dispositivo_unido', 'busqueda_realizada']);
});

function fetchMock(handler) {
  const llamadas = [];
  const fn = async (url) => { llamadas.push(String(url)); const h = handler(String(url)); return { ok: h.ok !== false, status: h.status || 200, json: async () => h.body }; };
  fn.llamadas = llamadas;
  return fn;
}

test('youtube.obtenerVideo: videos.list por id; null si no existe; sin key → 503', async () => {
  const f = fetchMock((u) => ({ body: { items: u.includes('id=ABCDEFGHIJK') ? [item()] : [] } }));
  const yt = crearClienteYoutube({ apiKey: 'K', fetchImpl: f });
  assert.equal((await yt.obtenerVideo('ABCDEFGHIJK')).id, 'ABCDEFGHIJK');
  assert.equal(await yt.obtenerVideo('OTRO_______'), null);
  assert.match(f.llamadas[0], /\/videos\?part=snippet%2CcontentDetails%2Cstatus&id=ABCDEFGHIJK/);
  await assert.rejects(crearClienteYoutube({ apiKey: '' }).obtenerVideo('x'), (e) => e.codigo === 'sin_api_key');
});

test('youtube.buscar: avisa a los observadores con los videos crudos; un observador que falla no rompe la búsqueda', async () => {
  const f = fetchMock((u) => ({ body: u.includes('/search') ? { items: [{ id: { videoId: 'ABCDEFGHIJK' } }] } : { items: [item()] } }));
  const yt = crearClienteYoutube({ apiKey: 'K', fetchImpl: f });
  const recibidos = [];
  yt.alObtenerVideos((items) => recibidos.push(...items));
  yt.alObtenerVideos(() => { throw new Error('observador roto'); });
  const r = await yt.buscar('hola');
  assert.equal(r.length, 1);
  await new Promise(setImmediate);
  assert.equal(recibidos[0].id, 'ABCDEFGHIJK');
});

test('crearApp sin db: las rutas del E4 no existen (comportamiento del E3 intacto)', async () => {
  const app = crearApp({ sesiones: cargarSesiones(), youtube: { buscar: async () => [] }, almacenEventos: { guardar() {} } });
  assert.equal(app.locals.e4, undefined);
  const srv = app.listen(0);
  try {
    const base = `http://127.0.0.1:${srv.address().port}`;
    assert.equal((await fetch(`${base}/api/sesiones/SES-MOCK-001/cola`)).status, 404);
    assert.equal((await fetch(`${base}/api/sesiones/demo-activa-001`)).status, 200);
  } finally { srv.close(); }
});
