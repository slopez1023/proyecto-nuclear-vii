'use strict';
/**
 * Crea o actualiza un usuario del personal (admin o dj) del Entregable 5.
 * Uso: node scripts/e5-crear-usuario.js <id_establecimiento> <usuario> <rol:admin|dj> <clave> [nombre]
 */
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { crearPool, migrar } = require('../src/db');
const { CARPETA_MIGRACIONES_E5 } = require('../src/e5/server-e5');
const { crearOActualizarUsuario } = require('../src/e5/auth');

async function main() {
  const [idEstablecimiento, usuario, rol, clave, ...resto] = process.argv.slice(2);
  if (!idEstablecimiento || !usuario || !rol || !clave) {
    console.error('Uso: node scripts/e5-crear-usuario.js <id_establecimiento> <usuario> <admin|dj> <clave> [nombre]');
    process.exit(1);
  }
  const pool = crearPool({ connectionString: process.env.DATABASE_URL });
  try {
    await migrar(pool);
    await migrar(pool, CARPETA_MIGRACIONES_E5);
    const nombre = resto.join(' ') || usuario;
    const r = await crearOActualizarUsuario(pool, { idEstablecimiento, usuario, nombre, rol, clave });
    console.log(r.creado ? `Usuario "${usuario}" (${rol}) creado en ${idEstablecimiento}.` : `Clave de "${usuario}" actualizada.`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('[error]', err.message);
  process.exit(1);
});
