'use strict';
/**
 * Script de ejecución manual única para inicializar producción en Railway.
 * Uso: npm run bootstrap:prod
 */
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { leerConfiguracion } = require('../src/config');
const { crearPool, migrar } = require('../src/db');
const { CARPETA_MIGRACIONES_E5 } = require('../src/e5/server-e5');
const { ejecutarBootstrapProduccion } = require('../src/e5/bootstrap');

async function main() {
  const cfg = leerConfiguracion(process.env);
  if (!cfg.ok || !cfg.e4) {
    throw new Error(cfg.error || 'Se requiere PostgreSQL (E4_HABILITADO=true) para ejecutar el bootstrap.');
  }

  const pool = crearPool({ connectionString: cfg.databaseUrl, max: 3 });
  try {
    const aplicadasE4 = await migrar(pool);
    const aplicadasE5 = await migrar(pool, CARPETA_MIGRACIONES_E5);
    if (aplicadasE4.length || aplicadasE5.length) {
      console.log(`[bootstrap] migraciones aplicadas: ${[...aplicadasE4, ...aplicadasE5].join(', ')}`);
    }

    const r = await ejecutarBootstrapProduccion({ pool, env: process.env });
    console.log('[bootstrap] inicialización de producción completada:');
    console.log(`  establecimiento: ${r.id_establecimiento} (${r.nombre_establecimiento})`);
    console.log(`  sesion_activa:   ${r.id_sesion} (qr=${r.qr_token_enmascarado})`);
    console.log(`  usuarios:        ${r.admin_usuario} (admin), ${r.dj_usuario} (dj)`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('[bootstrap:error]', err.message);
  process.exit(1);
});
