'use strict';
/**
 * Base de pruebas sobre un PostgreSQL REAL (DATABASE_URL_TEST). Cada archivo de prueba crea su propio
 * schema `test_<aleatorio>`, aplica las migraciones y carga las sesiones del mock; al terminar lo borra.
 * Así los archivos pueden correr en paralelo sin pisarse. No arranca server.js (ni YouTube).
 */
const path = require('node:path');
const crypto = require('node:crypto');
const { Client } = require('pg');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const { crearPool, migrar, cargarSesionesEnBd } = require('../../src/db');
const { cargarSesiones } = require('../../src/sesiones');

function urlDePrueba() {
  const url = process.env.DATABASE_URL_TEST;
  if (!url) {
    throw new Error('DATABASE_URL_TEST no está definida. Levanta PostgreSQL con `npm run db:up` y define la '
      + 'variable (ver backend/.env.example). Las pruebas del E4 necesitan una base real.');
  }
  return url;
}

async function conAdmin(url, fn) {
  const c = new Client({ connectionString: url });
  await c.connect();
  try { return await fn(c); } finally { await c.end(); }
}

/** @returns {Promise<{pool:import('pg').Pool, schema:string, url:string, cerrar:()=>Promise<void>}>} */
async function crearBaseDePrueba({ max = 30 } = {}) {
  const url = urlDePrueba();
  const schema = `test_${crypto.randomBytes(6).toString('hex')}`;
  await conAdmin(url, (c) => c.query(`CREATE SCHEMA ${schema}`));
  const pool = crearPool({ connectionString: url, schema, max });
  try {
    await migrar(pool);
    await cargarSesionesEnBd(pool, cargarSesiones());
  } catch (err) {
    await pool.end();
    await conAdmin(url, (c) => c.query(`DROP SCHEMA ${schema} CASCADE`));
    throw err;
  }
  return {
    pool, schema, url,
    async cerrar() {
      await pool.end();
      await conAdmin(url, (c) => c.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`));
    },
  };
}

module.exports = { crearBaseDePrueba, urlDePrueba };
