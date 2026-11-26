'use strict';
/**
 * E4 — Intervalo de votación (tabla B y casos C de la especificación), fronteras de rango con
 * dispositivos virtuales, persistencia y aislamiento por establecimiento.
 * Convención: cada "paso" avanza el reloj 1 s; así inicio_en > fecha del voto salvo cuando la prueba
 * quiere el mismo instante (B4d).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { crearEntorno, cancion, uuid } = require('./helpers/e4');

const conEntorno = (fn) => async () => {
  const e = await crearEntorno();
  try { await fn(e); } finally { await e.cerrar(); }
};
const A = uuid(1);
const X = uuid(2);
const Y = uuid(3);
const relleno = (i) => uuid(100 + i);

/** Dispositivos de relleno que solicitan n canciones (desde la canción `desde`). Devuelve los ids SOL-. */
async function llenar(e, n, desde = 10, sesion) {
  const ids = [];
  for (let i = 0; i < n; i++) {
    const r = await e.solicitar(relleno(desde + i), cancion(desde + i), sesion);
    assert.equal(r.status, 201, `relleno ${i}: ${JSON.stringify(r.body)}`);
    ids.push(r.body.solicitud.id_solicitud);
  }
  return ids;
}
/** Avanza 1 s y reporta el resultado de la canción en curso (inicia automáticamente la siguiente). */
async function cerrar(e, resultado = 'exitosa', sesion) {
  e.reloj.avanzar(1000);
  const r = await e.siguiente(resultado, {}, sesion);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body;
}
async function iniciar(e, sesion) {
  e.reloj.avanzar(1000);
  const r = await e.iniciar(sesion);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body;
}
const contadas = async (e, d, sesion) => (await e.miVotacion(d, sesion)).reproducciones_contadas;

// ------------------------------------------------------------------ tabla B (intervalo 2)

test('B1/B2/B3/B6/B7: la canción propia no cuenta; solo exitosas posteriores; se habilita y se reinicia', conEntorno(async (e) => {
  e.activos(4); // rango 4–10 → intervalo 2
  await e.solicitar(A, cancion(1)); // A pide su canción (la más antigua: sonará primero)
  await llenar(e, 3);
  assert.deepEqual(await e.miVotacion(A), { puede_votar: false, intervalo_canciones: 2, reproducciones_contadas: 0, canciones_restantes: 2 }); // B2
  await iniciar(e); // suena la canción de A
  await cerrar(e); // B1: exitosa, pero es la suya
  assert.equal(await contadas(e, A), 0);
  await cerrar(e); // B3: primera ajena exitosa
  assert.equal(await contadas(e, A), 1);
  assert.equal((await e.solicitar(A, cancion(2))).body.error.codigo, 'intervalo_no_cumplido');
  await cerrar(e);
  assert.deepEqual(await e.miVotacion(A), { puede_votar: true, intervalo_canciones: 2, reproducciones_contadas: 2, canciones_restantes: 0 });
  const r = await e.solicitar(A, cancion(2)); // B6
  assert.equal(r.status, 201);
  assert.equal(await contadas(e, A), 0); // B7: lo anterior ya no cuenta
}));

test('B4: una reproducción que ya estaba en curso al solicitar no suma, aunque termine bien', conEntorno(async (e) => {
  await llenar(e, 2);
  await iniciar(e); // relleno 1 suena
  e.reloj.avanzar(1000);
  await e.solicitar(A, cancion(1));
  await cerrar(e); // termina bien DESPUÉS de la solicitud, pero comenzó antes
  assert.equal(await contadas(e, A), 0);
}));

test('B4a: una reproducción que terminó antes de la solicitud no suma', conEntorno(async (e) => {
  await llenar(e, 1);
  await iniciar(e);
  await cerrar(e);
  e.reloj.avanzar(1000);
  await e.solicitar(A, cancion(1));
  assert.equal(await contadas(e, A), 0);
}));

