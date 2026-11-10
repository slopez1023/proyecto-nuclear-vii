'use strict';
/**
 * E4 — Concurrencia real contra PostgreSQL (A7 y similares). Las peticiones se lanzan a la vez con
 * Promise.all sobre HTTP; el pool tiene conexiones de sobra para que compitan de verdad en la base.
 * El reloj inyectado está quieto: todas ocurren "en el mismo milisegundo", el peor caso.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { crearEntorno, cancion, uuid } = require('./helpers/e4');

const conEntorno = (fn) => async () => {
  const e = await crearEntorno();
  try { await fn(e); } finally { await e.cerrar(); }
};
const contar = async (e, sql) => (await e.pool.query(sql)).rows[0].n;

test('concurrencia 1: 20 solicitudes simultáneas de la MISMA canción → 1 solicitud viva, 20 votos, ningún 500', conEntorno(async (e) => {
  const N = 20;
  const respuestas = await Promise.all(Array.from({ length: N }, (_, i) => e.solicitar(uuid(i + 1), cancion(1))));
  const estados = respuestas.map((r) => r.status);
  assert.equal(estados.filter((s) => s === 500).length, 0, JSON.stringify(respuestas.filter((r) => r.status === 500).map((r) => r.body)));
  assert.equal(estados.filter((s) => s === 201).length, 1);
  assert.equal(estados.filter((s) => s === 200).length, N - 1);
  assert.equal(new Set(respuestas.map((r) => r.body.solicitud.id_solicitud)).size, 1);
  assert.equal(await contar(e, "SELECT COUNT(*) AS n FROM solicitud WHERE estado IN ('pendiente','en_reproduccion')"), 1);
  assert.equal(await contar(e, 'SELECT COUNT(*) AS n FROM voto'), N);
  assert.equal(await contar(e, 'SELECT COUNT(DISTINCT id_dispositivo) AS n FROM voto'), N);
  const cola = (await e.cola(null)).body.cola;
  assert.equal(cola.length, 1);
  assert.equal(cola[0].total_votos, N);
  // version_cola: un incremento por operación aceptada, sin perder ninguno
  assert.equal(await contar(e, "SELECT version_cola AS n FROM sesion WHERE id_sesion = 'SES-MOCK-001'"), N);
}));

test('concurrencia 2 (A7): un dispositivo lanza 10 solicitudes a la vez con un solo voto → 1 aceptada, 9 x 409', conEntorno(async (e) => {
  const yo = uuid(1);
  const respuestas = await Promise.all(Array.from({ length: 10 }, (_, i) => e.solicitar(yo, cancion(i + 1))));
  const aceptadas = respuestas.filter((r) => r.status === 201);
  const rechazadas = respuestas.filter((r) => r.status === 409);
  assert.equal(aceptadas.length, 1);
  assert.equal(rechazadas.length, 9);
  for (const r of rechazadas) assert.equal(r.body.error.codigo, 'intervalo_no_cumplido');
  assert.equal(await contar(e, 'SELECT COUNT(*) AS n FROM solicitud'), 1);
  assert.equal(await contar(e, 'SELECT COUNT(*) AS n FROM voto'), 1);
}));

test('concurrencia 2b: solicitar y votar a la vez con un solo voto disponible → solo una acción gana', conEntorno(async (e) => {
  const yo = uuid(1);
  const ajenas = [];
  for (let i = 0; i < 5; i++) ajenas.push((await e.solicitar(uuid(50 + i), cancion(20 + i))).body.solicitud.id_solicitud);
  const respuestas = await Promise.all([
    ...ajenas.map((id) => e.votar(yo, id)),
    ...[1, 2, 3, 4, 5].map((n) => e.solicitar(yo, cancion(n))),
  ]);
  assert.equal(respuestas.filter((r) => r.status === 201).length, 1);
  assert.equal(respuestas.filter((r) => r.status === 409 && r.body.error.codigo === 'intervalo_no_cumplido').length, 9);
  assert.equal(await contar(e, `SELECT COUNT(*) AS n FROM voto v JOIN dispositivo d USING (id_dispositivo)
    WHERE d.identificador_seudonimo = '${yo}'`), 1);
}));

test('concurrencia 2c: el mismo voto manual repetido 10 veces a la vez (doble toque) → un solo voto', conEntorno(async (e) => {
  const id = (await e.solicitar(uuid(1), cancion(1))).body.solicitud.id_solicitud;
  const respuestas = await Promise.all(Array.from({ length: 10 }, () => e.votar(uuid(2), id)));
  assert.equal(respuestas.filter((r) => r.status === 201).length, 1);
  assert.equal(respuestas.filter((r) => r.status === 409).length, 9);
  assert.equal(respuestas.filter((r) => r.status === 500).length, 0);
  assert.equal(await contar(e, 'SELECT COUNT(*) AS n FROM voto'), 2);
}));

test('concurrencia 3: 5 "siguiente" simultáneos con una sola canción → gana uno, 4 x 409; nunca dos en curso', conEntorno(async (e) => {
  await e.solicitar(uuid(1), cancion(1));
  await e.iniciar();
  const respuestas = await Promise.all(Array.from({ length: 5 }, () => e.siguiente('exitosa')));
  assert.equal(respuestas.filter((r) => r.status === 200).length, 1);
  const perdedoras = respuestas.filter((r) => r.status === 409);
  assert.equal(perdedoras.length, 4);
  for (const r of perdedoras) assert.equal(r.body.error.codigo, 'sin_reproduccion_actual');
  assert.equal(await contar(e, "SELECT COUNT(*) AS n FROM reproduccion WHERE resultado = 'exitosa'"), 1);
  assert.equal(await contar(e, "SELECT COUNT(*) AS n FROM reproduccion WHERE resultado = 'en_curso'"), 0);
}));

test('concurrencia 3b: "siguiente" e "iniciar" simultáneos con cola → nunca dos reproducciones en curso', conEntorno(async (e) => {
  for (let i = 1; i <= 6; i++) await e.solicitar(uuid(i), cancion(i));
  await e.iniciar();
  const respuestas = await Promise.all([
    e.siguiente('exitosa'), e.iniciar(), e.siguiente('fallida'), e.iniciar(), e.siguiente('exitosa'),
  ]);
  assert.equal(respuestas.filter((r) => r.status === 500).length, 0);
  assert.equal(await contar(e, "SELECT COUNT(*) AS n FROM reproduccion WHERE resultado = 'en_curso'"), 1);
  // cada "siguiente" exitoso cerró exactamente una y abrió la siguiente
  const cerradas = await contar(e, "SELECT COUNT(*) AS n FROM reproduccion WHERE resultado <> 'en_curso'");
  assert.equal(cerradas, respuestas.filter((r) => r.status === 200 && r.body.anterior).length);
  for (const r of respuestas.filter((x) => x.status === 409)) assert.equal(r.body.error.codigo, 'ya_hay_reproduccion');
}));
