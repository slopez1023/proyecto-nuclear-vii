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

/**
 * Igual que [validarToken] pero contra la tabla `sesion` de PostgreSQL (la fuente del E4). Así el acceso del E3 y
 * la cola del E4 coinciden: una sesión cerrada o con el QR desactivado en la base se rechaza ya al escanear.
 */
async function validarTokenEnBd(token, pool) {
  if (typeof token !== 'string' || !TOKEN_REGEX.test(token)) return { ok: false, motivo: 'token_invalido' };
  const fila = await require('./db/repositorio').obtenerSesionPorToken(pool, token);
  if (!fila) return { ok: false, motivo: 'sesion_inexistente' };
  if (fila.estado !== 'activa') return { ok: false, motivo: 'sesion_cerrada' };
  if (fila.qr_estado !== 'activo') return { ok: false, motivo: 'qr_desactivado' };
  return {
    ok: true,
    sesion: {
      id_sesion: fila.id_sesion,
      estado: fila.estado,
      establecimiento: { id_establecimiento: fila.id_establecimiento, nombre: fila.nombre },
    },
  };
}

module.exports = { TOKEN_REGEX, cargarSesiones, validarToken, validarTokenEnBd };
