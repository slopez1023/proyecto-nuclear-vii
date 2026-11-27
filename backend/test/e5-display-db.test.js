'use strict';
/**
 * Pruebas de repositorio, migración 105, correspondencia establecimiento-sesión,
 * concurrencia, revocación y regeneración transaccional de e5_display (requiere PostgreSQL).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { crearBaseDePrueba } = require('./helpers/db');
const { CARPETA_MIGRACIONES_E5 } = require('../src/e5/server-e5');
const { migrar } = require('../src/db');
const repo5 = require('../src/e5/repositorio-e5');
const { crearDisplayServicio, enmascararDisplayToken } = require('../src/e5/display');

async function crearEntornoDisplay() {
  const db = await crearBaseDePrueba();
  await migrar(db.pool, CARPETA_MIGRACIONES_E5);
  const eventos = [];
  const emisor = { emitir: (e) => eventos.push(e) };
  let reloj = 1_796_000_000_000;
  const servicio = crearDisplayServicio({ pool: db.pool, ahora: () => ++reloj, emisor });
  return { ...db, eventos, servicio };
}

test('e5_display: rechaza inserción cuando id_establecimiento e id_sesion no corresponden', async () => {
  const e = await crearEntornoDisplay();
  try {
    await assert.rejects(
      () => repo5.insertarDisplay(e.pool, {
        idEst: 'EST-MOCK-002',
        idSesion: 'SES-MOCK-001',
        displayToken: 'disp-mismatchtoken123456',
        ahora: Date.now(),
      }),
      /no pertenece al establecimiento/,
    );
  } finally {
    await e.cerrar();
  }
});

test('e5_display: asegurarDisplay es idempotente bajo concurrencia y no guarda token completo en auditoría', async () => {
  const e = await crearEntornoDisplay();
  try {
    const [d1, d2, d3] = await Promise.all([
      e.servicio.asegurarDisplay('EST-MOCK-001', 'SES-MOCK-001'),
      e.servicio.asegurarDisplay('EST-MOCK-001', 'SES-MOCK-001'),
      e.servicio.asegurarDisplay('EST-MOCK-001', 'SES-MOCK-001'),
    ]);
    assert.equal(d1.id_display, d2.id_display);
    assert.equal(d2.id_display, d3.id_display);
    assert.equal(d1.display_token, d2.display_token);

    const reg = await e.pool.query("SELECT detalle::text AS d FROM e5_registro WHERE accion = 'display_creado'");
    assert.equal(reg.rows.length, 1);
    assert.equal(reg.rows[0].d.includes(d1.display_token), false);
    assert.equal(reg.rows[0].d.includes(enmascararDisplayToken(d1.display_token)), true);
  } finally {
    await e.cerrar();
  }
});

test('e5_display: regenerarDisplay revoca el token anterior y activa el nuevo en una sola transacción', async () => {
  const e = await crearEntornoDisplay();
  try {
    const inicial = await e.servicio.asegurarDisplay('EST-MOCK-001', 'SES-MOCK-001');
    const nuevo = await e.servicio.regenerarDisplay('EST-MOCK-001', 'SES-MOCK-001');

    assert.notEqual(nuevo.display_token, inicial.display_token);
    assert.equal(await e.servicio.resolverDisplay(inicial.display_token), null);

    const resuelto = await e.servicio.resolverDisplay(nuevo.display_token);
    assert.equal(resuelto.id_sesion, 'SES-MOCK-001');
    assert.equal(resuelto.id_establecimiento, 'EST-MOCK-001');

    const activos = await e.pool.query("SELECT COUNT(*)::int AS n FROM e5_display WHERE id_sesion = 'SES-MOCK-001' AND activo = true");
    assert.equal(activos.rows[0].n, 1);
  } finally {
    await e.cerrar();
  }
});

test('e5_display: revocarDisplay invalida el token y rechaza sesión de otro establecimiento', async () => {
  const e = await crearEntornoDisplay();
  try {
    const d = await e.servicio.asegurarDisplay('EST-MOCK-001', 'SES-MOCK-001');
    await assert.rejects(
      () => e.servicio.asegurarDisplay('EST-MOCK-002', 'SES-MOCK-001'),
      /no existe en este establecimiento/,
    );
    const r = await e.servicio.revocarDisplay('EST-MOCK-001', 'SES-MOCK-001');
    assert.equal(r.revocado, true);
    assert.equal(await e.servicio.resolverDisplay(d.display_token), null);
  } finally {
    await e.cerrar();
  }
});
