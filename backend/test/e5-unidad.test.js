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
