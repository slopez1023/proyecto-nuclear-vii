'use strict';
/**
 * Funcionalidades opcionales (bonificación del reto):
 *  1) Cambio de voto: el cliente mueve su voto de una solicitud pendiente a otra.
 *  2) Filtros del catálogo por género, duración y popularidad.
 *  3) Respaldo automático de las listas más populares (JSON en disco + tabla) para análisis posterior.
 *  4) Integración con el sistema de sonido del establecimiento (volumen, silencio y salida de audio dedicada).
 * Todo es aditivo: no modifica las reglas del E4 ni sus tablas.
 */
const fs = require('node:fs');
const path = require('node:path');
const repo4 = require('../db/repositorio');
const repo5 = require('./repositorio-e5');
const { ErrorApi, texto, entero, booleano, iso, idTexto, cancionJson, videoId } = require('./comun-e5');

const CARPETA_RESPALDOS = path.join(__dirname, '..', '..', 'data', 'respaldos');
const LATIDO_VIGENTE_MS = 20_000;
const SALIDAS = new Set(['panel', 'equipo_local', 'pantalla_publica']);
const ORDENES = new Set(['popularidad', 'duracion_asc', 'duracion_desc', 'titulo']);

// ---------------------------------------------------------------- géneros (funciones puras)

const GENEROS_PALABRAS = [
  ['reggaeton', ['reggaeton', 'reggaetón', 'perreo', 'daddy yankee', 'bad bunny', 'karol g', 'feid', 'j balvin', 'maluma', 'ozuna', 'anuel', 'rauw', 'urbano']],
  ['salsa', ['salsa', 'marc anthony', 'celia cruz', 'gran combo', 'joe arroyo', 'grupo niche', 'hector lavoe', 'willie colon']],
  ['vallenato', ['vallenato', 'diomedes', 'silvestre dangond', 'carlos vives', 'binomio de oro', 'jorge celedon']],
  ['bachata', ['bachata', 'romeo santos', 'aventura', 'prince royce', 'xtreme']],
  ['cumbia', ['cumbia', 'los angeles azules', 'sonora dinamita', 'los palmeras']],
  ['merengue', ['merengue', 'juan luis guerra', 'elvis crespo', 'olga tanon']],
  ['regional mexicano', ['corrido', 'banda ms', 'mariachi', 'ranchera', 'norteno', 'norteño', 'regional mexicano', 'vicente fernandez', 'peso pluma', 'grupo frontera', 'fuerza regida']],
  ['rock', ['rock', 'metallica', 'queen', 'nirvana', 'acdc', 'ac/dc', 'led zeppelin', 'guns n', 'soda stereo', 'heroes del silencio', 'aterciopelados']],
  ['hip hop / rap', ['hip hop', 'rap', 'eminem', 'drake', 'kendrick', 'snoop']],
  ['electronica', ['electronica', 'electrónica', 'edm', 'techno', 'house', 'remix', 'avicii', 'calvin harris', 'david guetta', 'tiesto']],
  ['balada', ['balada', 'ballad', 'romantica', 'romántica', 'ana gabriel', 'luis miguel', 'camilo sesto', 'jose jose', 'rocio durcal', 'lyrics']],
  ['pop', ['pop', 'shakira', 'dua lipa', 'taylor swift', 'ed sheeran', 'bruno mars', 'the weeknd', 'ariana grande', 'rosalia', 'rosalía']],
];

