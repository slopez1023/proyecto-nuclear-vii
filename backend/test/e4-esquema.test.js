'use strict';
/**
 * E4 — Esquema y restricciones en PostgreSQL REAL. Los índices únicos parciales son la red de seguridad
 * final, independiente de la lógica de la aplicación: aquí se prueban insertando directamente por SQL.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { crearBaseDePrueba } = require('./helpers/db');
const { migrar } = require('../src/db');

let base;
test.before(async () => { base = await crearBaseDePrueba(); });
test.after(async () => { await base.cerrar(); });

const q = (sql, params) => base.pool.query(sql, params);
const rechazaPorUnico = async (promesa) => assert.rejects(promesa, (err) => err.code === '23505');

async function datosBase() {
  const { rows: [d1] } = await q(`INSERT INTO dispositivo (identificador_seudonimo, creado_en, ultima_actividad)
    VALUES (gen_random_uuid()::text, 1, 1) RETURNING id_dispositivo`);
  const { rows: [d2] } = await q(`INSERT INTO dispositivo (identificador_seudonimo, creado_en, ultima_actividad)
    VALUES (gen_random_uuid()::text, 1, 1) RETURNING id_dispositivo`);
  const { rows: [c] } = await q(`INSERT INTO cancion (youtube_video_id, titulo, artista_canal, duracion_segundos,
    disponibilidad, consultado_en) VALUES (substr(md5(random()::text), 1, 11), 't', 'a', 100, 'disponible', 1) RETURNING id_cancion`);
  return { d1: d1.id_dispositivo, d2: d2.id_dispositivo, c: c.id_cancion };
}

const insertarSolicitud = (c, d, estado) => q(
  `INSERT INTO solicitud (id_sesion, id_cancion, id_dispositivo, fecha_solicitud, estado)
   VALUES ('SES-MOCK-001', $1, $2, 1, $3) RETURNING id_solicitud`, [c, d, estado]);

test('las migraciones crean todas las tablas y quedan registradas', async () => {
  const { rows } = await q(`SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema() ORDER BY 1`);
  assert.deepEqual(rows.map((r) => r.table_name), [
    'cancion', 'dispositivo', 'dispositivo_sesion', 'establecimiento', 'reproduccion', 'schema_migrations', 'sesion', 'solicitud', 'voto',
  ]);
  const { rows: m } = await q('SELECT nombre FROM schema_migrations');
  assert.deepEqual(m.map((r) => r.nombre), ['001_esquema.sql']);
});

test('migrar es idempotente: una segunda ejecución no aplica nada', async () => {
  assert.deepEqual(await migrar(base.pool), []);
});

test('las sesiones del mock se cargan en establecimiento y sesion', async () => {
  const { rows } = await q('SELECT id_sesion, id_establecimiento, estado, qr_estado, version_cola FROM sesion ORDER BY 1');
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[0], { id_sesion: 'SES-MOCK-001', id_establecimiento: 'EST-MOCK-001', estado: 'activa', qr_estado: 'activo', version_cola: 0 });
});

test('los índices únicos parciales existen con su condición', async () => {
  const { rows } = await q(`SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = current_schema()
    AND indexname IN ('solicitud_viva_unica', 'reproduccion_en_curso_unica')`);
  const def = Object.fromEntries(rows.map((r) => [r.indexname, r.indexdef]));
  assert.match(def.solicitud_viva_unica, /UNIQUE INDEX .* WHERE .*pendiente.*en_reproduccion/);
  assert.match(def.reproduccion_en_curso_unica, /UNIQUE INDEX .* WHERE .*en_curso/);
});

test('solicitud_viva_unica: rechaza una segunda solicitud viva de la misma canción y sesión', async () => {
  const { d1, d2, c } = await datosBase();
  await insertarSolicitud(c, d1, 'pendiente');
  await rechazaPorUnico(insertarSolicitud(c, d2, 'pendiente'));
  await rechazaPorUnico(insertarSolicitud(c, d2, 'en_reproduccion'));
  // Terminadas o fallidas no cuentan como vivas: pueden repetirse (decisión 1B, H3b).
  await insertarSolicitud(c, d2, 'reproducida');
  await insertarSolicitud(c, d2, 'fallida');
});

test('voto: un solo voto por (solicitud, dispositivo)', async () => {
  const { d1, c } = await datosBase();
  const { rows: [s] } = await insertarSolicitud(c, d1, 'reproducida');
  const votar = () => q(`INSERT INTO voto (id_solicitud, id_dispositivo, id_establecimiento, fecha_hora, origen)
    VALUES ($1, $2, 'EST-MOCK-001', 1, 'manual')`, [s.id_solicitud, d1]);
  await votar();
  await rechazaPorUnico(votar());
});

test('reproduccion_en_curso_unica: una sola reproducción en curso por sesión', async () => {
  const { d1, c } = await datosBase();
  const { rows: [s] } = await insertarSolicitud(c, d1, 'reproducida');
  const rep = (resultado) => q(`INSERT INTO reproduccion (id_sesion, id_establecimiento, id_solicitud, id_cancion, inicio_en, resultado, origen)
    VALUES ('SES-MOCK-002', 'EST-MOCK-002', $1, $2, 1, $3, 'simulacion')`, [s.id_solicitud, c, resultado]);
  await rep('en_curso');
  await rechazaPorUnico(rep('en_curso'));
  await rep('exitosa');
  await rep('exitosa');
});

test('CHECK: estados y orígenes fuera de la lista se rechazan', async () => {
  const { d1, c } = await datosBase();
  await assert.rejects(insertarSolicitud(c, d1, 'rechazada'), (err) => err.code === '23514');
  await assert.rejects(q(`INSERT INTO voto (id_solicitud, id_dispositivo, id_establecimiento, fecha_hora, origen)
    VALUES (1, $1, 'EST-MOCK-001', 1, 'otro')`, [d1]), (err) => err.code === '23514');
});