test('B4b/B4c/B5/A12: comenzó después y falla → no suma; las fallidas no habilitan', conEntorno(async (e) => {
  e.activos(4); // rango 4–10 → intervalo 2
  await e.solicitar(A, cancion(1));
  await llenar(e, 3);
  await iniciar(e); // propia
  await cerrar(e, 'fallida'); // la propia falla
  await cerrar(e, 'fallida'); // B4c: ajena posterior que falla
  assert.equal(await contadas(e, A), 0);
  await cerrar(e, 'exitosa'); // B4b
  assert.equal(await contadas(e, A), 1); // B5: una fallida + una exitosa = 1
  assert.equal((await e.solicitar(A, cancion(2))).body.error.codigo, 'intervalo_no_cumplido');
}));

test('B4d: una reproducción que comienza en el MISMO milisegundo que la solicitud no suma', conEntorno(async (e) => {
  await llenar(e, 2); // relleno más antiguo: será el primero de la cola
  e.reloj.avanzar(1000);
  await e.solicitar(A, cancion(1)); // instante t
  const r = await e.iniciar(); // mismo instante t (el reloj no avanza)
  assert.equal(r.body.reproduccion_actual.inicio_en, new Date(e.reloj.ahora()).toISOString());
  await cerrar(e); // el relleno que empezó en t termina bien
  assert.equal(await contadas(e, A), 0);
  await cerrar(e); // el siguiente empezó en t+1 s → sí cuenta
  assert.equal(await contadas(e, A), 1);
}));

test('B9/B11: contadores independientes; la misma reproducción cuenta para X y no para Y', conEntorno(async (e) => {
  const [z] = await llenar(e, 3);
  e.reloj.avanzar(1000);
  await e.solicitar(X, cancion(1)); // X vota antes de que Z empiece
  await iniciar(e); // Z (relleno 1) comienza
  e.reloj.avanzar(1000);
  await e.solicitar(Y, cancion(2)); // Y vota con Z ya sonando
  await cerrar(e); // Z termina bien
  assert.equal(await contadas(e, X), 1);
  assert.equal(await contadas(e, Y), 0);
  assert.ok(z);
}));

test('C4/C5/C23/C25: el voto manual reinicia y la canción votada SÍ cuenta si empezó después (y no si falla)', conEntorno(async (e) => {
  const [s1, s2] = await llenar(e, 3);
  await iniciar(e); // s1 ya suena
  e.reloj.avanzar(1000);
  assert.equal((await e.votar(X, s2)).status, 201); // voto manual sobre s2 (pendiente)
  await cerrar(e); // C5: s1 comenzó antes del voto → no suma
  assert.equal(await contadas(e, X), 0);
  await cerrar(e); // C23: s2 (votada por X) comenzó después y termina bien → suma
  assert.equal(await contadas(e, X), 1);
  await cerrar(e, 'fallida'); // C25 (variante): ajena posterior que falla → no suma
  assert.equal(await contadas(e, X), 1);
  assert.ok(s1);
}));

test('C25: la canción votada manualmente comenzó después del voto y falla → no suma', conEntorno(async (e) => {
  const [, s2] = await llenar(e, 2);
  e.reloj.avanzar(1000);
  await e.votar(X, s2);
  await iniciar(e);
  await cerrar(e, 'exitosa'); // s1 → +1
  await cerrar(e, 'fallida'); // s2 (la votada) falla
  assert.equal(await contadas(e, X), 1);
}));

test('C24 / H3c (decisión de cierre): se puede votar manualmente la canción que suena; el voto reinicia el contador', conEntorno(async (e) => {
  const [s1] = await llenar(e, 1);
  await iniciar(e);
  const r = await e.votar(X, s1);
  assert.equal(r.status, 201);
  assert.equal(r.body.voto.origen, 'manual');
  assert.equal(r.body.solicitud.estado, 'en_reproduccion');
  assert.equal(r.body.solicitud.posicion, null);
  assert.equal(r.body.solicitud.espera_estimada_segundos, null);
  assert.equal(r.body.mi_votacion.reproducciones_contadas, 0);
  await cerrar(e);
  assert.equal((await e.votar(X, s1)).body.error.codigo, 'solicitud_no_votable'); // terminada: ya no
}));