function normalizar(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/** Género más probable según palabras clave del título y del canal; 'otros' si ninguna coincide. */
function inferirGenero(titulo, canal) {
  const t = normalizar(`${titulo} ${canal}`);
  for (const [genero, palabras] of GENEROS_PALABRAS) {
    if (palabras.some((p) => t.includes(normalizar(p)))) return genero;
  }
  return 'otros';
}

/** Valida y normaliza los filtros del catálogo (query string). Lanza 400 si algo no es válido. */
function parsearFiltros(query = {}) {
  const num = (v, campo) => {
    if (v === undefined || v === null || v === '') return null;
    const n = Number(v);
    if (!Number.isInteger(n) || n < 0 || n > 86_400) throw new ErrorApi(400, 'filtro_invalido', `${campo} debe ser un entero de segundos entre 0 y 86400.`);
    return n;
  };
  const duracionMin = num(query.duracion_min, 'duracion_min');
  const duracionMax = num(query.duracion_max, 'duracion_max');
  if (duracionMin !== null && duracionMax !== null && duracionMin > duracionMax) {
    throw new ErrorApi(400, 'filtro_invalido', 'duracion_min no puede ser mayor que duracion_max.');
  }
  const orden = query.orden === undefined || query.orden === '' ? 'popularidad' : String(query.orden);
  if (!ORDENES.has(orden)) throw new ErrorApi(400, 'filtro_invalido', `orden debe ser uno de: ${[...ORDENES].join(', ')}.`);
  const limite = query.limite === undefined || query.limite === '' ? 30 : Number(query.limite);
  if (!Number.isInteger(limite) || limite < 1 || limite > 100) throw new ErrorApi(400, 'filtro_invalido', 'limite debe estar entre 1 y 100.');
  const genero = typeof query.genero === 'string' && query.genero.trim() ? normalizar(query.genero).trim().slice(0, 40) : null;
  const q = typeof query.q === 'string' ? query.q.trim().slice(0, 100) : '';
  const sesion = typeof query.sesion === 'string' && query.sesion.trim() ? query.sesion.trim().slice(0, 40) : null;
  return { q, genero, duracionMin, duracionMax, orden, limite, sesion };
}

const POPULARIDAD_SQL = `
  SELECT s.id_cancion, COUNT(DISTINCT s.id_solicitud)::int AS solicitudes, COUNT(v.id_voto)::int AS votos
  FROM solicitud s LEFT JOIN voto v ON v.id_solicitud = s.id_solicitud
  GROUP BY s.id_cancion`;

function crearBonus({ pool, e4, flujo, ahora, emisor, intervaloRespaldoMs = 24 * 60 * 60 * 1000, carpetaRespaldos = CARPETA_RESPALDOS }) {
  const notificar = (idSesion) => {
    if (flujo && typeof flujo.notificarSesion === 'function') flujo.notificarSesion(idSesion);
  };

  // ------------------------------------------------------------ 1) cambio de voto

  async function cambiarVoto({ idSesion, uuid, idSolicitudOrigen, idSolicitudDestino }) {
    if (idSolicitudOrigen === null || idSolicitudDestino === null) {
      throw new ErrorApi(400, 'solicitud_invalida', 'Las solicitudes deben tener el formato SOL-n.');
    }
    if (idSolicitudOrigen === idSolicitudDestino) {
      throw new ErrorApi(400, 'mismo_destino', 'Elige una canción diferente a la que ya votaste.');
    }
    const sesionPrevia = await e4.cola.obtenerSesionActiva(idSesion);
    const idDispositivo = await e4.cola.registrarDispositivo(uuid, idSesion);
    const idEst = sesionPrevia.id_establecimiento;
    const t = ahora();

    const r = await repo4.conTransaccion(pool, async (client) => {
      e4.cola.verificarSesion(await repo4.bloquearEstablecimientoYSesion(client, idEst, idSesion));
      const origen = await repo4.obtenerSolicitud(client, idSesion, idSolicitudOrigen);
      const destino = await repo4.obtenerSolicitud(client, idSesion, idSolicitudDestino);
      if (!origen || !destino) throw new ErrorApi(404, 'solicitud_inexistente', 'La solicitud no existe en esta sesión.');
      if (!(await repo4.existeVoto(client, idSolicitudOrigen, idDispositivo))) {
        throw new ErrorApi(409, 'sin_voto_en_origen', 'Este dispositivo no tiene un voto en la canción de origen.');
      }
      if (origen.estado !== 'pendiente') {
        throw new ErrorApi(409, 'voto_no_cambiable', 'Ese voto ya no se puede cambiar: la canción está sonando o ya terminó.');
      }
      if (destino.estado !== 'pendiente') {
        throw new ErrorApi(409, 'solicitud_no_votable', 'La canción elegida ya no se puede votar.');
      }
      if (await repo4.existeVoto(client, idSolicitudDestino, idDispositivo)) {
        throw new ErrorApi(409, 'voto_duplicado', 'Este dispositivo ya votó por la canción elegida.',
          { id_solicitud: idTexto('SOL', idSolicitudDestino) });
      }
      if ((await repo5.idsBloqueados(client, idEst, t)).has(destino.id_cancion)) {
        throw new ErrorApi(403, 'cancion_bloqueada', 'Esa canción está bloqueada temporalmente en este establecimiento.');
      }
      // El voto conserva su fecha_hora: cambiarlo no reinicia el intervalo de votación del dispositivo (regla E4).
      const { rows } = await client.query(
        `UPDATE voto SET id_solicitud = $1, origen = 'manual'
         WHERE id_solicitud = $2 AND id_dispositivo = $3 RETURNING id_voto, fecha_hora`,
        [idSolicitudDestino, idSolicitudOrigen, idDispositivo],
      );
      const { rows: restantes } = await client.query('SELECT COUNT(*)::int AS n FROM voto WHERE id_solicitud = $1', [idSolicitudOrigen]);
      const origenRetirada = restantes[0].n === 0;
      if (origenRetirada) await repo4.cambiarEstadoSolicitud(client, idSolicitudOrigen, 'retirada');
      await repo4.incrementarVersion(client, idSesion);
      const { rows: votosDestino } = await client.query('SELECT COUNT(*)::int AS n FROM voto WHERE id_solicitud = $1', [idSolicitudDestino]);
      return {
        idVoto: rows[0].id_voto, fecha: rows[0].fecha_hora, origenRetirada,
        votosOrigen: restantes[0].n, votosDestino: votosDestino[0].n,
        youtubeOrigen: origen.youtube_video_id, youtubeDestino: destino.youtube_video_id,
      };
    });

    emisor.emitir({
      tipo: 'voto_cambiado', sesion_id: idSesion, id_establecimiento: idEst, dispositivo_id: uuid,
      datos_evento: {
        id_solicitud_origen: idTexto('SOL', idSolicitudOrigen), id_solicitud_destino: idTexto('SOL', idSolicitudDestino),
        youtube_origen: r.youtubeOrigen, youtube_destino: r.youtubeDestino, solicitud_origen_retirada: r.origenRetirada,
      },
    });
    notificar(idSesion);
    return {
      resultado: 'voto_cambiado',
      voto: { id_voto: idTexto('VOT', r.idVoto), id_solicitud: idTexto('SOL', idSolicitudDestino), fecha_hora: iso(r.fecha), origen: 'manual' },
      origen: { id_solicitud: idTexto('SOL', idSolicitudOrigen), total_votos: r.votosOrigen, retirada: r.origenRetirada },
      destino: { id_solicitud: idTexto('SOL', idSolicitudDestino), total_votos: r.votosDestino },
      estado_cola: await e4.cola.estadoCola(idSesion, idDispositivo),
    };
  }

  // ------------------------------------------------------------ 2) filtros del catálogo

  /** Completa el género de las canciones que aún no lo tienen (inferido por palabras clave). */
  async function completarGeneros(limite = 300) {
    const { rows } = await pool.query(
      `SELECT c.id_cancion, c.titulo, c.artista_canal FROM cancion c
       LEFT JOIN e5_cancion_genero g ON g.id_cancion = c.id_cancion
       WHERE g.id_cancion IS NULL AND c.disponibilidad = 'disponible' LIMIT $1`,
      [limite],
    );
    const t = ahora();
    for (const c of rows) {
      await pool.query(
        `INSERT INTO e5_cancion_genero (id_cancion, genero, origen, fijado_en) VALUES ($1, $2, 'inferido', $3)
         ON CONFLICT (id_cancion) DO NOTHING`,
        [c.id_cancion, inferirGenero(c.titulo, c.artista_canal), t],
      );
    }
    return rows.length;
  }

  async function listarGeneros() {
    await completarGeneros();
    const { rows } = await pool.query(
      `SELECT g.genero, COUNT(*)::int AS total FROM e5_cancion_genero g
       JOIN cancion c ON c.id_cancion = g.id_cancion WHERE c.disponibilidad = 'disponible'
       GROUP BY g.genero ORDER BY total DESC, g.genero ASC`,
    );
    return { generos: rows };
  }

  async function explorarCatalogo(query) {
    const f = parsearFiltros(query);
    await completarGeneros();
    const params = [];
    const where = ["c.disponibilidad = 'disponible'"];
    const p = (valor) => { params.push(valor); return `$${params.length}`; };
    if (f.q) {
      const like = `%${f.q.replace(/[%_\\]/g, (ch) => `\\${ch}`)}%`;
      const ph = p(like);
      where.push(`(c.titulo ILIKE ${ph} OR c.artista_canal ILIKE ${ph})`);
    }
    if (f.genero) where.push(`g.genero = ${p(f.genero)}`);
    if (f.duracionMin !== null) where.push(`c.duracion_segundos >= ${p(f.duracionMin)}`);
    if (f.duracionMax !== null) where.push(`c.duracion_segundos <= ${p(f.duracionMax)}`);
    if (f.sesion) {
      const s = await repo5.obtenerSesionCompleta(pool, f.sesion);
      if (s) {
        where.push(`NOT EXISTS (SELECT 1 FROM e5_bloqueo b WHERE b.id_cancion = c.id_cancion AND b.id_establecimiento = ${p(s.id_establecimiento)}
                     AND b.levantado_en IS NULL AND b.hasta > ${p(ahora())})`);
      }
    }
    const orden = {
      popularidad: 'votos DESC, solicitudes DESC, c.titulo ASC',
      duracion_asc: 'c.duracion_segundos ASC NULLS LAST, c.titulo ASC',
      duracion_desc: 'c.duracion_segundos DESC NULLS LAST, c.titulo ASC',
      titulo: 'c.titulo ASC',
    }[f.orden];
    const { rows } = await pool.query(
      `SELECT c.id_cancion, c.youtube_video_id, c.titulo, c.artista_canal, c.duracion_segundos, c.url_miniatura,
              COALESCE(g.genero, 'otros') AS genero, COALESCE(pp.votos, 0) AS votos, COALESCE(pp.solicitudes, 0) AS solicitudes
       FROM cancion c
       LEFT JOIN e5_cancion_genero g ON g.id_cancion = c.id_cancion
       LEFT JOIN (${POPULARIDAD_SQL}) pp ON pp.id_cancion = c.id_cancion
       WHERE ${where.join(' AND ')}
       ORDER BY ${orden} LIMIT ${p(f.limite)}`,
      params,
    );
    return {
      filtros: { q: f.q || null, genero: f.genero, duracion_min: f.duracionMin, duracion_max: f.duracionMax, orden: f.orden },
      total: rows.length,
      resultados: rows.map((r) => ({ ...cancionJson(r), genero: r.genero, total_votos: r.votos, total_solicitudes: r.solicitudes })),
    };
  }

  async function etiquetarGenero(idEst, ytId, body, usuario) {
    videoId(ytId);
    const genero = normalizar(texto(body && body.genero, 'genero', { max: 40 })).trim();
    const cancion = await repo4.obtenerCancion(pool, ytId);
    if (!cancion) throw new ErrorApi(404, 'cancion_inexistente', 'La canción no está en el catálogo.');
    const t = ahora();
    await pool.query(
      `INSERT INTO e5_cancion_genero (id_cancion, genero, origen, fijado_en) VALUES ($1, $2, 'manual', $3)
       ON CONFLICT (id_cancion) DO UPDATE SET genero = EXCLUDED.genero, origen = 'manual', fijado_en = EXCLUDED.fijado_en`,
      [cancion.id_cancion, genero, t],
    );
    await repo5.registrar(pool, {
      idEst, idUsuario: usuario.id_usuario, accion: 'cancion_genero_actualizado',
      detalle: { youtube_video_id: ytId, genero }, ahora: t
    });
    return { youtube_video_id: ytId, genero, origen: 'manual' };
  }

  // ------------------------------------------------------------ 3) respaldo de listas populares

  async function construirRespaldo(idEst) {
    await completarGeneros();
    const top = await pool.query(
      `SELECT c.youtube_video_id, c.titulo, c.artista_canal, c.duracion_segundos, COALESCE(g.genero, 'otros') AS genero,
              pp.votos, pp.solicitudes
       FROM (SELECT s.id_cancion, COUNT(DISTINCT s.id_solicitud)::int AS solicitudes, COUNT(v.id_voto)::int AS votos
             FROM solicitud s JOIN sesion se ON se.id_sesion = s.id_sesion
             LEFT JOIN voto v ON v.id_solicitud = s.id_solicitud
             WHERE se.id_establecimiento = $1 GROUP BY s.id_cancion) pp
       JOIN cancion c ON c.id_cancion = pp.id_cancion
       LEFT JOIN e5_cancion_genero g ON g.id_cancion = c.id_cancion
       ORDER BY pp.votos DESC, pp.solicitudes DESC, c.titulo ASC LIMIT 20`,
      [idEst],
    );
    const porGenero = {};
    for (const c of top.rows) porGenero[c.genero] = (porGenero[c.genero] || 0) + c.votos;
    const listas = [];
    for (const l of await repo5.listarListas(pool, idEst)) {
      const canciones = await repo5.cancionesDeLista(pool, l.id_lista);
      listas.push({
        id_lista: l.id_lista, nombre: l.nombre, en_rotacion: l.en_rotacion,
        canciones: canciones.map((c) => ({ posicion: c.posicion, ...cancionJson(c) })),
      });
    }
    return {
      version: '1.0',
      id_establecimiento: idEst,
      canciones_mas_populares: top.rows.map((c, i) => ({
        posicion: i + 1, youtube_video_id: c.youtube_video_id, titulo: c.titulo, artista_canal: c.artista_canal,
        duracion_segundos: c.duracion_segundos, genero: c.genero, total_votos: c.votos, total_solicitudes: c.solicitudes,
      })),
      votos_por_genero: Object.entries(porGenero).map(([genero, votos]) => ({ genero, votos })).sort((a, b) => b.votos - a.votos),
      listas_predeterminadas: listas,
    };
  }

  async function generarRespaldo(idEst, origen = 'manual', usuario = null) {
    const t = ahora();
    const contenido = await construirRespaldo(idEst);
    let archivo = null;
    try {
      fs.mkdirSync(carpetaRespaldos, { recursive: true });
      archivo = `respaldo-${idEst}-${new Date(t).toISOString().replace(/[:.]/g, '-')}.json`;
      fs.writeFileSync(path.join(carpetaRespaldos, archivo), JSON.stringify({ generado_en: iso(t), origen, ...contenido }, null, 2), 'utf8');
    } catch (err) {
      console.error('[e5/respaldo] no se pudo escribir el archivo:', err.message);
      archivo = null;
    }
    const { rows } = await pool.query(
      `INSERT INTO e5_respaldo_lista (id_establecimiento, generado_en, origen, archivo, total_canciones, contenido)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb) RETURNING id_respaldo`,
      [idEst, t, origen, archivo, contenido.canciones_mas_populares.length, JSON.stringify(contenido)],
    );
    await repo5.registrar(pool, {
      idEst, idUsuario: usuario ? usuario.id_usuario : null, accion: 'respaldo_listas_generado',
      detalle: { id_respaldo: rows[0].id_respaldo, origen, archivo }, ahora: t
    });
    emisor.emitir({
      tipo: 'respaldo_listas_generado', id_establecimiento: idEst, usuario,
      datos_evento: { id_respaldo: rows[0].id_respaldo, origen, total_canciones: contenido.canciones_mas_populares.length }
    });
    return { id_respaldo: rows[0].id_respaldo, generado_en: iso(t), origen, archivo, total_canciones: contenido.canciones_mas_populares.length };
  }

  async function listarRespaldos(idEst, limite = 15) {
    const { rows } = await pool.query(
      `SELECT id_respaldo, generado_en, origen, archivo, total_canciones FROM e5_respaldo_lista
       WHERE id_establecimiento = $1 ORDER BY generado_en DESC LIMIT $2`,
      [idEst, limite],
    );
    return { respaldos: rows.map((r) => ({ ...r, generado_en: iso(r.generado_en) })), intervalo_horas: Math.round(intervaloRespaldoMs / 3_600_000) };
  }

  async function obtenerRespaldo(idEst, idRespaldo) {
    const { rows } = await pool.query(
      'SELECT id_respaldo, generado_en, origen, contenido FROM e5_respaldo_lista WHERE id_respaldo = $1 AND id_establecimiento = $2',
      [idRespaldo, idEst],
    );
    if (!rows[0]) throw new ErrorApi(404, 'respaldo_inexistente', 'El respaldo no existe.');
    return { id_respaldo: rows[0].id_respaldo, generado_en: iso(rows[0].generado_en), origen: rows[0].origen, ...rows[0].contenido };
  }

  let ultimaRevision = 0;
  /** Genera un respaldo automático por establecimiento activo cuando el último tiene más de `intervaloRespaldoMs`. */
  async function cicloRespaldo() {
    const t = ahora();
    if (t - ultimaRevision < 60_000) return [];
    ultimaRevision = t;
    const { rows } = await pool.query(
      `SELECT e.id_establecimiento,
              (SELECT MAX(r.generado_en) FROM e5_respaldo_lista r WHERE r.id_establecimiento = e.id_establecimiento) AS ultimo
       FROM establecimiento e WHERE e.estado = 'activo'`,
    );
    const hechos = [];
    for (const e of rows) {
      if (e.ultimo === null || t - e.ultimo >= intervaloRespaldoMs) hechos.push(await generarRespaldo(e.id_establecimiento, 'automatico'));
    }
    return hechos;
  }

  // ------------------------------------------------------------ 4) sistema de sonido

  async function leerSonido(idEst) {
    const t = ahora();
    await pool.query(
      `INSERT INTO e5_sonido (id_establecimiento, actualizado_en) VALUES ($1, $2) ON CONFLICT (id_establecimiento) DO NOTHING`,
      [idEst, t],
    );
    const { rows } = await pool.query('SELECT * FROM e5_sonido WHERE id_establecimiento = $1', [idEst]);
    const s = rows[0];
    return {
      volumen: s.volumen,
      silenciado: s.silenciado,
      salida: s.salida,
      salida_conectada: s.ultimo_latido !== null && t - s.ultimo_latido < LATIDO_VIGENTE_MS,
      ultimo_latido: iso(s.ultimo_latido),
      actualizado_en: iso(s.actualizado_en),
    };
  }

  async function fijarSonido(idEst, body, usuario) {
    const b = body && typeof body === 'object' ? body : {};
    const cambios = {};
    if (b.volumen !== undefined) cambios.volumen = entero(b.volumen, 'volumen', { min: 0, max: 100 });
    if (b.silenciado !== undefined) cambios.silenciado = booleano(b.silenciado, 'silenciado');
    if (b.salida !== undefined) {
      if (!SALIDAS.has(b.salida)) throw new ErrorApi(400, 'dato_invalido', 'salida debe ser "panel", "equipo_local" o "pantalla_publica".');
      cambios.salida = b.salida;
    }
    const claves = Object.keys(cambios);
    if (claves.length === 0) throw new ErrorApi(400, 'dato_invalido', 'Indica volumen, silenciado o salida.');
    const t = ahora();
    await leerSonido(idEst);
    await pool.query(
      `UPDATE e5_sonido SET ${claves.map((k, i) => `${k} = $${i + 3}`).join(', ')}, actualizado_en = $2 WHERE id_establecimiento = $1`,
      [idEst, t, ...claves.map((k) => cambios[k])],
    );
    if (cambios.salida && cambios.salida !== 'pantalla_publica') {
      await repo5.invalidarControlDisplaysDeEstablecimiento(pool, idEst);
    }
    await repo5.registrar(pool, { idEst, idUsuario: usuario.id_usuario, accion: 'sonido_actualizado', detalle: cambios, ahora: t });
    emisor.emitir({ tipo: 'sonido_actualizado', id_establecimiento: idEst, usuario, datos_evento: cambios });
    const actualizado = await leerSonido(idEst);
    if (flujo && typeof flujo.notificarEvento === 'function') {
      const activas = await repo5.sesionesActivasDeEstablecimiento(pool, idEst);
      const payload = { volumen: actualizado.volumen, silenciado: actualizado.silenciado, salida: actualizado.salida };
      for (const s of activas) flujo.notificarEvento(s.id_sesion, 'sonido', payload);
    }
    return actualizado;
  }

  /** El equipo conectado al sistema de sonido avisa que sigue activo (página /sonido). */
  async function registrarLatido(idEst) {
    await leerSonido(idEst);
    await pool.query('UPDATE e5_sonido SET ultimo_latido = $2 WHERE id_establecimiento = $1', [idEst, ahora()]);
    return leerSonido(idEst);
  }

  return {
    cambiarVoto,
    explorarCatalogo, listarGeneros, etiquetarGenero, completarGeneros,
    construirRespaldo, generarRespaldo, listarRespaldos, obtenerRespaldo, cicloRespaldo,
    leerSonido, fijarSonido, registrarLatido,
  };
}

module.exports = { crearBonus, inferirGenero, parsearFiltros, normalizar, LATIDO_VIGENTE_MS };
