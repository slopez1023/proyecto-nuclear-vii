'use strict';
/**
 * Arranque del backend completo (E3 + E4 + E5).
 * No modifica `src/server.js`: reutiliza `crearApp()` y monta el E5 encima.
 * Uso: node src/e5/server-e5.js
 */
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const { crearApp } = require('../app');
const { cargarSesiones } = require('../sesiones');
const { crearClienteYoutube } = require('../youtube');
const { crearAlmacen } = require('../eventos');
const { crearPool, migrar, cargarSesionesEnBd, cargarCatalogoSemilla, leerCatalogoSemilla } = require('../db');
const { leerConfiguracion } = require('../config');
const { montarE5 } = require('./montar-e5');
const repo5 = require('./repositorio-e5');
const { crearOActualizarUsuario } = require('./auth');

const CARPETA_MIGRACIONES_E5 = path.join(__dirname, '..', '..', 'migrations-e5');
const port = Number(process.env.PORT) || 3000;

function semillaMockHabilitada(env = process.env) {
  return String(env.SEMILLA_MOCK || '').trim().toLowerCase() === 'true';
}

async function sembrarPersonalInicial(pool, env = process.env) {
  const total = await repo5.contarUsuarios(pool);
  const est = 'EST-MOCK-001';
  if (!(await repo5.obtenerEstablecimiento(pool, est))) return { sembrados: false };
  const faltaDj = total === 1 && !(await repo5.obtenerUsuarioPorNombre(pool, 'dj'));
  if (total !== 0 && !faltaDj) return { sembrados: false };

  const claveAdmin = env.E5_ADMIN_CLAVE;
  const claveDj = env.E5_DJ_CLAVE;
  if (total === 0) {
    if (!claveAdmin || !claveDj) {
      throw new Error('Faltan E5_ADMIN_CLAVE y/o E5_DJ_CLAVE para crear los usuarios iniciales.');
    }
    await crearOActualizarUsuario(pool, { idEstablecimiento: est, usuario: 'admin', nombre: 'Administrador La Nota', rol: 'admin', clave: claveAdmin });
    await crearOActualizarUsuario(pool, { idEstablecimiento: est, usuario: 'dj', nombre: 'DJ La Nota', rol: 'dj', clave: claveDj });
    console.log('[e5] usuarios iniciales creados en EST-MOCK-001: usuario "admin" (admin) y "dj" (dj)');
    return { sembrados: true };
  }
  if (!claveDj) {
    throw new Error('Falta E5_DJ_CLAVE para crear el usuario inicial "dj".');
  }
  await crearOActualizarUsuario(pool, { idEstablecimiento: est, usuario: 'dj', nombre: 'DJ La Nota', rol: 'dj', clave: claveDj });
  console.log('[e5] usuario inicial "dj" (dj) creado en EST-MOCK-001');
  return { sembrados: true };
}

async function inicializarDatosBase({ pool, sesiones, env = process.env, ahora = Date.now }) {
  const conSemillaMock = semillaMockHabilitada(env);
  if (conSemillaMock) {
    const { rows: [{ n: totalSesiones }] } = await pool.query('SELECT COUNT(*)::int AS n FROM sesion');
    if (totalSesiones === 0) {
      await cargarSesionesEnBd(pool, sesiones);
    }
  }
  if (env.CATALOGO_SEMILLA === 'true') {
    await cargarCatalogoSemilla(pool, leerCatalogoSemilla(), ahora());
  }
  if (conSemillaMock) {
    await sembrarPersonalInicial(pool, env);
  }
}

async function main() {
  const cfg = leerConfiguracion(process.env);
  if (!cfg.ok || !cfg.e4) {
    console.error(`[error] El módulo E5 requiere PostgreSQL (E4 habilitado): ${cfg.error || 'E4_HABILITADO=false'}`);
    process.exit(1);
  }

  const sesiones = cargarSesiones();
  const youtube = crearClienteYoutube({ apiKey: process.env.YOUTUBE_API_KEY });
  const pool = crearPool({ connectionString: cfg.databaseUrl });
  const aplicadasE4 = await migrar(pool);
  const aplicadasE5 = await migrar(pool, CARPETA_MIGRACIONES_E5);
  if (aplicadasE4.length || aplicadasE5.length) {
    console.log(`[db] migraciones aplicadas: ${[...aplicadasE4, ...aplicadasE5].join(', ')}`);
  }

  await inicializarDatosBase({ pool, sesiones, env: process.env });

  const app = crearApp({
    sesiones,
    youtube,
    almacenEventos: crearAlmacen(),
    db: pool,
    config: {
      androidPackage: process.env.ANDROID_PACKAGE,
      androidSha256: process.env.ANDROID_SHA256_CERT,
      reproductorToken: process.env.REPRODUCTOR_TOKEN || '',
      simulacionHabilitada: process.env.SIMULACION_HABILITADA === 'true',
    },
  });

  const e5 = montarE5(app, {
    pool,
    youtube,
    almacenEventos: crearAlmacen(),
    config: {
      publicBaseUrl: process.env.PUBLIC_BASE_URL || `http://localhost:${port}`,
      cookieSegura: String(process.env.PUBLIC_BASE_URL || '').startsWith('https://'),
    },
  });
  e5.planificador.iniciar();

  const srv = app.listen(port, () => {
    console.log(`Backend Nuclear VII (E3+E4+E5) escuchando en http://localhost:${port}`);
    console.log(`Panel web de administración y DJ: http://localhost:${port}/admin`);
  });

  const apagar = async () => {
    e5.planificador.detener();
    if (app.locals.e4) await app.locals.e4.cerrar();
    srv.close(() => pool.end().finally(() => process.exit(0)));
  };
  process.on('SIGINT', apagar);
  process.on('SIGTERM', apagar);
}

if (require.main === module) {
  main().catch((err) => {
    const detalle = err.message
      || (Array.isArray(err.errors) && err.errors.map((e) => e.message || e.code).join('; '))
      || err.code
      || String(err);
    console.error('[error] no se pudo arrancar el backend E5:', detalle);
    process.exit(1);
  });
}

module.exports = { CARPETA_MIGRACIONES_E5, semillaMockHabilitada, sembrarPersonalInicial, inicializarDatosBase };
