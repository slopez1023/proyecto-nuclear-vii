'use strict';
/**
 * Entorno de pruebas de integración del E5 sobre PostgreSQL real (reutiliza helpers/e4.js).
 */
const { migrar } = require('../../src/db');
const { crearEntorno, ESTABLECIMIENTO } = require('./e4');
const { montarE5 } = require('../../src/e5/montar-e5');
const { CARPETA_MIGRACIONES_E5 } = require('../../src/e5/server-e5');
const { crearOActualizarUsuario } = require('../../src/e5/auth');

async function crearEntornoE5(opciones = {}) {
  const e = await crearEntorno({ simulacion: false, ...opciones });
  await migrar(e.pool, CARPETA_MIGRACIONES_E5);
  const e5 = montarE5(e.app, {
    pool: e.pool,
    youtube: e.youtube,
    almacenEventos: { guardar: (ev) => e.eventos.push(ev) },
    ahora: e.reloj.ahora,
    config: {
      publicBaseUrl: 'https://ponga.test',
      intervaloPlanificadorMs: 60_000,
      carpetaRespaldos: require('node:path').join(require('node:os').tmpdir(), 'ponga-respaldos-test'),
      generarCodigo: opciones.generarCodigo,
      esperarCodigo: opciones.esperarCodigo,
      registrarCodigo: opciones.registrarCodigo,
    },
  });

  await crearOActualizarUsuario(e.pool, {
    idEstablecimiento: ESTABLECIMIENTO, usuario: 'admin1', nombre: 'Admin 1', rol: 'admin', clave: 'ClaveAdmin123',
  }, e.reloj.ahora());
  await crearOActualizarUsuario(e.pool, {
    idEstablecimiento: ESTABLECIMIENTO, usuario: 'dj1', nombre: 'DJ 1', rol: 'dj', clave: 'ClaveDj123',
  }, e.reloj.ahora());
  await crearOActualizarUsuario(e.pool, {
    idEstablecimiento: 'EST-MOCK-002', usuario: 'admin2', nombre: 'Admin 2', rol: 'admin', clave: 'ClaveAdmin2',
  }, e.reloj.ahora());

  async function login(usuario, clave) {
    const r = await e.pedir('POST', '/api/admin/auth/login', { cuerpo: { usuario, clave } });
    return r.body && r.body.token ? { Authorization: `Bearer ${r.body.token}` } : null;
  }

  const admin = await login('admin1', 'ClaveAdmin123');
  const dj = await login('dj1', 'ClaveDj123');
  const adminOtro = await login('admin2', 'ClaveAdmin2');

  return {
    ...e,
    e5,
    admin,
    dj,
    adminOtro,
    login,
    pedirAdmin: (metodo, ruta, { auth = admin, cuerpo } = {}) =>
      e.pedir(metodo, `/api/admin${ruta}`, { cabeceras: auth || {}, cuerpo }),
  };
}

module.exports = { crearEntornoE5 };
