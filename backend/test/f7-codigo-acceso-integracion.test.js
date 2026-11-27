'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { crearEntornoE5 } = require('./helpers/e5');
const { SESION, ESTABLECIMIENTO, uuid } = require('./helpers/e4');

test('F7 códigos de 6 dígitos: generación atómica, ceros iniciales, colisión, agotamiento y concurrencia', async () => {
  const secuencia = ['004281', '004281', '123456'];
  let idx = 0;
  const logs = [];
  const e = await crearEntornoE5({
    generarCodigo: () => secuencia[idx++] || '999888',
    esperarCodigo: async () => {},
    registrarCodigo: (msg, meta) => logs.push({ msg, meta }),
  });
  try {
    // 1. Sesión creada conserva '004281' como texto con cero inicial
    const c1 = await e.pedirAdmin('POST', '/sesiones', { cuerpo: { id_sesion: 'SES-F7-001', qr_token: 'qr-f7-ses-001' } });
    assert.equal(c1.status, 201);
    assert.equal(c1.body.sesion.codigo_acceso, '004281');

    // 2. Colisión simulada: el segundo intento recibe '004281' (ocupado), reintenta y toma '123456'
    const c2 = await e.pedirAdmin('POST', '/sesiones', { cuerpo: { id_sesion: 'SES-F7-002', qr_token: 'qr-f7-ses-002' } });
    assert.equal(c2.status, 201);
    assert.equal(c2.body.sesion.codigo_acceso, '123456');

    // 3. Agotamiento de códigos: si siempre colisiona devuelve 503 y hace rollback completo (sin sesión huérfana)
    secuencia.length = 0;
    idx = 0;
    for (let i = 0; i < 20; i += 1) secuencia.push('004281');
    const cFail = await e.pedirAdmin('POST', '/sesiones', { cuerpo: { id_sesion: 'SES-F7-FAIL', qr_token: 'qr-f7-ses-fail' } });
    assert.equal(cFail.status, 503);
    assert.equal(cFail.body.error.codigo, 'codigos_agotados');
    const qFail = await e.pool.query('SELECT 1 FROM sesion WHERE id_sesion = $1', ['SES-F7-FAIL']);
    assert.equal(qFail.rows.length, 0);

    // 4. Creación concurrente con colisión inicial: dos sesiones terminan con códigos vigentes distintos
    secuencia.length = 0;
    idx = 0;
    secuencia.push('555111', '555111', '555222');
    const [p1, p2] = await Promise.all([
      e.pedirAdmin('POST', '/sesiones', { cuerpo: { id_sesion: 'SES-F7-PAR1', qr_token: 'qr-f7-par-001' } }),
      e.pedirAdmin('POST', '/sesiones', { cuerpo: { id_sesion: 'SES-F7-PAR2', qr_token: 'qr-f7-par-002' } }),
    ]);
    assert.equal(p1.status, 201);
    assert.equal(p2.status, 201);
    assert.notEqual(p1.body.sesion.codigo_acceso, p2.body.sesion.codigo_acceso);

    // 5. Sesión histórica (sin fila en e5_codigo_acceso) conserva su QR y reporta codigo_acceso: null
    const lista = await e.pedirAdmin('GET', '/sesiones');
    const antigua = lista.body.sesiones.find((s) => s.id_sesion === SESION);
    assert.equal(antigua.codigo_acceso, null);
    assert.equal((await e.pedir('GET', `/api/sesiones/${antigua.qr_token}`)).status, 200);
  } finally {
    await e.cerrar();
  }
});

