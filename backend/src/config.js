'use strict';
/**
 * Validación de la configuración de arranque (sin tocar la red ni la base de datos, para poder probarla).
 *
 * El backend del E4 necesita PostgreSQL: por defecto `DATABASE_URL` es OBLIGATORIA y, si falta, el arranque falla con
 * un mensaje claro (fail fast). El E3 nunca la necesitó (cola, solicitudes y votos no existían): para ejecutar solo
 * lo del E3 —por ejemplo una demostración de acceso y búsqueda sin Docker— hay que pedirlo de forma EXPLÍCITA con
 * `E4_HABILITADO=false`. No hay un modo silencioso: sin esa variable, la ausencia de base de datos es un error, y un
 * valor distinto de `true`/`false` también lo es (un error de escritura no puede desactivar el E4 sin que nadie lo note).
 *
 * @param {Record<string, string|undefined>} env normalmente `process.env`
 * @returns {{ok: true, e4: boolean, databaseUrl: string|null, avisos: string[]} | {ok: false, error: string}}
 */
function leerConfiguracion(env) {
  const bruto = env.E4_HABILITADO === undefined || env.E4_HABILITADO === '' ? 'true' : String(env.E4_HABILITADO).trim().toLowerCase();
  if (bruto !== 'true' && bruto !== 'false') {
    return { ok: false, error: `E4_HABILITADO debe ser "true" o "false" (llegó "${env.E4_HABILITADO}").` };
  }

  if (bruto === 'false') {
    return {
      ok: true,
      e4: false,
      databaseUrl: null,
      avisos: ['E4_HABILITADO=false: solo se ofrece lo del E3 (acceso por QR, búsqueda y eventos). No hay cola, solicitudes, votos ni flujo en tiempo real.'],
    };
  }

  if (!env.DATABASE_URL) {
    return {
      ok: false,
      error: 'DATABASE_URL no está configurada. El E4 necesita PostgreSQL (ver backend/.env.example y README). '
        + 'Para ejecutar solo lo del E3, sin base de datos, define E4_HABILITADO=false de forma explícita.',
    };
  }
  return { ok: true, e4: true, databaseUrl: env.DATABASE_URL, avisos: [] };
}

module.exports = { leerConfiguracion };
