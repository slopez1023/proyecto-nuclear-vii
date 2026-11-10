'use strict';
require('dotenv').config({ path: require('node:path').join(__dirname, '..', '.env') });
const { crearApp } = require('./app');
const { cargarSesiones } = require('./sesiones');
const { crearClienteYoutube } = require('./youtube');
const { crearAlmacen } = require('./eventos');
const { crearPool, migrar, cargarSesionesEnBd, cargarCatalogoSemilla, leerCatalogoSemilla } = require('./db');
const { leerConfiguracion } = require('./config');

const port = Number(process.env.PORT) || 3000;

async function main() {
  const cfg = leerConfiguracion(process.env);
  if (!cfg.ok) {
    console.error(`[error] ${cfg.error}`);
    process.exit(1);
  }
  cfg.avisos.forEach((aviso) => console.warn(`[aviso] ${aviso}`));
  if (!process.env.YOUTUBE_API_KEY) {
    console.warn('[aviso] YOUTUBE_API_KEY no configurada: /api/busqueda responderá 503 hasta definirla en backend/.env');
  }

  const sesiones = cargarSesiones();
  const youtube = crearClienteYoutube({ apiKey: process.env.YOUTUBE_API_KEY });
  let pool = null;
  const simulacionHabilitada = cfg.e4 && process.env.SIMULACION_HABILITADA === 'true';

  if (cfg.e4) {
    // Arranque del E4: migraciones pendientes → sesiones del mock → catálogo semilla (opcional).
    pool = crearPool({ connectionString: cfg.databaseUrl });
    const aplicadas = await migrar(pool);
    if (aplicadas.length > 0) console.log(`[db] migraciones aplicadas: ${aplicadas.join(', ')}`);
    await cargarSesionesEnBd(pool, sesiones);
    if (process.env.CATALOGO_SEMILLA === 'true') {
      await cargarCatalogoSemilla(pool, leerCatalogoSemilla(), Date.now());
      console.log('[db] catálogo semilla cargado (CATALOGO_SEMILLA=true)');
    }
  }

  const app = crearApp({
    sesiones,
    youtube,
    almacenEventos: crearAlmacen(),
    db: pool || undefined,
    config: {
      androidPackage: process.env.ANDROID_PACKAGE,
      androidSha256: process.env.ANDROID_SHA256_CERT,
      reproductorToken: process.env.REPRODUCTOR_TOKEN || '',
      simulacionHabilitada,
    },
  });

  const srv = app.listen(port, () => {
    console.log(`Backend Nuclear VII (${cfg.e4 ? 'E4' : 'E3'}) escuchando en http://localhost:${port}`);
    if (simulacionHabilitada) console.log('[aviso] SIMULACION_HABILITADA=true: rutas /api/simulacion/* activas');
  });

  const apagar = async () => {
    if (app.locals.e4) await app.locals.e4.cerrar();
    srv.close(() => (pool ? pool.end() : Promise.resolve()).finally(() => process.exit(0)));
  };
  process.on('SIGINT', apagar);
  process.on('SIGTERM', apagar);
}

main().catch((err) => {
  console.error('[error] no se pudo arrancar el backend:', err.message);
  process.exit(1);
});
