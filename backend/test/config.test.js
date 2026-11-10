'use strict';
/**
 * Configuración de arranque: el E4 exige DATABASE_URL (fail fast) y el modo solo-E3 solo existe si se pide
 * de forma explícita con E4_HABILITADO=false. Las pruebas de proceso arrancan `node src/server.js` de verdad.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { leerConfiguracion } = require('../src/config');

// ------------------------------------------------------------------ unidad

test('por defecto el E4 exige DATABASE_URL y el error explica cómo ejecutar solo el E3', () => {
  const r = leerConfiguracion({});
  assert.equal(r.ok, false);
  assert.match(r.error, /DATABASE_URL/);
  assert.match(r.error, /E4_HABILITADO=false/);
  assert.equal(leerConfiguracion({ DATABASE_URL: '' }).ok, false);
});

test('con DATABASE_URL arranca el E4 (E4_HABILITADO vacío o true)', () => {
  for (const extra of [{}, { E4_HABILITADO: '' }, { E4_HABILITADO: 'true' }, { E4_HABILITADO: ' TRUE ' }]) {
    const r = leerConfiguracion({ DATABASE_URL: 'postgres://x', ...extra });
    assert.deepEqual([r.ok, r.e4, r.databaseUrl], [true, true, 'postgres://x']);
  }
});

test('el modo solo-E3 solo existe con E4_HABILITADO=false explícito y avisa de lo que no ofrece', () => {
  const r = leerConfiguracion({ E4_HABILITADO: 'false' });
  assert.deepEqual([r.ok, r.e4, r.databaseUrl], [true, false, null]);
  assert.equal(r.avisos.length, 1);
  assert.match(r.avisos[0], /sin|No hay cola/i);
});

test('un valor que no es true/false es un error: un descuido no puede desactivar el E4 en silencio', () => {
  for (const valor of ['0', 'no', 'falso', 'flase']) {
    const r = leerConfiguracion({ E4_HABILITADO: valor, DATABASE_URL: 'postgres://x' });
    assert.equal(r.ok, false, valor);
    assert.match(r.error, /E4_HABILITADO/);
  }
});

// ------------------------------------------------------------------ proceso real

const RAIZ = path.join(__dirname, '..');

async function puertoLibre() {
  return new Promise((resolve) => {
    const s = net.createServer().listen(0, () => { const { port } = s.address(); s.close(() => resolve(port)); });
  });
}

/** Arranca el servidor con un entorno controlado (valores vacíos pisan lo que haya en backend/.env). */
function arrancar(env) {
  const hijo = spawn(process.execPath, ['src/server.js'], { cwd: RAIZ, env: { ...process.env, DATABASE_URL: '', E4_HABILITADO: '', YOUTUBE_API_KEY: 'x', ...env } });
  const salida = { out: '', err: '' };
  hijo.stdout.on('data', (d) => { salida.out += d; });
  hijo.stderr.on('data', (d) => { salida.err += d; });
  const termino = new Promise((resolve) => hijo.on('exit', (codigo) => resolve(codigo)));
  return { hijo, salida, termino };
}

async function esperar(cond, ms = 10_000) {
  const limite = Date.now() + ms;
  while (Date.now() < limite) { if (cond()) return true; await new Promise((r) => setTimeout(r, 50)); }
  return false;
}

test('proceso: sin DATABASE_URL y sin pedirlo, el servidor NO arranca (código 1) y explica el motivo', { timeout: 20_000 }, async () => {
  const { salida, termino } = arrancar({ PORT: String(await puertoLibre()) });
  assert.equal(await termino, 1);
  assert.match(salida.err, /DATABASE_URL no está configurada/);
});

test('proceso: E4_HABILITADO inválido tampoco arranca', { timeout: 20_000 }, async () => {
  const { salida, termino } = arrancar({ PORT: String(await puertoLibre()), E4_HABILITADO: 'flase' });
  assert.equal(await termino, 1);
  assert.match(salida.err, /E4_HABILITADO debe ser/);
});

test('proceso: con E4_HABILITADO=false arranca como el E3 (acceso por QR sí, cola del E4 no)', { timeout: 20_000 }, async () => {
  const puerto = await puertoLibre();
  const { hijo, salida, termino } = arrancar({ PORT: String(puerto), E4_HABILITADO: 'false' });
  try {
    assert.ok(await esperar(() => /escuchando/.test(salida.out)), `no arrancó: ${salida.err}`);
    assert.match(salida.out, /\(E3\)/);
    assert.match(salida.err, /E4_HABILITADO=false/);
    const acceso = await fetch(`http://127.0.0.1:${puerto}/api/sesiones/demo-activa-001`);
    assert.equal(acceso.status, 200);
    assert.equal((await acceso.json()).id_sesion, 'SES-MOCK-001');
    assert.equal((await fetch(`http://127.0.0.1:${puerto}/api/sesiones/SES-MOCK-001/cola`)).status, 404); // sin rutas del E4
    assert.equal((await fetch(`http://127.0.0.1:${puerto}/api/busqueda?q=a`)).status, 400); // ruta del E3 viva
  } finally {
    hijo.kill();
    await termino;
  }
});
