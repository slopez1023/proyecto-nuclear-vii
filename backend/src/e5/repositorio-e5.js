'use strict';
/**
 * Repositorio del E5: todo el SQL nuevo vive aquí (parametrizado). Cada función recibe `q` (Pool o cliente en
 * transacción), igual que src/db/repositorio.js del E4, que se REUTILIZA sin cambios para lo que ya existe
 * (sesión, cola pendiente, reproducción en curso, versión de la cola…).
 *
 * Sobre las tablas del E3/E4 este archivo solo hace:
 *  - INSERT de sesiones/establecimientos nuevos (crear sesión desde el panel);
 *  - UPDATE de sesion.estado / sesion.qr_estado (abrir, cerrar, QR) — exactamente lo que el E4 lee para validar;
 *  - UPDATE de solicitud.estado a 'retirada' o 'saltada' (estados ya previstos en el CHECK del E4);
 *  - INSERT de filas de `reproduccion` de la lista por defecto con id_solicitud NULL (valor reservado por el E4).
 * Nunca borra filas de esas tablas: el historial se conserva.
 */

// ---------------------------------------------------------------- usuarios y sesiones de acceso

async function obtenerUsuarioPorNombre(q, usuario) {
  const { rows } = await q.query(
    `SELECT u.id_usuario, u.id_establecimiento, u.usuario, u.nombre, u.rol, u.clave_hash, u.activo, e.nombre AS establecimiento
     FROM e5_usuario u JOIN establecimiento e ON e.id_establecimiento = u.id_establecimiento WHERE u.usuario = $1`,
    [usuario],
  );
  return rows[0] || null;
}

async function insertarUsuario(q, { idEstablecimiento, usuario, nombre, rol, claveHash, ahora }) {
  const { rows } = await q.query(
    `INSERT INTO e5_usuario (id_establecimiento, usuario, nombre, rol, clave_hash, creado_en)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (usuario) DO NOTHING RETURNING id_usuario`,
    [idEstablecimiento, usuario, nombre, rol, claveHash, ahora],
  );
  return rows[0] ? rows[0].id_usuario : null;
}

async function actualizarClaveUsuario(q, usuario, claveHash) {
  const { rowCount } = await q.query('UPDATE e5_usuario SET clave_hash = $2, activo = true WHERE usuario = $1', [usuario, claveHash]);
  return rowCount > 0;
}

async function contarUsuarios(q) {
  const { rows } = await q.query('SELECT COUNT(*)::int AS n FROM e5_usuario');
  return rows[0].n;
}

async function insertarSesionUsuario(q, { tokenHash, idUsuario, ahora, expira }) {
  await q.query('INSERT INTO e5_sesion_usuario (token_hash, id_usuario, creado_en, expira_en) VALUES ($1, $2, $3, $4)',
    [tokenHash, idUsuario, ahora, expira]);
  await q.query('UPDATE e5_usuario SET ultimo_acceso = $2 WHERE id_usuario = $1', [idUsuario, ahora]);
}

async function usuarioPorToken(q, tokenHash, ahora) {
  const { rows } = await q.query(
    `SELECT u.id_usuario, u.id_establecimiento, u.usuario, u.nombre, u.rol, e.nombre AS establecimiento, su.expira_en
     FROM e5_sesion_usuario su
     JOIN e5_usuario u ON u.id_usuario = su.id_usuario
     JOIN establecimiento e ON e.id_establecimiento = u.id_establecimiento
     WHERE su.token_hash = $1 AND su.cerrado_en IS NULL AND su.expira_en > $2 AND u.activo`,
    [tokenHash, ahora],
  );
  return rows[0] || null;
}

async function cerrarSesionUsuario(q, tokenHash, ahora) {
  await q.query('UPDATE e5_sesion_usuario SET cerrado_en = $2 WHERE token_hash = $1 AND cerrado_en IS NULL', [tokenHash, ahora]);
}

// ---------------------------------------------------------------- configuración del establecimiento

async function asegurarConfig(q, idEst, ahora) {
  await q.query(
    `INSERT INTO e5_config_establecimiento (id_establecimiento, actualizado_en) VALUES ($1, $2)
     ON CONFLICT (id_establecimiento) DO NOTHING`,
    [idEst, ahora],
  );
}

async function obtenerConfig(q, idEst, { bloquear = false } = {}) {
  const { rows } = await q.query(
    `SELECT id_establecimiento, id_sesion_principal, modo_automatico, pausa_manual, pausa_motivo, zona_horaria,
            id_lista_defecto, rotacion_listas, actualizado_en
     FROM e5_config_establecimiento WHERE id_establecimiento = $1${bloquear ? ' FOR UPDATE' : ''}`,
    [idEst],
  );
  return rows[0] || null;
}

