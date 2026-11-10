'use strict';
/**
 * Conexión a PostgreSQL, migraciones y carga de datos semilla (E4).
 * El SQL de negocio vive en repositorio.js; aquí solo hay infraestructura.
 */
const fs = require('node:fs');
const path = require('node:path');
const { Pool, types } = require('pg');
const repo = require('./repositorio');

// BIGINT (int8, OID 20) llega como texto por defecto. Todos los BIGINT del esquema (ids y epoch ms)
// caben de sobra en Number.MAX_SAFE_INTEGER, así que se convierten a número.
types.setTypeParser(20, (v) => Number(v));

const CARPETA_MIGRACIONES = path.join(__dirname, '..', '..', 'migrations');

/** Crea un Pool. `schema` (opcional) fija el search_path de cada conexión (lo usan las pruebas). */
function crearPool({ connectionString, schema, max = 10 } = {}) {
  if (!connectionString) throw new Error('Falta la cadena de conexión de PostgreSQL (DATABASE_URL).');
  const opciones = { connectionString, max };
  if (schema) opciones.options = `-c search_path=${schema}`;
  return new Pool(opciones);
}

/**
 * Aplica las migraciones pendientes de `migrations/` en orden. Cada archivo corre en su propia
 * transacción y queda registrado en schema_migrations. Un candado consultivo evita que dos procesos
 * migren el mismo schema a la vez. Devuelve los nombres aplicados.
 */
async function migrar(pool, carpeta = CARPETA_MIGRACIONES) {
  const archivos = fs.readdirSync(carpeta).filter((f) => /^\d+_.+\.sql$/.test(f)).sort();
  const client = await pool.connect();
  const aplicadas = [];
  try {
    await client.query('SELECT pg_advisory_lock(hashtext(current_schema()))');
    try {
      await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
        nombre TEXT PRIMARY KEY, aplicada_en TIMESTAMPTZ NOT NULL DEFAULT now())`);
      const { rows } = await client.query('SELECT nombre FROM schema_migrations');
      const hechas = new Set(rows.map((r) => r.nombre));
      for (const archivo of archivos) {
        if (hechas.has(archivo)) continue;
        const sql = fs.readFileSync(path.join(carpeta, archivo), 'utf8');
        await client.query('BEGIN');
        try {
          await client.query(sql);
          await client.query('INSERT INTO schema_migrations (nombre) VALUES ($1)', [archivo]);
          await client.query('COMMIT');
        } catch (err) {
          await client.query('ROLLBACK');
          throw new Error(`La migración ${archivo} falló: ${err.message}`);
        }
        aplicadas.push(archivo);
      }
    } finally {
      await client.query('SELECT pg_advisory_unlock(hashtext(current_schema()))');
    }
  } finally {
    client.release();
  }
  return aplicadas;
}

/** Copia las sesiones del mock a establecimiento/sesion (upsert). `version_cola` no se toca. */
async function cargarSesionesEnBd(pool, sesiones) {
  for (const s of sesiones) {
    await repo.upsertEstablecimiento(pool, s.establecimiento);
    await repo.upsertSesion(pool, { ...s, id_establecimiento: s.establecimiento.id_establecimiento });
  }
}

const RUTA_CATALOGO_SEMILLA = path.join(__dirname, '..', '..', 'data', 'catalogo.semilla.json');

function leerCatalogoSemilla(ruta = RUTA_CATALOGO_SEMILLA) {
  return JSON.parse(fs.readFileSync(ruta, 'utf8')).canciones;
}

async function cargarCatalogoSemilla(pool, canciones, ahoraMs) {
  for (const c of canciones) await repo.insertarCancionSemilla(pool, c, ahoraMs);
}

module.exports = {
  crearPool, migrar, cargarSesionesEnBd, cargarCatalogoSemilla, leerCatalogoSemilla, CARPETA_MIGRACIONES,
};
