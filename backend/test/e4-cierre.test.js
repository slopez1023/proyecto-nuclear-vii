'use strict';
/**
 * E4 — Pruebas de las decisiones de cierre (fase de estabilización):
 *  - F1/F3: regla ÚNICA de «canción permitida» (búsqueda y catálogo) y tope de duración.
 *  - H1: regla de inactividad (cola vacía y nada sonando → se puede pedir).
 *  - F2: el acceso por QR (GET /api/sesiones/:token) usa la misma fuente que el E4 (PostgreSQL).
 *  - Cierre de sesión avisado por el flujo SSE (`event: sesion_cerrada`).
 *  - A1/A2/A3/A5: eventos analíticos ampliados.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { motivoNoPermitido, mapearCanciones, DURACION_MAXIMA_POR_DEFECTO_S } = require('../src/youtube');
const { crearEntorno, abrirFlujo, cancion, uuid, SESION } = require('./helpers/e4');

const A = uuid(1);
const B = uuid(2);
const C = uuid(3);

const conEntorno = (fn, opciones) => async () => {
  const e = await crearEntorno(opciones);
  try { await fn(e); } finally { await e.cerrar(); }
};

const video = (id, over = {}) => ({
  id,
  snippet: { title: `Video ${id}`, channelTitle: 'Canal', categoryId: '10', liveBroadcastContent: 'none', thumbnails: {}, ...(over.snippet || {}) },
  contentDetails: { duration: 'PT3M', ...(over.contentDetails || {}) },
  status: { embeddable: true, privacyStatus: 'public', ...(over.status || {}) },
});

// ------------------------------------------------------------------ F1 / F3: regla única

test('F1/F3: motivoNoPermitido aplica la regla en orden y el tope de duración', () => {
  assert.equal(motivoNoPermitido(video('x'), 180), null);
  assert.equal(motivoNoPermitido(video('x', { snippet: { categoryId: '26' } }), 180), 'no_musica');
  assert.equal(motivoNoPermitido(video('x', { status: { embeddable: false } }), 180), 'no_embebible');
  assert.equal(motivoNoPermitido(video('x', { status: { privacyStatus: 'private' } }), 180), 'no_publico');
  assert.equal(motivoNoPermitido(video('x', { snippet: { liveBroadcastContent: 'live' } }), 0), 'en_vivo');
  assert.equal(motivoNoPermitido(video('x'), null), 'sin_duracion');
  assert.equal(motivoNoPermitido(video('x'), 0), 'sin_duracion'); // un directo termina con duración 0
  assert.equal(motivoNoPermitido(video('x'), DURACION_MAXIMA_POR_DEFECTO_S), null); // justo en el tope
  assert.equal(motivoNoPermitido(video('x'), DURACION_MAXIMA_POR_DEFECTO_S + 1), 'demasiado_larga');
  assert.equal(DURACION_MAXIMA_POR_DEFECTO_S, 1200);
});

test('F1: la búsqueda marca no_disponible lo mismo que rechazará el catálogo (directos, no música, demasiado largas)', () => {
  const ids = ['OK', 'VIVO', 'LARGA', 'NOMUSICA', 'SINDUR'];
  const search = ids.map((id) => ({ id: { videoId: id } }));
  const videos = [
    video('OK'),
    video('VIVO', { snippet: { liveBroadcastContent: 'live' }, contentDetails: { duration: 'P0D' } }),
    video('LARGA', { contentDetails: { duration: 'PT4H40M21S' } }),
    video('NOMUSICA', { snippet: { categoryId: '22' } }),
    video('SINDUR', { contentDetails: { duration: 'basura' } }),
  ];
  const r = Object.fromEntries(mapearCanciones(search, videos).map((c) => [c.youtube_video_id, c.disponibilidad]));
  assert.deepEqual(r, { OK: 'disponible', VIVO: 'no_disponible', LARGA: 'no_disponible', NOMUSICA: 'no_disponible', SINDUR: 'no_disponible' });
});

test('F3: pedir una canción de varias horas → 422 demasiado_larga y no se crea nada', conEntorno(async (e) => {
  e.youtube.videos.LARGA000001 = video('LARGA000001', { contentDetails: { duration: 'PT4H40M21S' } });
  const r = await e.solicitar(A, 'LARGA000001');
  assert.equal(r.status, 422);
  assert.equal(r.body.error.codigo, 'cancion_no_permitida');
  assert.deepEqual(r.body.error.detalle, { motivo: 'demasiado_larga' });
  assert.equal((await e.pool.query('SELECT COUNT(*)::int AS n FROM solicitud')).rows[0].n, 0);
}));

// ------------------------------------------------------------------ H1: regla de inactividad

test('H1: con dos dispositivos que solo se piden canciones entre sí, al quedar la cola vacía ambos pueden volver a pedir', conEntorno(async (e) => {
  await e.solicitar(A, cancion(1));
  await e.solicitar(B, cancion(2));
  e.reloj.avanzar(1000); // las reproducciones cuentan solo si empiezan DESPUÉS del último voto
  await e.iniciar();
  e.reloj.avanzar(1000);
  await e.siguiente(); // suena la 2.ª: la cola está vacía pero algo suena
  // Algo suena → no es inactividad: el intervalo sigue vigente (A solo ha visto 1 canción ajena... la de B aún suena)
  assert.equal((await e.miVotacion(A)).puede_votar, false);
  e.reloj.avanzar(1000);
  await e.siguiente(); // termina la 2.ª y no queda nada
  const mvA = await e.miVotacion(A);
  const mvB = await e.miVotacion(B);
  assert.deepEqual(mvA, { puede_votar: true, intervalo_canciones: 1, reproducciones_contadas: 1, canciones_restantes: 0 });
  assert.equal(mvB.puede_votar, true);
  const r = await e.solicitar(A, cancion(3));
  assert.equal(r.status, 201);
  // Tras pedir, el intervalo vuelve a aplicarse con normalidad.
  assert.deepEqual(r.body.mi_votacion, { puede_votar: false, intervalo_canciones: 1, reproducciones_contadas: 0, canciones_restantes: 1 });
}));

test('H1: la inactividad no se aplica con algo en espera ni con algo sonando (el intervalo protege a los demás)', conEntorno(async (e) => {
  await e.solicitar(A, cancion(1));
  // Algo en espera
  let r = await e.solicitar(A, cancion(2));
  assert.equal(r.status, 409);
  assert.equal(r.body.error.codigo, 'intervalo_no_cumplido');
  // Algo sonando, cola vacía
  await e.iniciar();
  r = await e.solicitar(A, cancion(2));
  assert.equal(r.status, 409);
  assert.equal((await e.miVotacion(A)).puede_votar, false);
  // Termina: ahora sí está inactiva
  await e.siguiente();
  assert.equal((await e.miVotacion(A)).puede_votar, true);
}));

test('H1: los votos siguen siendo definitivos y se marca en el evento que se pidió por inactividad', conEntorno(async (e) => {
  await e.solicitar(A, cancion(1));
  await e.iniciar();
  await e.siguiente();
  e.eventos.length = 0;
  const r = await e.solicitar(A, cancion(1)); // la misma canción ya terminó → solicitud nueva
  assert.equal(r.status, 201);
  const voto = e.eventos.find((x) => x.tipo === 'voto_registrado');
  assert.equal(voto.datos_evento.por_inactividad, true);
  assert.equal((await e.pool.query('SELECT COUNT(*)::int AS n FROM voto WHERE id_dispositivo = (SELECT id_dispositivo FROM dispositivo WHERE identificador_seudonimo = $1)', [A])).rows[0].n, 2);
  assert.equal((await e.votar(A, r.body.solicitud.id_solicitud)).body.error.codigo, 'voto_duplicado');
}));

test('H1: un dispositivo que nunca votó sigue pudiendo votar (H4) y la elegibilidad de la vista pública no cambia', conEntorno(async (e) => {
  assert.deepEqual(await e.miVotacion(C), { puede_votar: true, intervalo_canciones: 1, reproducciones_contadas: 0, canciones_restantes: 0 });
  const publica = await e.pedir('GET', `/api/sesiones/${SESION}/cola`);
  assert.equal(publica.body.mi_votacion, undefined);
}));

// ------------------------------------------------------------------ F2: acceso por QR con la fuente del E4

test('F2: GET /api/sesiones/:token valida contra PostgreSQL (la misma fuente que la cola)', conEntorno(async (e) => {
  let r = await e.pedir('GET', '/api/sesiones/demo-activa-001');
  assert.equal(r.status, 200);
  assert.equal(r.body.id_sesion, SESION);
  assert.deepEqual(r.body.establecimiento, { id_establecimiento: 'EST-MOCK-001', nombre: 'La Nota Bar (demo)' });

  await e.pool.query("UPDATE sesion SET estado = 'cerrada' WHERE id_sesion = $1", [SESION]);
  r = await e.pedir('GET', '/api/sesiones/demo-activa-001');
  assert.equal(r.status, 410);
  assert.equal(r.body.error.codigo, 'sesion_cerrada');

  await e.pool.query("UPDATE sesion SET estado = 'activa', qr_estado = 'inactivo' WHERE id_sesion = $1", [SESION]);
  r = await e.pedir('GET', '/api/sesiones/demo-activa-001');
  assert.equal(r.status, 410);
  assert.equal(r.body.error.codigo, 'qr_desactivado');

  assert.equal((await e.pedir('GET', '/api/sesiones/no-existe-12345')).status, 404);
  assert.equal((await e.pedir('GET', '/api/sesiones/corto')).status, 400);
}));

// ------------------------------------------------------------------ cierre de sesión por SSE

test('SSE: al cerrarse la sesión el flujo avisa con event: sesion_cerrada y termina', { timeout: 20_000 }, conEntorno(async (e) => {
  const f = await abrirFlujo(e.url, { dispositivo: A });
  await f.esperarEstado();
  await e.pool.query("UPDATE sesion SET estado = 'cerrada' WHERE id_sesion = $1", [SESION]);
  await e.servicios.flujo.verificarSesiones();
  const m = await f.esperar((x) => x.event === 'sesion_cerrada');
  assert.deepEqual(m.data, { sesion_id: SESION, motivo: 'sesion_cerrada' });
  await f.fin; // el servidor cierra el flujo
  assert.equal(f.terminado(), true);
}));

test('SSE: el ping (cada 10 s) aprovecha para detectar que el QR se desactivó', { timeout: 20_000 }, conEntorno(async (e) => {
  const f = await abrirFlujo(e.url, { dispositivo: A });
  await f.esperarEstado();
  await e.pool.query("UPDATE sesion SET qr_estado = 'inactivo' WHERE id_sesion = $1", [SESION]);
  e.temporizadores.dispararIntervalos(); // el ping programado
  const m = await f.esperar((x) => x.event === 'sesion_cerrada');
  assert.equal(m.data.motivo, 'qr_desactivado');
  await f.fin;
}));

test('SSE: una sesión vigente no recibe avisos de cierre', { timeout: 20_000 }, conEntorno(async (e) => {
  const f = await abrirFlujo(e.url, { dispositivo: A });
  await f.esperarEstado();
  await e.servicios.flujo.verificarSesiones();
  assert.equal(f.mensajes.some((x) => x.event === 'sesion_cerrada'), false);
  assert.equal(f.terminado(), false);
  await f.cerrar();
}));

// ------------------------------------------------------------------ analítica A1 / A2 / A3 / A5

test('A1: todos los eventos del servidor llevan id_establecimiento y versión de esquema 1.2', conEntorno(async (e) => {
  await e.solicitar(A, cancion(1));
  await e.solicitar(B, cancion(1));
  await e.iniciar();
  await e.siguiente();
  assert.ok(e.eventos.length >= 5);
  for (const ev of e.eventos) {
    assert.equal(ev.id_establecimiento, 'EST-MOCK-001', ev.tipo);
    assert.equal(ev.version_esquema, '1.2', ev.tipo);
  }
}));

test('A2: distingue solicitud nueva, voto sumado a una pendiente, voto sumado a la que suena y voto manual', conEntorno(async (e) => {
  const caso = async (accion) => {
    e.eventos.length = 0;
    await accion();
    return e.eventos.map((x) => x.tipo === 'voto_registrado'
      ? [x.tipo, x.datos_evento.origen, x.datos_evento.sumado_a_existente, x.datos_evento.estado_solicitud] : [x.tipo]);
  };
  assert.deepEqual(await caso(() => e.solicitar(A, cancion(1))), [['solicitud_creada'], ['voto_registrado', 'solicitud', false, 'pendiente']]);
  assert.deepEqual(await caso(() => e.solicitar(B, cancion(1))), [['voto_registrado', 'solicitud', true, 'pendiente']]);
  await e.iniciar();
  assert.deepEqual(await caso(() => e.solicitar(C, cancion(1))), [['voto_registrado', 'solicitud', true, 'en_reproduccion']]);
  await e.solicitar(uuid(7), cancion(2));
  assert.deepEqual(await caso(() => e.votar(uuid(8), 'SOL-2')), [['voto_registrado', 'manual', false, 'pendiente']]);
}));

test('A3: al agotarse la cola se emite cola_vacia (y no si queda otra canción)', conEntorno(async (e) => {
  await e.solicitar(A, cancion(1));
  await e.solicitar(B, cancion(2));
  await e.iniciar();
  e.eventos.length = 0;
  await e.siguiente(); // aún queda la 2.ª
  assert.equal(e.eventos.some((x) => x.tipo === 'cola_vacia'), false);
  await e.siguiente(); // se agota
  const vacia = e.eventos.find((x) => x.tipo === 'cola_vacia');
  assert.ok(vacia);
  assert.equal(vacia.id_establecimiento, 'EST-MOCK-001');
  assert.equal(vacia.dispositivo_id, null);
}));

test('A5: solicitud_creada lleva la espera estimada y reproduccion_iniciada los segundos que esperó en cola', conEntorno(async (e) => {
  await e.solicitar(A, cancion(1));
  e.reloj.avanzar(75_000);
  e.eventos.length = 0;
  await e.iniciar();
  const iniciada = e.eventos.find((x) => x.tipo === 'reproduccion_iniciada');
  assert.equal(iniciada.datos_evento.segundos_en_cola, 75);
  e.eventos.length = 0;
  await e.solicitar(B, cancion(2));
  const creada = e.eventos.find((x) => x.tipo === 'solicitud_creada');
  assert.equal(creada.datos_evento.espera_estimada_segundos, 200); // lo que le queda a la que suena (200 s)
}));
