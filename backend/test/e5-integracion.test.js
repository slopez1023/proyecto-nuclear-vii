'use strict';
/**
 * Entregable 5 — Pruebas de integración contra PostgreSQL real.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { crearEntornoE5 } = require('./helpers/e5');
const { SESION, ESTABLECIMIENTO, cancion, uuid } = require('./helpers/e4');

const conEntorno = (fn) => async (t) => {
  const e = await crearEntornoE5();
  try { await fn(e, t); } finally { await e.cerrar(); }
};

test('auth y control de acceso por rol y establecimiento', conEntorno(async (e) => {
  // Sin credenciales -> 401
  assert.equal((await e.pedirAdmin('GET', '/panel', { auth: {} })).status, 401);
  // Cliente Android (X-Dispositivo-Id) -> 401
  assert.equal((await e.pedir('GET', '/api/admin/panel', { dispositivo: uuid(1) })).status, 401);
  // DJ accede a panel y reproducción, pero no a horarios ni sesiones
  assert.equal((await e.pedirAdmin('GET', '/panel', { auth: e.dj })).status, 200);
  assert.equal((await e.pedirAdmin('PUT', '/horarios', { auth: e.dj, cuerpo: { horarios: [] } })).status, 403);
  assert.equal((await e.pedirAdmin('POST', '/sesiones', { auth: e.dj, cuerpo: {} })).status, 403);
  // Admin de EST-MOCK-002 no puede tocar SES-MOCK-001 (EST-MOCK-001) -> 404
  assert.equal((await e.pedirAdmin('POST', `/sesiones/${SESION}/desactivar`, { auth: e.adminOtro, cuerpo: {} })).status, 404);
}));

test('QR, pausa manual, horarios automáticos y rechazo de clientes en E3/E4', conEntorno(async (e) => {
  // Crear sesión temporal con QR único, activarla y verificar acceso
  const nueva = await e.pedirAdmin('POST', '/sesiones', { cuerpo: { id_sesion: 'SES-TEMP-QR', qr_token: 'qr-unico-temp-001' } });
  assert.equal(nueva.status, 201);
  assert.equal((await e.pedirAdmin('POST', '/sesiones/SES-TEMP-QR/activar', { cuerpo: {} })).status, 200);
  assert.equal((await e.pedir('GET', '/api/sesiones/qr-unico-temp-001')).status, 200);

  // Crear otra sesión con el mismo QR -> 409 qr_duplicado
  const dup = await e.pedirAdmin('POST', '/sesiones', { cuerpo: { id_sesion: 'SES-TEMP-QR-2', qr_token: 'qr-unico-temp-001' } });
  assert.equal(dup.status, 409);
  assert.equal(dup.body.error.codigo, 'qr_duplicado');

  // Desactivar QR -> cliente recibe 410 qr_desactivado y NO puede volver a activarse (409)
  assert.equal((await e.pedirAdmin('PATCH', '/sesiones/SES-TEMP-QR/qr', { cuerpo: { activo: false } })).status, 200);
  const acc1 = await e.pedir('GET', '/api/sesiones/qr-unico-temp-001');
  assert.equal(acc1.status, 410);
  assert.equal(acc1.body.error.codigo, 'qr_desactivado');
  const reactQr = await e.pedirAdmin('PATCH', '/sesiones/SES-TEMP-QR/qr', { cuerpo: { activo: true } });
  assert.equal(reactQr.status, 409);
  const reactSes = await e.pedirAdmin('POST', '/sesiones/SES-TEMP-QR/activar', { cuerpo: {} });
  assert.equal(reactSes.status, 409);

  // Horario automático (F8): respetar sesión manual activa, y si no hay sesión activa crear una nueva automática al abrir
  await e.pedirAdmin('PUT', '/horarios', {
    cuerpo: { zona_horaria: 'America/Bogota', horarios: [{ dia_semana: 2, apertura: '18:00', cierre: '23:00', activo: true }] },
  });
  await e.pedirAdmin('PATCH', '/establecimiento/automatico', {
    cuerpo: { modo_automatico: true },
  });
  // Cerramos las sesiones manuales previas para que al abrir la franja se cree la sesión automática
  await e.pedirAdmin('POST', `/sesiones/${SESION}/desactivar`, { cuerpo: {} });
  await e.pedirAdmin('POST', '/sesiones/SES-TEMP-QR/desactivar', { cuerpo: {} });
  await e.e5.planificador.ejecutarCiclo();
  assert.equal((await e.pedir('GET', '/api/sesiones/demo-activa-001')).body.error.codigo, 'sesion_cerrada');

  // Avanzar reloj a las 19:00 Bogota (2026-11-11T00:00Z) -> crea y abre sesión automática nueva
  e.reloj.avanzar(4 * 60 * 60 * 1000);
  await e.e5.planificador.ejecutarCiclo();
  const panelAuto = await e.pedirAdmin('GET', '/panel');
  const sesAuto = panelAuto.body.sesiones.find((s) => s.estado === 'activa');
  assert.ok(sesAuto);
  assert.equal((await e.pedir('GET', `/api/sesiones/${sesAuto.qr_token}`)).status, 200);

  // Pausa manual -> desactiva QR aunque el horario siga abierto
  await e.pedirAdmin('POST', '/establecimiento/pausa', { cuerpo: { pausada: true, motivo: 'Anuncio' } });
  await e.e5.planificador.ejecutarCiclo();
  assert.equal((await e.pedir('GET', `/api/sesiones/${sesAuto.qr_token}`)).body.error.codigo, 'qr_desactivado');
}));

test('mantenimiento de cola: limpia pendientes y conserva historial', conEntorno(async (e) => {
  await e.solicitar(uuid(1), cancion(1));
  await e.solicitar(uuid(2), cancion(2));
  const r = await e.pedirAdmin('POST', `/sesiones/${SESION}/mantenimiento/limpiar-cola`, { cuerpo: {} });
  assert.equal(r.status, 200);
  assert.equal(r.body.solicitudes_retiradas, 2);
  assert.equal((await e.cola(uuid(1))).body.cola.length, 0);

  const mant = await e.pedirAdmin('GET', `/sesiones/${SESION}/mantenimiento`);
  assert.equal(mant.body.resumen_solicitudes.retirada, 2);
}));

test('continuidad musical, listas, bloqueos y compatibilidad con votaciones', conEntorno(async (e) => {
  // Crear lista predeterminada con 2 canciones
  const lista = (await e.pedirAdmin('POST', '/listas', { cuerpo: { nombre: 'Ambiente', predeterminada: true } })).body;
  await e.pedirAdmin('POST', `/listas/${lista.id_lista}/canciones`, { cuerpo: { youtube_video_id: cancion(10) } });
  await e.pedirAdmin('POST', `/listas/${lista.id_lista}/canciones`, { cuerpo: { youtube_video_id: cancion(11) } });

  // Sin solicitudes -> iniciar reproduce de la lista predeterminada
  const rep1 = (await e.pedirAdmin('POST', `/sesiones/${SESION}/reproduccion/iniciar`, { auth: e.dj, cuerpo: {} })).body;
  assert.equal(rep1.actual.fuente, 'lista_defecto');
  assert.equal(rep1.actual.cancion.youtube_video_id, cancion(10));

  // Cliente solicita canción 1 mientras suena la lista (la regla H1 permite pedir porque la cola E4 no está ocupada)
  assert.equal((await e.solicitar(uuid(1), cancion(1))).status, 201);

  // DJ pasa a siguiente -> ahora debe priorizar la solicitud del cliente (canción 1)
  const rep2 = (await e.pedirAdmin('POST', `/sesiones/${SESION}/reproduccion/siguiente`, { auth: e.dj, cuerpo: { segundos_reproducidos: 200 } })).body;
  assert.equal(rep2.actual.fuente, 'solicitud');
  assert.equal(rep2.actual.cancion.youtube_video_id, cancion(1));

  // Pausar y reanudar
  assert.equal((await e.pedirAdmin('POST', `/sesiones/${SESION}/reproduccion/pausar`, { auth: e.dj, cuerpo: {} })).body.estado_reproduccion, 'pausada');
  assert.equal((await e.pedirAdmin('POST', `/sesiones/${SESION}/reproduccion/reanudar`, { auth: e.dj, cuerpo: {} })).body.estado_reproduccion, 'reproduciendo');

  // Cliente 2 solicita canción 2 y 3; la 2 se bloquea -> debe retirarse de la cola
  await e.solicitar(uuid(2), cancion(2));
  await e.solicitar(uuid(3), cancion(3));
  const bl = await e.pedirAdmin('POST', '/bloqueos', { cuerpo: { youtube_video_id: cancion(2), motivo: 'Inapropiada', duracion_minutos: 60 } });
  assert.equal(bl.status, 201);
  assert.equal(bl.body.solicitudes_retiradas, 1);

  // Intentar solicitar la canción bloqueada debe rechazarse con 403 cancion_bloqueada
  const solBloq = await e.solicitar(uuid(4), cancion(2));
  assert.equal(solBloq.status, 403);
  assert.equal(solBloq.body.error.codigo, 'cancion_bloqueada');

  // Saltar canción 1 -> no cuenta para el intervalo de votación de uuid(1), y pasa a canción 3 (saltando la bloqueada)
  const rep3 = (await e.pedirAdmin('POST', `/sesiones/${SESION}/reproduccion/saltar`, { auth: e.dj, cuerpo: { segundos_reproducidos: 30 } })).body;
  assert.equal(rep3.actual.cancion.youtube_video_id, cancion(3));
  const mv = await e.miVotacion(uuid(1));
  assert.equal(mv.reproducciones_contadas, 0);
}));

test('bonificación: cambio de voto, filtros del catálogo, respaldo de listas y sistema de sonido', conEntorno(async (e) => {
  // Cambio de voto: el dispositivo 1 mueve su voto de la canción 1 a la canción 2 (de otro dispositivo)
  const s1 = (await e.solicitar(uuid(1), cancion(1))).body.solicitud.id_solicitud;
  const s2 = (await e.solicitar(uuid(2), cancion(2))).body.solicitud.id_solicitud;
  const cambiar = (origen, destino, disp = uuid(1)) => e.pedir('POST', `/api/sesiones/${SESION}/solicitudes/${origen}/cambiar-voto`,
    { dispositivo: disp, cuerpo: { nueva_solicitud_id: destino } });

  assert.equal((await cambiar(s1, s1)).status, 400);
  const r = await cambiar(s1, s2);
  assert.equal(r.status, 200);
  assert.equal(r.body.resultado, 'voto_cambiado');
  assert.equal(r.body.origen.retirada, true);
  assert.equal(r.body.destino.total_votos, 2);
  // Ya no tiene voto en la canción de origen
  assert.equal((await cambiar(s1, s2)).status, 409);

  // Filtros: orden por popularidad (la canción 2 tiene 2 votos) y validación de parámetros
  const ex = await e.pedir('GET', '/api/catalogo/explorar?orden=popularidad&limite=5');
  assert.equal(ex.status, 200);
  assert.equal(ex.body.resultados[0].youtube_video_id, cancion(2));
  assert.equal(ex.body.resultados[0].total_votos, 2);
  assert.equal((await e.pedir('GET', '/api/catalogo/generos')).status, 200);
  assert.equal((await e.pedir('GET', '/api/catalogo/explorar?duracion_min=500&duracion_max=10')).status, 400);
  assert.equal((await e.pedir('GET', '/api/catalogo/explorar?orden=raro')).status, 400);

  // Respaldo de listas populares: solo el administrador lo genera; ambos roles pueden consultarlo
  assert.equal((await e.pedirAdmin('POST', '/respaldos', { auth: e.dj, cuerpo: {} })).status, 403);
  const rs = await e.pedirAdmin('POST', '/respaldos', { cuerpo: {} });
  assert.equal(rs.status, 201);
  assert.ok(rs.body.total_canciones >= 1);
  const lista = await e.pedirAdmin('GET', '/respaldos', { auth: e.dj });
  assert.equal(lista.body.respaldos.length, 1);
  const detalle = await e.pedirAdmin('GET', `/respaldos/${rs.body.id_respaldo}`);
  assert.equal(detalle.body.canciones_mas_populares[0].youtube_video_id, cancion(2));

  // Sistema de sonido: el DJ ajusta volumen y salida; el latido del equipo local marca la salida como conectada
  const snd = await e.pedirAdmin('PUT', '/sonido', { auth: e.dj, cuerpo: { volumen: 40, silenciado: true, salida: 'equipo_local' } });
  assert.equal(snd.status, 200);
  assert.equal(snd.body.volumen, 40);
  assert.equal(snd.body.salida_conectada, false);
  assert.equal((await e.pedirAdmin('PUT', '/sonido', { cuerpo: { volumen: 150 } })).status, 400);
  const latido = await e.pedirAdmin('POST', '/sonido/latido', { auth: e.dj, cuerpo: {} });
  assert.equal(latido.body.salida_conectada, true);
}));
