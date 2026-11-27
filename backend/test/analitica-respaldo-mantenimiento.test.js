'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { crearEntornoE5 } = require('./helpers/e5');
const { SESION, ESTABLECIMIENTO, uuid, cancion } = require('./helpers/e4');

test('Analítica: intervalos de 5 minutos reales, mapa de calor por zona horaria y conservación de métricas', async () => {
  const e = await crearEntornoE5();
  try {
    // Generar participación real en momentos separados por 10 min (para validar cubeta de 5 min y hueco en 0)
    await e.solicitar(uuid(1), cancion(1));
    await e.votar(uuid(2), 'SOL-1');

    // Insertar eventos analíticos en una fecha futura (2027-01-15 viernes 20:02 y 20:12 Bogota) para aislar de eventos.jsonl local
    const t1 = Date.UTC(2027, 0, 16, 1, 2, 0);
    const t2 = Date.UTC(2027, 0, 16, 1, 12, 0);
    await e.pool.query(
      `INSERT INTO e5_analitica_evento (evento_id, tipo, fecha_hora, sesion_id, id_establecimiento, actor, dispositivo_hash, datos_evento, ingestado_en)
       VALUES
         ('EV-5M-1', 'solicitud_creada', $1, $3, $4, 'cliente', 'anon_0000000000000001', '{}'::jsonb, $1),
         ('EV-5M-2', 'voto_registrado',  $2, $3, $4, 'cliente', 'anon_0000000000000002', '{}'::jsonb, $2)`,
      [t1, t2, SESION, ESTABLECIMIENTO],
    );

    const res = await e.pedirAdmin('GET', '/analitica');
    assert.equal(res.status, 200);
    const b = res.body;

    assert.equal(b.intervalo_temporal_minutos, 5);
    assert.ok(Array.isArray(b.participacion_temporal));
    assert.ok(b.participacion_temporal.length >= 3);
    assert.deepEqual(
      b.participacion_temporal.slice(-3).map((x) => [x.hora, x.eventos]),
      [['20:00', 1], ['20:05', 0], ['20:10', 1]],
    );

    assert.ok(b.mapa_calor);
    assert.equal(b.mapa_calor.zona_horaria, 'America/Bogota');
    assert.ok(b.mapa_calor.total_interacciones >= 2);
    // Viernes = dia_iso 5, 20:00..21:59 = franja_hora 20
    const celdaViernes20 = b.mapa_calor.celdas.find((c) => c.dia_iso === 5 && c.franja_hora === 20);
    assert.ok(celdaViernes20);
    assert.equal(celdaViernes20.interacciones, 2);

    // Métricas actuales conservadas
    assert.equal(b.indicadores.total_solicitudes, 1);
    assert.equal(b.indicadores.votos_validos, 2);
    assert.ok(b.indicadores.cancion_mas_popular);
  } finally {
    await e.cerrar();
  }
});

test('Copias de seguridad: generación manual, exportación PDF válida y aislamiento por establecimiento', async () => {
  const e = await crearEntornoE5();
  try {
    await e.solicitar(uuid(1), cancion(1));
    await e.votar(uuid(2), 'SOL-1');
    const lista = (await e.pedirAdmin('POST', '/listas', { cuerpo: { nombre: 'Clásicos de la casa', predeterminada: true } })).body;
    await e.pedirAdmin('POST', `/listas/${lista.id_lista}/canciones`, { cuerpo: { youtube_video_id: cancion(2) } });

    const gen = await e.pedirAdmin('POST', '/respaldos', { cuerpo: {} });
    assert.equal(gen.status, 201);
    const idResp = gen.body.id_respaldo;

    const listado = await e.pedirAdmin('GET', '/respaldos');
    assert.equal(listado.status, 200);
    assert.equal(listado.body.respaldos[0].total_listas, 1);
    assert.equal(listado.body.intervalo_horas, 24);

    // JSON técnico sigue disponible
    const jsonRes = await e.pedirAdmin('GET', `/respaldos/${idResp}`);
    assert.equal(jsonRes.status, 200);
    assert.equal(jsonRes.body.id_respaldo, idResp);

    // Descarga PDF administrativa
    const pdfFetch = await fetch(`${e.url}/api/admin/respaldos/${idResp}/pdf`, { headers: e.admin });
    assert.equal(pdfFetch.status, 200);
    assert.equal(pdfFetch.headers.get('content-type'), 'application/pdf');
    assert.match(pdfFetch.headers.get('content-disposition') || '', /informe-copia-seguridad-\d+\.pdf/);
    const buf = Buffer.from(await pdfFetch.arrayBuffer());
    const txt = buf.toString('latin1');
    assert.ok(txt.startsWith('%PDF-1.4'));
    assert.ok(txt.trimEnd().endsWith('%%EOF'));
    assert.ok(txt.includes('Informe de copia de seguridad'));
    assert.ok(txt.includes('Cl\\341sicos de la casa'));

    // Otro establecimiento no puede descargar este PDF (404)
    const otroPdf = await fetch(`${e.url}/api/admin/respaldos/${idResp}/pdf`, { headers: e.adminOtro });
    assert.equal(otroPdf.status, 404);
  } finally {
    await e.cerrar();
  }
});

test('Mantenimiento: resumen con lista predeterminada y limpieza sin borrar historial', async () => {
  const e = await crearEntornoE5();
  try {
    const lista = (await e.pedirAdmin('POST', '/listas', { cuerpo: { nombre: 'Ambiente', predeterminada: true } })).body;
    await e.pedirAdmin('POST', `/listas/${lista.id_lista}/canciones`, { cuerpo: { youtube_video_id: cancion(1) } });
    await e.solicitar(uuid(1), cancion(2));

    const mant = await e.pedirAdmin('GET', `/sesiones/${SESION}/mantenimiento`);
    assert.equal(mant.status, 200);
    assert.equal(mant.body.resumen_solicitudes.pendiente, 1);
    assert.equal(mant.body.lista_predeterminada.nombre, 'Ambiente');
    assert.equal(mant.body.lista_predeterminada.total_canciones, 1);

    const limpiar = await e.pedirAdmin('POST', `/sesiones/${SESION}/mantenimiento/limpiar-cola`, {
      cuerpo: { reiniciar_lista: true },
    });
    assert.equal(limpiar.status, 200);
    assert.equal(limpiar.body.solicitudes_retiradas, 1);
    assert.equal(limpiar.body.historial_conservado, true);

    const votos = await e.pool.query('SELECT COUNT(*)::int AS total FROM voto');
    assert.equal(votos.rows[0].total, 1, 'Los votos históricos deben conservarse');
  } finally {
    await e.cerrar();
  }
});
