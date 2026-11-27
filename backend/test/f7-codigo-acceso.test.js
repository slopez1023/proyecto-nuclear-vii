'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  CODIGO_REGEX,
  generarCodigoSeguro,
  crearLimitadorIntentos,
} = require('../src/e5/codigo-acceso');

test('generarCodigoSeguro produce exactamente 6 dígitos e incluye ceros iniciales en 10.000 muestras', () => {
  let conCeroInicial = 0;
  for (let i = 0; i < 10_000; i += 1) {
    const codigo = generarCodigoSeguro();
    assert.equal(typeof codigo, 'string');
    assert.match(codigo, CODIGO_REGEX);
    if (codigo.startsWith('0')) conCeroInicial += 1;
  }
  assert.ok(conCeroInicial > 500, `Se esperaban ~1000 códigos con cero inicial; hubo ${conCeroInicial}`);
});

test('CODIGO_REGEX valida cadenas de exactamente 6 dígitos numéricos', () => {
  assert.equal(CODIGO_REGEX.test('000000'), true);
  assert.equal(CODIGO_REGEX.test('004281'), true);
  assert.equal(CODIGO_REGEX.test('999999'), true);

  assert.equal(CODIGO_REGEX.test('12345'), false);
  assert.equal(CODIGO_REGEX.test('1234567'), false);
  assert.equal(CODIGO_REGEX.test('12345a'), false);
  assert.equal(CODIGO_REGEX.test(' 123456'), false);
  assert.equal(CODIGO_REGEX.test(''), false);
});

test('crearLimitadorIntentos aplica límites por dispositivo e IP, retardo progresivo, liberación y poda', () => {
  let t = 1_700_000_000_000;
  const lim = crearLimitadorIntentos({ ahora: () => t, maxClaves: 4 });

  // Dispositivo A falla 5 veces -> 0, 0, 250, 500, 750 ms y luego bloqueado
  const retardos = [];
  for (let i = 0; i < 5; i += 1) {
    assert.equal(lim.comprobar({ ip: '1.1.1.1', dispositivo: 'disp-a' }).bloqueado, false);
    lim.reservar({ ip: '1.1.1.1', dispositivo: 'disp-a' });
    retardos.push(lim.retardoMs({ ip: '1.1.1.1', dispositivo: 'disp-a' }));
  }
  assert.deepEqual(retardos, [0, 0, 250, 500, 750]);

  const bloqDisp = lim.comprobar({ ip: '1.1.1.1', dispositivo: 'disp-a' });
  assert.equal(bloqDisp.bloqueado, true);
  assert.equal(bloqDisp.tipo, 'dispositivo');
  assert.ok(bloqDisp.reintentarEnS >= 1);

  // Otro dispositivo desde otra IP no se ve afectado
  assert.equal(lim.comprobar({ ip: '2.2.2.2', dispositivo: 'disp-b' }).bloqueado, false);

  // Un éxito libera su reserva de fallo
  const rOk = lim.reservar({ ip: '2.2.2.2', dispositivo: 'disp-b' });
  lim.liberar(rOk);
  assert.equal(lim.retardoMs({ ip: '2.2.2.2', dispositivo: 'disp-b' }), 0);

  // Tope de retardo en 2000 ms al acumular varios fallos por IP
  for (let i = 0; i < 12; i += 1) {
    lim.reservar({ ip: '3.3.3.3', dispositivo: `disp-ip-${i}` });
  }
  assert.equal(lim.retardoMs({ ip: '3.3.3.3', dispositivo: 'disp-otro' }), 2000);

  // 20 fallos por IP bloquean la IP aunque cambie el dispositivo
  for (let i = 12; i < 20; i += 1) {
    lim.reservar({ ip: '3.3.3.3', dispositivo: `disp-ip-${i}` });
  }
  const bloqIp = lim.comprobar({ ip: '3.3.3.3', dispositivo: 'disp-nuevo' });
  assert.equal(bloqIp.bloqueado, true);
  assert.equal(bloqIp.tipo, 'ip_fallos');

  // maxClaves mantiene acotado el número de entradas en memoria
  assert.ok(lim._tamano().dispositivos <= 4);

  // Tras expirar la ventana de 15 minutos, la poda limpia el historial y desbloquea
  t += 15 * 60_000 + 1;
  lim.podarTodo();
  assert.equal(lim.comprobar({ ip: '1.1.1.1', dispositivo: 'disp-a' }).bloqueado, false);
  assert.equal(lim.comprobar({ ip: '3.3.3.3', dispositivo: 'disp-nuevo' }).bloqueado, false);
});

test('crearLimitadorIntentos aplica límite de 60 peticiones por minuto por IP', () => {
  let t = 1_700_000_000_000;
  const lim = crearLimitadorIntentos({ ahora: () => t, maxFallosDispositivo: 100, maxFallosIp: 100 });
  for (let i = 0; i < 60; i += 1) {
    assert.equal(lim.comprobar({ ip: '9.9.9.9', dispositivo: `d-${i}` }).bloqueado, false);
    const r = lim.reservar({ ip: '9.9.9.9', dispositivo: `d-${i}` });
    lim.liberar(r);
  }
  const chk = lim.comprobar({ ip: '9.9.9.9', dispositivo: 'd-extra' });
  assert.equal(chk.bloqueado, true);
  assert.equal(chk.tipo, 'ip_frecuencia');

  t += 60_001;
  assert.equal(lim.comprobar({ ip: '9.9.9.9', dispositivo: 'd-extra' }).bloqueado, false);
});
