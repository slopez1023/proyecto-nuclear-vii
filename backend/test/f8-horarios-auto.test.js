'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluarHorario } = require('../src/e5/horarios');
const { crearPlanificador } = require('../src/e5/planificador');
const { crearEntornoE5 } = require('./helpers/e5');
const { ESTABLECIMIENTO, SESION, uuid, cancion } = require('./helpers/e4');

test('F8 unidad: evaluarHorario incluye fecha_jornada y marcas apertura/cierre incluyendo cruce de medianoche', () => {
  const cfg = {
    horarios: [
      { dia_semana: 5, apertura_min: 20 * 60, cierre_min: 3 * 60, activo: true }, // Viernes 20:00 -> Sab 03:00
    ],
    excepciones: [],
  };
  // Sábado 2026-11-21 01:30 America/Bogota = 2026-11-21T06:30Z (madrugada de viernes 2026-11-20)
  const evMadrugada = evaluarHorario(cfg, Date.UTC(2026, 10, 21, 6, 30), 'America/Bogota');
  assert.equal(evMadrugada.abierto, true);
  assert.equal(evMadrugada.motivo, 'franja_de_ayer');
  assert.equal(evMadrugada.fecha_jornada, '2026-11-20');
  assert.ok(evMadrugada.apertura_programada_en < Date.UTC(2026, 10, 21, 6, 30));
  assert.ok(evMadrugada.cierre_programado_en > Date.UTC(2026, 10, 21, 6, 30));
});

test('F8.1: apertura automática crea sesión nueva con QR y código 6 dígitos, e idempotencia ante 2 instancias concurrentes', async () => {
  let seq = 100000;
  const e = await crearEntornoE5({
    generarCodigo: () => String(seq++),
  });
  try {
    // Cerrar la sesión inicial manual para partir sin sesión activa
    assert.equal((await e.pedirAdmin('POST', `/sesiones/${SESION}/desactivar`, { cuerpo: {} })).status, 200);

    // Reloj inicial es martes 2026-11-10 15:00 Bogota. Configuramos martes 18:00-23:00 y miércoles 18:00-23:00
    await e.pedirAdmin('PUT', '/horarios', {
      cuerpo: {
        zona_horaria: 'America/Bogota',
        horarios: [
          { dia_semana: 2, apertura: '18:00', cierre: '23:00', activo: true },
          { dia_semana: 3, apertura: '18:00', cierre: '23:00', activo: true },
        ],
      },
    });
    const rAuto = await e.pedirAdmin('PATCH', '/establecimiento/automatico', {
      cuerpo: { modo_automatico: true },
    });
    assert.equal(rAuto.status, 200);

    // Antes de las 18:00 no se crea sesión automática
    await e.e5.planificador.ejecutarCiclo();
    let panel = await e.pedirAdmin('GET', '/panel');
    assert.equal(panel.body.sesiones.filter((s) => s.estado === 'activa').length, 0);

    // Avanzar a 19:00 Bogota (+4h) y simular dos instancias concurrentes del planificador
    e.reloj.avanzar(4 * 60 * 60 * 1000);
    const planB = crearPlanificador({
      pool: e.pool,
      sesionesAdmin: e.e5.sesionesAdmin,
      reproductor: e.e5.reproductor,
      ahora: e.reloj.ahora,
    });
    await Promise.all([e.e5.planificador.ejecutarCiclo(), planB.ejecutarCiclo()]);

    panel = await e.pedirAdmin('GET', '/panel');
    const activas = panel.body.sesiones.filter((s) => s.estado === 'activa');
    assert.equal(activas.length, 1, 'Solo debe crearse una sesión automática');
    const sesAuto = activas[0];
    assert.notEqual(sesAuto.id_sesion, SESION);
    assert.equal(sesAuto.qr_estado, 'activo');
    assert.ok(sesAuto.codigo_acceso);
    assert.equal(panel.body.jornada_programada.estado, 'abierta');
    assert.equal(panel.body.jornada_programada.id_sesion, sesAuto.id_sesion);

    // Tanto QR como código de 6 dígitos resuelven a la misma sesión automática
    const porQr = await e.pedir('GET', `/api/sesiones/${sesAuto.qr_token}`);
    assert.equal(porQr.status, 200);
    assert.equal(porQr.body.id_sesion, sesAuto.id_sesion);

    const porCodigo = await e.pedir('POST', '/api/sesiones/acceso-codigo', {
      dispositivo: uuid(1),
      cuerpo: { codigo: sesAuto.codigo_acceso },
    });
    assert.equal(porCodigo.status, 200);
    assert.equal(porCodigo.body.qr_token, sesAuto.qr_token);
  } finally {
    await e.cerrar();
  }
});

