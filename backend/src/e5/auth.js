'use strict';
/**
 * Autenticación y autorización del panel del E5 (el E3/E4 no tenían: el E4 la delegó explícitamente al E5).
 *
 *  - Claves con scrypt (node:crypto, sin dependencias nuevas) y sal aleatoria; comparación en tiempo constante.
 *  - Token de sesión aleatorio (256 bits) en una cookie HttpOnly + SameSite=Strict; en la base solo su SHA-256.
 *  - Protección CSRF: toda operación que modifica exige la cabecera `X-Ponga-Admin: 1` (un formulario de otro sitio
 *    no puede enviarla y el backend no habilita CORS).
 *  - Límite de intentos fallidos de inicio de sesión por usuario+IP.
 *  - Roles: 'admin' (administrador del establecimiento) y 'dj' (operador de sonido). Cada usuario pertenece a UN
 *    establecimiento y solo ve y opera datos de ese establecimiento.
 *  - Un cliente Android (X-Dispositivo-Id) nunca obtiene acceso: sin cookie/token válido todo responde 401.
 */
const crypto = require('node:crypto');
const repo5 = require('./repositorio-e5');
const { ErrorApi } = require('./comun-e5');

const COOKIE = 'ponga_admin';
const SCRYPT = { N: 16384, r: 8, p: 1, largo: 64 };

