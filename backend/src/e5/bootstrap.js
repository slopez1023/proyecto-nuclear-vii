'use strict';
/**
 * Bootstrap seguro de producción (ejecución manual única).
 * Crea el establecimiento real inicial, la primera sesión activa con QR impredecible,
 * su configuración E5 y los usuarios admin y dj en una sola transacción atómica.
 * Nunca crea datos MOCK ni acepta contraseñas predeterminadas.
 */
const crypto = require('node:crypto');
const repo4 = require('../db/repositorio');
const repo5 = require('./repositorio-e5');
const { validarClaveNueva, crearOActualizarUsuario } = require('./auth');
const { asignarCodigoNuevo } = require('./codigo-acceso');
const { TOKEN_REGEX } = require('../sesiones');

const ID_EST_REGEX = /^[A-Za-z0-9_-]{4,40}$/;
const ID_SESION_REGEX = /^[A-Za-z0-9_-]{4,40}$/;
const USUARIO_REGEX = /^[a-z0-9._-]{2,60}$/;

function generarQrTokenSeguro() {
  const token = `ponga-${crypto.randomBytes(18).toString('base64url')}`;
  if (!TOKEN_REGEX.test(token)) throw new Error('Error interno al generar token QR seguro.');
  return token;
}

function enmascararToken(token) {
  const s = String(token || '');
  if (s.length <= 12) return '***';
  return `${s.slice(0, 8)}...${s.slice(-4)}`;
}

function leerParametrosBootstrap(env = process.env) {
  const idEst = String(env.BOOTSTRAP_EST_ID || 'EST-PROD-001').trim();
  const nombreEst = String(env.BOOTSTRAP_EST_NOMBRE || '').trim();
  const idSesion = String(env.BOOTSTRAP_SESION_ID || 'SES-PROD-001').trim();
  const adminUsuario = String(env.BOOTSTRAP_ADMIN_USUARIO || 'admin').trim().toLowerCase();
  const adminNombre = String(env.BOOTSTRAP_ADMIN_NOMBRE || 'Administrador').trim();
  const claveAdmin = env.E5_ADMIN_CLAVE;
  const djUsuario = String(env.BOOTSTRAP_DJ_USUARIO || 'dj').trim().toLowerCase();
  const djNombre = String(env.BOOTSTRAP_DJ_NOMBRE || 'DJ').trim();
  const claveDj = env.E5_DJ_CLAVE;

  if (!ID_EST_REGEX.test(idEst) || idEst.toUpperCase().startsWith('EST-MOCK')) {
    throw new Error('BOOTSTRAP_EST_ID inválido o reservado para MOCK (usa 4-40 caracteres A-Za-z0-9_- sin prefijo EST-MOCK).');
  }
  if (nombreEst.length < 2 || nombreEst.length > 120) {
    throw new Error('BOOTSTRAP_EST_NOMBRE es obligatorio (entre 2 y 120 caracteres).');
  }
  if (!ID_SESION_REGEX.test(idSesion) || idSesion.toUpperCase().startsWith('SES-MOCK')) {
    throw new Error('BOOTSTRAP_SESION_ID inválido o reservado para MOCK (usa 4-40 caracteres A-Za-z0-9_- sin prefijo SES-MOCK).');
  }
  if (!USUARIO_REGEX.test(adminUsuario) || !USUARIO_REGEX.test(djUsuario)) {
    throw new Error('Los nombres de usuario deben tener entre 2 y 60 caracteres (a-z, 0-9, ., _, -).');
  }
  if (adminUsuario === djUsuario) {
    throw new Error('BOOTSTRAP_ADMIN_USUARIO y BOOTSTRAP_DJ_USUARIO deben ser distintos.');
  }
  if (adminNombre.length < 2 || adminNombre.length > 100 || djNombre.length < 2 || djNombre.length > 100) {
    throw new Error('BOOTSTRAP_ADMIN_NOMBRE y BOOTSTRAP_DJ_NOMBRE deben tener entre 2 y 100 caracteres.');
  }
  if (!claveAdmin || !claveDj) {
    throw new Error('Faltan E5_ADMIN_CLAVE y/o E5_DJ_CLAVE para inicializar producción.');
  }
  validarClaveNueva(claveAdmin);
  validarClaveNueva(claveDj);

  return {
    idEst,
    nombreEst,
    idSesion,
    adminUsuario,
    adminNombre,
    claveAdmin,
    djUsuario,
    djNombre,
    claveDj,
  };
}