test('F8 política sesiones manuales: respeta sesión manual activa, registra omitida_sesion_manual y no crea tardía al cerrarse', async () => {
  const e = await crearEntornoE5();
  try {
    // SES-DEMO está activa manualmente desde el inicio (15:00 Bogota)
    await e.pedirAdmin('PUT', '/horarios', {
      cuerpo: {
        zona_horaria: 'America/Bogota',
        horarios: [
          { dia_semana: 2, apertura: '18:00', cierre: '23:00', activo: true },
          { dia_semana: 3, apertura: '18:00', cierre: '23:00', activo: true },
        ],
      },
    });
    await e.pedirAdmin('PATCH', '/establecimiento/automatico', { cuerpo: { modo_automatico: true } });

    // Antes de apertura: no debe cerrar la sesión manual
    await e.e5.planificador.ejecutarCiclo();
    assert.equal((await e.pedir('GET', '/api/sesiones/demo-activa-001')).status, 200);

    // Llega la apertura (19:00 Bogota): hay sesión manual activa -> omitida_sesion_manual
    e.reloj.avanzar(4 * 60 * 60 * 1000);
    await e.e5.planificador.ejecutarCiclo();

    let panel = await e.pedirAdmin('GET', '/panel');
    assert.equal(panel.body.sesiones.filter((s) => s.estado === 'activa').length, 1);
    assert.equal(panel.body.sesiones.find((s) => s.estado === 'activa').id_sesion, SESION);
    assert.equal(panel.body.jornada_programada.estado, 'omitida_sesion_manual');
    assert.equal(panel.body.jornada_programada.id_sesion, null);

    // Llega la hora de cierre (23:30 Bogota, +4.5h): la sesión manual NO debe cerrarse automáticamente
    e.reloj.avanzar(4.5 * 60 * 60 * 1000);
    await e.e5.planificador.ejecutarCiclo();
    assert.equal((await e.pedir('GET', '/api/sesiones/demo-activa-001')).status, 200);

    // Probar cierre manual temprano en otra jornada (miércoles 19:00): si se cierra manualmente antes del fin, no crea tardía
    // Primero cerramos SES-DEMO ahora
    await e.pedirAdmin('POST', `/sesiones/${SESION}/desactivar`, { cuerpo: {} });
    // Avanzar al miércoles 2026-11-11 19:00 Bogota (+19.5h desde 23:30 martes = 19:00 miércoles)
    e.reloj.avanzar(19.5 * 60 * 60 * 1000);
    const adminDia2 = await e.login('admin1', 'ClaveAdmin123');
    // Crear y activar sesión manual antes de ejecutar el ciclo
    await e.pedirAdmin('POST', '/sesiones', { auth: adminDia2, cuerpo: { id_sesion: 'SES-MAN-MIE', qr_token: 'qr-man-mie-001' } });
    await e.pedirAdmin('POST', '/sesiones/SES-MAN-MIE/activar', { auth: adminDia2, cuerpo: {} });
    await e.e5.planificador.ejecutarCiclo();

    panel = await e.pedirAdmin('GET', '/panel', { auth: adminDia2 });
    assert.equal(panel.body.jornada_programada.fecha_jornada, '2026-11-11');
    assert.equal(panel.body.jornada_programada.estado, 'omitida_sesion_manual');

    // Cerrar la sesión manual a las 20:00 (dentro del horario 18:00-23:00) y ejecutar otro ciclo -> NO debe crear sesión automática tardía
    e.reloj.avanzar(60 * 60 * 1000);
    await e.pedirAdmin('POST', '/sesiones/SES-MAN-MIE/desactivar', { auth: adminDia2, cuerpo: {} });
    await e.e5.planificador.ejecutarCiclo();

    panel = await e.pedirAdmin('GET', '/panel', { auth: adminDia2 });
    assert.equal(panel.body.sesiones.filter((s) => s.estado === 'activa').length, 0);
    assert.equal(panel.body.jornada_programada.estado, 'omitida_sesion_manual');
  } finally {
    await e.cerrar();
  }
});

