'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { crearEntornoE5 } = require('./helpers/e5');
const { SESION, uuid, cancion, abrirFlujo } = require('./helpers/e4');

test('F8.3 y F8.4: persistencia de dispositivo 30 min, clasificación e integridad de votación sin inflar activos', async () => {
  const e = await crearEntornoE5();
  try {
    const dev1 = uuid(10);
    const dev2 = uuid(11);

    // 1) dev1 pide la cola y abre SSE; dev2 pide la cola y envía solicitud
    await e.solicitar(dev2, cancion(1));
    const rSol = await e.pedir('GET', `/api/sesiones/${SESION}/cola`, { dispositivo: dev1 });
    assert.equal(rSol.status, 200);
    const idSol = rSol.body.cola[0].id_solicitud;

    // dev1 vota por la canción
    assert.equal((await e.votar(dev1, idSol)).status, 201);

    // Abrir conexión SSE real con dev1
    const sse = await abrirFlujo(e.url, { dispositivo: dev1 });
    assert.equal(sse.respuesta.status, 200);
    await sse.esperarEstado();

    let panel = await e.pedirAdmin('GET', '/panel');
    assert.equal(panel.body.dispositivos_activos, 1);
    assert.equal(panel.body.dispositivos_estado.activos, 1);
    assert.equal(panel.body.dispositivos_estado.inactivos_recientes, 1); // dev2 dentro de 30 min
    assert.equal(panel.body.dispositivos_estado.desconectados, 0);

    // 2) Desconectar SSE de dev1 y vencer la ventana de gracia (20s -> avanzamos 30s)
    await sse.cerrar();
    await new Promise((r) => setTimeout(r, 80));
    e.reloj.avanzar(30_000);
    e.app.locals.e4.conectividad.revisar(SESION);

    panel = await e.pedirAdmin('GET', '/panel');
    assert.equal(panel.body.dispositivos_activos, 0, 'Inactivos recientes NO deben inflar dispositivos_activos');
    assert.equal(panel.body.dispositivos_estado.activos, 0);
    assert.equal(panel.body.dispositivos_estado.inactivos_recientes, 2);
    assert.equal(panel.body.dispositivos_estado.desconectados, 0);

    // 3) Avanzar 31 minutos: ambos pasan a desconectados
    e.reloj.avanzar(31 * 60 * 1000);
    panel = await e.pedirAdmin('GET', '/panel');
    assert.equal(panel.body.dispositivos_activos, 0);
    assert.equal(panel.body.dispositivos_estado.inactivos_recientes, 0);
    assert.equal(panel.body.dispositivos_estado.desconectados, 2);

    // 4) dev1 se reconecta mediante latido / cola: mantiene su voto y NO duplica dispositivo_sesion ni permite doble voto
    const lat = await e.pedir('POST', `/api/sesiones/${SESION}/latido`, { dispositivo: dev1 });
    assert.equal(lat.status, 200);

    const colaTrasReconexion = await e.pedir('GET', `/api/sesiones/${SESION}/cola`, { dispositivo: dev1 });
    assert.equal(colaTrasReconexion.status, 200);
    assert.equal(colaTrasReconexion.body.cola[0].ya_voto, true);

    const dobleVoto = await e.votar(dev1, idSol);
    assert.equal(dobleVoto.status, 409);

    const filasDs = await e.pool.query(
      `SELECT COUNT(*)::int AS total FROM dispositivo_sesion ds
       JOIN dispositivo d ON d.id_dispositivo = ds.id_dispositivo
       WHERE ds.id_sesion = $1 AND d.identificador_seudonimo = $2`,
      [SESION, dev1],
    );
    assert.equal(filasDs.rows[0].total, 1, 'No debe duplicar dispositivo_sesion al reconectar');

    // 5) Al cerrar sesión, latido devuelve 410 sesion_cerrada
    await e.pedirAdmin('POST', `/sesiones/${SESION}/desactivar`, { cuerpo: {} });
    const latCerrada = await e.pedir('POST', `/api/sesiones/${SESION}/latido`, { dispositivo: dev1 });
    assert.equal(latCerrada.status, 410);
  } finally {
    await e.cerrar();
  }
});