const CAMPOS_CONFIG = new Set(['id_sesion_principal', 'modo_automatico', 'pausa_manual', 'pausa_motivo', 'zona_horaria',
  'id_lista_defecto', 'rotacion_listas']);

async function actualizarConfig(q, idEst, cambios, ahora) {
  const claves = Object.keys(cambios).filter((k) => CAMPOS_CONFIG.has(k));
  if (claves.length === 0) return;
  const sets = claves.map((k, i) => `${k} = $${i + 3}`).join(', ');
  await q.query(`UPDATE e5_config_establecimiento SET ${sets}, actualizado_en = $2 WHERE id_establecimiento = $1`,
    [idEst, ahora, ...claves.map((k) => cambios[k])]);
}

async function configsAutomaticas(q) {
  const { rows } = await q.query(
    `SELECT id_establecimiento, id_sesion_principal, modo_automatico, pausa_manual, zona_horaria
     FROM e5_config_establecimiento WHERE modo_automatico`,
  );
  return rows;
}

async function obtenerEstablecimiento(q, idEst) {
  const { rows } = await q.query('SELECT id_establecimiento, nombre, estado FROM establecimiento WHERE id_establecimiento = $1', [idEst]);
  return rows[0] || null;
}

// ---------------------------------------------------------------- sesiones (tabla del E3/E4)

async function listarSesiones(q, idEst) {
  const { rows } = await q.query(
    `SELECT s.id_sesion, s.id_establecimiento, s.qr_token, s.estado, s.qr_estado, s.version_cola,
            (SELECT COUNT(*) FROM solicitud x WHERE x.id_sesion = s.id_sesion AND x.estado = 'pendiente')::int AS pendientes,
            (SELECT COUNT(*) FROM solicitud x WHERE x.id_sesion = s.id_sesion)::int AS solicitudes_historicas,
            j.id_jornada, j.abierta_en, j.origen_apertura,
            (qd.id_sesion IS NOT NULL) AS desactivado_permanente,
            ca.codigo AS codigo_acceso
     FROM sesion s
     LEFT JOIN e5_jornada j ON j.id_sesion = s.id_sesion AND j.cerrada_en IS NULL
     LEFT JOIN e5_qr_desactivado qd ON qd.id_sesion = s.id_sesion
     LEFT JOIN e5_codigo_acceso ca ON ca.id_sesion = s.id_sesion AND ca.vigente
     WHERE s.id_establecimiento = $1 ORDER BY s.id_sesion`,
    [idEst],
  );
  return rows;
}

async function obtenerSesionCompleta(q, idSesion) {
  const { rows } = await q.query(
    'SELECT id_sesion, id_establecimiento, qr_token, estado, qr_estado, version_cola FROM sesion WHERE id_sesion = $1',
    [idSesion],
  );
  return rows[0] || null;
}

async function insertarSesion(q, { idSesion, idEst, qrToken }) {
  await q.query(
    `INSERT INTO sesion (id_sesion, id_establecimiento, qr_token, estado, qr_estado) VALUES ($1, $2, $3, 'cerrada', 'inactivo')`,
    [idSesion, idEst, qrToken],
  );
}

async function fijarEstadoSesion(q, idSesion, { estado, qrEstado }) {
  const sets = [];
  const params = [idSesion];
  if (estado) { params.push(estado); sets.push(`estado = $${params.length}`); }
  if (qrEstado) { params.push(qrEstado); sets.push(`qr_estado = $${params.length}`); }
  sets.push('version_cola = version_cola + 1'); // los clientes (SSE) reciben el cambio con una versión nueva
  await q.query(`UPDATE sesion SET ${sets.join(', ')} WHERE id_sesion = $1`, params);
}

async function marcarQrDesactivado(q, { idSesion, qrToken, motivo, ahora }) {
  await q.query(
    `INSERT INTO e5_qr_desactivado (id_sesion, qr_token, motivo, desactivado_en)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT DO NOTHING`,
    [idSesion, qrToken, motivo, ahora],
  );
}

async function estaQrDesactivado(q, idSesion) {
  const { rows } = await q.query('SELECT 1 FROM e5_qr_desactivado WHERE id_sesion = $1', [idSesion]);
  return rows.length > 0;
}

async function existeQrToken(q, qrToken) {
  const { rows } = await q.query(
    `SELECT 1 FROM sesion WHERE qr_token = $1
     UNION ALL
     SELECT 1 FROM e5_qr_desactivado WHERE qr_token = $1
     LIMIT 1`,
    [qrToken],
  );
  return rows.length > 0;
}

