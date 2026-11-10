'use strict';
/**
 * Simulación manual (nivel 1): llama a los endpoints reales del reproductor (R1/R2) con X-Reproductor-Token.
 *   npm run simular -- iniciar SES-MOCK-001
 *   npm run simular -- exitosa SES-MOCK-001
 *   npm run simular -- fallida SES-MOCK-001 video_no_reproducible
 * Requiere el backend en marcha y REPRODUCTOR_TOKEN en backend/.env (con SIMULACION_HABILITADA=true las
 * reproducciones quedan con origen 'simulacion').
 */
require('dotenv').config({ path: require('node:path').join(__dirname, '..', '.env') });

const [accion, idSesion, codigoError] = process.argv.slice(2);
const base = process.env.SIMULAR_URL || `http://localhost:${Number(process.env.PORT) || 3000}`;
const token = process.env.REPRODUCTOR_TOKEN;

async function post(ruta, cuerpo) {
  const r = await fetch(`${base}${ruta}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Reproductor-Token': token },
    body: JSON.stringify(cuerpo || {}),
  });
  const texto = await r.text();
  console.log(`${r.status} ${texto}`);
  if (!r.ok) process.exitCode = 1;
}

async function main() {
  if (!['iniciar', 'exitosa', 'fallida'].includes(accion) || !idSesion) {
    console.error('Uso: npm run simular -- <iniciar|exitosa|fallida> <idSesion> [codigo_error]');
    process.exit(1);
  }
  if (!token) {
    console.error('REPRODUCTOR_TOKEN no está definido en backend/.env');
    process.exit(1);
  }
  const ruta = `/api/sesiones/${encodeURIComponent(idSesion)}/reproduccion`;
  if (accion === 'iniciar') return post(`${ruta}/iniciar`);

  // Duración de la canción actual, para reportar los segundos reproducidos.
  const cola = await (await fetch(`${base}/api/sesiones/${encodeURIComponent(idSesion)}/cola`)).json();
  const actual = cola.reproduccion_actual;
  if (accion === 'exitosa') {
    return post(`${ruta}/siguiente`, { resultado: 'exitosa', segundos_reproducidos: actual?.cancion?.duracion_segundos ?? 0 });
  }
  return post(`${ruta}/siguiente`, { resultado: 'fallida', segundos_reproducidos: 0, codigo_error: codigoError || 'video_no_reproducible' });
}

main().catch((err) => {
  console.error('[simular]', err.message);
  process.exit(1);
});
