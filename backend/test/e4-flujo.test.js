'use strict';
/**
 * E4 — Flujo SSE (C2) y dispositivos activos por conectividad (sección 7).
 * Conexiones HTTP reales; ping y gracia de desconexión con temporizadores falsos y reloj inyectado.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { crearEntorno, abrirFlujo, cancion, uuid, SESION, ESTABLECIMIENTO } = require('./helpers/e4');

const conEntorno = (fn) => async () => {
  const e = await crearEntorno();
  const flujos = [];
  const abrir = async (opciones) => { const f = await abrirFlujo(e.url, opciones); flujos.push(f); return f; };
  try { await fn(e, abrir); } finally {
    for (const f of flujos) await f.cerrar();
    await e.cerrar();
  }
};
const opciones = { timeout: 10_000 };
const A = uuid(1);
const B = uuid(2);

test('conexión: cabeceras SSE, retry y estado inicial inmediato (vista pública)', opciones, conEntorno(async (e, abrir) => {
  await e.solicitar(A, cancion(1));
  const f = await abrir();
  assert.equal(f.respuesta.status, 200);
  assert.match(f.respuesta.headers.get('content-type'), /^text\/event-stream/);
  assert.equal(f.respuesta.headers.get('cache-control'), 'no-cache');
  assert.equal(f.respuesta.headers.get('x-accel-buffering'), 'no');
  const inicial = await f.esperarEstado();
  assert.equal(f.mensajes[0].retry, 3000);
  assert.equal(inicial.sesion_id, SESION);
  assert.equal(inicial.version, 1);
  assert.equal(inicial.cola.length, 1);
  assert.equal('mi_votacion' in inicial, false);
  assert.equal('ya_voto' in inicial.cola[0], false);
  const msg = f.mensajes.find((m) => m.event === 'estado');
  assert.equal(msg.id, '1'); // id del mensaje = version
  // Igual que GET /cola
  assert.deepEqual(inicial, (await e.cola(null)).body);
}));

test('cada cambio llega a todas las conexiones, personalizado y con versión creciente', opciones, conEntorno(async (e, abrir) => {
  const fa = await abrir({ dispositivo: A });
  const fb = await abrir({ dispositivo: B });
  const fp = await abrir();
  for (const f of [fa, fb, fp]) assert.equal((await f.esperarEstado()).version, 0);

  const sol = (await e.solicitar(B, cancion(1))).body.solicitud.id_solicitud; // v1
  const ea = await fa.esperarEstado((d) => d.version === 1);
  const eb = await fb.esperarEstado((d) => d.version === 1);
  const ep = await fp.esperarEstado((d) => d.version === 1);
  assert.deepEqual([ea.cola[0].es_mia, ea.cola[0].ya_voto, ea.mi_votacion.puede_votar], [false, false, true]);
  assert.deepEqual([eb.cola[0].es_mia, eb.cola[0].ya_voto, eb.mi_votacion.puede_votar], [true, true, false]);
  assert.equal('mi_votacion' in ep, false);

  await e.votar(A, sol); // v2
  await e.iniciar(); // v3
  await e.siguiente('exitosa'); // v4
  const ultimo = await fa.esperarEstado((d) => d.version === 4);
  assert.equal(ultimo.reproduccion_actual, null);
  for (const f of [fa, fb, fp]) {
    await f.esperarEstado((d) => d.version === 4);
    const versiones = f.estados().map((d) => d.version);
    assert.deepEqual(versiones, [...versiones].sort((x, y) => x - y), 'en orden');
    assert.deepEqual(versiones, [0, 1, 2, 3, 4]);
  }
}));

test('ping: comentario ": ping" a todas las conexiones', opciones, conEntorno(async (e, abrir) => {
  const f = await abrir({ dispositivo: A });
  await f.esperarEstado();
  e.temporizadores.dispararIntervalos();
  const ping = await f.esperar((m) => m.comentario === 'ping');
  assert.deepEqual(ping.lineas, [': ping']);
}));

test('errores antes de abrir el flujo: JSON normal (404, 410, 400)', opciones, conEntorno(async (e) => {
  const pedir = (sesion, cabeceras = {}) => e.pedir('GET', `/api/sesiones/${sesion}/cola/flujo`, { cabeceras });
  const casos = [
    [await pedir('SES-NADA'), 404, 'sesion_inexistente'],
    [await pedir('SES-MOCK-002'), 410, 'sesion_cerrada'],
    [await pedir('SES-MOCK-003'), 410, 'qr_desactivado'],
    [await pedir(SESION, { 'X-Dispositivo-Id': 'no-es-uuid' }), 400, 'dispositivo_id_invalido'],
  ];
  for (const [r, status, codigo] of casos) {
    assert.equal(r.status, status);
    assert.match(r.headers.get('content-type'), /application\/json/);
    assert.equal(r.body.error.codigo, codigo);
  }
}));

test('reconexión: se ignora Last-Event-ID y se envía el estado actual', opciones, conEntorno(async (e) => {
  await e.solicitar(A, cancion(1));
  const r = await fetch(`${e.url}/api/sesiones/${SESION}/cola/flujo`, { headers: { 'Last-Event-ID': '0' } });
  const reader = r.body.getReader();
  let texto = '';
  while (!texto.includes('event: estado')) texto += new TextDecoder().decode((await reader.read()).value);
  await reader.cancel();
  assert.match(texto, /id: 1\nevent: estado\ndata: \{"sesion_id":"SES-MOCK-001","version":1,/);
}));

test('C12: solo cuentan como activos los dispositivos con flujo abierto y X-Dispositivo-Id; gracia de 20 s', opciones, conEntorno(async (e, abrir) => {
  const activos = () => e.conectividad.contarActivos(ESTABLECIMIENTO);
  const publica = await abrir();
  await publica.esperarEstado();
  assert.equal(activos(), 0); // la vista pública no cuenta
  await e.cola(B); // pedir la cola tampoco: no es conectividad sostenida
  assert.equal(activos(), 0);

  const fa = await abrir({ dispositivo: A });
  const fa2 = await abrir({ dispositivo: A }); // dos conexiones del mismo dispositivo cuentan una vez
  await fa.esperarEstado();
  await fa2.esperarEstado();
  assert.equal(activos(), 1);
  assert.equal((await e.cola(null)).body.reglas_votacion.dispositivos_activos, 1);

  await fa.cerrar();
  await fa2.cerrar();
  await e.servicios.flujo.esperarConexiones(1);
  assert.equal(activos(), 1); // dentro de la gracia
  e.reloj.avanzar(19_999);
  assert.equal(activos(), 1);
  e.reloj.avanzar(2);
  assert.equal(activos(), 0); // gracia vencida
  // Se programó la revisión del rango al vencer la gracia (temporizador falso)
  assert.ok([...e.temporizadores.pendientes.values()].some((t) => t.ms === 20_001));

  await e.servicios.flujo.inactivo(); // registros de conexión/desconexión escritos
  const { rows } = await e.pool.query(`SELECT ds.ultima_conexion, ds.ultima_desconexion FROM dispositivo_sesion ds
    JOIN dispositivo d USING (id_dispositivo) WHERE d.identificador_seudonimo = $1`, [A]);
  assert.ok(rows[0].ultima_conexion !== null);
  assert.ok(rows[0].ultima_desconexion !== null);
}));

test('reconectar dentro de la gracia no cambia el conteo', opciones, conEntorno(async (e, abrir) => {
  const f1 = await abrir({ dispositivo: A });
  await f1.esperarEstado();
  await f1.cerrar();
  await e.servicios.flujo.esperarConexiones(0);
  e.reloj.avanzar(3000); // retry del cliente
  const f2 = await abrir({ dispositivo: A });
  await f2.esperarEstado();
  e.reloj.avanzar(60_000);
  assert.equal(e.conectividad.contarActivos(ESTABLECIMIENTO), 1);
}));

test('cambio de rango por conectividad: nueva versión y reenvío a las conexiones del establecimiento', opciones, conEntorno(async (e, abrir) => {
  e.activos(10); // 10 virtuales → intervalo 2
  const publica = await abrir();
  const inicial = await publica.esperarEstado();
  assert.deepEqual(inicial.reglas_votacion, { dispositivos_activos: 10, intervalo_canciones: 2 });

  const fa = await abrir({ dispositivo: A }); // 11 activos → intervalo 4: cambia el rango
  const cambio = await publica.esperarEstado((d) => d.reglas_votacion.intervalo_canciones === 4);
  assert.ok(cambio.version > inicial.version);
  assert.equal(cambio.reglas_votacion.dispositivos_activos, 11);
  const propio = await fa.esperarEstado((d) => d.reglas_votacion.intervalo_canciones === 4);
  assert.equal(propio.mi_votacion.intervalo_canciones, 4);

  // Se va A: dentro de la gracia sigue el rango; al vencer (temporizador) vuelve a 2 y se reenvía.
  await fa.cerrar();
  await e.servicios.flujo.esperarConexiones(1);
  e.reloj.avanzar(20_001);
  await e.temporizadores.ejecutarPendientes();
  const vuelta = await publica.esperarEstado((d) => d.reglas_votacion.intervalo_canciones === 2 && d.version > cambio.version);
  assert.equal(vuelta.reglas_votacion.dispositivos_activos, 10);
}));

test('apagado: cerrar() termina los flujos abiertos', opciones, conEntorno(async (e, abrir) => {
  const f = await abrir({ dispositivo: A });
  await f.esperarEstado();
  await e.servicios.flujo.cerrar();
  await f.fin;
  assert.equal(f.terminado(), true);
  assert.equal(e.servicios.flujo.totalConexiones(), 0);
}));
