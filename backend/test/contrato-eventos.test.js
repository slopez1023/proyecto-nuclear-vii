'use strict';
/**
 * Prueba de contrato de eventos (integración): los cuerpos de test/fixtures/eventos-e3.json son los
 * mismos que verifica la app Android. Se envían por HTTP a la app Express real y se comprueba lo que
 * queda almacenado. YouTube no interviene.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { crearApp } = require('../src/app');
const { cargarSesiones } = require('../src/sesiones');
const { crearAlmacen } = require('../src/eventos');
const fixtures = require('./fixtures/eventos-e3.json');

const { _aviso, ...casos } = fixtures;

async function conServidor(fn) {
  const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'eventos-'));
  const almacen = crearAlmacen(path.join(carpeta, 'eventos.jsonl'));
  const app = crearApp({ sesiones: cargarSesiones(), youtube: { buscar: async () => [] }, almacenEventos: almacen });
  const srv = app.listen(0);
  try {
    await fn(`http://127.0.0.1:${srv.address().port}`, almacen.ruta);
  } finally {
    srv.close();
    fs.rmSync(carpeta, { recursive: true, force: true });
  }
}

const leerEventos = (ruta) => fs.readFileSync(ruta, 'utf8').trim().split('\n').map((l) => JSON.parse(l));

test('el backend acepta todos los cuerpos del contrato y los guarda con el esquema completo', async () => {
  await conServidor(async (base, ruta) => {
    for (const [nombre, cuerpo] of Object.entries(casos)) {
      const r = await fetch(`${base}/api/eventos`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });
      assert.equal(r.status, 202, nombre);
      assert.ok((await r.json()).evento_id, nombre);
    }
    const guardados = leerEventos(ruta);
    assert.equal(guardados.length, Object.keys(casos).length);
    for (const e of guardados) {
      assert.equal(e.actor, 'cliente');
      assert.equal(e.version_esquema, '1.0');
      assert.match(e.fecha_hora, /^\d{4}-\d{2}-\d{2}T.*Z$/); // UTC
      assert.equal(e.dispositivo_id, fixtures.dispositivo_unido.dispositivo_id);
      assert.ok(e.evento_id);
    }
    const busqueda = guardados.find((e) => e.tipo === 'busqueda_realizada' && e.datos_evento.desde_cache);
    assert.deepEqual(busqueda.datos_evento, { termino: 'Queen Bohemian Rhapsody', cantidad_resultados: 10, desde_cache: true });
    assert.equal(guardados.find((e) => e.tipo === 'dispositivo_unido' && e.datos_evento.recurrente).tipo, 'dispositivo_unido');
  });
});

test('el backend rechaza eventos fuera de E3 y datos no seudónimos, sin guardar nada', async () => {
  await conServidor(async (base, ruta) => {
    const post = (cuerpo) => fetch(`${base}/api/eventos`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });
    const base_ = casos.dispositivo_unido;
    assert.equal((await post({ ...base_, tipo: 'voto_registrado' })).status, 400);
    assert.equal((await post({ ...base_, dispositivo_id: 'ANDROID-ID-1234' })).status, 400);
    assert.equal((await post({ ...base_, sesion_id: '' })).status, 400);
    assert.equal((await post({ ...casos.busqueda_realizada, datos: { termino: '', cantidad_resultados: 1 } })).status, 400);
    assert.equal(fs.existsSync(ruta), false);
  });
});