test('C26 / H2: la canción solicitada por el dispositivo no le suma aunque suene después de otra solicitud suya', conEntorno(async (e) => {
  await llenar(e, 2, 10); // r10, r11 (más antiguas)
  e.reloj.avanzar(1000);
  await e.solicitar(A, cancion(1)); // a (t1), queda detrás de los rellenos
  await iniciar(e);
  await cerrar(e); // r10 → +1
  await cerrar(e); // r11 → +1  (intervalo cumplido)
  e.reloj.avanzar(1000);
  // Ahora suena 'a'; A solicita 'd'. Luego 'a' termina bien: H2 → no cuenta para A (fue su solicitud).
  await e.solicitar(A, cancion(2));
  await llenar(e, 1, 20);
  await cerrar(e); // 'a' termina
  assert.equal(await contadas(e, A), 0);
}));

// ------------------------------------------------------------------ rangos (B8, A11, C8, C9)

for (const [activos, intervalo] of [[1, 1], [3, 1], [4, 2], [10, 2], [11, 4], [30, 4], [31, 6], [60, 6], [61, 8], [100, 8]]) {
  test(`B8/A11: con ${activos} dispositivos activos hacen falta ${intervalo} reproducciones exitosas`, conEntorno(async (e) => {
    e.activos(activos);
    await e.solicitar(A, cancion(1));
    await llenar(e, intervalo);
    await iniciar(e);
    await cerrar(e); // la propia: no cuenta
    assert.equal(await contadas(e, A), 0);
    for (let i = 1; i <= intervalo; i++) {
      assert.equal((await e.solicitar(A, cancion(2))).body.error.codigo, 'intervalo_no_cumplido', `paso ${i}`);
      await cerrar(e);
      assert.equal(await contadas(e, A), i);
    }
    const mv = await e.miVotacion(A);
    assert.equal(mv.intervalo_canciones, intervalo);
    assert.equal(mv.puede_votar, true);
    assert.equal((await e.solicitar(A, cancion(2))).status, 201);
  }));
}

test('A11: fronteras 3/4, 10/11, 30/31 y 60/61 dispositivos activos', conEntorno(async (e) => {
  const esperado = [[0, 1], [1, 1], [3, 1], [4, 2], [10, 2], [11, 4], [30, 4], [31, 6], [60, 6], [61, 8], [100, 8], [500, 8]];
  for (const [n, intervalo] of esperado) {
    e.activos(n);
    const estado = (await e.cola(A)).body;
    assert.deepEqual(estado.reglas_votacion, { dispositivos_activos: n, intervalo_canciones: intervalo }, `${n} activos`);
    assert.equal(estado.mi_votacion.intervalo_canciones, intervalo);
  }
}));

test('A11: los rangos también se aplican al rechazar (detalle del 409 con el intervalo vigente)', conEntorno(async (e) => {
  e.activos(31);
  await e.solicitar(A, cancion(1));
  const r = await e.solicitar(A, cancion(2));
  assert.deepEqual(r.body.error.detalle, { intervalo_canciones: 6, reproducciones_contadas: 0, canciones_restantes: 6 });
}));

test('C8/C9: el rango nuevo se aplica de inmediato y el contador no se reinicia', conEntorno(async (e) => {
  e.activos(10);
  await e.solicitar(A, cancion(1));
  await llenar(e, 3);
  await iniciar(e);
  await cerrar(e);
  await cerrar(e);
  await cerrar(e);
  assert.deepEqual(await e.miVotacion(A), { puede_votar: true, intervalo_canciones: 2, reproducciones_contadas: 2, canciones_restantes: 0 });
  e.activos(11); // C8: pasa a intervalo 4
  assert.deepEqual(await e.miVotacion(A), { puede_votar: false, intervalo_canciones: 4, reproducciones_contadas: 2, canciones_restantes: 2 });
  assert.equal((await e.solicitar(A, cancion(2))).body.error.codigo, 'intervalo_no_cumplido');
  e.activos(10); // C9: vuelve a intervalo 2
  assert.equal((await e.solicitar(A, cancion(2))).status, 201);
}));

