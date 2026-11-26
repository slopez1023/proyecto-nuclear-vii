'use strict';
/**
 * Pruebas de inicialización segura (SEMILLA_MOCK y claves administrativas sin fallbacks inseguros).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { Client } = require('pg');
const { crearPool, migrar } = require('../src/db');
const { cargarSesiones } = require('../src/sesiones');
const { verificarClave } = require('../src/e5/auth');
const {
  CARPETA_MIGRACIONES_E5,
  semillaMockHabilitada,
  sembrarPersonalInicial,
  inicializarDatosBase,
} = require('../src/e5/server-e5');

async function conEsquemaVacio(fn) {
  const url = process.env.DATABASE_URL_TEST;
  if (!url) throw new Error('DATABASE_URL_TEST no está definida.');
  const schema = `test_sem_${crypto.randomBytes(6).toString('hex')}`;
  const admin = new Client({ connectionString: url });
  await admin.connect();
  await admin.query(`CREATE SCHEMA ${schema}`);
  const pool = crearPool({ connectionString: url, schema, max: 5 });
  try {
    await migrar(pool);
    await migrar(pool, CARPETA_MIGRACIONES_E5);
    await fn(pool);
  } finally {
    await pool.end();
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`).finally(() => admin.end());
  }
}

test('semillaMockHabilitada solo se activa con SEMILLA_MOCK=true explícito', () => {
  assert.equal(semillaMockHabilitada({}), false);
  assert.equal(semillaMockHabilitada({ SEMILLA_MOCK: '' }), false);
  assert.equal(semillaMockHabilitada({ SEMILLA_MOCK: 'false' }), false);
  assert.equal(semillaMockHabilitada({ SEMILLA_MOCK: '1' }), false);
  assert.equal(semillaMockHabilitada({ SEMILLA_MOCK: 'true' }), true);
  assert.equal(semillaMockHabilitada({ SEMILLA_MOCK: ' TRUE ' }), true);
});

test('SEMILLA_MOCK=false y ausencia de variable evitan sembrar establecimientos, sesiones y usuarios demo', async () => {
  const sesiones = cargarSesiones();
  for (const env of [{ SEMILLA_MOCK: 'false' }, {}]) {
    await conEsquemaVacio(async (pool) => {
      await inicializarDatosBase({ pool, sesiones, env });
      const est = await pool.query('SELECT COUNT(*)::int AS n FROM establecimiento');
      const ses = await pool.query('SELECT COUNT(*)::int AS n FROM sesion');
      const usr = await pool.query('SELECT COUNT(*)::int AS n FROM e5_usuario');
      assert.equal(est.rows[0].n, 0);
      assert.equal(ses.rows[0].n, 0);
      assert.equal(usr.rows[0].n, 0);
    });
  }
});

test('sin EST-MOCK-001 en la base, sembrarPersonalInicial no crea usuarios demo', async () => {
  await conEsquemaVacio(async (pool) => {
    await pool.query("INSERT INTO establecimiento (id_establecimiento, nombre) VALUES ('EST-REAL-001', 'Bar Real')");
    const r = await sembrarPersonalInicial(pool, { E5_ADMIN_CLAVE: 'ClaveAdminProd123', E5_DJ_CLAVE: 'ClaveDjProd123' });
    assert.equal(r.sembrados, false);
    const usr = await pool.query('SELECT COUNT(*)::int AS n FROM e5_usuario');
    assert.equal(usr.rows[0].n, 0);
  });
});

test('SEMILLA_MOCK=true exige E5_ADMIN_CLAVE y E5_DJ_CLAVE y rechaza ausencia o claves cortas', async () => {
  const sesiones = cargarSesiones();
  await conEsquemaVacio(async (pool) => {
    await assert.rejects(
      () => inicializarDatosBase({ pool, sesiones, env: { SEMILLA_MOCK: 'true' } }),
      /E5_ADMIN_CLAVE.*E5_DJ_CLAVE/,
    );
    await assert.rejects(
      () => inicializarDatosBase({ pool, sesiones, env: { SEMILLA_MOCK: 'true', E5_ADMIN_CLAVE: 'ClaveAdmin123' } }),
      /E5_ADMIN_CLAVE.*E5_DJ_CLAVE/,
    );
    await assert.rejects(
      () => inicializarDatosBase({ pool, sesiones, env: { SEMILLA_MOCK: 'true', E5_ADMIN_CLAVE: 'corta', E5_DJ_CLAVE: 'ClaveDj123' } }),
      /8 y 128/,
    );
    const usr = await pool.query('SELECT COUNT(*)::int AS n FROM e5_usuario');
    assert.equal(usr.rows[0].n, 0);
  });
});

test('SEMILLA_MOCK=true con claves válidas inicializa sesiones mock y usuarios con hash verificado', async () => {
  const sesiones = cargarSesiones();
  const claveAdmin = 'AdminPruebaSegura2026';
  const claveDj = 'DjPruebaSegura2026';
  await conEsquemaVacio(async (pool) => {
    await inicializarDatosBase({
      pool,
      sesiones,
      env: { SEMILLA_MOCK: 'true', E5_ADMIN_CLAVE: claveAdmin, E5_DJ_CLAVE: claveDj },
    });
    const ses = await pool.query('SELECT id_sesion FROM sesion ORDER BY id_sesion');
    assert.deepEqual(ses.rows.map((r) => r.id_sesion), ['SES-MOCK-001', 'SES-MOCK-002', 'SES-MOCK-003']);
    const usrs = await pool.query('SELECT usuario, rol, clave_hash FROM e5_usuario ORDER BY usuario');
    assert.equal(usrs.rows.length, 2);
    assert.equal(verificarClave(claveAdmin, usrs.rows[0].clave_hash), true);
    assert.equal(verificarClave(claveDj, usrs.rows[1].clave_hash), true);
  });
});
