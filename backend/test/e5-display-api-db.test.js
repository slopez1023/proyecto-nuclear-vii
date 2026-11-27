'use strict';
/**
 * Pruebas de integración de la API Pública (FASE 2) — REST, SSE proyectado, aislamiento,
 * throttle de ultimo_acceso, auditoría display_* y regresión con clientes Android/DJ.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { crearEntornoE5 } = require('./helpers/e5');
const { SESION, ESTABLECIMIENTO, cancion, uuid } = require('./helpers/e4');

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

test('API Pública: estado de solo lectura, lista predeterminada, solicitudes, votos y throttle de ultimo_acceso', async () => {
  const e = await crearEntornoE5();
  try {
    const display = await e.e5.display.asegurarDisplay(ESTABLECIMIENTO, SESION);
    const token = display.display_token;

    // Evento analítico display_creado emitido sin error y sin token completo
    const evCreado = e.eventos.find((ev) => ev.tipo === 'display_creado');
    assert.ok(evCreado);
    assert.equal(JSON.stringify(evCreado).includes(token), false);

    // 1. Estado inicial con lista predeterminada
    const vidLista = cancion(1);
    const lista = (await e.pedirAdmin('POST', '/listas', { cuerpo: { nombre: 'Base', predeterminada: true } })).body;
    await e.pedirAdmin('POST', `/listas/${lista.id_lista}/canciones`, { cuerpo: { youtube_video_id: vidLista } });
    await e.pedirAdmin('POST', `/sesiones/${SESION}/reproduccion/iniciar`, { cuerpo: {} });

    const r1 = await e.pedir('GET', `/api/public/${token}/estado`);
    assert.equal(r1.status, 200);
    assert.equal(r1.headers.get('cache-control'), 'no-store');

    // HTML de la pantalla pública y assets estáticos
    const htmlRes = await fetch(`${e.url}/public/${token}`);
    assert.equal(htmlRes.status, 200);
    assert.match(htmlRes.headers.get('content-type') || '', /text\/html/);
    const htmlText = await htmlRes.text();
    assert.match(htmlText, /\/public-assets\/display\.css/);
    assert.match(htmlText, /\/public-assets\/display\.js/);
    assert.match(htmlText, /\/ponga-logo\.png/);
    assert.equal(htmlText.includes('class="tv-logo"'), false);
    assert.equal(htmlText.includes('C:\\'), false);
    assert.equal(htmlText.includes('/docs/'), false);

    const logoRes = await fetch(`${e.url}/ponga-logo.png`);
    assert.equal(logoRes.status, 200);
    assert.match(logoRes.headers.get('content-type') || '', /image\/png/);

    const cssRes = await fetch(`${e.url}/public-assets/display.css`);
    assert.equal(cssRes.status, 200);
    const jsRes = await fetch(`${e.url}/public-assets/display.js`);
    assert.equal(jsRes.status, 200);
    const b1 = r1.body;
    assert.equal(b1.establecimiento.nombre, 'La Nota Bar (demo)');
    assert.equal(b1.sesion.estado, 'activa');
    assert.equal(b1.estado_reproduccion, 'reproduciendo');
    assert.equal(b1.actual.fuente, 'lista_defecto');
    assert.equal(b1.actual.titulo, 'Canción 1');

    // No expone campos privados ni internos
    const texto = JSON.stringify(b1);
    for (const prohibido of ['SES-MOCK-001', 'EST-MOCK-001', 'demo-activa-001', 'dispositivos_activos', 'id_solicitud', 'id_reproduccion']) {
      assert.equal(texto.includes(prohibido), false, `No debe exponer ${prohibido}`);
    }

    // 2. Throttle 60s de ultimo_acceso
    const acc1 = (await e.pool.query('SELECT ultimo_acceso FROM e5_display WHERE id_display = $1', [display.id_display])).rows[0].ultimo_acceso;
    assert.ok(acc1 !== null);
    await e.pedir('GET', `/api/public/${token}/estado`);
    const acc2 = (await e.pool.query('SELECT ultimo_acceso FROM e5_display WHERE id_display = $1', [display.id_display])).rows[0].ultimo_acceso;
    assert.equal(acc2, acc1);
    e.reloj.avanzar(61_000);
    await e.pedir('GET', `/api/public/${token}/estado`);
    const acc3 = (await e.pool.query('SELECT ultimo_acceso FROM e5_display WHERE id_display = $1', [display.id_display])).rows[0].ultimo_acceso;
    assert.ok(acc3 > acc1);

    // 3. Solicitud + voto reflejados en cola pública ordenada
    await e.solicitar(uuid(1), cancion(2));
    const sol2 = await e.solicitar(uuid(2), cancion(3));
    await e.votar(uuid(3), sol2.body.solicitud.id_solicitud);

    const b2 = (await e.pedir('GET', `/api/public/${token}/estado`)).body;
    assert.equal(b2.cola.length, 2);
    assert.equal(b2.cola[0].cancion.titulo, 'Canción 3');
    assert.equal(b2.cola[0].total_votos, 2);
    assert.equal(b2.cola[1].cancion.titulo, 'Canción 2');
    assert.equal(b2.cola[1].total_votos, 1);

    // 4. Solo lectura: el display_token no da acceso admin ni permite mutaciones
    const adminIntento = await e.pedir('GET', '/api/admin/panel', { cabeceras: { Authorization: `Bearer ${token}` } });
    assert.equal(adminIntento.status, 401);
    const postIntento = await e.pedir('POST', `/api/public/${token}/estado`);
    assert.equal(postIntento.status, 404);
  } finally {
    await e.cerrar();
  }
});

test('API Pública: tokens inválidos/revocados, sesión cerrada, QR desactivado y auditoría display_*', async () => {
  const e = await crearEntornoE5();
  try {
    const display = await e.e5.display.asegurarDisplay(ESTABLECIMIENTO, SESION);
    const token = display.display_token;

    // Token inválido o inexistente -> 404 sin filtrar el token en respuesta
    const rMal = await e.pedir('GET', '/api/public/token-invalido-123/estado');
    assert.equal(rMal.status, 404);
    assert.equal(JSON.stringify(rMal.body).includes('token-invalido-123'), false);
    assert.equal((await fetch(`${e.url}/public/token-invalido-123`)).status, 404);

    // QR desactivado con sesión activa -> el display sigue funcionando normalmente
    await e.pedirAdmin('PATCH', `/sesiones/${SESION}/qr`, { cuerpo: { activo: false } });
    const rQrOff = await e.pedir('GET', `/api/public/${token}/estado`);
    assert.equal(rQrOff.status, 200);
    assert.equal(rQrOff.body.sesion.estado, 'activa');
    assert.equal(rQrOff.body.sesion.qr_activo, false);

    // Regeneración emite evento y guarda e5_registro sin token completo
    const reg = await e.e5.display.regenerarDisplay(ESTABLECIMIENTO, SESION);
    assert.notEqual(reg.display_token, token);
    assert.ok(e.eventos.some((ev) => ev.tipo === 'display_regenerado'));
    assert.equal((await e.pedir('GET', `/api/public/${token}/estado`)).status, 404);

    // Sesión cerrada -> /estado responde 200 estado cerrada, /flujo responde 409
    await e.pedirAdmin('POST', `/sesiones/${SESION}/desactivar`, { cuerpo: {} });
    const rCerrada = await e.pedir('GET', `/api/public/${reg.display_token}/estado`);
    assert.equal(rCerrada.status, 200);
    assert.equal(rCerrada.body.sesion.estado, 'cerrada');
    assert.equal(rCerrada.body.actual, null);
    assert.deepEqual(rCerrada.body.cola, []);

    const rFlujoCerrado = await e.pedir('GET', `/api/public/${reg.display_token}/flujo`);
    assert.equal(rFlujoCerrado.status, 409);

    // Token revocado -> 404 y auditoría enmascarada en e5_registro
    await e.e5.display.revocarDisplay(ESTABLECIMIENTO, SESION);
    assert.equal((await e.pedir('GET', `/api/public/${reg.display_token}/estado`)).status, 404);
    assert.equal((await e.pedir('GET', `/api/public/${reg.display_token}/flujo`)).status, 404);

    const registros = await e.pool.query(
      "SELECT accion, detalle::text AS d FROM e5_registro WHERE accion LIKE 'display_%' ORDER BY id_registro",
    );
    assert.deepEqual(registros.rows.map((r) => r.accion), ['display_creado', 'display_regenerado', 'display_revocado']);
    for (const row of registros.rows) {
      assert.equal(row.d.includes(token), false);
      assert.equal(row.d.includes(reg.display_token), false);
    }
  } finally {
    await e.cerrar();
  }
});

test('SSE Público: proyecta eventos, filtra conectividad, no cuenta como dispositivo y tolera QR desactivado', async () => {
  const e = await crearEntornoE5();
  let ssePublico = null;
  let sseMovil = null;
  let sseDj = null;
  try {
    const display = await e.e5.display.asegurarDisplay(ESTABLECIMIENTO, SESION);
    const token = display.display_token;

    sseDj = await abrirSse(`${e.url}/api/sesiones/${SESION}/cola/flujo`);
    await sseDj.leerHasta((evs) => evs.some((x) => x.event === 'estado'));

    ssePublico = await abrirSse(`${e.url}/api/public/${token}/flujo`);
    await ssePublico.leerHasta((evs) => evs.some((x) => x.event === 'estado'));

    // El TV NO cuenta como dispositivo activo
    assert.equal(e.conectividad.contarActivos(SESION), 0);

    // Conectar un dispositivo móvil real -> DJ recibe conectividad, TV NO recibe conectividad
    sseMovil = await abrirSse(`${e.url}/api/sesiones/${SESION}/cola/flujo`, { 'X-Dispositivo-Id': uuid(10) });
    await sseMovil.leerHasta((evs) => evs.some((x) => x.event === 'estado'));
    await sseDj.leerHasta((evs) => evs.some((x) => x.event === 'conectividad' && x.data.dispositivos_activos === 1));
    assert.equal(e.conectividad.contarActivos(SESION), 1);

    // Nueva solicitud + pausa -> TV recibe estado y reproductor proyectados sin IDs internos
    await e.solicitar(uuid(11), cancion(4));
    await ssePublico.leerHasta((evs) => evs.filter((x) => x.event === 'estado').some((x) => x.data.cola.length === 1));

    await e.pedirAdmin('POST', `/sesiones/${SESION}/reproduccion/iniciar`, { cuerpo: {} });
    await e.pedirAdmin('POST', `/sesiones/${SESION}/reproduccion/pausar`, { cuerpo: {} });
    await ssePublico.leerHasta((evs) => evs.some((x) => x.event === 'reproductor' && x.data.estado_reproduccion === 'pausada'));

    // Confirmar cero eventos `conectividad` en TV y cero claves prohibidas en todos los eventos del TV
    assert.equal(ssePublico.eventos.some((x) => x.event === 'conectividad'), false);
    const tvPayload = JSON.stringify(ssePublico.eventos);
    for (const k of ['sesion_id', 'id_solicitud', 'id_reproduccion', 'dispositivos_activos', 'intervalo_canciones']) {
      assert.equal(tvPayload.includes(`"${k}"`), false, `SSE público no debe exponer "${k}"`);
    }

    // Desactivar QR con sesión activa: móvil recibe sesion_cerrada, TV sigue vivo y recibe reanudar
    await e.pedirAdmin('PATCH', `/sesiones/${SESION}/qr`, { cuerpo: { activo: false } });
    await sseMovil.leerHasta((evs) => evs.some((x) => x.event === 'sesion_cerrada' && x.data.motivo === 'qr_desactivado'));
    assert.equal(ssePublico.eventos.some((x) => x.event === 'sesion_cerrada'), false);

    // Reanudar sigue llegando al TV aunque QR esté desactivado
    await e.pedirAdmin('POST', `/sesiones/${SESION}/reproduccion/reanudar`, { cuerpo: {} });
    await ssePublico.leerHasta((evs) => evs.some((x) => x.event === 'reproductor' && x.data.estado_reproduccion === 'reproduciendo'));

    // Cerrar sesión sí emite sesion_cerrada proyectada (sin sesion_id) al TV
    await e.pedirAdmin('POST', `/sesiones/${SESION}/desactivar`, { cuerpo: {} });
    await ssePublico.leerHasta((evs) => evs.some((x) => x.event === 'sesion_cerrada' && x.data.motivo === 'sesion_cerrada'));
    const cierreTv = ssePublico.eventos.find((x) => x.event === 'sesion_cerrada');
    assert.deepEqual(cierreTv.data, { motivo: 'sesion_cerrada' });
  } finally {
    if (ssePublico) ssePublico.cerrar();
    if (sseMovil) sseMovil.cerrar();
    if (sseDj) sseDj.cerrar();
    await e.cerrar();
  }
});