// ------------------------------------------------------------------ persistencia y establecimiento

test('C10: el contador persiste entre sesiones del mismo establecimiento (y lo reproducido en otra sesión cuenta)', conEntorno(async (e) => {
  e.activos(4); // rango 4–10 → intervalo 2
  e.activos(4, 'SES-PRUEBA-005');
  await e.pool.query(`INSERT INTO sesion (id_sesion, id_establecimiento, qr_token, estado, qr_estado)
    VALUES ('SES-PRUEBA-005', 'EST-MOCK-001', 'prueba-005-token', 'activa', 'activo')`);
  await e.solicitar(A, cancion(1)); // en SES-MOCK-001
  await llenar(e, 2, 10, 'SES-PRUEBA-005'); // otra sesión, mismo establecimiento
  await iniciar(e, 'SES-PRUEBA-005');
  await cerrar(e, 'exitosa', 'SES-PRUEBA-005');
  // Mismo dispositivo visto desde la otra sesión: mismo contador.
  assert.equal(await contadas(e, A, 'SES-PRUEBA-005'), 1);
  assert.equal(await contadas(e, A), 1);
  // Al "reabrir" (nueva app sobre la misma base) el contador sigue ahí: se calcula desde la base de datos.
  assert.equal((await e.solicitar(A, cancion(2), 'SES-PRUEBA-005')).body.error.detalle.reproducciones_contadas, 1);
}));

test('B12/C11: contadores independientes por establecimiento', conEntorno(async (e) => {
  await e.pool.query(`INSERT INTO sesion (id_sesion, id_establecimiento, qr_token, estado, qr_estado)
    VALUES ('SES-PRUEBA-006', 'EST-MOCK-002', 'prueba-006-token', 'activa', 'activo')`);
  await e.solicitar(A, cancion(1)); // establecimiento 1
  await llenar(e, 3, 10, 'SES-PRUEBA-006');
  await iniciar(e, 'SES-PRUEBA-006');
  await cerrar(e, 'exitosa', 'SES-PRUEBA-006');
  await cerrar(e, 'exitosa', 'SES-PRUEBA-006');
  assert.equal(await contadas(e, A), 0); // lo reproducido en el establecimiento 2 no cuenta en el 1
  // En el establecimiento 2, A nunca votó: tiene voto disponible aunque en el 1 no lo tenga.
  assert.equal((await e.solicitar(A, cancion(2), 'SES-PRUEBA-006')).status, 201);
  assert.equal((await e.solicitar(A, cancion(3))).body.error.codigo, 'intervalo_no_cumplido');
}));

test('C14/C17: ciclo de estados pendiente → en_reproduccion → reproducida / fallida', conEntorno(async (e) => {
  const [s1, s2] = await llenar(e, 2);
  const estado = async (id) => (await e.pool.query('SELECT estado FROM solicitud WHERE id_solicitud = $1', [Number(id.slice(4))])).rows[0].estado;
  assert.equal(await estado(s1), 'pendiente');
  await iniciar(e);
  assert.equal(await estado(s1), 'en_reproduccion');
  await cerrar(e, 'exitosa');
  assert.equal(await estado(s1), 'reproducida');
  assert.equal(await estado(s2), 'en_reproduccion');
  await cerrar(e, 'fallida');
  assert.equal(await estado(s2), 'fallida');
  const { rows } = await e.pool.query('SELECT resultado, origen FROM reproduccion ORDER BY id_reproduccion');
  assert.deepEqual(rows, [{ resultado: 'exitosa', origen: 'simulacion' }, { resultado: 'fallida', origen: 'simulacion' }]);
}));