function hashClave(clave) {
  const sal = crypto.randomBytes(16);
  const hash = crypto.scryptSync(clave, sal, SCRYPT.largo, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${sal.toString('base64')}$${hash.toString('base64')}`;
}

function verificarClave(clave, guardado) {
  const partes = typeof guardado === 'string' ? guardado.split('$') : [];
  if (partes.length !== 6 || partes[0] !== 'scrypt') return false;
  const [, N, r, p, sal, hash] = partes;
  const esperado = Buffer.from(hash, 'base64');
  const calculado = crypto.scryptSync(String(clave), Buffer.from(sal, 'base64'), esperado.length,
    { N: Number(N), r: Number(r), p: Number(p) });
  return calculado.length === esperado.length && crypto.timingSafeEqual(calculado, esperado);
}

/** Política mínima de claves del personal. */
function validarClaveNueva(clave) {
  if (typeof clave !== 'string' || clave.length < 8 || clave.length > 128) {
    throw new ErrorApi(400, 'clave_invalida', 'La clave debe tener entre 8 y 128 caracteres.');
  }
  return clave;
}

const sha256 = (t) => crypto.createHash('sha256').update(t).digest('hex');

function leerCookies(req) {
  const salida = {};
  for (const parte of String(req.headers.cookie || '').split(';')) {
    const i = parte.indexOf('=');
    if (i < 0) continue;
    const k = parte.slice(0, i).trim();
    if (k) salida[k] = decodeURIComponent(parte.slice(i + 1).trim());
  }
  return salida;
}

function tokenDe(req) {
  const auth = req.get('Authorization');
  if (auth && auth.startsWith('Bearer ')) return { token: auth.slice(7).trim(), viaCookie: false };
  const c = leerCookies(req)[COOKIE];
  return c ? { token: c, viaCookie: true } : { token: null, viaCookie: false };
}

/**
 * @param {{pool:object, ahora:()=>number, duracionMs?:number, cookieSegura?:boolean, maxIntentos?:number, ventanaMs?:number}} deps
 */
function crearAuth({ pool, ahora, duracionMs = 12 * 60 * 60 * 1000, cookieSegura = false, maxIntentos = 5, ventanaMs = 15 * 60 * 1000 }) {
  const intentos = new Map(); // clave usuario|ip -> { n, desde }

  function limitado(clave) {
    const t = ahora();
    const i = intentos.get(clave);
    if (!i || t - i.desde > ventanaMs) return false;
    return i.n >= maxIntentos;
  }
  function fallo(clave) {
    const t = ahora();
    const i = intentos.get(clave);
    if (!i || t - i.desde > ventanaMs) intentos.set(clave, { n: 1, desde: t });
    else i.n++;
  }

  function cookie(valor, maxAgeS) {
    return `${COOKIE}=${encodeURIComponent(valor)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeS}${cookieSegura ? '; Secure' : ''}`;
  }

  async function iniciarSesion(req, res) {
    const b = req.body && typeof req.body === 'object' ? req.body : {};
    const usuario = typeof b.usuario === 'string' ? b.usuario.trim().toLowerCase() : '';
    const clave = typeof b.clave === 'string' ? b.clave : '';
    if (!usuario || !clave || usuario.length > 60 || clave.length > 128) {
      throw new ErrorApi(400, 'credenciales_incompletas', 'Escribe tu usuario y tu clave.');
    }
    const claveLimite = `${usuario}|${req.ip}`;
    if (limitado(claveLimite)) throw new ErrorApi(429, 'demasiados_intentos', 'Demasiados intentos. Espera unos minutos.');
    const fila = await repo5.obtenerUsuarioPorNombre(pool, usuario);
    // Se verifica igualmente con una clave ficticia para no revelar si el usuario existe por el tiempo de respuesta.
    const ok = fila && fila.activo ? verificarClave(clave, fila.clave_hash) : (verificarClave(clave, FICTICIA), false);
    if (!ok) {
      fallo(claveLimite);
      throw new ErrorApi(401, 'credenciales_invalidas', 'Usuario o clave incorrectos.');
    }
    intentos.delete(claveLimite);
    const token = crypto.randomBytes(32).toString('base64url');
    const t = ahora();
    await repo5.insertarSesionUsuario(pool, { tokenHash: sha256(token), idUsuario: fila.id_usuario, ahora: t, expira: t + duracionMs });
    res.set('Set-Cookie', cookie(token, Math.floor(duracionMs / 1000)));
    res.set('Cache-Control', 'no-store');
    return { usuario: usuarioJson(fila), token, expira_en: new Date(t + duracionMs).toISOString() };
  }

  async function cerrarSesion(req, res) {
    const { token } = tokenDe(req);
    if (token) await repo5.cerrarSesionUsuario(pool, sha256(token), ahora());
    res.set('Set-Cookie', cookie('', 0));
  }

  /** Middleware: exige sesión válida; deja `req.usuario`. */
  function autenticar(req, res, next) {
    const { token, viaCookie } = tokenDe(req);
    if (!token) return res.status(401).json({ error: { codigo: 'no_autenticado', mensaje: 'Inicia sesión para continuar.' } });
    // CSRF: con cookie, las operaciones que modifican exigen la cabecera propia del panel.
    if (viaCookie && !['GET', 'HEAD'].includes(req.method) && req.get('X-Ponga-Admin') !== '1') {
      return res.status(403).json({ error: { codigo: 'origen_no_permitido', mensaje: 'Operación no permitida desde este origen.' } });
    }
    repo5.usuarioPorToken(pool, sha256(token), ahora()).then((u) => {
      if (!u) return res.status(401).json({ error: { codigo: 'sesion_expirada', mensaje: 'Tu sesión terminó. Inicia sesión de nuevo.' } });
      req.usuario = u;
      res.set('Cache-Control', 'no-store');
      return next();
    }).catch((err) => {
      console.error('[e5/auth]', err.message);
      res.status(500).json({ error: { codigo: 'error_interno', mensaje: 'Error inesperado.' } });
    });
  }

  /** Middleware: exige uno de los roles. */
  const exigirRol = (...roles) => (req, res, next) => {
    if (!req.usuario || !roles.includes(req.usuario.rol)) {
      return res.status(403).json({ error: { codigo: 'permiso_denegado', mensaje: 'Tu rol no tiene permiso para esta acción.' } });
    }
    return next();
  };

  return { iniciarSesion, cerrarSesion, autenticar, exigirRol };
}

const FICTICIA = hashClave('clave-ficticia-para-tiempo-constante');

const usuarioJson = (u) => ({
  id_usuario: `USR-${u.id_usuario}`,
  usuario: u.usuario,
  nombre: u.nombre,
  rol: u.rol,
  id_establecimiento: u.id_establecimiento,
  establecimiento: u.establecimiento,
});

/** Crea (o actualiza la clave de) un usuario del personal. Lo usan el script y el arranque con usuarios demo. */
async function crearOActualizarUsuario(pool, { idEstablecimiento, usuario, nombre, rol, clave }, ahora = Date.now()) {
  if (!['admin', 'dj'].includes(rol)) throw new Error('rol debe ser admin o dj');
  validarClaveNueva(clave);
  const nombreUsuario = String(usuario).trim().toLowerCase();
  if (!/^[a-z0-9._-]{2,60}$/.test(nombreUsuario)) throw new Error('usuario: 2-60 caracteres a-z 0-9 . _ -');
  const hash = hashClave(clave);
  const id = await repo5.insertarUsuario(pool, { idEstablecimiento, usuario: nombreUsuario, nombre, rol, claveHash: hash, ahora });
  if (id) return { creado: true };
  await repo5.actualizarClaveUsuario(pool, nombreUsuario, hash);
  return { creado: false };
}

module.exports = { COOKIE, hashClave, verificarClave, validarClaveNueva, crearAuth, usuarioJson, crearOActualizarUsuario, leerCookies };
