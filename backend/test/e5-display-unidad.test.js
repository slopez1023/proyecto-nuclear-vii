'use strict';
/**
 * Pruebas unitarias de Pantalla Pública — Fase 1 (sin PostgreSQL ni red).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  DISPLAY_TOKEN_REGEX,
  generarDisplayToken,
  esFormatoDisplayToken,
  enmascararDisplayToken,
} = require('../src/e5/display');

test('generarDisplayToken genera tokens criptográficos únicos, distintos de QR y válidos', () => {
  const t1 = generarDisplayToken();
  const t2 = generarDisplayToken();
  assert.notEqual(t1, t2);
  assert.match(t1, DISPLAY_TOKEN_REGEX);
  assert.match(t2, DISPLAY_TOKEN_REGEX);
  assert.equal(t1.startsWith('disp-'), true);
  assert.ok(t1.length >= 24);
});

test('esFormatoDisplayToken acepta tokens válidos y rechaza inválidos o tokens QR de cliente', () => {
  assert.equal(esFormatoDisplayToken(generarDisplayToken()), true);
  assert.equal(esFormatoDisplayToken('disp-abcdefghijklmnop'), true);
  assert.equal(esFormatoDisplayToken(null), false);
  assert.equal(esFormatoDisplayToken(''), false);
  assert.equal(esFormatoDisplayToken('demo-activa-001'), false);
  assert.equal(esFormatoDisplayToken('ponga-1234567890abcdef'), false);
  assert.equal(esFormatoDisplayToken('disp-corto'), false);
  assert.equal(esFormatoDisplayToken('disp-con espacios 123456'), false);
});

test('enmascararDisplayToken oculta el secreto completo del token', () => {
  const token = generarDisplayToken();
  const mascara = enmascararDisplayToken(token);
  assert.equal(mascara.includes(token), false);
  assert.match(mascara, /^disp-.+\.\.\..{4}$/);
  assert.equal(enmascararDisplayToken('corto'), '***');
});
