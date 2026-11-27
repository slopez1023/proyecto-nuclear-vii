'use strict';
/**
 * Pruebas de integración FASE 5 — Gestión de pantalla pública desde el panel DJ:
 *  - GET/POST/POST regenerar/DELETE de /api/admin/sesiones/:id/display
 *  - Separación real entre conexión SSE (sse_conectada) y propiedad del lease (estado_control)
 *  - Estados diferenciados: sin_crear, pantalla_creada, pantalla_conectada, control_autorizado,
 *    control_perdido, control_liberado, pantalla_revocada, sesion_cerrada
 *  - Compatibilidad con QR desactivado y aislamiento entre establecimientos
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { crearEntornoE5 } = require('./helpers/e5');
const { SESION, ESTABLECIMIENTO } = require('./helpers/e4');

async function abrirSse(url, headers = {}) {
  const ac = new AbortController();
  const res = await fetch(url, { headers, signal: ac.signal });
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  const eventos = [];
  const leerHasta = async (pred, timeoutMs = 4000) => {
    const fin = Date.now() + timeoutMs;
    while (!pred(eventos)) {
      const rem = fin - Date.now();
      if (rem <= 0) throw new Error('Timeout esperando evento SSE');
      const chunk = await Promise.race([
        reader.read(),
        new Promise((_, rej) => setTimeout(() => rej(new Error('Timeout read SSE')), rem)),
      ]);
      if (chunk.done) break;
      buf += dec.decode(chunk.value, { stream: true });
      let idx;
      while ((idx = buf.indexOf('\n\n')) >= 0) {
        const bloque = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        if (!bloque.trim() || bloque.startsWith(':')) continue;
        let event = 'message';
        let data = '';
        for (const linea of bloque.split('\n')) {
          if (linea.startsWith('event:')) event = linea.slice(6).trim();
          else if (linea.startsWith('data:')) data += linea.slice(5).trim();
        }
        eventos.push({ event, data: data ? JSON.parse(data) : null });
      }
    }
    return eventos;
  };
  return { res, eventos, leerHasta, cerrar: () => ac.abort() };
}

test('FASE 5: ciclo completo de pantalla pública en panel DJ, separación SSE vs lease y QR desactivado', async () => {
  const e = await crearEntornoE5();
  let sseAdmin = null;
  let sseTv = null;
  try {
    // Aislamiento: otro establecimiento recibe 404
    const ajeno = await e.pedirAdmin('GET', `/sesiones/${SESION}/display`, { auth: e.adminOtro });
    assert.equal(ajeno.status, 404);

    // 1. Estado inicial sin crear
    const d0 = await e.pedirAdmin('GET', `/sesiones/${SESION}/display`, { auth: e.dj });
    assert.equal(d0.status, 200);
    assert.equal(d0.body.existe, false);
    assert.equal(d0.body.estado_pantalla, 'sin_crear');
    assert.equal(d0.body.estado_control, 'sin_control');
    assert.equal(d0.body.sse_conectada, false);
    assert.equal(d0.body.lease_vigente, false);

    // Conectar SSE del panel DJ
    sseAdmin = await abrirSse(`${e.url}/api/admin/sesiones/${SESION}/flujo`, e.dj);
    await sseAdmin.leerHasta((evs) => evs.some((x) => x.event === 'estado'));

    // 2. Crear y recuperar display idempotentemente desde panel DJ
    const d1 = await e.pedirAdmin('POST', `/sesiones/${SESION}/display`, { auth: e.dj, cuerpo: {} });
    assert.equal(d1.status, 200);
    assert.equal(d1.body.existe, true);
    assert.equal(d1.body.estado_pantalla, 'pantalla_creada');
    assert.equal(d1.body.estado_control, 'sin_control');
    assert.ok(d1.body.display_token.startsWith('disp-'));
    assert.equal(d1.body.ruta_publica, `/public/${d1.body.display_token}`);

    const d1Bis = await e.pedirAdmin('POST', `/sesiones/${SESION}/display`, { auth: e.dj, cuerpo: {} });
    assert.equal(d1Bis.body.display_token, d1.body.display_token);
    await sseAdmin.leerHasta((evs) => evs.some((x) => x.event === 'display_estado' && x.data.evento === 'creado'));

    // 3. Conectar SSE público -> sse_conectada = true (pantalla_conectada), lease sigue en sin_control
    sseTv = await abrirSse(`${e.url}/api/public/${d1.body.display_token}/flujo`);
    await sseTv.leerHasta((evs) => evs.some((x) => x.event === 'estado'));
    await sseAdmin.leerHasta((evs) => evs.some((x) => x.event === 'display_estado' && x.data.sse_conectada === true));

    const dConectada = (await e.pedirAdmin('GET', `/sesiones/${SESION}/display`, { auth: e.dj })).body;
    assert.equal(dConectada.sse_conectada, true);
    assert.equal(dConectada.lease_vigente, false);
    assert.equal(dConectada.estado_pantalla, 'pantalla_conectada');
    assert.equal(dConectada.estado_control, 'sin_control');
    assert.equal(e.conectividad.contarActivos(SESION), 0);

    // 4. Cambiar salida a pantalla_publica, generar claim_code y vincular TV -> control_autorizado
    await e.pedirAdmin('PUT', '/sonido', { auth: e.dj, cuerpo: { salida: 'pantalla_publica' } });
    const aut = await e.pedirAdmin('POST', `/sesiones/${SESION}/display/autorizar-control`, { auth: e.dj, cuerpo: {} });
    assert.equal(aut.status, 200);
    const dPend = (await e.pedirAdmin('GET', `/sesiones/${SESION}/display`, { auth: e.dj })).body;
    assert.equal(dPend.claim_pendiente, true);
    assert.equal(JSON.stringify(dPend).includes(aut.body.claim_code), false);

    const reclamo = await e.pedir('POST', `/api/public/${d1.body.display_token}/reproduccion/reclamar`, {
      cuerpo: { claim_code: aut.body.claim_code },
    });
    assert.equal(reclamo.status, 200);

    const dAut = (await e.pedirAdmin('GET', `/sesiones/${SESION}/display`, { auth: e.dj })).body;
    assert.equal(dAut.sse_conectada, true);
    assert.equal(dAut.lease_vigente, true);
    assert.equal(dAut.estado_control, 'control_autorizado');
    assert.equal(dAut.estado_pantalla, 'control_autorizado');
    assert.equal(JSON.stringify(dAut).includes(reclamo.body.control_token), false);

    // 5. Expirar lease (>25s) manteniendo SSE conectado -> estado_control = control_perdido mientras sse_conectada sigue true
    e.reloj.avanzar(26_000);
    const dPerdido = (await e.pedirAdmin('GET', `/sesiones/${SESION}/display`, { auth: e.dj })).body;
    assert.equal(dPerdido.sse_conectada, true);
    assert.equal(dPerdido.lease_vigente, false);
    assert.equal(dPerdido.estado_control, 'control_perdido');
    assert.equal(dPerdido.estado_pantalla, 'control_perdido');

    // 6. Re-autorizar, reclamar y liberar control desde DJ -> estado_control = control_liberado
    const aut2 = (await e.pedirAdmin('POST', `/sesiones/${SESION}/display/autorizar-control`, { auth: e.dj, cuerpo: {} })).body;
    await e.pedir('POST', `/api/public/${d1.body.display_token}/reproduccion/reclamar`, { cuerpo: { claim_code: aut2.claim_code } });
    const lib = await e.pedirAdmin('POST', `/sesiones/${SESION}/display/liberar-control`, { auth: e.dj, cuerpo: {} });
    assert.equal(lib.status, 200);
    const dLib = (await e.pedirAdmin('GET', `/sesiones/${SESION}/display`, { auth: e.dj })).body;
    assert.equal(dLib.sse_conectada, true);
    assert.equal(dLib.lease_vigente, false);
    assert.equal(dLib.estado_control, 'control_liberado');
    assert.equal(dLib.estado_pantalla, 'control_liberado');

    // 7. Compatibilidad con QR desactivado
    await e.pedirAdmin('PATCH', `/sesiones/${SESION}/qr`, { cuerpo: { activo: false } });
    const dQrOff = await e.pedirAdmin('GET', `/sesiones/${SESION}/display`, { auth: e.dj });
    assert.equal(dQrOff.status, 200);
    assert.equal(dQrOff.body.qr_estado, 'inactivo');
    assert.equal(dQrOff.body.estado_control, 'control_liberado');

    // 8. Regenerar enlace -> viejo token responde 404 y nuevo queda activo
    const dReg = await e.pedirAdmin('POST', `/sesiones/${SESION}/display/regenerar`, { auth: e.dj, cuerpo: {} });
    assert.equal(dReg.status, 200);
    assert.notEqual(dReg.body.display_token, d1.body.display_token);
    assert.equal((await e.pedir('GET', `/api/public/${d1.body.display_token}/estado`)).status, 404);
    assert.equal((await e.pedir('GET', `/api/public/${dReg.body.display_token}/estado`)).status, 200);

    // 9. Revocar enlace -> estado_pantalla = pantalla_revocada y nuevo enlace responde 404
    const dRev = await e.pedirAdmin('DELETE', `/sesiones/${SESION}/display`, { auth: e.dj });
    assert.equal(dRev.status, 200);
    assert.equal(dRev.body.existe, false);
    assert.equal(dRev.body.estado_pantalla, 'pantalla_revocada');
    assert.equal((await e.pedir('GET', `/api/public/${dReg.body.display_token}/estado`)).status, 404);

    // 10. Cerrar sesión -> estado_pantalla = sesion_cerrada y POST /display devuelve 409 sesion_cerrada
    await e.pedirAdmin('POST', `/sesiones/${SESION}/desactivar`, { cuerpo: {} });
    const dCerrada = await e.pedirAdmin('GET', `/sesiones/${SESION}/display`, { auth: e.dj });
    assert.equal(dCerrada.status, 200);
    assert.equal(dCerrada.body.estado_pantalla, 'sesion_cerrada');
    const postCerrada = await e.pedirAdmin('POST', `/sesiones/${SESION}/display`, { auth: e.dj, cuerpo: {} });
    assert.equal(postCerrada.status, 409);
    assert.equal(postCerrada.body.error.codigo, 'sesion_cerrada');
  } finally {
    if (sseTv) sseTv.cerrar();
    if (sseAdmin) sseAdmin.cerrar();
    await e.cerrar();
  }
});