// ---------------------------------------------------------------- jornadas

async function jornadaAbierta(q, idSesion) {
  const { rows } = await q.query('SELECT * FROM e5_jornada WHERE id_sesion = $1 AND cerrada_en IS NULL', [idSesion]);
  return rows[0] || null;
}

async function abrirJornada(q, idSesion, origen, ahora) {
  const { rows } = await q.query(
    `INSERT INTO e5_jornada (id_sesion, abierta_en, origen_apertura) VALUES ($1, $2, $3)
     ON CONFLICT (id_sesion) WHERE cerrada_en IS NULL DO NOTHING RETURNING id_jornada`,
    [idSesion, ahora, origen],
  );
  return rows[0] ? rows[0].id_jornada : null;
}

async function cerrarJornada(q, idSesion, origen, ahora, retiradas, motivo = null) {
  await q.query(
    `UPDATE e5_jornada SET cerrada_en = $2, origen_cierre = $3, solicitudes_retiradas = $4,
       motivo_cierre = COALESCE($5, motivo_cierre)
     WHERE id_sesion = $1 AND cerrada_en IS NULL`,
    [idSesion, ahora, origen, retiradas, motivo],
  );
}

async function obtenerJornadaProgramada(q, idEstablecimiento, fechaJornada) {
  const { rows } = await q.query(
    `SELECT id_establecimiento, fecha_jornada, id_sesion, estado,
            apertura_programada_en, cierre_programado_en,
            creada_en, cerrada_en, motivo
     FROM e5_jornada_programada
     WHERE id_establecimiento = $1 AND fecha_jornada = $2`,
    [idEstablecimiento, fechaJornada],
  );
  return rows[0] || null;
}

async function ultimaJornadaProgramadaEstablecimiento(q, idEstablecimiento) {
  const { rows } = await q.query(
    `SELECT jp.id_establecimiento, jp.fecha_jornada, jp.id_sesion, jp.estado,
            jp.apertura_programada_en, jp.cierre_programado_en,
            jp.creada_en, jp.cerrada_en, jp.motivo,
            s.estado AS sesion_estado,
            s.qr_token, (qd.id_sesion IS NOT NULL) AS e5_qr_desactivado,
            ca.codigo AS codigo_acceso, ca.vigente AS codigo_vigente
     FROM e5_jornada_programada jp
     LEFT JOIN sesion s ON s.id_sesion = jp.id_sesion
     LEFT JOIN e5_qr_desactivado qd ON qd.id_sesion = jp.id_sesion
     LEFT JOIN e5_codigo_acceso ca ON ca.id_sesion = jp.id_sesion AND ca.vigente = TRUE
     WHERE jp.id_establecimiento = $1
     ORDER BY jp.fecha_jornada DESC, jp.creada_en DESC
     LIMIT 1`,
    [idEstablecimiento],
  );
  return rows[0] || null;
}

async function jornadasProgramadasPorCerrar(q, idEstablecimiento) {
  const { rows } = await q.query(
    `SELECT jp.id_establecimiento, jp.fecha_jornada, jp.id_sesion, jp.estado,
            jp.apertura_programada_en, jp.cierre_programado_en,
            s.estado AS sesion_estado
     FROM e5_jornada_programada jp
     JOIN sesion s ON s.id_sesion = jp.id_sesion
     WHERE jp.id_establecimiento = $1
       AND jp.estado = 'abierta'
       AND jp.id_sesion IS NOT NULL
       AND s.estado = 'activa'
     ORDER BY jp.cierre_programado_en ASC`,
    [idEstablecimiento],
  );
  return rows;
}

async function registrarJornadaProgramada(q, {
  idEstablecimiento, fechaJornada, idSesion = null, estado,
  aperturaProgramadaEn, cierreProgramadoEn, ahora, motivo = null,
}) {
  const { rows } = await q.query(
    `INSERT INTO e5_jornada_programada (
       id_establecimiento, fecha_jornada, id_sesion, estado,
       apertura_programada_en, cierre_programado_en, creada_en, motivo
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (id_establecimiento, fecha_jornada) DO NOTHING
     RETURNING *`,
    [
      idEstablecimiento, fechaJornada, idSesion, estado,
      aperturaProgramadaEn, cierreProgramadoEn, ahora, motivo,
    ],
  );
  return rows[0] || null;
}