test('F8.2 Opción A: cierre automático invalida QR y código 6 dígitos y preserva historial', async () => {
  const e = await crearEntornoE5({
    generarCodigo: () => '445566',
  });
  try {
    await e.pedirAdmin('POST', `/sesiones/${SESION}/desactivar`, { cuerpo: {} });
    await e.pedirAdmin('PUT', '/horarios', {
      cuerpo: {
        zona_horaria: 'America/Bogota',
        horarios: [{ dia_semana: 2, apertura: '18:00', cierre: '23:00', activo: true }],
      },
    });
    await e.pedirAdmin('PATCH', '/establecimiento/automatico', { cuerpo: { modo_automatico: true } });

    // 19:00 Bogota: abre sesión automática
    e.reloj.avanzar(4 * 60 * 60 * 1000);
    await e.e5.planificador.ejecutarCiclo();
    let panel = await e.pedirAdmin('GET', '/panel');
    const sesAuto = panel.body.sesiones.find((s) => s.estado === 'activa');
    assert.ok(sesAuto);

    // Registrar una solicitud y un voto histórico en la sesión automática
    const rSol = await e.pedir('POST', `/api/sesiones/${sesAuto.id_sesion}/solicitudes`, {
      dispositivo: uuid(2),
      cuerpo: { youtube_video_id: cancion(1) },
    });
    assert.equal(rSol.status, 201);

    // 23:05 Bogota (+4h 5m): cierre automático
    e.reloj.avanzar((4 * 60 + 5) * 60 * 1000);
    await e.e5.planificador.ejecutarCiclo();

    // QR y código de 6 dígitos quedan revocados
    const porQr = await e.pedir('GET', `/api/sesiones/${sesAuto.qr_token}`);
    assert.equal(porQr.status, 410);
    assert.equal(porQr.body.error.codigo, 'sesion_cerrada');

    const porCod = await e.pedir('POST', '/api/sesiones/acceso-codigo', {
      dispositivo: uuid(3),
      cuerpo: { codigo: '445566' },
    });
    assert.equal(porCod.status, 404);

    // Jornada programada marcada cerrada_auto y solicitudes preservadas
    panel = await e.pedirAdmin('GET', '/panel');
    assert.equal(panel.body.jornada_programada.estado, 'cerrada_auto');
    const solHist = await e.pool.query('SELECT estado FROM solicitud WHERE id_sesion = $1', [sesAuto.id_sesion]);
    assert.equal(solHist.rows.length, 1);
    assert.equal(solHist.rows[0].estado, 'retirada');

    // No re-cierra ni falla en ciclos posteriores
    await e.e5.planificador.ejecutarCiclo();
    const rowQr = await e.pool.query('SELECT motivo FROM e5_qr_desactivado WHERE id_sesion = $1', [sesAuto.id_sesion]);
    assert.equal(rowQr.rows.length, 1);
  } finally {
    await e.cerrar();
  }
});
