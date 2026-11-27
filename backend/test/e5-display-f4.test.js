'use strict';
/**
 * Pruebas de integración FASE 4 — Integración Audiovisual Segura:
 *  - Autorización con claim_code (entropía, TTL 120s, un solo uso, 5 fallos, rate-limit, cero secretos en logs/errores)
 *  - Exclusividad de lease (409 control_en_uso, expiración a 25s, liberación por DJ, latido cada 10s sin tocar e5_sonido.ultimo_latido)
 *  - Cambio de salida (panel <-> equipo_local <-> pantalla_publica) invalidando leases y emitiendo SSE sonido
 *  - reproduccion_uid UUID persistente en BD, repetición consecutiva, reporte atrasado, tiempo efectivo con pausas, concurrencia 5x ended
 *  - Política diferenciada de error (validación yt_error_*, 1 incidente deduplicado en e5_registro + SSE DJ, sin auto-avanzar)
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { crearEntornoE5 } = require('./helpers/e5');
const { SESION, ESTABLECIMIENTO, cancion, uuid } = require('./helpers/e4');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

test('FASE 4: claim_code (ausente, erróneo, expirado, reutilizado), fuerza bruta (5 intentos), rate-limit y cero secretos en auditoría', async () => {
  const e = await crearEntornoE5();
  try {
    const display = await e.e5.display.asegurarDisplay(ESTABLECIMIENTO, SESION);
    const token = display.display_token;

    // Sin salida pantalla_publica -> rechaza sin quemar claim
    await e.pedirAdmin('PUT', '/sonido', { cuerpo: { salida: 'pantalla_publica', volumen: 75, silenciado: false } });
    const aut = await e.pedirAdmin('POST', `/sesiones/${SESION}/display/autorizar-control`, { auth: e.dj, cuerpo: {} });
    assert.equal(aut.status, 200);
    const claimCode = aut.body.claim_code;
    assert.ok(typeof claimCode === 'string' && claimCode.length >= 16);
    assert.equal(aut.body.ttl_segundos, 120);

    // 1. Sin claim_code -> 400 sin filtrar nada
    const sinClaim = await e.pedir('POST', `/api/public/${token}/reproduccion/reclamar`, { cuerpo: {} });
    assert.equal(sinClaim.status, 400);

    // 2. Código expirado (>120s) -> 401
    e.reloj.avanzar(121_000);
    const expirado = await e.pedir('POST', `/api/public/${token}/reproduccion/reclamar`, { cuerpo: { claim_code: claimCode } });
    assert.equal(expirado.status, 401);

    // 3. Fuerza bruta: 5 intentos fallidos invalidan el nuevo código (el 6º con el código bueno falla!)
    const aut2 = await e.pedirAdmin('POST', `/sesiones/${SESION}/display/autorizar-control`, { auth: e.dj, cuerpo: {} });
    const codigoBueno = aut2.body.claim_code;
    for (let i = 1; i <= 4; i++) {
      const rErr = await e.pedir('POST', `/api/public/${token}/reproduccion/reclamar`, { cuerpo: { claim_code: `malo-${i}` } });
      assert.equal(rErr.status, 401);
      assert.equal(JSON.stringify(rErr.body).includes(codigoBueno), false);
    }
    const quinto = await e.pedir('POST', `/api/public/${token}/reproduccion/reclamar`, { cuerpo: { claim_code: 'malo-5' } });
    assert.equal(quinto.status, 429);
    assert.equal(quinto.body.error.codigo, 'claim_bloqueado');

    const intentoPostBloqueo = await e.pedir('POST', `/api/public/${token}/reproduccion/reclamar`, { cuerpo: { claim_code: codigoBueno } });
    assert.equal(intentoPostBloqueo.status, 401);

    // 4. Rate-limit acumulado por IP/display (10 fallos en 15 min -> 429 demasiados_intentos)
    const aut3 = await e.pedirAdmin('POST', `/sesiones/${SESION}/display/autorizar-control`, { auth: e.dj, cuerpo: {} });
    const codigoValido3 = aut3.body.claim_code;
    for (let i = 0; i < 4; i++) {
      await e.pedir('POST', `/api/public/${token}/reproduccion/reclamar`, { cuerpo: { claim_code: `rl-${i}` } });
    }
    const rl = await e.pedir('POST', `/api/public/${token}/reproduccion/reclamar`, { cuerpo: { claim_code: 'otro' } });
    assert.equal(rl.status, 429);
    assert.equal(rl.body.error.codigo, 'demasiados_intentos');

    // Al pasar 15 min, se limpia la ventana de rate limit y puede reclamar una sola vez
    e.reloj.avanzar(16 * 60_000);
    const aut4 = await e.pedirAdmin('POST', `/sesiones/${SESION}/display/autorizar-control`, { auth: e.dj, cuerpo: {} });
    const codigoFinal = aut4.body.claim_code;
    assert.notEqual(codigoFinal, codigoValido3);

    const reclamoOk = await e.pedir('POST', `/api/public/${token}/reproduccion/reclamar`, { cuerpo: { claim_code: codigoFinal } });
    assert.equal(reclamoOk.status, 200);
    const controlToken = reclamoOk.body.control_token;
    assert.ok(typeof controlToken === 'string' && controlToken.length >= 24);
    assert.equal(reclamoOk.body.ttl_segundos, 25);
    assert.equal(reclamoOk.body.intervalo_latido_segundos, 10);

    // Reutilizar el mismo claim_code tras liberar control -> 401
    await e.pedirAdmin('POST', `/sesiones/${SESION}/display/liberar-control`, { auth: e.dj, cuerpo: {} });
    const reuso = await e.pedir('POST', `/api/public/${token}/reproduccion/reclamar`, { cuerpo: { claim_code: codigoFinal } });
    assert.equal(reuso.status, 401);

    // Verificar auditoría en e5_registro y eventos sin ningún secreto
    const regs = await e.pool.query("SELECT accion, detalle::text AS d FROM e5_registro WHERE accion LIKE 'display_%'");
    assert.ok(regs.rows.some((r) => r.accion === 'display_control_autorizado'));
    assert.ok(regs.rows.some((r) => r.accion === 'display_control_reclamado'));
    assert.ok(regs.rows.some((r) => r.accion === 'display_control_liberado'));
    const dump = JSON.stringify(regs.rows) + JSON.stringify(e.eventos);
    for (const secreto of [claimCode, codigoBueno, codigoValido3, codigoFinal, controlToken, token]) {
      assert.equal(dump.includes(secreto), false, 'Nunca debe aparecer un secreto en registro o eventos');
    }
  } finally {
    await e.cerrar();
  }
});

test('FASE 4: exclusividad del lease (409 control_en_uso), latidos 10s, expiración 25s y liberación DJ', async () => {
  const e = await crearEntornoE5();
  try {
    const token = (await e.e5.display.asegurarDisplay(ESTABLECIMIENTO, SESION)).display_token;
    await e.pedirAdmin('PUT', '/sonido', { cuerpo: { salida: 'pantalla_publica' } });

    const c1 = (await e.pedirAdmin('POST', `/sesiones/${SESION}/display/autorizar-control`, { auth: e.dj, cuerpo: {} })).body.claim_code;
    const leader = await e.pedir('POST', `/api/public/${token}/reproduccion/reclamar`, { cuerpo: { claim_code: c1 } });
    assert.equal(leader.status, 200);
    const token1 = leader.body.control_token;

    // 2do navegador intenta reclamar con nuevo claim_code mientras lease del 1ro sigue vigente -> 409 control_en_uso
    const c2 = (await e.pedirAdmin('POST', `/sesiones/${SESION}/display/autorizar-control`, { auth: e.dj, cuerpo: {} })).body.claim_code;
    const intruder = await e.pedir('POST', `/api/public/${token}/reproduccion/reclamar`, { cuerpo: { claim_code: c2 } });
    assert.equal(intruder.status, 409);
    assert.equal(intruder.body.error.codigo, 'control_en_uso');

    // Latido del líder cada 10s renueva lease y NO toca e5_sonido.ultimo_latido
    e.reloj.avanzar(10_000);
    const lat1 = await e.pedir('POST', `/api/public/${token}/latido`, { cabeceras: { 'X-Display-Control': token1 } });
    assert.equal(lat1.status, 200);
    assert.equal(lat1.body.vigente, true);
    assert.equal(lat1.body.salida, 'pantalla_publica');

    const sonidoRow = (await e.pool.query('SELECT ultimo_latido FROM e5_sonido WHERE id_establecimiento = $1', [ESTABLECIMIENTO])).rows[0];
    assert.equal(sonidoRow.ultimo_latido, null);

    // Otro token es rechazado con 403 en latido
    const latAjeno = await e.pedir('POST', `/api/public/${token}/latido`, { cabeceras: { 'X-Display-Control': 'otro-token-ajeno' } });
    assert.equal(latAjeno.status, 403);

    // Expiración a los 25s sin latido permite reclamar con c2 (no consumido durante el 409 anterior!)
    e.reloj.avanzar(26_000);
    const latVencido = await e.pedir('POST', `/api/public/${token}/latido`, { cabeceras: { 'X-Display-Control': token1 } });
    assert.equal(latVencido.status, 401);

    const reclamo2 = await e.pedir('POST', `/api/public/${token}/reproduccion/reclamar`, { cuerpo: { claim_code: c2 } });
    assert.equal(reclamo2.status, 200);
    const token2 = reclamo2.body.control_token;
    assert.notEqual(token2, token1);

    // Liberación explícita por el DJ permite reclamar inmediatamente con nuevo código
    const lib = await e.pedirAdmin('POST', `/sesiones/${SESION}/display/liberar-control`, { auth: e.dj, cuerpo: {} });
    assert.equal(lib.status, 200);
    assert.equal(lib.body.liberado, true);
    const latTrasLiberar = await e.pedir('POST', `/api/public/${token}/latido`, { cabeceras: { 'X-Display-Control': token2 } });
    assert.equal(latTrasLiberar.status, 401);
  } finally {
    await e.cerrar();
  }
});

test('FASE 4: las 4 transiciones de salida invalidan lease/avances y emiten SSE sonido incluso con QR inactivo', async () => {
  const e = await crearEntornoE5();
  let sseTv = null;
  let sseAdmin = null;
  try {
    const token = (await e.e5.display.asegurarDisplay(ESTABLECIMIENTO, SESION)).display_token;
    const lista = (await e.pedirAdmin('POST', '/listas', { cuerpo: { nombre: 'Trans', predeterminada: true } })).body;
    await e.pedirAdmin('POST', `/listas/${lista.id_lista}/canciones`, { cuerpo: { youtube_video_id: cancion(1) } });
    await e.pedirAdmin('POST', `/sesiones/${SESION}/reproduccion/iniciar`, { cuerpo: {} });
    const uid = (await e.pedir('GET', `/api/public/${token}/estado`)).body.actual.reproduccion_uid;

    sseTv = await abrirSse(`${e.url}/api/public/${token}/flujo`);
    await sseTv.leerHasta((evs) => evs.some((x) => x.event === 'estado'));
    sseAdmin = await abrirSse(`${e.url}/api/admin/sesiones/${SESION}/flujo`, e.dj);
    await sseAdmin.leerHasta((evs) => evs.some((x) => x.event === 'estado'));
    // El SSE de operador no cuenta como dispositivo cliente
    assert.equal(e.conectividad.contarActivos(SESION), 0);

    // 1. panel -> pantalla_publica
    const p1 = await e.pedirAdmin('PUT', '/sonido', { auth: e.dj, cuerpo: { salida: 'pantalla_publica', volumen: 65, silenciado: false } });
    assert.equal(p1.status, 200);
    assert.equal(p1.body.salida, 'pantalla_publica');
    await sseTv.leerHasta((evs) => evs.filter((x) => x.event === 'sonido').at(-1)?.data?.salida === 'pantalla_publica');
    await sseAdmin.leerHasta((evs) => evs.filter((x) => x.event === 'sonido').at(-1)?.data?.salida === 'pantalla_publica');

    const c1 = (await e.pedirAdmin('POST', `/sesiones/${SESION}/display/autorizar-control`, { auth: e.dj, cuerpo: {} })).body.claim_code;
    const ct1 = (await e.pedir('POST', `/api/public/${token}/reproduccion/reclamar`, { cuerpo: { claim_code: c1 } })).body.control_token;

    // 2. pantalla_publica -> panel: invalida lease, rechaza latido y avances posteriores
    await e.pedirAdmin('PUT', '/sonido', { auth: e.dj, cuerpo: { salida: 'panel' } });
    await sseTv.leerHasta((evs) => evs.filter((x) => x.event === 'sonido').at(-1)?.data?.salida === 'panel');
    await sseAdmin.leerHasta((evs) => evs.filter((x) => x.event === 'sonido').at(-1)?.data?.salida === 'panel');

    assert.equal((await e.pedir('POST', `/api/public/${token}/latido`, { cabeceras: { 'X-Display-Control': ct1 } })).status, 409);
    assert.equal((await e.pedir('POST', `/api/public/${token}/reproduccion/avanzar`, {
      cabeceras: { 'X-Display-Control': ct1 },
      cuerpo: { tipo: 'ended', reproduccion_uid: uid },
    })).status, 409);

    // Preparar equipo_local y probar transición directa 3. equipo_local -> pantalla_publica
    await e.pedirAdmin('PUT', '/sonido', { auth: e.dj, cuerpo: { salida: 'equipo_local' } });
    await sseAdmin.leerHasta((evs) => evs.filter((x) => x.event === 'sonido').at(-1)?.data?.salida === 'equipo_local');

    await e.pedirAdmin('PUT', '/sonido', { auth: e.dj, cuerpo: { salida: 'pantalla_publica' } });
    await sseTv.leerHasta((evs) => evs.filter((x) => x.event === 'sonido').at(-1)?.data?.salida === 'pantalla_publica');
    await sseAdmin.leerHasta((evs) => evs.filter((x) => x.event === 'sonido').at(-1)?.data?.salida === 'pantalla_publica');

    // Token antiguo sigue rechazado (401); nuevo reclamo funciona
    assert.equal((await e.pedir('POST', `/api/public/${token}/latido`, { cabeceras: { 'X-Display-Control': ct1 } })).status, 401);
    const c2 = (await e.pedirAdmin('POST', `/sesiones/${SESION}/display/autorizar-control`, { auth: e.dj, cuerpo: {} })).body.claim_code;
    const ct2 = (await e.pedir('POST', `/api/public/${token}/reproduccion/reclamar`, { cuerpo: { claim_code: c2 } })).body.control_token;

    // 4. pantalla_publica -> equipo_local: invalida lease, rechaza latido y avanzar
    await e.pedirAdmin('PUT', '/sonido', { auth: e.dj, cuerpo: { salida: 'equipo_local' } });
    await sseTv.leerHasta((evs) => evs.filter((x) => x.event === 'sonido').at(-1)?.data?.salida === 'equipo_local');
    await sseAdmin.leerHasta((evs) => evs.filter((x) => x.event === 'sonido').at(-1)?.data?.salida === 'equipo_local');

    const latTrasCambio = await e.pedir('POST', `/api/public/${token}/latido`, { cabeceras: { 'X-Display-Control': ct2 } });
    assert.equal(latTrasCambio.status, 409);
    assert.equal(latTrasCambio.body.error.codigo, 'salida_no_autorizada');
    assert.equal((await e.pedir('POST', `/api/public/${token}/reproduccion/avanzar`, {
      cabeceras: { 'X-Display-Control': ct2 },
      cuerpo: { tipo: 'error', reproduccion_uid: uid, codigo_error: 'yt_error_150' },
    })).status, 409);

    // Hallazgo B: desactivar QR mantiene vivo SSE del operador (/api/admin/sesiones/:id/flujo), pero clientes Android reciben 410
    await e.pedirAdmin('PATCH', `/sesiones/${SESION}/qr`, { cuerpo: { activo: false } });
    const clienteQrOff = await e.pedir('GET', `/api/sesiones/${SESION}/cola/flujo`);
    assert.equal(clienteQrOff.status, 410);

    await e.pedirAdmin('PUT', '/sonido', { auth: e.dj, cuerpo: { salida: 'pantalla_publica' } });
    await sseAdmin.leerHasta((evs) => evs.filter((x) => x.event === 'sonido').length >= 6);
    assert.equal(sseAdmin.eventos.filter((x) => x.event === 'sonido').at(-1).data.salida, 'pantalla_publica');
    assert.equal(sseAdmin.eventos.some((x) => x.event === 'sesion_cerrada'), false);
    assert.equal(e.conectividad.contarActivos(SESION), 0);
  } finally {
    if (sseTv) sseTv.cerrar();
    if (sseAdmin) sseAdmin.cerrar();
    await e.cerrar();
  }
});

test('FASE 4: reproduccion_uid único en repeticiones, reporte atrasado, pausas, 5x ended concurrentes y política de error', async () => {
  const e = await crearEntornoE5();
  let sseTv = null;
  let sseDj = null;
  try {
    const token = (await e.e5.display.asegurarDisplay(ESTABLECIMIENTO, SESION)).display_token;
    await e.pedirAdmin('PUT', '/sonido', { auth: e.dj, cuerpo: { salida: 'pantalla_publica' } });

    const lista = (await e.pedirAdmin('POST', '/listas', { cuerpo: { nombre: 'Loop', predeterminada: true } })).body;
    await e.pedirAdmin('POST', `/listas/${lista.id_lista}/canciones`, { cuerpo: { youtube_video_id: cancion(1) } });
    await e.pedirAdmin('POST', `/sesiones/${SESION}/reproduccion/iniciar`, { cuerpo: {} });

    sseTv = await abrirSse(`${e.url}/api/public/${token}/flujo`);
    await sseTv.leerHasta((evs) => evs.some((x) => x.event === 'estado' && x.data.actual));
    sseDj = await abrirSse(`${e.url}/api/sesiones/${SESION}/cola/flujo`);
    await sseDj.leerHasta((evs) => evs.some((x) => x.event === 'estado'));

    const c = (await e.pedirAdmin('POST', `/sesiones/${SESION}/display/autorizar-control`, { auth: e.dj, cuerpo: {} })).body.claim_code;
    const ct = (await e.pedir('POST', `/api/public/${token}/reproduccion/reclamar`, { cuerpo: { claim_code: c } })).body.control_token;

    const est1 = (await e.pedir('GET', `/api/public/${token}/estado`)).body;
    const uid1 = est1.actual.reproduccion_uid;
    assert.match(uid1, UUID_RE);

    // Error inválido (código arbitrario) -> 400
    const errInvalido = await e.pedir('POST', `/api/public/${token}/reproduccion/avanzar`, {
      cabeceras: { 'X-Display-Control': ct },
      cuerpo: { tipo: 'error', reproduccion_uid: uid1, codigo_error: 'yt_error_999' },
    });
    assert.equal(errInvalido.status, 400);

    // Error válido (yt_error_150) -> 1 incidente en registro + SSE al DJ, NO al TV, NO avanza ni inhabilita canción
    const errValido = await e.pedir('POST', `/api/public/${token}/reproduccion/avanzar`, {
      cabeceras: { 'X-Display-Control': ct },
      cuerpo: { tipo: 'error', reproduccion_uid: uid1, codigo_error: 'yt_error_150' },
    });
    assert.equal(errValido.status, 200);
    assert.equal(errValido.body.avanzado, false);
    assert.equal(errValido.body.incidente_registrado, true);
    assert.equal(errValido.body.duplicado, false);

    // Deduplicado al repetir reporte para el mismo reproduccion_uid
    const errDup = await e.pedir('POST', `/api/public/${token}/reproduccion/avanzar`, {
      cabeceras: { 'X-Display-Control': ct },
      cuerpo: { tipo: 'error', reproduccion_uid: uid1, codigo_error: 'yt_error_150' },
    });
    assert.equal(errDup.body.avanzado, false);
    assert.equal(errDup.body.duplicado, true);

    await sseDj.leerHasta((evs) => evs.some((x) => x.event === 'incidente_reproductor' && x.data.codigo_error === 'yt_error_150'));
    assert.equal(sseTv.eventos.some((x) => x.event === 'incidente_reproductor'), false);
    const incRows = await e.pool.query("SELECT id_registro FROM e5_registro WHERE accion = 'display_error_reproduccion'");
    assert.equal(incRows.rows.length, 1);
    const dispCancion = (await e.pool.query('SELECT disponibilidad FROM cancion WHERE youtube_video_id = $1', [cancion(1)])).rows[0].disponibilidad;
    assert.equal(dispCancion, 'disponible');

    // Ended anticipado -> 409 reproduccion_en_curso
    e.reloj.avanzar(10_000);
    await e.pedir('POST', `/api/public/${token}/latido`, { cabeceras: { 'X-Display-Control': ct } });
    const endedTemprano = await e.pedir('POST', `/api/public/${token}/reproduccion/avanzar`, {
      cabeceras: { 'X-Display-Control': ct },
      cuerpo: { tipo: 'ended', reproduccion_uid: uid1 },
    });
    assert.equal(endedTemprano.status, 409);
    assert.equal(endedTemprano.body.error.codigo, 'reproduccion_en_curso');

    // Tiempo efectivo con pausas: duración 200s. Lleva 10s, se pausa 60s (renovando latido cada 10s), se reanuda y avanza 140s -> wall=210s pero efectivo=150s (<195s) -> 409!
    await e.pedirAdmin('POST', `/sesiones/${SESION}/reproduccion/pausar`, { auth: e.dj, cuerpo: {} });
    for (let i = 0; i < 6; i++) {
      e.reloj.avanzar(10_000);
      await e.pedir('POST', `/api/public/${token}/latido`, { cabeceras: { 'X-Display-Control': ct } });
    }
    await e.pedirAdmin('POST', `/sesiones/${SESION}/reproduccion/reanudar`, { auth: e.dj, cuerpo: {} });
    for (let i = 0; i < 14; i++) {
      e.reloj.avanzar(10_000);
      await e.pedir('POST', `/api/public/${token}/latido`, { cabeceras: { 'X-Display-Control': ct } });
    }
    const endedPausado = await e.pedir('POST', `/api/public/${token}/reproduccion/avanzar`, {
      cabeceras: { 'X-Display-Control': ct },
      cuerpo: { tipo: 'ended', reproduccion_uid: uid1 },
    });
    assert.equal(endedPausado.status, 409);

    // Avanza 48s más (efectivo = 198s >= 195s) y lanza 5 ended concurrentes -> exactamente 1 avanza!
    for (let i = 0; i < 4; i++) {
      e.reloj.avanzar(12_000);
      await e.pedir('POST', `/api/public/${token}/latido`, { cabeceras: { 'X-Display-Control': ct } });
    }
    const resultados = await Promise.all(
      Array.from({ length: 5 }, () =>
        e.pedir('POST', `/api/public/${token}/reproduccion/avanzar`, {
          cabeceras: { 'X-Display-Control': ct },
          cuerpo: { tipo: 'ended', reproduccion_uid: uid1 },
        })),
    );
    assert.equal(resultados.filter((r) => r.status === 200 && r.body.avanzado === true).length, 1);
    assert.equal(resultados.filter((r) => r.status === 200 && r.body.avanzado === false && r.body.motivo === 'ya_avanzada').length, 4);

    // La misma canción vuelve a sonar de la lista Loop, pero con reproduccion_uid distinto
    const est2 = (await e.pedir('GET', `/api/public/${token}/estado`)).body;
    const uid2 = est2.actual.reproduccion_uid;
    assert.equal(est2.actual.youtube_video_id, cancion(1));
    assert.match(uid2, UUID_RE);
    assert.notEqual(uid2, uid1);

    // Reporte atrasado con uid1 devuelve avanzado: false sin afectar uid2
    const atrasado = await e.pedir('POST', `/api/public/${token}/reproduccion/avanzar`, {
      cabeceras: { 'X-Display-Control': ct },
      cuerpo: { tipo: 'ended', reproduccion_uid: uid1 },
    });
    assert.equal(atrasado.status, 200);
    assert.equal(atrasado.body.avanzado, false);
    assert.equal(atrasado.body.motivo, 'ya_avanzada');

    const est3 = (await e.pedir('GET', `/api/public/${token}/estado`)).body;
    assert.equal(est3.actual.reproduccion_uid, uid2);
  } finally {
    if (sseTv) sseTv.cerrar();
    if (sseDj) sseDj.cerrar();
    await e.cerrar();
  }
});