async function actualizarEstadoJornadaProgramada(q, {
  idEstablecimiento, fechaJornada, estado, ahora, motivo = null,
}) {
  const { rows } = await q.query(
    `UPDATE e5_jornada_programada
     SET estado = $3,
         cerrada_en = CASE WHEN $3 IN ('cerrada_auto', 'cerrada_manual') THEN COALESCE(cerrada_en, $4) ELSE cerrada_en END,
         motivo = COALESCE($5, motivo)
     WHERE id_establecimiento = $1 AND fecha_jornada = $2
     RETURNING *`,
    [idEstablecimiento, fechaJornada, estado, ahora, motivo],
  );
  return rows[0] || null;
}

async function marcarJornadasProgramadasCerradasPorSesion(q, idSesion, estado, ahora, motivo = null) {
  await q.query(
    `UPDATE e5_jornada_programada
     SET estado = $2,
         cerrada_en = COALESCE(cerrada_en, $3),
         motivo = COALESCE($4, motivo)
     WHERE id_sesion = $1 AND estado = 'abierta'`,
    [idSesion, estado, ahora, motivo],
  );
}

async function listarJornadas(q, idSesion, limite = 20) {
  const { rows } = await q.query(
    `SELECT j.*,
       (SELECT COUNT(*) FROM solicitud s WHERE s.id_sesion = j.id_sesion AND s.fecha_solicitud >= j.abierta_en
          AND (j.cerrada_en IS NULL OR s.fecha_solicitud <= j.cerrada_en))::int AS solicitudes,
       (SELECT COUNT(*) FROM reproduccion r WHERE r.id_sesion = j.id_sesion AND r.inicio_en >= j.abierta_en
          AND (j.cerrada_en IS NULL OR r.inicio_en <= j.cerrada_en))::int AS reproducciones
     FROM e5_jornada j WHERE j.id_sesion = $1 ORDER BY j.abierta_en DESC LIMIT $2`,
    [idSesion, limite],
  );
  return rows;
}

// ---------------------------------------------------------------- solicitudes (tabla del E4)

/** Pasa a 'retirada' las solicitudes pendientes de la sesión (opcionalmente solo de una canción). Devuelve las filas. */
async function retirarPendientes(q, idSesion, idCancion = null) {
  const params = [idSesion];
  let filtro = '';
  if (idCancion !== null) { params.push(idCancion); filtro = ' AND id_cancion = $2'; }
  const { rows } = await q.query(
    `UPDATE solicitud SET estado = 'retirada' WHERE id_sesion = $1 AND estado = 'pendiente'${filtro}
     RETURNING id_solicitud, id_cancion`,
    params,
  );
  return rows;
}

async function resumenSolicitudes(q, idSesion) {
  const { rows } = await q.query(
    'SELECT estado, COUNT(*)::int AS total FROM solicitud WHERE id_sesion = $1 GROUP BY estado ORDER BY estado',
    [idSesion],
  );
  return Object.fromEntries(rows.map((r) => [r.estado, r.total]));
}

async function historialReproducciones(q, idSesion, limite = 30) {
  const { rows } = await q.query(
    `SELECT r.id_reproduccion, r.id_solicitud, r.inicio_en, r.fin_en, r.resultado, r.segundos_reproducidos, r.codigo_error,
            c.youtube_video_id, c.titulo, c.artista_canal, c.duracion_segundos, c.url_miniatura,
            (SELECT COUNT(*) FROM voto v WHERE v.id_solicitud = r.id_solicitud)::int AS total_votos
     FROM reproduccion r JOIN cancion c ON c.id_cancion = r.id_cancion
     WHERE r.id_sesion = $1 ORDER BY r.inicio_en DESC, r.id_reproduccion DESC LIMIT $2`,
    [idSesion, limite],
  );
  return rows;
}

// ---------------------------------------------------------------- reproducción

async function asegurarEstadoReproduccion(q, idSesion, ahora) {
  await q.query(
    `INSERT INTO e5_estado_reproduccion (id_sesion, estado, actualizado_en) VALUES ($1, 'detenida', $2)
     ON CONFLICT (id_sesion) DO NOTHING`,
    [idSesion, ahora],
  );
}

async function obtenerEstadoReproduccion(q, idSesion, { bloquear = false } = {}) {
  const { rows } = await q.query(
    `SELECT e.*, c.youtube_video_id, c.titulo, c.artista_canal, c.duracion_segundos, c.url_miniatura, l.nombre AS lista_nombre
     FROM e5_estado_reproduccion e
     LEFT JOIN cancion c ON c.id_cancion = e.lista_cancion
     LEFT JOIN e5_lista l ON l.id_lista = e.lista_id
     WHERE e.id_sesion = $1${bloquear ? ' FOR UPDATE OF e' : ''}`,
    [idSesion],
  );
  return rows[0] || null;
}

