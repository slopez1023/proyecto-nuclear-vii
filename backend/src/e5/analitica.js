'use strict';
/**
 * Pipeline de ingesta, limpieza, anonimización y tablero de analítica (Big Data / E6).
 *
 * - Lee eventos crudos desde JSONL (`backend/data/eventos.jsonl`).
 * - Limpia registros corruptos, valida campos obligatorios y normaliza fechas a epoch ms.
 * - Anonimiza `dispositivo_id` mediante HMAC-SHA256 irreversible (prefijo `anon_`), sin almacenar
 *   ni exponer el identificador crudo del dispositivo en la capa analítica.
 * - Almacena eventos deduplicados en `e5_analitica_evento` y métricas de corrida en `e5_analitica_corrida`.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { iso } = require('./comun-e5');

const RUTA_EVENTOS_DEFECTO = path.join(__dirname, '..', '..', 'data', 'eventos.jsonl');
const SAL_DEFECTO = process.env.ANALITICA_SALT || 'ponga-nuclear-vii-anon-2026';

/** Anonimiza de forma irreversible y determinista el identificador de dispositivo. */
function anonimizarDispositivo(idCrudo, sal = SAL_DEFECTO) {
  if (typeof idCrudo !== 'string') return null;
  const limpio = idCrudo.trim();
  if (!limpio) return null;
  if (limpio.startsWith('anon_') && limpio.length === 21) return limpio;
  const hash = crypto.createHmac('sha256', sal).update(limpio).digest('hex').slice(0, 16);
  return `anon_${hash}`;
}

/** Valida, limpia y anonimiza una línea JSONL. Devuelve { ok: true, evento } o { ok: false, motivo }. */
function limpiarEvento(linea, sal = SAL_DEFECTO) {
  if (typeof linea !== 'string' || !linea.trim()) return { ok: false, motivo: 'linea_vacia' };
  let ev;
  try {
    ev = JSON.parse(linea);
  } catch {
    return { ok: false, motivo: 'json_invalido' };
  }
  if (!ev || typeof ev !== 'object' || Array.isArray(ev)) return { ok: false, motivo: 'estructura_invalida' };
  if (typeof ev.evento_id !== 'string' || !ev.evento_id.trim()) return { ok: false, motivo: 'sin_evento_id' };
  if (typeof ev.tipo !== 'string' || !ev.tipo.trim()) return { ok: false, motivo: 'sin_tipo' };
  const fechaMs = Date.parse(ev.fecha_hora);
  if (!Number.isFinite(fechaMs)) return { ok: false, motivo: 'fecha_invalida' };

  const datos = ev.datos_evento && typeof ev.datos_evento === 'object' && !Array.isArray(ev.datos_evento)
    ? ev.datos_evento
    : {};

  return {
    ok: true,
    evento: {
      evento_id: ev.evento_id.trim().slice(0, 100),
      tipo: ev.tipo.trim().slice(0, 60),
      fecha_hora: fechaMs,
      sesion_id: typeof ev.sesion_id === 'string' && ev.sesion_id.trim() ? ev.sesion_id.trim() : null,
      id_establecimiento: typeof ev.id_establecimiento === 'string' && ev.id_establecimiento.trim()
        ? ev.id_establecimiento.trim()
        : null,
      actor: typeof ev.actor === 'string' && ev.actor.trim() ? ev.actor.trim().slice(0, 30) : 'desconocido',
      dispositivo_hash: anonimizarDispositivo(ev.dispositivo_id, sal),
      version_esquema: typeof ev.version_esquema === 'string' ? ev.version_esquema.trim().slice(0, 20) : null,
      datos_evento: datos,
    },
  };
}

