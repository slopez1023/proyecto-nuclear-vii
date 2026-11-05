'use strict';
/**
 * Validación de sesiones/QR (B01).
 * La validación del token es real (formato, existencia, estado de sesión y del QR).
 * La FUENTE de sesiones es provisional: data/sesiones.mock.json (ver README).
 */
const fs = require('node:fs');
const path = require('node:path');

const TOKEN_REGEX = /^[A-Za-z0-9_-]{8,64}$/;

function cargarSesiones(ruta = path.join(__dirname, '..', 'data', 'sesiones.mock.json')) {
  const json = JSON.parse(fs.readFileSync(ruta, 'utf8'));
  return json.sesiones;
}

/**
 * @returns {{ok:true, sesion:object} | {ok:false, motivo:'token_invalido'|'sesion_inexistente'|'sesion_cerrada'|'qr_desactivado'}}
 */
function validarToken(token, sesiones) {
  if (typeof token !== 'string' || !TOKEN_REGEX.test(token)) {
    return { ok: false, motivo: 'token_invalido' };
  }
  const sesion = sesiones.find((s) => s.qr_token === token);
  if (!sesion) return { ok: false, motivo: 'sesion_inexistente' };
  if (sesion.estado !== 'activa') return { ok: false, motivo: 'sesion_cerrada' };
  if (sesion.qr_estado !== 'activo') return { ok: false, motivo: 'qr_desactivado' };
  return { ok: true, sesion };
}

module.exports = { TOKEN_REGEX, cargarSesiones, validarToken };