const CAMPOS_ESTADO = new Set(['estado', 'pausada_en', 'lista_id', 'lista_posicion', 'lista_cancion', 'lista_inicio_en', 'tiempo_pausado_ms', 'reproduccion_uid']);

async function actualizarEstadoReproduccion(q, idSesion, cambios, ahora) {
  const claves = Object.keys(cambios).filter((k) => CAMPOS_ESTADO.has(k));
  const sets = claves.map((k, i) => `${k} = $${i + 3}`);
  sets.push('actualizado_en = $2');
  await q.query(`UPDATE e5_estado_reproduccion SET ${sets.join(', ')} WHERE id_sesion = $1`,
    [idSesion, ahora, ...claves.map((k) => cambios[k])]);
}

async function sesionesEnEspera(q) {
  const { rows } = await q.query(
    `SELECT e.id_sesion FROM e5_estado_reproduccion e JOIN sesion s ON s.id_sesion = e.id_sesion
     WHERE e.estado = 'en_espera' AND s.estado = 'activa'`,
  );
  return rows.map((r) => r.id_sesion);
}

/** Registra en `reproduccion` una canción de la lista por defecto ya terminada (id_solicitud NULL). */
async function insertarReproduccionLista(q, { idSesion, idEst, idCancion, inicio, fin, resultado, segundos, codigoError }) {
  const { rows } = await q.query(
    `INSERT INTO reproduccion (id_sesion, id_establecimiento, id_solicitud, id_cancion, inicio_en, fin_en, resultado,
       segundos_reproducidos, codigo_error, origen)
     VALUES ($1, $2, NULL, $3, $4, $5, $6, $7, $8, 'reproductor') RETURNING id_reproduccion`,
    [idSesion, idEst, idCancion, inicio, fin, resultado, segundos, codigoError],
  );
  return rows[0].id_reproduccion;
}

// ---------------------------------------------------------------- catálogo

async function buscarCatalogo(q, termino, limite = 20) {
  const { rows } = await q.query(
    `SELECT id_cancion, youtube_video_id, titulo, artista_canal, duracion_segundos, url_miniatura, disponibilidad
     FROM cancion WHERE disponibilidad = 'disponible' AND (titulo ILIKE $1 OR artista_canal ILIKE $1)
     ORDER BY titulo LIMIT $2`,
    [`%${termino.replace(/[%_\\]/g, (c) => `\\${c}`)}%`, limite],
  );
  return rows;
}

// ---------------------------------------------------------------- bloqueos

async function idsBloqueados(q, idEst, ahora) {
  const { rows } = await q.query(
    'SELECT DISTINCT id_cancion FROM e5_bloqueo WHERE id_establecimiento = $1 AND levantado_en IS NULL AND hasta > $2',
    [idEst, ahora],
  );
  return new Set(rows.map((r) => r.id_cancion));
}

async function listarBloqueos(q, idEst, ahora, { incluirVencidos = false } = {}) {
  const { rows } = await q.query(
    `SELECT b.*, c.youtube_video_id, c.titulo, c.artista_canal, c.duracion_segundos, c.url_miniatura,
            u.nombre AS creado_por_nombre
     FROM e5_bloqueo b JOIN cancion c ON c.id_cancion = b.id_cancion
     LEFT JOIN e5_usuario u ON u.id_usuario = b.creado_por
     WHERE b.id_establecimiento = $1 ${incluirVencidos ? '' : 'AND b.levantado_en IS NULL AND b.hasta > $2'}
     ORDER BY b.desde DESC LIMIT 100`,
    incluirVencidos ? [idEst] : [idEst, ahora],
  );
  return rows;
}

async function insertarBloqueo(q, { idEst, idCancion, motivo, desde, hasta, idUsuario }) {
  const { rows } = await q.query(
    `INSERT INTO e5_bloqueo (id_establecimiento, id_cancion, motivo, desde, hasta, creado_por)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id_bloqueo`,
    [idEst, idCancion, motivo, desde, hasta, idUsuario],
  );
  return rows[0].id_bloqueo;
}

async function levantarBloqueo(q, idEst, idBloqueo, idUsuario, ahora) {
  const { rows } = await q.query(
    `UPDATE e5_bloqueo SET levantado_en = $4, levantado_por = $3
     WHERE id_bloqueo = $2 AND id_establecimiento = $1 AND levantado_en IS NULL
     RETURNING id_bloqueo, id_cancion`,
    [idEst, idBloqueo, idUsuario, ahora],
  );
  return rows[0] || null;
}

// ---------------------------------------------------------------- listas

