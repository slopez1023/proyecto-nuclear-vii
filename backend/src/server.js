'use strict';
require('dotenv').config({ path: require('node:path').join(__dirname, '..', '.env') });
const { crearApp } = require('./app');
const { cargarSesiones } = require('./sesiones');
const { crearClienteYoutube } = require('./youtube');
const { crearAlmacen } = require('./eventos');
const { crearPool, migrar, cargarSesionesEnBd, cargarCatalogoSemilla, leerCatalogoSemilla } = require('./db');

const port = Number(process.env.PORT) || 3000;

async function main() {
  if (!process.env.YOUTUBE_API_KEY) {
    console.warn('[aviso] YOUTUBE_API_KEY no configurada: /api/busqueda responderá 503 hasta definirla en backend/.env');
  }
  if (!process.env.DATABASE_URL) {
    console.error('[error] DATABASE_URL no está configurada. El E4 necesita PostgreSQL (ver backend/.env.example y README).');
    process.exit(1);
  }

  // Arranque: migraciones pendientes → sesiones del mock → catálogo semilla (opcional).
  const sesiones = cargarSesiones();
  const pool = crearPool({ connectionString: process.env.DATABASE_URL });
  const aplicadas = await migrar(pool);
  if (aplicadas.length > 0) console.log(`[db] migraciones aplicadas: ${aplicadas.join(', ')}`);
  await cargarSesionesEnBd(pool, sesiones);
  if (process.env.CATALOGO_SEMILLA === 'true') {
    await cargarCatalogoSemilla(pool, leerCatalogoSemilla(), Date.now());
    console.log('[db] catálogo semilla cargado (CATALOGO_SEMILLA=true)');
  }

  const simulacionHabilitada = process.env.SIMULACION_HABILITADA === 'true';
  const app = crearApp({
    sesiones,
    youtube: crearClienteYoutube({ apiKey: process.env.YOUTUBE_API_KEY }),
    almacenEventos: crearAlmacen(),
    db: pool,
    config: {
      androidPackage: process.env.ANDROID_PACKAGE,
      androidSha256: process.env.ANDROID_SHA256_CERT,
      reproductorToken: process.env.REPRODUCTOR_TOKEN || '',
      simulacionHabilitada,
    },
  });

  const srv = app.listen(port, () => {
    console.log(`Backend Nuclear VII (E4) escuchando en http://localhost:${port}`);
    if (simulacionHabilitada) console.log('[aviso] SIMULACION_HABILITADA=true: rutas /api/simulacion/* activas');
  });

  const apagar = async () => {
    await app.locals.e4.cerrar();
    srv.close(() => pool.end().finally(() => process.exit(0)));
  };
  process.on('SIGINT', apagar);
  process.on('SIGTERM', apagar);
}

main().catch((err) => {
  console.error('[error] no se pudo arrancar el backend:', err.message);
  process.exit(1);
});
