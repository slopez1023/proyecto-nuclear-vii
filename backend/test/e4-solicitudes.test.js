'use strict';
/**
 * E4 — Solicitudes (P1), votos manuales (P2), cola y catálogo. Tabla A ("solicitar implica votar") y
 * casos C de la especificación. PostgreSQL real; YouTube falso; reloj inyectado.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { crearEntorno, cancion, uuid, SESION } = require('./helpers/e4');

const conEntorno = (fn, opciones) => async () => {
  const e = await crearEntorno(opciones);
  try { await fn(e); } finally { await e.cerrar(); }
};
const contar = async (e, tabla) => (await e.pool.query(`SELECT COUNT(*) AS n FROM ${tabla}`)).rows[0].n;
const A = uuid(1);
const B = uuid(2);
const C = uuid(3);

// ------------------------------------------------------------------ tabla A

test('A1/A2: solicitud aceptada con su voto automático (exactamente un voto)', conEntorno(async (e) => {
  const r = await e.solicitar(A, cancion(1));
  assert.equal(r.status, 201);
  assert.equal(r.body.resultado, 'solicitud_creada');
  assert.equal(r.body.solicitud.total_votos, 1);
  assert.equal(r.body.solicitud.ya_voto, true);
  assert.equal(r.body.solicitud.es_mia, true);
  assert.equal(r.body.solicitud.estado, 'pendiente');
  assert.equal(r.body.solicitud.posicion, 1);
  assert.equal(r.body.voto.origen, 'solicitud');
  assert.equal(r.body.voto.id_solicitud, r.body.solicitud.id_solicitud);
  assert.match(r.body.solicitud.id_solicitud, /^SOL-\d+$/);
  assert.match(r.body.voto.id_voto, /^VOT-\d+$/);
  assert.deepEqual(r.body.mi_votacion, { puede_votar: false, intervalo_canciones: 2, reproducciones_contadas: 0, canciones_restantes: 2 });
  assert.equal(await contar(e, 'voto'), 1);
  const { rows } = await e.pool.query(`SELECT v.origen, d.identificador_seudonimo FROM voto v JOIN dispositivo d USING (id_dispositivo)`);
  assert.deepEqual(rows, [{ origen: 'solicitud', identificador_seudonimo: A }]);
}));

test('A3/A4/A5/C18/C19: rechazo por intervalo → 409 sin solicitud; la cola y los votos no cambian', conEntorno(async (e) => {
  await e.solicitar(A, cancion(1));
  const colaAntes = (await e.cola(null)).body.cola;
  const [sol, vot] = [await contar(e, 'solicitud'), await contar(e, 'voto')];
  const r = await e.solicitar(A, cancion(2));
  assert.equal(r.status, 409);
  assert.deepEqual(r.body, { error: {
    codigo: 'intervalo_no_cumplido',
    mensaje: 'Todavía no tienes otro voto disponible, por eso no puedes solicitar otra canción.',
    detalle: { intervalo_canciones: 2, reproducciones_contadas: 0, canciones_restantes: 2 },
  } });
  assert.deepEqual((await e.cola(null)).body.cola, colaAntes);
  assert.equal(await contar(e, 'solicitud'), sol);
  assert.equal(await contar(e, 'voto'), vot);
}));

test('A6: no se evade con solicitudes repetidas', conEntorno(async (e) => {
  assert.equal((await e.solicitar(A, cancion(1))).status, 201);
  for (const n of [2, 3, 4]) assert.equal((await e.solicitar(A, cancion(n))).body.error.codigo, 'intervalo_no_cumplido');
  assert.equal(await contar(e, 'solicitud'), 1);
}));

test('A8: no se evade combinando acciones (solicitar y luego votar otra)', conEntorno(async (e) => {
  const deB = (await e.solicitar(B, cancion(2))).body.solicitud.id_solicitud;
  await e.solicitar(A, cancion(1));
  const r = await e.votar(A, deB);
  assert.equal(r.status, 409);
  assert.equal(r.body.error.codigo, 'intervalo_no_cumplido');
  assert.equal(r.body.error.mensaje, 'Aún no puedes votar de nuevo.');
}));

test('A9: votar la propia solicitud → 409 voto_duplicado', conEntorno(async (e) => {
  const id = (await e.solicitar(A, cancion(1))).body.solicitud.id_solicitud;
  const r = await e.votar(A, id);
  assert.equal(r.status, 409);
  assert.equal(r.body.error.codigo, 'voto_duplicado');
  assert.deepEqual(r.body.error.detalle, { id_solicitud: id });
}));

test('A10: atomicidad — si falla guardar el voto, no queda la solicitud', conEntorno(async (e) => {
  // Fallo inyectado en la base de pruebas: un disparador que rechaza cualquier voto.
  await e.pool.query(`CREATE FUNCTION fallar_voto() RETURNS trigger LANGUAGE plpgsql AS
    $$ BEGIN RAISE EXCEPTION 'fallo inyectado'; END $$`);
  await e.pool.query('CREATE TRIGGER fallar_voto BEFORE INSERT ON voto FOR EACH ROW EXECUTE FUNCTION fallar_voto()');
  const r = await e.solicitar(A, cancion(1));
  assert.equal(r.status, 500);
  assert.equal(r.body.error.codigo, 'error_interno');
  assert.equal(await contar(e, 'solicitud'), 0);
  assert.equal(await contar(e, 'voto'), 0);
  assert.equal((await e.pool.query('SELECT version_cola FROM sesion WHERE id_sesion = $1', [SESION])).rows[0].version_cola, 0);
}));

test('A13: otras causas de rechazo no crean solicitud ni voto', conEntorno(async (e) => {
  const casos = [
    [await e.pedir('POST', `/api/sesiones/${SESION}/solicitudes`, { cuerpo: { youtube_video_id: cancion(1) } }), 400, 'dispositivo_id_invalido'],
    [await e.pedir('POST', `/api/sesiones/${SESION}/solicitudes`, { dispositivo: 'ANDROID-ID-1234', cuerpo: { youtube_video_id: cancion(1) } }), 400, 'dispositivo_id_invalido'],
    [await e.pedir('POST', `/api/sesiones/${SESION}/solicitudes`, { dispositivo: A, cuerpo: {} }), 400, 'cancion_invalida'],
    [await e.solicitar(A, 'corto'), 400, 'cancion_invalida'],
    [await e.solicitar(A, cancion(1), 'SES-NO-EXISTE'), 404, 'sesion_inexistente'],
    [await e.solicitar(A, cancion(1), 'SES-MOCK-002'), 410, 'sesion_cerrada'],
    [await e.solicitar(A, cancion(1), 'SES-MOCK-003'), 410, 'qr_desactivado'],
    [await e.solicitar(A, 'NOEXISTE_01'), 404, 'cancion_inexistente'],
  ];
  for (const [r, status, codigo] of casos) {
    assert.equal(r.status, status, codigo);
    assert.equal(r.body.error.codigo, codigo);
  }
  assert.equal(await contar(e, 'solicitud'), 0);
  assert.equal(await contar(e, 'voto'), 0);
}));

// ------------------------------------------------------------------ canción duplicada (decisión 1B)

test('C1: canción pendiente pedida por otro dispositivo → 200 voto_sumado, sin duplicar', conEntorno(async (e) => {
  await e.solicitar(A, cancion(1));
  const deC = (await e.solicitar(C, cancion(2))).body.solicitud.id_solicitud;
  const r = await e.solicitar(B, cancion(2));
  assert.equal(r.status, 200);
  assert.equal(r.body.resultado, 'voto_sumado');
  assert.equal(r.body.solicitud.id_solicitud, deC);
  assert.equal(r.body.solicitud.total_votos, 2);
  assert.equal(r.body.solicitud.posicion, 1); // subió por votos
  assert.equal(r.body.solicitud.es_mia, false);
  assert.equal(r.body.voto.origen, 'solicitud'); // H3a
  assert.equal(r.body.mi_votacion.canciones_restantes, 2); // el contador de B vuelve a 0
  assert.equal(await contar(e, 'solicitud'), 2);
}));

test('C2: canción ya en cola pedida por un dispositivo sin voto disponible → 409, total sin cambio', conEntorno(async (e) => {
  await e.solicitar(A, cancion(1));
  await e.solicitar(B, cancion(2));
  const r = await e.solicitar(A, cancion(2));
  assert.equal(r.body.error.codigo, 'intervalo_no_cumplido');
  const cola = (await e.cola(null)).body.cola;
  assert.equal(cola.find((x) => x.cancion.youtube_video_id === cancion(2)).total_votos, 1);
}));

test('C3: el dispositivo ya votó esa solicitud y la pide otra vez → 409 voto_duplicado', conEntorno(async (e) => {
  const id = (await e.solicitar(A, cancion(1))).body.solicitud.id_solicitud;
  const r = await e.solicitar(A, cancion(1));
  assert.equal(r.status, 409);
  assert.equal(r.body.error.codigo, 'voto_duplicado');
  assert.deepEqual(r.body.error.detalle, { id_solicitud: id });
}));

test('C21: canción en reproducción pedida con voto disponible → suma voto, sin duplicar', conEntorno(async (e) => {
  const id = (await e.solicitar(A, cancion(1))).body.solicitud.id_solicitud;
  await e.iniciar();
  const r = await e.solicitar(B, cancion(1));
  assert.equal(r.status, 200);
  assert.equal(r.body.resultado, 'voto_sumado');
  assert.equal(r.body.solicitud.id_solicitud, id);
  assert.equal(r.body.solicitud.estado, 'en_reproduccion');
  assert.equal(r.body.solicitud.posicion, null);
  assert.equal(r.body.solicitud.espera_estimada_segundos, null);
  assert.equal(r.body.solicitud.total_votos, 2);
  assert.equal((await e.cola(null)).body.reproduccion_actual.total_votos, 2);
}));

test('C22 / H3b: canción ya reproducida o fallida → nueva solicitud con 1 voto', conEntorno(async (e) => {
  const primera = (await e.solicitar(A, cancion(1))).body.solicitud.id_solicitud;
  await e.iniciar();
  await e.siguiente('exitosa');
  const r = await e.solicitar(B, cancion(1));
  assert.equal(r.status, 201);
  assert.notEqual(r.body.solicitud.id_solicitud, primera);
  assert.equal(r.body.solicitud.total_votos, 1);

  await e.iniciar();
  await e.siguiente('fallida', { codigo_error: 'video_no_reproducible' });
  const r2 = await e.solicitar(C, cancion(1));
  assert.equal(r2.status, 201);
  assert.equal(r2.body.solicitud.total_votos, 1);
}));

// ------------------------------------------------------------------ voto manual (P2)

test('P2: voto válido incrementa el total, reordena y reinicia el intervalo del votante (C4)', conEntorno(async (e) => {
  await e.solicitar(A, cancion(1));
  const deB = (await e.solicitar(B, cancion(2))).body.solicitud.id_solicitud;
  const r = await e.votar(C, deB);
  assert.equal(r.status, 201);
  assert.equal(r.body.voto.origen, 'manual');
  assert.equal(r.body.solicitud.total_votos, 2);
  assert.equal(r.body.solicitud.posicion, 1);
  assert.equal(r.body.solicitud.ya_voto, true);
  assert.equal(r.body.solicitud.es_mia, false);
  assert.deepEqual(r.body.mi_votacion, { puede_votar: false, intervalo_canciones: 2, reproducciones_contadas: 0, canciones_restantes: 2 });
  assert.equal((await e.votar(C, deB)).body.error.codigo, 'voto_duplicado');
}));

test('P2: solicitud inexistente, de otra sesión o con id mal formado → 404 solicitud_inexistente', conEntorno(async (e) => {
  await e.pool.query(`INSERT INTO sesion (id_sesion, id_establecimiento, qr_token, estado, qr_estado)
    VALUES ('SES-PRUEBA-004', 'EST-MOCK-002', 'prueba-004-token', 'activa', 'activo')`);
  const deOtra = (await e.solicitar(B, cancion(5), 'SES-PRUEBA-004')).body.solicitud.id_solicitud;
  for (const id of ['SOL-999999', deOtra, 'abc', 'SOL-']) {
    const r = await e.votar(A, id);
    assert.equal(r.status, 404, id);
    assert.equal(r.body.error.codigo, 'solicitud_inexistente');
  }
  assert.equal((await e.votar(A, 'SOL-1', 'SES-MOCK-002')).body.error.codigo, 'sesion_cerrada');
  assert.equal((await e.pedir('POST', `/api/sesiones/${SESION}/solicitudes/${deOtra}/votos`)).body.error.codigo, 'dispositivo_id_invalido');
}));

test('H3c (decisión de cierre): voto manual sobre una canción en reproducción → 201; reproducida o fallida → 409 solicitud_no_votable', conEntorno(async (e) => {
  const id = (await e.solicitar(A, cancion(1))).body.solicitud.id_solicitud;
  await e.solicitar(C, cancion(2)); // para que haya otra después y se pueda probar también una fallida
  await e.iniciar();
  const sonando = await e.votar(B, id);
  assert.equal(sonando.status, 201);
  assert.equal(sonando.body.solicitud.estado, 'en_reproduccion');
  assert.equal(sonando.body.solicitud.total_votos, 2);
  await e.siguiente('exitosa');
  const r = await e.votar(uuid(4), id);
  assert.equal(r.status, 409);
  assert.equal(r.body.error.codigo, 'solicitud_no_votable');
  await e.siguiente('fallida', { codigo_error: 'video_no_reproducible' });
  assert.equal((await e.votar(uuid(4), 'SOL-2')).body.error.codigo, 'solicitud_no_votable');
}));

test('C6: no existe operación para cambiar ni retirar un voto (405)', conEntorno(async (e) => {
  const id = (await e.solicitar(A, cancion(1))).body.solicitud.id_solicitud;
  for (const metodo of ['DELETE', 'PUT', 'PATCH']) {
    const r = await e.pedir(metodo, `/api/sesiones/${SESION}/solicitudes/${id}/votos`, { dispositivo: A });
    assert.equal(r.status, 405, metodo);
    assert.equal(r.headers.get('allow'), 'POST');
  }
  assert.equal(await contar(e, 'voto'), 1);
}));

// ------------------------------------------------------------------ cola y orden (F5)

test('C7 / F5: orden por votos y desempate por antigüedad; cola vacía', conEntorno(async (e) => {
  const vacia = (await e.cola(null)).body;
  assert.deepEqual(vacia.cola, []);
  assert.equal(vacia.reproduccion_actual, null);

  const s1 = (await e.solicitar(A, cancion(1))).body.solicitud.id_solicitud;
  e.reloj.avanzar(1000);
  const s2 = (await e.solicitar(B, cancion(2))).body.solicitud.id_solicitud;
  e.reloj.avanzar(1000);
  const s3 = (await e.solicitar(C, cancion(3))).body.solicitud.id_solicitud;
  let cola = (await e.cola(null)).body.cola;
  assert.deepEqual(cola.map((x) => [x.posicion, x.id_solicitud]), [[1, s1], [2, s2], [3, s3]]);

  await e.votar(uuid(4), s3);
  cola = (await e.cola(null)).body.cola;
  assert.deepEqual(cola.map((x) => x.id_solicitud), [s3, s1, s2]);
  assert.deepEqual(cola.map((x) => x.total_votos), [2, 1, 1]);
}));

test('GET /cola: vista pública sin X-Dispositivo-Id y vista personal con ella', conEntorno(async (e) => {
  await e.solicitar(A, cancion(1));
  const publica = (await e.cola(null)).body;
  assert.equal('mi_votacion' in publica, false);
  assert.equal('ya_voto' in publica.cola[0], false);
  assert.equal('es_mia' in publica.cola[0], false);
  const personal = (await e.cola(A)).body;
  assert.equal(personal.cola[0].ya_voto, true);
  assert.equal(personal.cola[0].es_mia, true);
  assert.equal(personal.mi_votacion.puede_votar, false);
  const otro = (await e.cola(B)).body;
  assert.equal(otro.cola[0].ya_voto, false);
  assert.deepEqual(otro.mi_votacion, { puede_votar: true, intervalo_canciones: 2, reproducciones_contadas: 0, canciones_restantes: 0 }); // H4
  assert.equal((await e.cola('no-es-uuid')).body.error.codigo, 'dispositivo_id_invalido');
  assert.equal((await e.cola(null, 'SES-MOCK-002')).status, 410);
  assert.equal((await e.cola(null, 'SES-NADA')).status, 404);
}));

// ------------------------------------------------------------------ catálogo (sección 8)

const video = (id, cambios = {}) => ({
  id,
  snippet: { title: `Video ${id}`, channelTitle: 'Canal', categoryId: '10', liveBroadcastContent: 'none', thumbnails: {}, ...cambios.snippet },
  contentDetails: { duration: 'PT3M', ...cambios.contentDetails },
  status: { embeddable: true, privacyStatus: 'public', ...cambios.status },
});

test('C15: canción fuera del catálogo → 422 cancion_no_permitida con motivo; no se crea nada', conEntorno(async (e) => {
  const casos = {
    NOMUSICA_01: ['no_musica', video('NOMUSICA_01', { snippet: { categoryId: '20' } })],
    NOEMBEBE_01: ['no_embebible', video('NOEMBEBE_01', { status: { embeddable: false } })],
    PRIVADO_001: ['no_publico', video('PRIVADO_001', { status: { privacyStatus: 'unlisted' } })],
    ENVIVO_0001: ['en_vivo', video('ENVIVO_0001', { snippet: { liveBroadcastContent: 'live' } })],
    SINDURAC_01: ['sin_duracion', video('SINDURAC_01', { contentDetails: { duration: 'P' } })],
  };
  for (const [id, [, item]] of Object.entries(casos)) e.youtube.videos[id] = item;
  for (const [id, [motivo]] of Object.entries(casos)) {
    const r = await e.solicitar(A, id);
    assert.equal(r.status, 422, id);
    assert.deepEqual(r.body.error.detalle, { motivo });
    assert.equal(r.body.error.codigo, 'cancion_no_permitida');
  }
  assert.equal(await contar(e, 'solicitud'), 0);
  // El veredicto queda guardado: la segunda vez no se llama a YouTube.
  const llamadas = e.youtube.llamadas.length;
  assert.equal((await e.solicitar(A, 'NOMUSICA_01')).body.error.detalle.motivo, 'no_musica');
  assert.equal(e.youtube.llamadas.length, llamadas);
  const rechazo = e.eventos.find((x) => x.tipo === 'solicitud_rechazada');
  assert.equal(rechazo.datos_evento.motivo, 'cancion_no_permitida');
  assert.equal(rechazo.datos_evento.motivo_catalogo, 'no_musica'); // A6: el sub-motivo del catálogo
}));

test('C16: los datos de la canción enviados por el cliente se ignoran; el backend usa los suyos', conEntorno(async (e) => {
  const r = await e.pedir('POST', `/api/sesiones/${SESION}/solicitudes`, { dispositivo: A,
    cuerpo: { youtube_video_id: cancion(1), titulo: 'MANIPULADO', duracion_segundos: 1, cancion: { titulo: 'X' } } });
  assert.equal(r.status, 201);
  assert.equal(r.body.solicitud.cancion.titulo, 'Canción 1');
  assert.equal(r.body.solicitud.cancion.duracion_segundos, 200);
}));

test('catálogo: vigente (<24 h) no llama a YouTube; vencida revalida; YouTube caído usa lo guardado', conEntorno(async (e) => {
  e.youtube.videos.NUEVO_00001 = video('NUEVO_00001');
  assert.equal((await e.solicitar(A, 'NUEVO_00001')).status, 201);
  assert.deepEqual(e.youtube.llamadas, ['NUEVO_00001']);
  assert.equal((await e.solicitar(A, cancion(1))).status, 409); // catálogo semilla vigente: sin llamada
  assert.deepEqual(e.youtube.llamadas, ['NUEVO_00001']);

  e.reloj.avanzar(24 * 60 * 60 * 1000); // vence el catálogo
  const { YoutubeError } = require('../src/youtube');
  e.youtube.fallo = new YoutubeError('cuota_excedida', 'cuota', 503);
  // guardada pero vencida + YouTube caído → se acepta con los datos guardados
  assert.equal((await e.solicitar(B, cancion(2))).status, 201);
  // nunca vista + YouTube caído → error de YouTube del E3
  const r = await e.solicitar(C, 'DESCONOC_01');
  assert.equal(r.status, 503);
  assert.equal(r.body.error.codigo, 'cuota_excedida');
}));

// ------------------------------------------------------------------ eventos analíticos (sección 9)

test('eventos: solicitud creada (2 eventos), voto sumado (1), rechazo (1), voto manual (1); actor servidor', conEntorno(async (e) => {
  const s = (await e.solicitar(A, cancion(1))).body.solicitud.id_solicitud;
  assert.deepEqual(e.eventos.map((x) => x.tipo), ['solicitud_creada', 'voto_registrado']);
  const [creada, voto] = e.eventos;
  assert.deepEqual(creada.datos_evento, { id_solicitud: s, youtube_video_id: cancion(1), duracion_segundos: 200, posicion_inicial: 1, dispositivos_activos: 0, espera_estimada_segundos: 0 });
  assert.deepEqual(voto.datos_evento, { id_solicitud: s, origen: 'solicitud', total_votos: 1, posicion_antes: null, posicion_despues: 1, intervalo_canciones: 2,
    sumado_a_existente: false, estado_solicitud: 'pendiente', por_inactividad: false });
  for (const ev of e.eventos) {
    assert.equal(ev.actor, 'servidor');
    assert.equal(ev.id_establecimiento, 'EST-MOCK-001'); // A1
    assert.equal(ev.version_esquema, '1.2');
    assert.equal(ev.dispositivo_id, A);
    assert.equal(ev.sesion_id, SESION);
    assert.equal(ev.fecha_hora, '2026-11-10T20:00:00.000Z');
  }
  e.eventos.length = 0;
  await e.solicitar(B, cancion(1));
  assert.deepEqual(e.eventos.map((x) => x.tipo), ['voto_registrado']);
  assert.equal(e.eventos[0].datos_evento.posicion_antes, 1);
  assert.equal(e.eventos[0].datos_evento.sumado_a_existente, true); // A2: voto sumado a una solicitud que ya existía
  e.eventos.length = 0;
  await e.solicitar(A, cancion(2));
  assert.deepEqual(e.eventos.map((x) => [x.tipo, x.datos_evento.motivo, x.datos_evento.canciones_restantes]),
    [['solicitud_rechazada', 'intervalo_no_cumplido', 2]]);
  e.eventos.length = 0;
  await e.votar(A, s);
  assert.deepEqual(e.eventos.map((x) => [x.tipo, x.datos_evento.motivo]), [['voto_rechazado', 'voto_duplicado']]);
  e.eventos.length = 0;
  await e.pedir('POST', `/api/sesiones/${SESION}/solicitudes`, { dispositivo: C, cuerpo: {} });
  assert.deepEqual(e.eventos, []); // los errores de formato (400) no se registran
}));

test('eventos: un fallo del almacén no deshace la operación ni cambia la respuesta', conEntorno(async (e) => {
  const original = e.eventos.push;
  e.eventos.push = () => { throw new Error('disco lleno'); };
  try {
    const r = await e.solicitar(A, cancion(1));
    assert.equal(r.status, 201);
    assert.equal(await contar(e, 'solicitud'), 1);
  } finally {
    e.eventos.push = original;
  }
}));