async function listarListas(q, idEst) {
  const { rows } = await q.query(
    `SELECT l.id_lista, l.nombre, l.descripcion, l.en_rotacion, l.creada_en, l.actualizada_en,
            (SELECT COUNT(*) FROM e5_lista_cancion lc WHERE lc.id_lista = l.id_lista)::int AS total_canciones,
            (SELECT COALESCE(SUM(c.duracion_segundos), 0) FROM e5_lista_cancion lc JOIN cancion c ON c.id_cancion = lc.id_cancion
              WHERE lc.id_lista = l.id_lista)::int AS duracion_total
     FROM e5_lista l WHERE l.id_establecimiento = $1 AND l.eliminada_en IS NULL ORDER BY l.id_lista`,
    [idEst],
  );
  return rows;
}

async function obtenerLista(q, idEst, idLista) {
  const { rows } = await q.query(
    'SELECT * FROM e5_lista WHERE id_lista = $1 AND id_establecimiento = $2 AND eliminada_en IS NULL',
    [idLista, idEst],
  );
  return rows[0] || null;
}

async function cancionesDeLista(q, idLista) {
  const { rows } = await q.query(
    `SELECT lc.posicion, c.id_cancion, c.youtube_video_id, c.titulo, c.artista_canal, c.duracion_segundos, c.url_miniatura,
            c.disponibilidad
     FROM e5_lista_cancion lc JOIN cancion c ON c.id_cancion = lc.id_cancion
     WHERE lc.id_lista = $1 ORDER BY lc.posicion`,
    [idLista],
  );
  return rows;
}

async function insertarLista(q, { idEst, nombre, descripcion, ahora }) {
  const { rows } = await q.query(
    `INSERT INTO e5_lista (id_establecimiento, nombre, descripcion, creada_en, actualizada_en) VALUES ($1, $2, $3, $4, $4)
     RETURNING id_lista`,
    [idEst, nombre, descripcion, ahora],
  );
  return rows[0].id_lista;
}

async function actualizarLista(q, idLista, { nombre, descripcion, enRotacion }, ahora) {
  await q.query(
    `UPDATE e5_lista SET nombre = COALESCE($2, nombre), descripcion = COALESCE($3, descripcion),
       en_rotacion = COALESCE($4, en_rotacion), actualizada_en = $5 WHERE id_lista = $1`,
    [idLista, nombre, descripcion, enRotacion, ahora],
  );
}

async function eliminarLista(q, idLista, ahora) {
  await q.query('UPDATE e5_lista SET eliminada_en = $2, actualizada_en = $2 WHERE id_lista = $1', [idLista, ahora]);
}

async function agregarCancionALista(q, idLista, idCancion, ahora) {
  const { rows } = await q.query(
    `INSERT INTO e5_lista_cancion (id_lista, id_cancion, posicion, agregada_en)
     SELECT $1, $2, COALESCE(MAX(posicion), 0) + 1, $3 FROM e5_lista_cancion WHERE id_lista = $1
     ON CONFLICT (id_lista, id_cancion) DO NOTHING RETURNING posicion`,
    [idLista, idCancion, ahora],
  );
  await q.query('UPDATE e5_lista SET actualizada_en = $2 WHERE id_lista = $1', [idLista, ahora]);
  return rows[0] ? rows[0].posicion : null;
}

/** Quita una canción y compacta las posiciones (1..n). */
async function quitarCancionDeLista(q, idLista, idCancion, ahora) {
  const { rowCount } = await q.query('DELETE FROM e5_lista_cancion WHERE id_lista = $1 AND id_cancion = $2', [idLista, idCancion]);
  if (rowCount === 0) return false;
  await renumerar(q, idLista);
  await q.query('UPDATE e5_lista SET actualizada_en = $2 WHERE id_lista = $1', [idLista, ahora]);
  return true;
}

async function renumerar(q, idLista) {
  await q.query(
    `UPDATE e5_lista_cancion lc SET posicion = o.n
     FROM (SELECT id_cancion, ROW_NUMBER() OVER (ORDER BY posicion) AS n FROM e5_lista_cancion WHERE id_lista = $1) o
     WHERE lc.id_lista = $1 AND lc.id_cancion = o.id_cancion`,
    [idLista],
  );
}

/** Reordena: `idsCancion` en el nuevo orden (debe contener exactamente las canciones de la lista). */
async function reordenarLista(q, idLista, idsCancion, ahora) {
  await q.query('UPDATE e5_lista_cancion SET posicion = posicion + 100000 WHERE id_lista = $1', [idLista]);
  for (let i = 0; i < idsCancion.length; i++) {
    await q.query('UPDATE e5_lista_cancion SET posicion = $3 WHERE id_lista = $1 AND id_cancion = $2', [idLista, idsCancion[i], i + 1]);
  }
  await q.query('UPDATE e5_lista SET actualizada_en = $2 WHERE id_lista = $1', [idLista, ahora]);
}