test('F7 resolución del código, vigencia, respuesta uniforme sin enumeración, cierre manual vs horario y rate limiting', async () => {
  const logs = [];
  let indice = 0;
  const codigos = ['004281', '778899', '665544'];
  const e = await crearEntornoE5({
    generarCodigo: () => codigos[indice++] || '889900',
    esperarCodigo: async () => {},
    registrarCodigo: (msg, meta) => logs.push({ msg, meta }),
  });
  try {
    await e.pedirAdmin('POST', '/sesiones', { cuerpo: { id_sesion: 'SES-F7-ACT', qr_token: 'qr-f7-activa-001' } });

    // Mientras la sesión recién creada sigue cerrada, devuelve 404 uniforme igual que un código inexistente
    const cerradaAntes = await e.pedir('POST', '/api/sesiones/acceso-codigo', {
      dispositivo: uuid(1),
      cuerpo: { codigo: '004281' },
    });
    const inexistente = await e.pedir('POST', '/api/sesiones/acceso-codigo', {
      dispositivo: uuid(2),
      cuerpo: { codigo: '999999' },
    });
    assert.equal(cerradaAntes.status, 404);
    assert.deepEqual(cerradaAntes.body, inexistente.body);
    assert.equal(cerradaAntes.body.error.codigo, 'codigo_no_disponible');

    // Formato inválido -> 400
    const bad = await e.pedir('POST', '/api/sesiones/acceso-codigo', {
      dispositivo: uuid(2),
      cuerpo: { codigo: '123' },
    });
    assert.equal(bad.status, 400);
    assert.equal(bad.body.error.codigo, 'codigo_invalido');

    // Activar sesión -> resuelve al mismo qr_token y no filtra campos internos
    assert.equal((await e.pedirAdmin('POST', '/sesiones/SES-F7-ACT/activar', { cuerpo: {} })).status, 200);
    const ok = await e.pedir('POST', '/api/sesiones/acceso-codigo', {
      dispositivo: uuid(3),
      cuerpo: { codigo: '004281' },
    });
    assert.equal(ok.status, 200);
    assert.deepEqual(Object.keys(ok.body), ['qr_token']);
    assert.equal(ok.body.qr_token, 'qr-f7-activa-001');

    // Converge exactamente en GET /api/sesiones/:token
    const acc = await e.pedir('GET', `/api/sesiones/${ok.body.qr_token}`);
    assert.equal(acc.status, 200);
    assert.equal(acc.body.id_sesion, 'SES-F7-ACT');

    // Pausa manual -> deja el código no disponible (404 uniforme), sin revocarlo en BD
    await e.pedirAdmin('POST', '/establecimiento/pausa', { cuerpo: { pausada: true, motivo: 'Pausa' } });
    const enPausa = await e.pedir('POST', '/api/sesiones/acceso-codigo', {
      dispositivo: uuid(3),
      cuerpo: { codigo: '004281' },
    });
    assert.equal(enPausa.status, 404);
    assert.deepEqual(enPausa.body, inexistente.body);
    await e.pedirAdmin('POST', '/establecimiento/pausa', { cuerpo: { pausada: false } });
    assert.equal((await e.pedir('POST', '/api/sesiones/acceso-codigo', {
      dispositivo: uuid(3), cuerpo: { codigo: '004281' },
    })).status, 200);

    // Rate limiting: 5 fallos del dispositivo 4 lo bloquean con 429; dispositivo 5 sigue entrando normalmente
    for (let i = 0; i < 5; i += 1) {
      const f = await e.pedir('POST', '/api/sesiones/acceso-codigo', {
        dispositivo: uuid(4),
        cuerpo: { codigo: '111000' },
      });
      assert.equal(f.status, 404);
    }
    const bloq = await e.pedir('POST', '/api/sesiones/acceso-codigo', {
      dispositivo: uuid(4),
      cuerpo: { codigo: '004281' },
    });
    assert.equal(bloq.status, 429);
    assert.equal(bloq.body.error.codigo, 'demasiados_intentos');
    assert.ok(Number(bloq.headers.get('retry-after')) >= 1);
    assert.ok(bloq.body.error.reintentar_en_s >= 1);
    // Los logs de seguridad nunca contienen el código probado
    assert.equal(JSON.stringify(logs).includes('004281'), false);
    assert.equal(JSON.stringify(logs).includes('111000'), false);

    // Otro dispositivo sigue entrando (sin bloqueo global de la sesión ni del código)
    const otroOk = await e.pedir('POST', '/api/sesiones/acceso-codigo', {
      dispositivo: uuid(5),
      cuerpo: { codigo: '004281' },
    });
    assert.equal(otroOk.status, 200);

    // Cierre manual revoca definitivamente el código
    await e.pedirAdmin('POST', '/sesiones/SES-F7-ACT/desactivar', { cuerpo: {} });
    const filaRev = await e.pool.query(
      'SELECT vigente, motivo_revocacion FROM e5_codigo_acceso WHERE id_sesion = $1',
      ['SES-F7-ACT'],
    );
    assert.equal(filaRev.rows[0].vigente, false);
    assert.equal(filaRev.rows[0].motivo_revocacion, 'sesion_cerrada');

    // Cierre por horario conserva vigencia lógica (vigente=true), bloquea mientras esté cerrada y reactiva al abrir
    await e.pedirAdmin('POST', '/sesiones', { cuerpo: { id_sesion: 'SES-F7-HOR', qr_token: 'qr-f7-hor-001' } });
    await e.pedirAdmin('POST', '/sesiones/SES-F7-HOR/activar', { cuerpo: {} });
    // Reloj por defecto en helpers/e4 es 2026-11-10T20:00Z (martes 15:00 Bogota). Horario 18:00-23:00 cierra la sesión.
    await e.pedirAdmin('PUT', '/horarios', {
      cuerpo: { zona_horaria: 'America/Bogota', horarios: [{ dia_semana: 2, apertura: '18:00', cierre: '23:00', activo: true }] },
    });
    await e.pedirAdmin('PATCH', '/establecimiento/automatico', {
      cuerpo: { modo_automatico: true, id_sesion_principal: 'SES-F7-HOR' },
    });
    await e.e5.planificador.ejecutarCiclo();
    const rowHor = await e.pool.query('SELECT codigo, vigente FROM e5_codigo_acceso WHERE id_sesion = $1', ['SES-F7-HOR']);
    assert.equal(rowHor.rows[0].vigente, true);
    assert.equal((await e.pedir('POST', '/api/sesiones/acceso-codigo', {
      dispositivo: uuid(6), cuerpo: { codigo: '778899' },
    })).status, 404);

    e.reloj.avanzar(4 * 60 * 60 * 1000);
    await e.e5.planificador.ejecutarCiclo();
    const rowReabierta = await e.pedir('POST', '/api/sesiones/acceso-codigo', {
      dispositivo: uuid(6), cuerpo: { codigo: '778899' },
    });
    assert.equal(rowReabierta.status, 200);
    assert.equal(rowReabierta.body.qr_token, 'qr-f7-hor-001');

    // Ningún endpoint público de display expone el código
    const disp = await e.pedirAdmin('POST', '/sesiones/SES-F7-HOR/display', { cuerpo: {} });
    const estPub = await e.pedir('GET', `/api/public/${disp.body.display_token}/estado`);
    assert.equal(JSON.stringify(estPub.body).includes('778899'), false);
    assert.equal(JSON.stringify(estPub.body).includes('codigo_acceso'), false);
  } finally {
    await e.cerrar();
  }
});
