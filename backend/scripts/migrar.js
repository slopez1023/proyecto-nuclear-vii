'use strict';
/**
 * npm run migrar: aplica las migraciones pendientes de backend/migrations/ sobre DATABASE_URL.
 * Idempotente: lo ya aplicado (tabla schema_migrations) no se repite. Nunca imprime la cadena de conexión.
 */
require('dotenv').config({ path: require('node:path').join(__dirname, '..', '.env') });
const { crearPool, migrar } = require('../src/db');

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('[migrar] DATABASE_URL no está definida.');
    process.exit(1);
  }
  const pool = crearPool({ connectionString: url, max: 1 });
  try {
    const aplicadas = await migrar(pool);
    console.log(aplicadas.length ? `[migrar] aplicadas: ${aplicadas.join(', ')}` : '[migrar] el esquema ya estaba al día');
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('[migrar] error:', err.message);
  process.exit(1);
});
