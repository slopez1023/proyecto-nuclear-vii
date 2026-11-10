'use strict';
/**
 * Repositorio del E4: TODO el SQL de negocio vive aquí (parametrizado con $1, $2…).
 * Cada función recibe `q`, que puede ser el Pool o un cliente dentro de una transacción.
 * Fechas en BIGINT epoch ms; ids numéricos (el prefijo "SOL-", "VOT-"… se pone en la capa de presentación).
 */

/** Ejecuta `fn(client)` dentro de BEGIN/COMMIT (READ COMMITTED). Cualquier excepción hace ROLLBACK. */
async function conTransaccion(pool, fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const resultado = await fn(client);
    await client.query('COMMIT');
    return resultado;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------- sesiones y establecimientos

async function upsertEstablecimiento(q, { id_establecimiento, nombre }) {
  await q.query(
    `INSERT INTO establecimiento (id_establecimiento, nombre) VALUES ($1, $2)
     ON CONFLICT (id_establecimiento) DO UPDATE SET nombre = EXCLUDED.nombre`,
    [id_establecimiento, nombre],
  );
}

async function upsertSesion(q, { id_sesion, id_establecimiento, qr_token, estado, qr_estado }) {
  await q.query(
    `INSERT INTO sesion (id_sesion, id_establecimiento, qr_token, estado, qr_estado) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (id_sesion) DO UPDATE SET id_establecimiento = EXCLUDED.id_establecimiento,
       qr_token = EXCLUDED.qr_token, estado = EXCLUDED.estado, qr_estado = EXCLUDED.qr_estado`,
    [id_sesion, id_establecimiento, qr_token, estado, qr_estado],
  );
}

async function obtenerSesion(q, idSesion) {
  const { rows } = await q.query(
    'SELECT id_sesion, id_establecimiento, estado, qr_estado, version_cola FROM sesion WHERE id_sesion = $1',
    [idSesion],
  );
  return rows[0] || null;
}

/**
 * Bloquea (FOR UPDATE) el establecimiento y después la sesión. Orden fijo establecimiento → sesión en
 * todas las transacciones, para evitar interbloqueos. Serializa el cálculo del intervalo (que es por
 * dispositivo y establecimiento) con la escritura de solicitudes, votos y reproducciones.
 */
async function bloquearEstablecimientoYSesion(client, idEstablecimiento, idSesion) {
  await client.query('SELECT 1 FROM establecimiento WHERE id_establecimiento = $1 FOR UPDATE', [idEstablecimiento]);
  const { rows } = await client.query(
    'SELECT id_sesion, id_establecimiento, estado, qr_estado, version_cola FROM sesion WHERE id_sesion = $1 FOR UPDATE',
    [idSesion],
  );
  return rows[0] || null;
}

async function incrementarVersion(client, idSesion) {
  const { rows } = await client.query(
    'UPDATE sesion SET version_cola = version_cola + 1 WHERE id_sesion = $1 RETURNING version_cola',
    [idSesion],
  );
  return rows[0].version_cola;
}

/** Cambio de rango de dispositivos activos: todas las sesiones del establecimiento cambian de versión. */
async function incrementarVersionEstablecimiento(pool, idEstablecimiento) {
  return conTransaccion(pool, async (client) => {
    await client.query('SELECT 1 FROM establecimiento WHERE id_establecimiento = $1 FOR UPDATE', [idEstablecimiento]);
    const { rows } = await client.query(
      `UPDATE sesion SET version_cola = version_cola + 1 WHERE id_establecimiento = $1
       RETURNING id_sesion`,
      [idEstablecimiento],
    );
    return rows.map((r) => r.id_sesion);
  });
}

// ---------------------------------------------------------------- dispositivos

/** Registro implícito: crea o actualiza el dispositivo y su participación en la sesión. Devuelve id_dispositivo. */
async function asegurarDispositivo(q, uuid, idSesion, ahoraMs) {
  const { rows } = await q.query(
    `INSERT INTO dispositivo (identificador_seudonimo, creado_en, ultima_actividad) VALUES ($1, $2, $2)
     ON CONFLICT (identificador_seudonimo) DO UPDATE SET ultima_actividad = EXCLUDED.ultima_actividad
     RETURNING id_dispositivo`,
    [uuid, ahoraMs],
  );
  const idDispositivo = rows[0].id_dispositivo;
  await q.query(
    `INSERT INTO dispositivo_sesion (id_dispositivo, id_sesion, unido_en) VALUES ($1, $2, $3)
     ON CONFLICT (id_dispositivo, id_sesion) DO NOTHING`,
    [idDispositivo, idSesion, ahoraMs],
  );
  return idDispositivo;
}

async function registrarConexion(q, idDispositivo, idSesion, ahoraMs) {
  await q.query(
    'UPDATE dispositivo_sesion SET ultima_conexion = $3 WHERE id_dispositivo = $1 AND id_sesion = $2',
    [idDispositivo, idSesion, ahoraMs],
  );
}

async function registrarDesconexion(q, idDispositivo, idSesion, ahoraMs) {
  await q.query(
    'UPDATE dispositivo_sesion SET ultima_desconexion = $3 WHERE id_dispositivo = $1 AND id_sesion = $2',
    [idDispositivo, idSesion, ahoraMs],
  );
}

// ---------------------------------------------------------------- catálogo

const COLUMNAS_CANCION = `id_cancion, youtube_video_id, titulo, artista_canal, duracion_segundos, url_miniatura,
  disponibilidad, motivo_no_permitida, consultado_en`;

async function obtenerCancion(q, youtubeVideoId) {
  const { rows } = await q.query(`SELECT ${COLUMNAS_CANCION} FROM cancion WHERE youtube_video_id = $1`, [youtubeVideoId]);
  return rows[0] || null;
}

/** Inserta o actualiza una canción validada contra YouTube. Devuelve la fila. */
async function guardarCancion(q, c) {
  const { rows } = await q.query(
    `INSERT INTO cancion (youtube_video_id, titulo, artista_canal, duracion_segundos, url_miniatura,
       disponibilidad, motivo_no_permitida, consultado_en)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (youtube_video_id) DO UPDATE SET titulo = EXCLUDED.titulo, artista_canal = EXCLUDED.artista_canal,
       duracion_segundos = EXCLUDED.duracion_segundos, url_miniatura = EXCLUDED.url_miniatura,
       disponibilidad = EXCLUDED.disponibilidad, motivo_no_permitida = EXCLUDED.motivo_no_permitida,
       consultado_en = EXCLUDED.consultado_en
     RETURNING ${COLUMNAS_CANCION}`,
    [c.youtube_video_id, c.titulo, c.artista_canal, c.duracion_segundos, c.url_miniatura,
      c.disponibilidad, c.motivo_no_permitida, c.consultado_en],
  );
  return rows[0];
}

/** Canción semilla como 'disponible'. ON CONFLICT DO NOTHING: no pisa datos ya validados. */
async function insertarCancionSemilla(q, c, ahoraMs) {
  await q.query(
    `INSERT INTO cancion (youtube_video_id, titulo, artista_canal, duracion_segundos, url_miniatura,
       disponibilidad, consultado_en)
     VALUES ($1, $2, $3, $4, $5, 'disponible', $6)
     ON CONFLICT (youtube_video_id) DO NOTHING`,
    [c.youtube_video_id, c.titulo, c.artista_canal, c.duracion_segundos, c.url_miniatura ?? null, ahoraMs],
  );
}

// ---------------------------------------------------------------- solicitudes y votos

const SELECT_SOLICITUD = `
  SELECT s.id_solicitud, s.id_sesion, s.id_cancion, s.id_dispositivo, s.fecha_solicitud, s.estado,
         c.youtube_video_id, c.titulo, c.artista_canal, c.duracion_segundos, c.url_miniatura,
         (SELECT COUNT(*) FROM voto v WHERE v.id_solicitud = s.id_solicitud) AS total_votos
  FROM solicitud s JOIN cancion c ON c.id_cancion = s.id_cancion`;

/** Solicitudes pendientes de la sesión en orden de cola: más votos primero; empate, la más antigua. */
async function leerColaPendiente(q, idSesion) {
  const { rows } = await q.query(
    `${SELECT_SOLICITUD}
     WHERE s.id_sesion = $1 AND s.estado = 'pendiente'
     ORDER BY total_votos DESC, s.fecha_solicitud ASC, s.id_solicitud ASC`,
    [idSesion],
  );
  return rows;
}

async function obtenerSolicitud(q, idSesion, idSolicitud) {
  const { rows } = await q.query(`${SELECT_SOLICITUD} WHERE s.id_sesion = $1 AND s.id_solicitud = $2`, [idSesion, idSolicitud]);
  return rows[0] || null;
}

/** Solicitud viva (pendiente o en reproducción) de una canción en la sesión, si existe. */
async function solicitudVivaDeCancion(q, idSesion, idCancion) {
  const { rows } = await q.query(
    `${SELECT_SOLICITUD}
     WHERE s.id_sesion = $1 AND s.id_cancion = $2 AND s.estado IN ('pendiente','en_reproduccion')`,
    [idSesion, idCancion],
  );
  return rows[0] || null;
}

async function existeVoto(q, idSolicitud, idDispositivo) {
  const { rows } = await q.query('SELECT 1 FROM voto WHERE id_solicitud = $1 AND id_dispositivo = $2', [idSolicitud, idDispositivo]);
  return rows.length > 0;
}

async function insertarSolicitud(client, { idSesion, idCancion, idDispositivo, fecha }) {
  const { rows } = await client.query(
    `INSERT INTO solicitud (id_sesion, id_cancion, id_dispositivo, fecha_solicitud, estado)
     VALUES ($1, $2, $3, $4, 'pendiente') RETURNING id_solicitud`,
    [idSesion, idCancion, idDispositivo, fecha],
  );
  return rows[0].id_solicitud;
}

async function insertarVoto(client, { idSolicitud, idDispositivo, idEstablecimiento, fecha, origen }) {
  const { rows } = await client.query(
    `INSERT INTO voto (id_solicitud, id_dispositivo, id_establecimiento, fecha_hora, origen)
     VALUES ($1, $2, $3, $4, $5) RETURNING id_voto, id_solicitud, fecha_hora, origen`,
    [idSolicitud, idDispositivo, idEstablecimiento, fecha, origen],
  );
  return rows[0];
}

/** Ids de las solicitudes de la sesión que este dispositivo ya votó. */
async function solicitudesVotadasPor(q, idDispositivo, idSesion) {
  const { rows } = await q.query(
    `SELECT v.id_solicitud FROM voto v JOIN solicitud s ON s.id_solicitud = v.id_solicitud
     WHERE v.id_dispositivo = $1 AND s.id_sesion = $2`,
    [idDispositivo, idSesion],
  );
  return new Set(rows.map((r) => r.id_solicitud));
}

async function cambiarEstadoSolicitud(client, idSolicitud, estado) {
  await client.query('UPDATE solicitud SET estado = $2 WHERE id_solicitud = $1', [idSolicitud, estado]);
}

// ---------------------------------------------------------------- intervalo (sección 5.3)

/**
 * Último voto del dispositivo en el establecimiento (L) y reproducciones que cuentan desde L.
 * Condiciones exactas de la sección 5.3: exitosa, inicio_en > L (estricto), viene de una solicitud y
 * no es una canción en la que el dispositivo puso un voto automático (H2: cualquiera, no solo la última).
 * Si L es NULL (nunca votó), la comparación con NULL no cuenta nada.
 */
async function contadorIntervalo(q, idDispositivo, idEstablecimiento) {
  const { rows } = await q.query(
    `WITH ultimo AS (
       SELECT MAX(fecha_hora) AS l FROM voto WHERE id_dispositivo = $1 AND id_establecimiento = $2
     )
     SELECT ultimo.l AS ultimo_voto,
       (SELECT COUNT(*) FROM reproduccion r
         WHERE r.id_establecimiento = $2
           AND r.resultado = 'exitosa'
           AND r.inicio_en > ultimo.l
           AND r.id_solicitud IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM voto v                    -- H2: su canción propia no cuenta
                           WHERE v.id_solicitud = r.id_solicitud
                             AND v.id_dispositivo = $1
                             AND v.origen = 'solicitud')
       ) AS contadas
     FROM ultimo`,
    [idDispositivo, idEstablecimiento],
  );
  return { ultimoVoto: rows[0].ultimo_voto, contadas: rows[0].contadas };
}

// ---------------------------------------------------------------- reproducción

async function reproduccionEnCurso(q, idSesion, { bloquear = false } = {}) {
  const { rows } = await q.query(
    `SELECT r.id_reproduccion, r.id_solicitud, r.id_cancion, r.inicio_en, r.origen,
            c.youtube_video_id, c.titulo, c.artista_canal, c.duracion_segundos, c.url_miniatura,
            (SELECT COUNT(*) FROM voto v WHERE v.id_solicitud = r.id_solicitud) AS total_votos
     FROM reproduccion r JOIN cancion c ON c.id_cancion = r.id_cancion
     WHERE r.id_sesion = $1 AND r.resultado = 'en_curso'${bloquear ? ' FOR UPDATE OF r' : ''}`,
    [idSesion],
  );
  return rows[0] || null;
}

async function insertarReproduccion(client, { idSesion, idEstablecimiento, idSolicitud, idCancion, inicio, origen }) {
  const { rows } = await client.query(
    `INSERT INTO reproduccion (id_sesion, id_establecimiento, id_solicitud, id_cancion, inicio_en, resultado, origen)
     VALUES ($1, $2, $3, $4, $5, 'en_curso', $6) RETURNING id_reproduccion`,
    [idSesion, idEstablecimiento, idSolicitud, idCancion, inicio, origen],
  );
  return rows[0].id_reproduccion;
}

async function cerrarReproduccion(client, idReproduccion, { fin, resultado, segundos, codigoError }) {
  await client.query(
    `UPDATE reproduccion SET fin_en = $2, resultado = $3, segundos_reproducidos = $4, codigo_error = $5
     WHERE id_reproduccion = $1`,
    [idReproduccion, fin, resultado, segundos, codigoError],
  );
}

module.exports = {
  conTransaccion,
  upsertEstablecimiento, upsertSesion, obtenerSesion, bloquearEstablecimientoYSesion,
  incrementarVersion, incrementarVersionEstablecimiento,
  asegurarDispositivo, registrarConexion, registrarDesconexion,
  obtenerCancion, guardarCancion, insertarCancionSemilla,
  leerColaPendiente, obtenerSolicitud, solicitudVivaDeCancion, existeVoto, insertarSolicitud, insertarVoto,
  solicitudesVotadasPor, cambiarEstadoSolicitud,
  contadorIntervalo,
  reproduccionEnCurso, insertarReproduccion, cerrarReproduccion,
};