async function listasEnRotacion(q, idEst) {
  const { rows } = await q.query(
    `SELECT id_lista FROM e5_lista WHERE id_establecimiento = $1 AND eliminada_en IS NULL AND en_rotacion ORDER BY id_lista`,
    [idEst],
  );
  return rows.map((r) => r.id_lista);
}

// ---------------------------------------------------------------- registro de auditoría

async function registrar(q, { idEst, idUsuario = null, accion, detalle = {}, ahora }) {
  await q.query('INSERT INTO e5_registro (id_establecimiento, id_usuario, accion, detalle, fecha) VALUES ($1, $2, $3, $4, $5)',
    [idEst, idUsuario, accion, JSON.stringify(detalle), ahora]);
}

async function leerRegistro(q, idEst, limite = 50) {
  const { rows } = await q.query(
    `SELECT r.id_registro, r.accion, r.detalle, r.fecha, u.nombre AS usuario, u.rol
     FROM e5_registro r LEFT JOIN e5_usuario u ON u.id_usuario = r.id_usuario
     WHERE r.id_establecimiento = $1 ORDER BY r.fecha DESC, r.id_registro DESC LIMIT $2`,
    [idEst, limite],
  );
  return rows;
}

// ---------------------------------------------------------------- horarios

async function leerHorarios(q, idEst) {
  const { rows } = await q.query(
    'SELECT dia_semana, apertura_min, cierre_min, activo FROM e5_horario WHERE id_establecimiento = $1 ORDER BY dia_semana',
    [idEst],
  );
  return rows;
}

async function guardarHorario(q, idEst, { dia, apertura, cierre, activo }, ahora) {
  await q.query(
    `INSERT INTO e5_horario (id_establecimiento, dia_semana, apertura_min, cierre_min, activo, actualizado_en)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (id_establecimiento, dia_semana) DO UPDATE SET apertura_min = EXCLUDED.apertura_min,
       cierre_min = EXCLUDED.cierre_min, activo = EXCLUDED.activo, actualizado_en = EXCLUDED.actualizado_en`,
    [idEst, dia, apertura, cierre, activo, ahora],
  );
}

async function leerExcepciones(q, idEst, desdeFecha = null) {
  const { rows } = await q.query(
    `SELECT id_excepcion, fecha, cerrado, apertura_min, cierre_min, motivo FROM e5_horario_excepcion
     WHERE id_establecimiento = $1 ${desdeFecha ? 'AND fecha >= $2' : ''} ORDER BY fecha`,
    desdeFecha ? [idEst, desdeFecha] : [idEst],
  );
  return rows;
}

async function guardarExcepcion(q, idEst, { fecha, cerrado, apertura, cierre, motivo }, ahora) {
  const { rows } = await q.query(
    `INSERT INTO e5_horario_excepcion (id_establecimiento, fecha, cerrado, apertura_min, cierre_min, motivo, creado_en)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (id_establecimiento, fecha) DO UPDATE SET cerrado = EXCLUDED.cerrado, apertura_min = EXCLUDED.apertura_min,
       cierre_min = EXCLUDED.cierre_min, motivo = EXCLUDED.motivo
     RETURNING id_excepcion`,
    [idEst, fecha, cerrado, apertura, cierre, motivo, ahora],
  );
  return rows[0].id_excepcion;
}

async function eliminarExcepcion(q, idEst, idExcepcion) {
  const { rows } = await q.query('DELETE FROM e5_horario_excepcion WHERE id_excepcion = $1 AND id_establecimiento = $2 RETURNING fecha',
    [idExcepcion, idEst]);
  return rows[0] || null;
}

// ---------------------------------------------------------------- pantalla pública (e5_display)

async function obtenerDisplayPorToken(q, displayToken, { bloquear = false } = {}) {
  const { rows } = await q.query(
    `SELECT d.id_display, d.id_establecimiento, d.id_sesion, d.display_token, d.activo,
            d.creado_en, d.revocado_en, d.ultimo_acceso,
            d.claim_hash, d.claim_expira_en, d.claim_intentos,
            d.control_hash, d.control_expira_en, d.ultimo_latido_display,
            s.estado AS sesion_estado, s.qr_estado, e.nombre AS establecimiento
     FROM e5_display d
     JOIN sesion s ON s.id_sesion = d.id_sesion
     JOIN establecimiento e ON e.id_establecimiento = d.id_establecimiento
     WHERE d.display_token = $1${bloquear ? ' FOR UPDATE OF d' : ''}`,
    [displayToken],
  );
  return rows[0] || null;
}

