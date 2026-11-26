'use strict';
/**
 * Entregable 5 — Pruebas unitarias (sin base de datos ni red).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluarHorario, zonaValida } = require('../src/e5/horarios');
const { hashClave, verificarClave, validarClaveNueva } = require('../src/e5/auth');
const { aMinutos, aHora, fechaValida } = require('../src/e5/comun-e5');
const { crearEmisorE5 } = require('../src/e5/eventos-e5');
const { anonimizarDispositivo, limpiarEvento } = require('../src/e5/analitica');

test('horarios: franja normal y franja que cruza la medianoche (America/Bogota)', () => {
  const cfg = {
    horarios: [
      { dia_semana: 5, apertura_min: 20 * 60, cierre_min: 3 * 60, activo: true }, // viernes 20:00 -> sábado 03:00
      { dia_semana: 6, apertura_min: 18 * 60, cierre_min: 2 * 60, activo: true },
    ],
    excepciones: [],
  };
  // Viernes 2026-11-20 21:30 America/Bogota (UTC-5 -> 2026-11-21T02:30Z)
  assert.equal(evaluarHorario(cfg, Date.UTC(2026, 10, 21, 2, 30), 'America/Bogota').abierto, true);
  // Sábado 2026-11-21 02:15 America/Bogota (madrugada del viernes) -> abierto
  const mad = evaluarHorario(cfg, Date.UTC(2026, 10, 21, 7, 15), 'America/Bogota');
  assert.equal(mad.abierto, true);
  assert.equal(mad.motivo, 'franja_de_ayer');
  // Sábado 2026-11-21 04:00 America/Bogota -> cerrado
  assert.equal(evaluarHorario(cfg, Date.UTC(2026, 10, 21, 9, 0), 'America/Bogota').abierto, false);
  // Jueves -> día cerrado
  assert.equal(evaluarHorario(cfg, Date.UTC(2026, 10, 19, 23, 0), 'America/Bogota').motivo, 'dia_cerrado');
});

test('horarios: las excepciones reemplazan la franja del día', () => {
  const cfg = {
    horarios: [{ dia_semana: 5, apertura_min: 18 * 60, cierre_min: 23 * 60, activo: true }],
    excepciones: [
      { fecha: '2026-11-20', cerrado: true, apertura_min: null, cierre_min: null },
      { fecha: '2026-11-21', cerrado: false, apertura_min: 14 * 60, cierre_min: 20 * 60 },
    ],
  };
  assert.equal(evaluarHorario(cfg, Date.UTC(2026, 10, 21, 0, 0), 'America/Bogota').abierto, false); // viernes 19:00 cerrado por excepción
  assert.equal(evaluarHorario(cfg, Date.UTC(2026, 10, 21, 20, 0), 'America/Bogota').abierto, true); // sábado 15:00 abierto por excepción
  assert.equal(zonaValida('America/Bogota'), true);
  assert.equal(zonaValida('Zona/Inexistente'), false);
});

test('auth: scrypt verifica claves válidas y rechaza incorrectas', () => {
  const h = hashClave('ClaveSegura123');
  assert.match(h, /^scrypt\$/);
  assert.equal(verificarClave('ClaveSegura123', h), true);
  assert.equal(verificarClave('otra-clave', h), false);
  assert.throws(() => validarClaveNueva('corta'));
});

test('comun-e5: conversión de horas y fechas', () => {
  assert.equal(aMinutos('20:15'), 1215);
  assert.equal(aHora(1215), '20:15');
  assert.throws(() => aMinutos('25:00'));
  assert.equal(fechaValida('2026-11-21'), true);
  assert.equal(fechaValida('2026-02-30'), false);
});

test('eventos-e5: emite eventos administrativos con el sobre estándar', () => {
  const guardados = [];
  const emisor = crearEmisorE5({
    almacenEventos: { guardar: (e) => guardados.push(e) },
    ahora: () => Date.UTC(2026, 10, 21, 12, 0),
  });
  emisor.emitir({
    tipo: 'qr_activado',
    sesion_id: 'SES-MOCK-001',
    id_establecimiento: 'EST-MOCK-001',
    usuario: { id_usuario: 7, rol: 'admin' },
    datos_evento: { origen: 'manual' },
  });
  assert.equal(guardados.length, 1);
  assert.equal(guardados[0].tipo, 'qr_activado');
  assert.equal(guardados[0].actor, 'administrador');
  assert.equal(guardados[0].datos_evento.id_usuario, 'USR-7');
});

test('analitica: anonimiza dispositivo_id de forma irreversible y limpia líneas corruptas', () => {
  const uuidReal = '550e8400-e29b-41d4-a716-446655440000';
  const h1 = anonimizarDispositivo(uuidReal);
  const h2 = anonimizarDispositivo(uuidReal);
  assert.match(h1, /^anon_[0-9a-f]{16}$/);
  assert.equal(h1, h2);
  assert.equal(h1.includes('550e8400'), false);
  assert.equal(anonimizarDispositivo(null), null);

  assert.equal(limpiarEvento('{corrupto').ok, false);
  assert.equal(limpiarEvento(JSON.stringify({ evento_id: '1', tipo: 'x', fecha_hora: 'invalida' })).ok, false);

  const ok = limpiarEvento(JSON.stringify({
    evento_id: 'ev-123',
    tipo: 'solicitud_creada',
    fecha_hora: '2026-11-23T12:00:00.000Z',
    sesion_id: 'SES-1',
    id_establecimiento: 'EST-1',
    actor: 'servidor',
    dispositivo_id: uuidReal,
    version_esquema: '1.2',
    datos_evento: { total_votos: 2 },
  }));
  assert.equal(ok.ok, true);
  assert.equal(ok.evento.dispositivo_hash, h1);
});

test('bonus: inferencia de género y validación de filtros del catálogo', () => {
  const { inferirGenero, parsearFiltros } = require('../src/e5/bonus');
  assert.equal(inferirGenero('Gasolina', 'Daddy Yankee'), 'reggaeton');
  assert.equal(inferirGenero('Hoy tengo ganas de ti', 'Marc Anthony Salsa Oficial'), 'salsa');
  assert.equal(inferirGenero('Canción sin pistas', 'Canal X'), 'otros');

  const f = parsearFiltros({ genero: 'Salsa', duracion_min: '120', duracion_max: '300', orden: 'duracion_asc', limite: '10' });
  assert.equal(f.genero, 'salsa');
  assert.equal(f.duracionMin, 120);
  assert.equal(f.orden, 'duracion_asc');
  assert.equal(parsearFiltros({}).orden, 'popularidad');
  assert.throws(() => parsearFiltros({ duracion_min: '500', duracion_max: '10' }));
  assert.throws(() => parsearFiltros({ orden: 'inexistente' }));
  assert.throws(() => parsearFiltros({ limite: '1000' }));
});
