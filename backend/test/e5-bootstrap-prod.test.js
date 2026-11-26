'use strict';
/**
 * Pruebas del bootstrap seguro de producción (sin datos MOCK y en transacción atómica).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { Client } = require('pg');
const { crearPool, migrar } = require('../src/db');
const { TOKEN_REGEX, validarTokenEnBd } = require('../src/sesiones');
const { verificarClave } = require('../src/e5/auth');
const { CARPETA_MIGRACIONES_E5 } = require('../src/e5/server-e5');
const {
  generarQrTokenSeguro,
  enmascararToken,
  ejecutarBootstrapProduccion,
} = require('../src/e5/bootstrap');

async function conEsquemaVacio(fn) {
  const url = process.env.DATABASE_URL_TEST;
  if (!url) throw new Error('DATABASE_URL_TEST no está definida.');
  const schema = `test_boot_${crypto.randomBytes(6).toString('hex')}`;
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

const envValido = () => ({
  BOOTSTRAP_EST_ID: 'EST-PROD-001',
  BOOTSTRAP_EST_NOMBRE: 'La Terraza Real',
  BOOTSTRAP_SESION_ID: 'SES-PROD-001',
  BOOTSTRAP_ADMIN_USUARIO: 'admin.terraza',
  BOOTSTRAP_ADMIN_NOMBRE: 'Admin Terraza',
  E5_ADMIN_CLAVE: 'ClaveAdminProd2026!',
  BOOTSTRAP_DJ_USUARIO: 'dj.terraza',
  BOOTSTRAP_DJ_NOMBRE: 'DJ Terraza',
  E5_DJ_CLAVE: 'ClaveDjProd2026!',
});

test('generarQrTokenSeguro produce tokens únicos, impredecibles y válidos para TOKEN_REGEX', () => {
  const t1 = generarQrTokenSeguro();
  const t2 = generarQrTokenSeguro();
  assert.notEqual(t1, t2);
  assert.match(t1, TOKEN_REGEX);
  assert.ok(t1.length >= 24);
  assert.equal(enmascararToken(t1).includes(t1), false);
});

test('bootstrap exitoso en BD vacía crea establecimiento, sesión activa, QR, config, usuarios y cero MOCK', async () => {
  const env = envValido();
  await conEsquemaVacio(async (pool) => {
    const res = await ejecutarBootstrapProduccion({ pool, env });
    assert.equal(res.id_establecimiento, 'EST-PROD-001');
    assert.equal(res.id_sesion, 'SES-PROD-001');
    assert.equal(res.qr_token_enmascarado, enmascararToken(
      (await pool.query('SELECT qr_token FROM sesion WHERE id_sesion = $1', ['SES-PROD-001'])).rows[0].qr_token,
    ));

    // No expone secretos ni token completo en el resultado ni en e5_registro
    const resTexto = JSON.stringify(res);
    assert.equal(resTexto.includes(env.E5_ADMIN_CLAVE), false);
    assert.equal(resTexto.includes(env.E5_DJ_CLAVE), false);

    const ests = await pool.query('SELECT id_establecimiento, nombre, estado FROM establecimiento');
    assert.equal(ests.rows.length, 1);
    assert.equal(ests.rows[0].id_establecimiento, 'EST-PROD-001');
    assert.equal(ests.rows.some((r) => r.id_establecimiento.includes('MOCK')), false);

    const sess = await pool.query('SELECT id_sesion, qr_token, estado, qr_estado FROM sesion');
    assert.equal(sess.rows.length, 1);
    assert.equal(sess.rows[0].estado, 'activa');
    assert.equal(sess.rows[0].qr_estado, 'activo');
    assert.match(sess.rows[0].qr_token, TOKEN_REGEX);
    assert.equal(sess.rows.some((r) => r.id_sesion.includes('MOCK')), false);

    // Token QR válido en flujo real E3/E4
    const qrCheck = await validarTokenEnBd(sess.rows[0].qr_token, pool);
    assert.equal(qrCheck.ok, true);
    assert.equal(qrCheck.sesion.id_sesion, 'SES-PROD-001');

    // Hashes scrypt válidos
    const usrs = await pool.query('SELECT usuario, rol, clave_hash FROM e5_usuario ORDER BY rol');
    assert.equal(usrs.rows.length, 2);
    assert.equal(usrs.rows[0].rol, 'admin');
    assert.equal(verificarClave(env.E5_ADMIN_CLAVE, usrs.rows[0].clave_hash), true);
    assert.equal(verificarClave('incorrecta', usrs.rows[0].clave_hash), false);
    assert.equal(usrs.rows[1].rol, 'dj');
    assert.equal(verificarClave(env.E5_DJ_CLAVE, usrs.rows[1].clave_hash), true);

    // Registro de auditoría sin contraseñas ni token completo
    const reg = await pool.query("SELECT detalle::text AS d FROM e5_registro WHERE accion = 'bootstrap_produccion'");
    assert.equal(reg.rows.length, 1);
    assert.equal(reg.rows[0].d.includes(sess.rows[0].qr_token), false);
    assert.equal(reg.rows[0].d.includes(env.E5_ADMIN_CLAVE), false);
    assert.equal(reg.rows[0].d.includes(env.E5_DJ_CLAVE), false);
  });
});

test('bootstrap rechaza segunda ejecución y datos previos incompatibles', async () => {
  const env = envValido();
  await conEsquemaVacio(async (pool) => {
    await ejecutarBootstrapProduccion({ pool, env });
    await assert.rejects(
      () => ejecutarBootstrapProduccion({ pool, env }),
      /ya contiene datos iniciales/,
    );
  });

  await conEsquemaVacio(async (pool) => {
    await pool.query("INSERT INTO establecimiento (id_establecimiento, nombre) VALUES ('EST-PREVIO', 'Previo')");
    await assert.rejects(
      () => ejecutarBootstrapProduccion({ pool, env }),
      /ya contiene datos iniciales/,
    );
  });
});

test('bootstrap ejecuta rollback completo ante errores sin dejar instalación parcial', async () => {
  const env = envValido();
  await conEsquemaVacio(async (pool) => {
    await assert.rejects(
      () => ejecutarBootstrapProduccion({
        pool,
        env,
        antesDeConfirmar: async () => { throw new Error('fallo_simulado_en_transaccion'); },
      }),
      /fallo_simulado_en_transaccion/,
    );
    const est = await pool.query('SELECT COUNT(*)::int AS n FROM establecimiento');
    const ses = await pool.query('SELECT COUNT(*)::int AS n FROM sesion');
    const usr = await pool.query('SELECT COUNT(*)::int AS n FROM e5_usuario');
    assert.equal(est.rows[0].n, 0);
    assert.equal(ses.rows[0].n, 0);
    assert.equal(usr.rows[0].n, 0);
  });
});

test('bootstrap rechaza prefijos MOCK, claves faltantes o claves inválidas', async () => {
  await conEsquemaVacio(async (pool) => {
    await assert.rejects(
      () => ejecutarBootstrapProduccion({ pool, env: { ...envValido(), BOOTSTRAP_EST_ID: 'EST-MOCK-999' } }),
      /MOCK/,
    );
    await assert.rejects(
      () => ejecutarBootstrapProduccion({ pool, env: { ...envValido(), BOOTSTRAP_SESION_ID: 'SES-MOCK-999' } }),
      /MOCK/,
    );
    await assert.rejects(
      () => ejecutarBootstrapProduccion({ pool, env: { ...envValido(), E5_ADMIN_CLAVE: '' } }),
      /E5_ADMIN_CLAVE/,
    );
    await assert.rejects(
      () => ejecutarBootstrapProduccion({ pool, env: { ...envValido(), E5_DJ_CLAVE: '123' } }),
      /8 y 128/,
    );
  });
});