/**
 * Ejecuta el bootstrap de producción de una sola vez dentro de una transacción.
 * Rechaza la ejecución si ya existen establecimientos, sesiones o usuarios en la base.
 */
async function ejecutarBootstrapProduccion({ pool, env = process.env, ahora = Date.now, antesDeConfirmar = null }) {
  const p = leerParametrosBootstrap(env);
  const qrToken = generarQrTokenSeguro();
  const t = ahora();

  return repo4.conTransaccion(pool, async (client) => {
    const [estRes, sesRes, usrRes] = await Promise.all([
      client.query('SELECT COUNT(*)::int AS n FROM establecimiento'),
      client.query('SELECT COUNT(*)::int AS n FROM sesion'),
      client.query('SELECT COUNT(*)::int AS n FROM e5_usuario'),
    ]);

    const existentes = {
      establecimientos: estRes.rows[0].n,
      sesiones: sesRes.rows[0].n,
      usuarios: usrRes.rows[0].n,
    };
    if (existentes.establecimientos > 0 || existentes.sesiones > 0 || existentes.usuarios > 0) {
      throw new Error(
        `La base ya contiene datos iniciales (establecimientos=${existentes.establecimientos}, sesiones=${existentes.sesiones}, usuarios=${existentes.usuarios}); bootstrap rechazado.`,
      );
    }

    await client.query(
      `INSERT INTO establecimiento (id_establecimiento, nombre, estado) VALUES ($1, $2, 'activo')`,
      [p.idEst, p.nombreEst],
    );

    await repo5.insertarSesion(client, { idSesion: p.idSesion, idEst: p.idEst, qrToken });
    await asignarCodigoNuevo(client, { idSesion: p.idSesion, t });
    await repo5.fijarEstadoSesion(client, p.idSesion, { estado: 'activa', qrEstado: 'activo' });
    await repo5.asegurarConfig(client, p.idEst, t);
    await repo5.actualizarConfig(client, p.idEst, { id_sesion_principal: p.idSesion }, t);
    await repo5.asegurarEstadoReproduccion(client, p.idSesion, t);
    await repo5.abrirJornada(client, p.idSesion, 'manual', t);

    const adminRes = await crearOActualizarUsuario(client, {
      idEstablecimiento: p.idEst,
      usuario: p.adminUsuario,
      nombre: p.adminNombre,
      rol: 'admin',
      clave: p.claveAdmin,
    }, t);
    const djRes = await crearOActualizarUsuario(client, {
      idEstablecimiento: p.idEst,
      usuario: p.djUsuario,
      nombre: p.djNombre,
      rol: 'dj',
      clave: p.claveDj,
    }, t);

    if (!adminRes.creado || !djRes.creado) {
      throw new Error('No se pudieron crear los usuarios iniciales de forma limpia.');
    }

    await repo5.registrar(client, {
      idEst: p.idEst,
      idUsuario: null,
      accion: 'bootstrap_produccion',
      detalle: {
        id_establecimiento: p.idEst,
        id_sesion: p.idSesion,
        qr_token_enmascarado: enmascararToken(qrToken),
        admin_usuario: p.adminUsuario,
        dj_usuario: p.djUsuario,
      },
      ahora: t,
    });

    if (typeof antesDeConfirmar === 'function') {
      await antesDeConfirmar(client);
    }

    return {
      id_establecimiento: p.idEst,
      nombre_establecimiento: p.nombreEst,
      id_sesion: p.idSesion,
      qr_token_enmascarado: enmascararToken(qrToken),
      admin_usuario: p.adminUsuario,
      dj_usuario: p.djUsuario,
    };
  });
}

module.exports = {
  generarQrTokenSeguro,
  enmascararToken,
  leerParametrosBootstrap,
  ejecutarBootstrapProduccion,
};