async function obtenerDisplayActivoPorSesion(q, idSesion, { bloquear = false } = {}) {
  const { rows } = await q.query(
    `SELECT id_display, id_establecimiento, id_sesion, display_token, activo, creado_en, revocado_en, ultimo_acceso,
            claim_hash, claim_expira_en, claim_intentos, control_hash, control_expira_en, ultimo_latido_display
     FROM e5_display
     WHERE id_sesion = $1 AND activo = true${bloquear ? ' FOR UPDATE' : ''}`,
    [idSesion],
  );
  return rows[0] || null;
}

async function insertarDisplay(q, { idEst, idSesion, displayToken, ahora }) {
  const { rows } = await q.query(
    `INSERT INTO e5_display (id_establecimiento, id_sesion, display_token, activo, creado_en)
     VALUES ($1, $2, $3, true, $4)
     RETURNING id_display, id_establecimiento, id_sesion, display_token, activo, creado_en, revocado_en, ultimo_acceso`,
    [idEst, idSesion, displayToken, ahora],
  );
  return rows[0];
}

async function revocarDisplaysDeSesion(q, idSesion, ahora) {
  const { rows } = await q.query(
    `UPDATE e5_display
     SET activo = false, revocado_en = $2,
         claim_hash = NULL, claim_expira_en = NULL, claim_intentos = 0,
         control_hash = NULL, control_expira_en = NULL
     WHERE id_sesion = $1 AND activo = true
     RETURNING id_display, display_token, revocado_en`,
    [idSesion, ahora],
  );
  return rows;
}

async function invalidarControlDisplaysDeEstablecimiento(q, idEst) {
  await q.query(
    `UPDATE e5_display
     SET claim_hash = NULL, claim_expira_en = NULL, claim_intentos = 0,
         control_hash = NULL, control_expira_en = NULL
     WHERE id_establecimiento = $1 AND activo = true`,
    [idEst],
  );
}

async function sesionesActivasDeEstablecimiento(q, idEst) {
  const { rows } = await q.query(
    `SELECT id_sesion FROM sesion WHERE id_establecimiento = $1 AND estado = 'activa'`,
    [idEst],
  );
  return rows;
}

async function registrarAccesoDisplay(q, idDisplay, ahora) {
  await q.query('UPDATE e5_display SET ultimo_acceso = $2 WHERE id_display = $1', [idDisplay, ahora]);
}

async function existeDisplayRevocadoEnSesion(q, idSesion) {
  const { rows } = await q.query(
    'SELECT 1 FROM e5_display WHERE id_sesion = $1 AND activo = false LIMIT 1',
    [idSesion],
  );
  return rows.length > 0;
}

module.exports = {
  obtenerUsuarioPorNombre, insertarUsuario, actualizarClaveUsuario, contarUsuarios,
  insertarSesionUsuario, usuarioPorToken, cerrarSesionUsuario,
  asegurarConfig, obtenerConfig, actualizarConfig, configsAutomaticas, obtenerEstablecimiento,
  listarSesiones, obtenerSesionCompleta, insertarSesion, fijarEstadoSesion,
  marcarQrDesactivado, estaQrDesactivado, existeQrToken,
  jornadaAbierta, abrirJornada, cerrarJornada, listarJornadas,
  obtenerJornadaProgramada, ultimaJornadaProgramadaEstablecimiento,
  jornadasProgramadasPorCerrar, registrarJornadaProgramada,
  actualizarEstadoJornadaProgramada, marcarJornadasProgramadasCerradasPorSesion,
  retirarPendientes, resumenSolicitudes, historialReproducciones,
  asegurarEstadoReproduccion, obtenerEstadoReproduccion, actualizarEstadoReproduccion, sesionesEnEspera, insertarReproduccionLista,
  buscarCatalogo,
  idsBloqueados, listarBloqueos, insertarBloqueo, levantarBloqueo,
  listarListas, obtenerLista, cancionesDeLista, insertarLista, actualizarLista, eliminarLista,
  agregarCancionALista, quitarCancionDeLista, reordenarLista, listasEnRotacion,
  registrar, leerRegistro,
  leerHorarios, guardarHorario, leerExcepciones, guardarExcepcion, eliminarExcepcion,
  obtenerDisplayPorToken, obtenerDisplayActivoPorSesion, insertarDisplay, revocarDisplaysDeSesion,
  invalidarControlDisplaysDeEstablecimiento, sesionesActivasDeEstablecimiento, registrarAccesoDisplay,
  existeDisplayRevocadoEnSesion,
};