/** Ejecuta el pipeline completo: lectura -> limpieza -> anonimización -> almacenamiento deduplicado. */
async function ejecutarPipeline({ pool, rutaJsonl = RUTA_EVENTOS_DEFECTO, ahora = Date.now, sal = SAL_DEFECTO }) {
  const t = ahora();
  const lineas = fs.existsSync(rutaJsonl)
    ? fs.readFileSync(rutaJsonl, 'utf8').split(/\r?\n/).filter((l) => l.trim().length > 0)
    : [];

  let validos = 0;
  let descartados = 0;
  let duplicados = 0;
  let anonimizados = 0;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const linea of lineas) {
      const r = limpiarEvento(linea, sal);
      if (!r.ok) {
        descartados++;
        continue;
      }
      validos++;
      const e = r.evento;
      if (e.dispositivo_hash) anonimizados++;
      const { rowCount } = await client.query(
        `INSERT INTO e5_analitica_evento
           (evento_id, tipo, fecha_hora, sesion_id, id_establecimiento, actor, dispositivo_hash, version_esquema, datos_evento, ingestado_en)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10)
         ON CONFLICT (evento_id) DO NOTHING`,
        [
          e.evento_id, e.tipo, e.fecha_hora, e.sesion_id, e.id_establecimiento,
          e.actor, e.dispositivo_hash, e.version_esquema, JSON.stringify(e.datos_evento), t,
        ],
      );
      if (rowCount === 0) duplicados++;
    }
    await client.query(
      `INSERT INTO e5_analitica_corrida (ejecutado_en, leidos, validos, duplicados, descartados, anonimizados)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [t, lineas.length, validos, duplicados, descartados, anonimizados],
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  return {
    ejecutado_en: iso(t),
    leidos: lineas.length,
    validos,
    insertados: validos - duplicados,
    duplicados,
    descartados,
    anonimizados,
  };
}

/** Construye todos los indicadores del tablero de analítica para el establecimiento (y sesión opcional). */
async function obtenerTablero({ pool, idEst, idSesion = null, rutaJsonl = RUTA_EVENTOS_DEFECTO, ahora = Date.now }) {
  const ultimaEjec = await ejecutarPipeline({ pool, rutaJsonl, ahora });

  const filtroSesSol = idSesion ? 'AND s.id_sesion = $2' : '';
  const filtroSesRep = idSesion ? 'AND r.id_sesion = $2' : '';
  const filtroSesEv = idSesion ? 'AND e.sesion_id = $2' : '';
  const params = idSesion ? [idEst, idSesion] : [idEst];

  const [
    resSol,
    resVotos,
    resRechazos,
    resTop,
    resUnicos,
    resEsperas,
    resCumplLista,
    resHistorial,
    resTemporal,
    resCorridas,
    resMuestraAnon,
    resCrudosCheck,
  ] = await Promise.all([
    pool.query(
      `SELECT COUNT(*)::int AS total
       FROM solicitud s JOIN sesion se ON se.id_sesion = s.id_sesion
       WHERE se.id_establecimiento = $1 ${filtroSesSol}`,
      params,
    ),
    pool.query(
      `SELECT COUNT(*)::int AS validos
       FROM voto v JOIN solicitud s ON s.id_solicitud = v.id_solicitud JOIN sesion se ON se.id_sesion = s.id_sesion
       WHERE se.id_establecimiento = $1 ${filtroSesSol}`,
      params,
    ),
    pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE e.tipo = 'solicitud_rechazada')::int AS solicitudes_rechazadas,
         COUNT(*) FILTER (WHERE e.tipo = 'voto_rechazado')::int AS votos_rechazados
       FROM e5_analitica_evento e
       WHERE (e.id_establecimiento = $1 OR e.id_establecimiento IS NULL) ${filtroSesEv}`,
      params,
    ),
    pool.query(
      `SELECT c.youtube_video_id, c.titulo, c.artista_canal,
              COUNT(DISTINCT s.id_solicitud)::int AS total_solicitudes,
              COUNT(v.id_voto)::int AS total_votos
       FROM solicitud s
       JOIN sesion se ON se.id_sesion = s.id_sesion
       JOIN cancion c ON c.id_cancion = s.id_cancion
       LEFT JOIN voto v ON v.id_solicitud = s.id_solicitud
       WHERE se.id_establecimiento = $1 ${filtroSesSol}
       GROUP BY c.id_cancion, c.youtube_video_id, c.titulo, c.artista_canal
       ORDER BY total_votos DESC, total_solicitudes DESC, c.titulo ASC
       LIMIT 5`,
      params,
    ),
    pool.query(
      `SELECT
         (SELECT COUNT(DISTINCT ds.id_dispositivo)::int
          FROM dispositivo_sesion ds JOIN sesion se ON se.id_sesion = ds.id_sesion
          WHERE se.id_establecimiento = $1 ${idSesion ? 'AND se.id_sesion = $2' : ''}) AS por_sesion,
         (SELECT COUNT(DISTINCT e.dispositivo_hash)::int
          FROM e5_analitica_evento e
          WHERE e.dispositivo_hash IS NOT NULL
            AND (e.id_establecimiento = $1 OR e.id_establecimiento IS NULL) ${filtroSesEv}) AS por_eventos`,
      params,
    ),
    pool.query(
      `SELECT
         ROUND(AVG((r.inicio_en - s.fecha_solicitud) / 1000.0))::int AS promedio_seg,
         MAX(GREATEST(0, FLOOR((r.inicio_en - s.fecha_solicitud) / 1000.0)))::int AS max_seg,
         MIN(GREATEST(0, FLOOR((r.inicio_en - s.fecha_solicitud) / 1000.0)))::int AS min_seg
       FROM reproduccion r
       JOIN solicitud s ON s.id_solicitud = r.id_solicitud
       WHERE r.id_establecimiento = $1 ${filtroSesRep} AND r.inicio_en >= s.fecha_solicitud`,
      params,
    ),
    pool.query(
      `SELECT
         COUNT(*)::int AS total_reproducciones,
         COUNT(*) FILTER (WHERE r.id_solicitud IS NOT NULL)::int AS de_solicitud,
         COUNT(*) FILTER (WHERE r.id_solicitud IS NULL)::int AS de_lista,
         COUNT(*) FILTER (WHERE r.id_solicitud IS NULL AND r.resultado = 'exitosa')::int AS lista_exitosas,
         COUNT(*) FILTER (WHERE r.id_solicitud IS NULL AND r.resultado = 'fallida')::int AS lista_fallidas,
         COUNT(*) FILTER (WHERE r.resultado = 'exitosa')::int AS total_exitosas
       FROM reproduccion r
       WHERE r.id_establecimiento = $1 ${filtroSesRep}`,
      params,
    ),
    pool.query(
      `SELECT r.id_reproduccion, r.id_sesion, r.id_solicitud, r.inicio_en, r.fin_en, r.resultado, r.codigo_error,
              r.segundos_reproducidos, c.youtube_video_id, c.titulo, c.artista_canal,
              CASE WHEN r.id_solicitud IS NOT NULL
                THEN GREATEST(0, FLOOR((r.inicio_en - s.fecha_solicitud) / 1000.0))::int
                ELSE NULL END AS espera_segundos,
              (SELECT COUNT(*)::int FROM voto v WHERE v.id_solicitud = r.id_solicitud) AS total_votos
       FROM reproduccion r
       JOIN cancion c ON c.id_cancion = r.id_cancion
       LEFT JOIN solicitud s ON s.id_solicitud = r.id_solicitud
       WHERE r.id_establecimiento = $1 ${filtroSesRep}
       ORDER BY r.inicio_en DESC
       LIMIT 25`,
      params,
    ),
    pool.query(
      `SELECT to_char(to_timestamp(e.fecha_hora / 1000.0) AT TIME ZONE 'America/Bogota', 'HH24') AS hora,
              COUNT(*)::int AS eventos
       FROM e5_analitica_evento e
       WHERE (e.id_establecimiento = $1 OR e.id_establecimiento IS NULL) ${filtroSesEv}
       GROUP BY 1
       ORDER BY 1 ASC`,
      params,
    ),
    pool.query(
      `SELECT id_corrida, ejecutado_en, leidos, validos, duplicados, descartados, anonimizados
       FROM e5_analitica_corrida ORDER BY id_corrida DESC LIMIT 5`,
    ),
    pool.query(
      `SELECT evento_id, tipo, actor, dispositivo_hash, fecha_hora, sesion_id
       FROM e5_analitica_evento
       WHERE dispositivo_hash IS NOT NULL
         AND (id_establecimiento = $1 OR id_establecimiento IS NULL) ${idSesion ? 'AND sesion_id = $2' : ''}
       ORDER BY fecha_hora DESC
       LIMIT 6`,
      params,
    ),
    pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE dispositivo_hash IS NOT NULL)::int AS total_con_dispositivo,
         COUNT(*) FILTER (WHERE dispositivo_hash IS NOT NULL AND dispositivo_hash !~ '^anon_[0-9a-f]{16}$')::int AS crudos_detectados
       FROM e5_analitica_evento`,
    ),
  ]);

  const cl = resCumplLista.rows[0] || {};
  const totalLista = cl.de_lista || 0;
  const listaExitosas = cl.lista_exitosas || 0;
  const cumplimientoListaPct = totalLista > 0 ? Math.round((listaExitosas / totalLista) * 100) : 100;
  const unicos = resUnicos.rows[0] || {};
  const esp = resEsperas.rows[0] || {};
  const rech = resRechazos.rows[0] || {};
  const check = resCrudosCheck.rows[0] || {};

  return {
    alcance: idSesion ? { tipo: 'sesion', id_sesion: idSesion } : { tipo: 'establecimiento', id_establecimiento: idEst },
    indicadores: {
      total_solicitudes: (resSol.rows[0] && resSol.rows[0].total) || 0,
      votos_validos: (resVotos.rows[0] && resVotos.rows[0].validos) || 0,
      votos_rechazados: rech.votos_rechazados || 0,
      solicitudes_rechazadas: rech.solicitudes_rechazadas || 0,
      reproducciones_totales: cl.total_reproducciones || 0,
      reproducciones_exitosas: cl.total_exitosas || 0,
      usuarios_unicos: Math.max(unicos.por_sesion || 0, unicos.por_eventos || 0),
      cancion_mas_popular: resTop.rows[0] || null,
      espera_promedio_segundos: esp.promedio_seg ?? null,
      espera_maxima_segundos: esp.max_seg ?? null,
      espera_minima_segundos: esp.min_seg ?? null,
      cumplimiento_lista: {
        porcentaje: cumplimientoListaPct,
        total_lista: totalLista,
        exitosas_lista: listaExitosas,
        fallidas_lista: cl.lista_fallidas || 0,
        de_solicitud: cl.de_solicitud || 0,
      },
    },
    popularidad: resTop.rows,
    participacion_temporal: resTemporal.rows.map((r) => ({ hora: `${r.hora}:00`, eventos: r.eventos })),
    historial_reproducciones: resHistorial.rows.map((r) => ({
      id_reproduccion: `REP-${r.id_reproduccion}`,
      id_sesion: r.id_sesion,
      fuente: r.id_solicitud ? 'solicitud' : 'lista_defecto',
      titulo: r.titulo,
      artista_canal: r.artista_canal,
      youtube_video_id: r.youtube_video_id,
      total_votos: r.total_votos || 0,
      espera_segundos: r.espera_segundos,
      segundos_reproducidos: r.segundos_reproducidos,
      resultado: r.resultado,
      codigo_error: r.codigo_error,
      inicio_en: iso(r.inicio_en),
    })),
    pipeline: {
      ultima_corrida: ultimaEjec,
      corridas_recientes: resCorridas.rows.map((c) => ({ ...c, ejecutado_en: iso(c.ejecutado_en) })),
    },
    anonimizacion: {
      metodo: 'HMAC-SHA256 truncado a 64 bits (prefijo anon_)',
      total_anonimizados: check.total_con_dispositivo || 0,
      identificadores_crudos_detectados: check.crudos_detectados || 0,
      cumple_privacidad: (check.crudos_detectados || 0) === 0,
      muestra: resMuestraAnon.rows.map((m) => ({
        evento_id: m.evento_id,
        tipo: m.tipo,
        actor: m.actor,
        dispositivo_hash: m.dispositivo_hash,
        sesion_id: m.sesion_id,
        fecha_hora: iso(m.fecha_hora),
      })),
    },
  };
}

module.exports = {
  RUTA_EVENTOS_DEFECTO,
  anonimizarDispositivo,
  limpiarEvento,
  ejecutarPipeline,
  obtenerTablero,
};
