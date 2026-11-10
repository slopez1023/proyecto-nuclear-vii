'use strict';
/**
 * E4 — Reproductor (R1/R2), protección por token, tiempo estimado y simulación (niveles 2 y 3).
 * Temporizadores falsos: la simulación automática avanza solo cuando la prueba lo indica.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { crearEntorno, cancion, uuid, SESION, ESTABLECIMIENTO } = require('./helpers/e4');

const conEntorno = (fn, opciones) => async () => {
  const e = await crearEntorno(opciones);
  try { await fn(e); } finally { await e.cerrar(); }
};
const A = uuid(1);
const B = uuid(2);
const C = uuid(3);

// ------------------------------------------------------------------ R1 / R2

test('R1: cola vacía → 409; inicia la primera; otra vez → 409 ya_hay_reproduccion', conEntorno(async (e) => {
  assert.equal((await e.iniciar()).body.error.codigo, 'cola_vacia');
  const s1 = (await e.solicitar(A, cancion(1))).body.solicitud.id_solicitud;
  await e.solicitar(B, cancion(2));
  const r = await e.iniciar();
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { reproduccion_actual: {
    id_reproduccion: r.body.reproduccion_actual.id_reproduccion,
    id_solicitud: s1,
    cancion: { youtube_video_id: cancion(1), titulo: 'Canción 1', artista_canal: 'Artista 1', duracion_segundos: 200, url_miniatura: null },
    total_votos: 1,
    inicio_en: '2026-11-10T20:00:00.000Z',
    segundos_restantes_estimados: 200,
  } });
  assert.match(r.body.reproduccion_actual.id_reproduccion, /^REP-\d+$/);
  const otra = await e.iniciar();
  assert.equal(otra.status, 409);
  assert.equal(otra.body.error.codigo, 'ya_hay_reproduccion');
  const estado = (await e.cola(null)).body;
  assert.equal(estado.cola.length, 1); // la que suena sale de la cola
  assert.equal(estado.reproduccion_actual.id_solicitud, s1);
}));

test('R2: cierra con su resultado, inicia la siguiente y deja null al vaciarse la cola', conEntorno(async (e) => {
  assert.equal((await e.siguiente()).body.error.codigo, 'sin_reproduccion_actual');
  const s1 = (await e.solicitar(A, cancion(1))).body.solicitud.id_solicitud;
  const s2 = (await e.solicitar(B, cancion(2))).body.solicitud.id_solicitud;
  const rep1 = (await e.iniciar()).body.reproduccion_actual.id_reproduccion;
  e.reloj.avanzar(200_000);
  const r = await e.siguiente('exitosa', { segundos_reproducidos: 200 });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.anterior, { id_reproduccion: rep1, id_solicitud: s1, resultado: 'exitosa' });
  assert.equal(r.body.reproduccion_actual.id_solicitud, s2);
  assert.equal(r.body.reproduccion_actual.inicio_en, '2026-11-10T20:03:20.000Z');
  const ultima = await e.siguiente('fallida', { segundos_reproducidos: 12, codigo_error: 'video_no_reproducible' });
  assert.equal(ultima.body.reproduccion_actual, null);
  assert.equal(ultima.body.anterior.resultado, 'fallida');
  const { rows } = await e.pool.query('SELECT resultado, segundos_reproducidos, codigo_error, fin_en FROM reproduccion ORDER BY id_reproduccion');
  assert.deepEqual(rows.map((x) => [x.resultado, x.segundos_reproducidos, x.codigo_error]),
    [['exitosa', 200, null], ['fallida', 12, 'video_no_reproducible']]);
  assert.equal(rows[0].fin_en, e.reloj.ahora());
}));

test('R2: cuerpo inválido → 400 resultado_invalido (incluido "finalizada" del borrador)', conEntorno(async (e) => {
  await e.solicitar(A, cancion(1));
  await e.iniciar();
  for (const cuerpo of [{}, { resultado: 'finalizada' }, { resultado: 'saltada' }, { resultado: 'exitosa', segundos_reproducidos: -1 },
    { resultado: 'exitosa', segundos_reproducidos: 1.5 }, { resultado: 'fallida', codigo_error: 7 }]) {
    const r = await e.pedir('POST', `/api/sesiones/${SESION}/reproduccion/siguiente`, { cabeceras: { 'X-Reproductor-Token': 'token-reproductor-de-prueba' }, cuerpo });
    assert.equal(r.status, 400, JSON.stringify(cuerpo));
    assert.equal(r.body.error.codigo, 'resultado_invalido');
  }
}));

test('R1/R2: sesión inexistente o cerrada → 404 / 410', conEntorno(async (e) => {
  assert.equal((await e.iniciar('SES-NO-EXISTE')).status, 404);
  assert.equal((await e.iniciar('SES-MOCK-002')).body.error.codigo, 'sesion_cerrada');
  assert.equal((await e.siguiente('exitosa', {}, 'SES-MOCK-003')).body.error.codigo, 'qr_desactivado');
}));

test('token del reproductor: sin cabecera o con token distinto → 404; nada cambia', conEntorno(async (e) => {
  await e.solicitar(A, cancion(1));
  const ruta = `/api/sesiones/${SESION}/reproduccion/iniciar`;
  assert.equal((await e.pedir('POST', ruta)).status, 404);
  assert.equal((await e.pedir('POST', ruta, { cabeceras: { 'X-Reproductor-Token': 'otro' } })).status, 404);
  assert.equal((await e.cola(null)).body.reproduccion_actual, null);
}));

test('sin REPRODUCTOR_TOKEN los endpoints del reproductor no existen (404)', conEntorno(async (e) => {
  await e.solicitar(A, cancion(1));
  assert.equal((await e.pedir('POST', `/api/sesiones/${SESION}/reproduccion/iniciar`, { cabeceras: { 'X-Reproductor-Token': '' } })).status, 404);
  assert.equal((await e.iniciar()).status, 404);
}, { token: '' }));

test('origen: "reproductor" cuando la simulación está deshabilitada; eventos de reproducción', conEntorno(async (e) => {
  const s1 = (await e.solicitar(A, cancion(1))).body.solicitud.id_solicitud;
  await e.solicitar(B, cancion(2));
  e.eventos.length = 0;
  await e.iniciar();
  await e.siguiente('exitosa', { segundos_reproducidos: 200 });
  await e.siguiente('fallida', { segundos_reproducidos: 3, codigo_error: 'video_no_reproducible' });
  const { rows } = await e.pool.query('SELECT origen FROM reproduccion');
  assert.deepEqual(rows.map((x) => x.origen), ['reproductor', 'reproductor']);
  assert.deepEqual(e.eventos.map((x) => x.tipo), ['reproduccion_iniciada', 'reproduccion_finalizada', 'reproduccion_iniciada', 'reproduccion_fallida']);
  const [iniciada, finalizada, , fallida] = e.eventos;
  assert.deepEqual(Object.keys(iniciada.datos_evento).sort(), ['id_reproduccion', 'id_solicitud', 'origen', 'total_votos', 'youtube_video_id']);
  assert.equal(iniciada.datos_evento.id_solicitud, s1);
  assert.equal(iniciada.dispositivo_id, null);
  assert.equal(iniciada.actor, 'servidor');
  assert.deepEqual(Object.keys(finalizada.datos_evento).sort(), ['id_reproduccion', 'id_solicitud', 'origen', 'segundos_reproducidos']);
  assert.equal(fallida.datos_evento.codigo_error, 'video_no_reproducible');
  assert.equal(fallida.datos_evento.origen, 'reproductor');
  // Sin simulación habilitada, sus rutas no existen.
  assert.equal((await e.pedir('POST', `/api/simulacion/sesiones/${SESION}/auto`, { cuerpo: { activo: true } })).status, 404);
}, { simulacion: false }));

// ------------------------------------------------------------------ tiempo estimado (sección 10)

test('tiempo estimado: restante de la actual + duraciones de las anteriores; cambia al reordenar', conEntorno(async (e) => {
  await e.pool.query(`UPDATE cancion SET duracion_segundos = 294 WHERE youtube_video_id = $1`, [cancion(1)]);
  await e.pool.query(`UPDATE cancion SET duracion_segundos = 125 WHERE youtube_video_id = $1`, [cancion(2)]);
  await e.pool.query(`UPDATE cancion SET duracion_segundos = 355 WHERE youtube_video_id = $1`, [cancion(3)]);
  await e.solicitar(A, cancion(1));
  await e.iniciar(); // 20:00:00, 294 s
  await e.solicitar(B, cancion(2)); // Yesterday, 125 s
  e.reloj.avanzar(63_000);
  const s3 = (await e.solicitar(C, cancion(3))).body; // Bohemian, 355 s
  assert.equal(s3.solicitud.espera_estimada_segundos, 231 + 125); // ejemplo del documento: 356
  e.reloj.avanzar(97_000); // 20:02:40
  let estado = (await e.cola(null)).body;
  assert.equal(estado.reproduccion_actual.segundos_restantes_estimados, 134);
  assert.deepEqual(estado.cola.map((x) => x.espera_estimada_segundos), [134, 259]);
  await e.votar(uuid(4), s3.solicitud.id_solicitud); // reordena: Bohemian primero
  estado = (await e.cola(null)).body;
  assert.deepEqual(estado.cola.map((x) => [x.cancion.duracion_segundos, x.espera_estimada_segundos]), [[355, 134], [125, 489]]);
  e.reloj.avanzar(600_000); // la actual ya debería haber terminado: restante 0, nunca negativo
  estado = (await e.cola(null)).body;
  assert.equal(estado.reproduccion_actual.segundos_restantes_estimados, 0);
  assert.deepEqual(estado.cola.map((x) => x.espera_estimada_segundos), [0, 355]);
}));

test('tiempo estimado: sin nada sonando empieza en 0; una duración desconocida deja null desde ahí', conEntorno(async (e) => {
  await e.pool.query(`UPDATE cancion SET duracion_segundos = NULL WHERE youtube_video_id = $1`, [cancion(2)]);
  await e.solicitar(A, cancion(1));
  await e.solicitar(B, cancion(2));
  await e.solicitar(C, cancion(3));
  let estado = (await e.cola(null)).body;
  assert.deepEqual(estado.cola.map((x) => x.espera_estimada_segundos), [0, 200, null]);
  await e.iniciar(); // suena la de 200 s
  await e.siguiente(); // ahora suena la de duración desconocida
  estado = (await e.cola(null)).body;
  assert.equal(estado.reproduccion_actual.segundos_restantes_estimados, null);
  assert.deepEqual(estado.cola.map((x) => x.espera_estimada_segundos), [null]);
}));

// ------------------------------------------------------------------ simulación nivel 2 (automática)

test('simulación automática: avanza con tiempo acelerado, aplica la probabilidad de fallo y espera nuevas solicitudes', conEntorno(async (e) => {
  const sim = e.servicios.simulacion;
  await e.solicitar(A, cancion(1));
  await e.solicitar(B, cancion(2));
  const r = await e.pedir('POST', `/api/simulacion/sesiones/${SESION}/auto`, { cuerpo: { activo: true, factor_tiempo: 10, probabilidad_fallo: 0.5 } });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { sesion_id: SESION, activo: true, factor_tiempo: 10, probabilidad_fallo: 0.5 });
  // inició la primera y programó su fin a 200 s / 10 = 20 s
  assert.equal((await e.cola(null)).body.reproduccion_actual.cancion.youtube_video_id, cancion(1));
  assert.deepEqual([...e.temporizadores.pendientes.values()].map((t) => t.ms), [20_000]);

  // aleatorio() = 1 (≥ 0.5) → exitosa; avanza a la segunda
  await e.temporizadores.ejecutarPendientes();
  await sim.inactiva(SESION);
  assert.equal((await e.cola(null)).body.reproduccion_actual.cancion.youtube_video_id, cancion(2));
  // la segunda falla: se fuerza aleatorio por debajo de la probabilidad
  sim.autos.get(SESION).prob = 1.01;
  assert.equal(e.temporizadores.pendientes.size, 1);
  await e.temporizadores.ejecutarPendientes();
  await sim.inactiva(SESION);
  assert.equal((await e.cola(null)).body.reproduccion_actual, null);
  const { rows } = await e.pool.query('SELECT resultado, origen, codigo_error FROM reproduccion ORDER BY id_reproduccion');
  assert.deepEqual(rows, [{ resultado: 'exitosa', origen: 'simulacion', codigo_error: null },
    { resultado: 'fallida', origen: 'simulacion', codigo_error: 'fallo_simulado' }]);

  // Cola vacía: queda esperando. Una solicitud nueva la vuelve a arrancar.
  assert.equal(e.temporizadores.pendientes.size, 0);
  await e.solicitar(C, cancion(3));
  await sim.inactiva(SESION);
  assert.equal(e.temporizadores.pendientes.size, 1);
  assert.equal((await e.cola(null)).body.reproduccion_actual.cancion.youtube_video_id, cancion(3));

  // Desactivar cancela el temporizador.
  const off = await e.pedir('POST', `/api/simulacion/sesiones/${SESION}/auto`, { cuerpo: { activo: false } });
  assert.deepEqual(off.body, { sesion_id: SESION, activo: false });
  assert.equal(e.temporizadores.pendientes.size, 0);
}));

test('simulación automática: cuerpo inválido → 400; sesión cerrada → 410', conEntorno(async (e) => {
  for (const cuerpo of [{}, { activo: 'si' }, { activo: true, factor_tiempo: 0 }, { activo: true, probabilidad_fallo: 2 }]) {
    const r = await e.pedir('POST', `/api/simulacion/sesiones/${SESION}/auto`, { cuerpo });
    assert.equal(r.status, 400, JSON.stringify(cuerpo));
    assert.equal(r.body.error.codigo, 'cuerpo_invalido');
  }
  assert.equal((await e.pedir('POST', '/api/simulacion/sesiones/SES-MOCK-002/auto', { cuerpo: { activo: true } })).status, 410);
}));

test('C27: escenario completo con reproducciones simuladas exitosas y fallidas', conEntorno(async (e) => {
  // El aleatorio del entorno siempre devuelve 1; para forzar cada resultado se ajusta la probabilidad:
  // 1.01 → fallida (1 < 1.01), 0 → exitosa.
  const resultados = ['exitosa', 'fallida', 'exitosa', 'exitosa', 'exitosa'];
  await e.solicitar(A, cancion(1)); // propia: suena primero
  for (let i = 0; i < 4; i++) await e.solicitar(uuid(100 + i), cancion(10 + i));
  e.reloj.avanzar(1000);
  const sim = e.servicios.simulacion;
  await e.pedir('POST', `/api/simulacion/sesiones/${SESION}/auto`, { cuerpo: { activo: true, factor_tiempo: 100, probabilidad_fallo: 0.5 } });
  for (const resultado of resultados) {
    await sim.inactiva(SESION);
    assert.equal(e.temporizadores.pendientes.size, 1);
    sim.autos.get(SESION).prob = resultado === 'fallida' ? 1.01 : 0;
    e.reloj.avanzar(2000);
    await e.temporizadores.ejecutarPendientes();
  }
  await sim.inactiva(SESION);
  const { rows } = await e.pool.query('SELECT resultado FROM reproduccion ORDER BY id_reproduccion');
  assert.deepEqual(rows.map((x) => x.resultado), resultados);
  // propia (exitosa, no cuenta) + fallida (no cuenta) + 3 exitosas ajenas → contador 3, intervalo 2 cumplido
  assert.deepEqual(await e.miVotacion(A), { puede_votar: true, intervalo_canciones: 2, reproducciones_contadas: 3, canciones_restantes: 0 });
  assert.equal((await e.solicitar(A, cancion(2))).status, 201);
}));

// ------------------------------------------------------------------ simulación nivel 3 (dispositivos virtuales)

test('dispositivos activos virtuales: cambian el rango (C8/C9 vía endpoint) y validan el cuerpo', conEntorno(async (e) => {
  const ruta = `/api/simulacion/establecimientos/${ESTABLECIMIENTO}/dispositivos-activos-virtuales`;
  const r = await e.pedir('POST', ruta, { cuerpo: { cantidad: 59 } });
  assert.deepEqual(r.body, { id_establecimiento: ESTABLECIMIENTO, cantidad: 59, dispositivos_activos: 59 });
  assert.deepEqual((await e.cola(null)).body.reglas_votacion, { dispositivos_activos: 59, intervalo_canciones: 6 });
  await e.pedir('POST', ruta, { cuerpo: { cantidad: 10 } });
  assert.deepEqual((await e.cola(null)).body.reglas_votacion, { dispositivos_activos: 10, intervalo_canciones: 2 });
  for (const cuerpo of [{}, { cantidad: -1 }, { cantidad: 2.5 }, { cantidad: '3' }]) {
    assert.equal((await e.pedir('POST', ruta, { cuerpo })).body.error.codigo, 'cuerpo_invalido');
  }
}));
