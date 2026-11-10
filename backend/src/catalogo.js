'use strict';
/**
 * Validación del catálogo permitido (propuesta E4, sección 8).
 * Android solo envía youtube_video_id; el backend usa SUS datos de la canción (decisión C16).
 * Esta validación se hace SIEMPRE antes de abrir una transacción: puede llamar a YouTube.
 */
const repo = require('./db/repositorio');
const { parseDuracionIso, elegirMiniatura, YoutubeError } = require('./youtube');
const { ErrorApi } = require('./comun-e4');

const VIGENCIA_MS = 24 * 60 * 60 * 1000;

/**
 * Evalúa un item crudo de videos.list (part=snippet,contentDetails,status) con las comprobaciones de la
 * sección 8, en ese orden. Devuelve la fila de `cancion` lista para guardar (sin consultado_en).
 */
function evaluarVideo(v) {
  const snippet = v.snippet || {};
  const status = v.status || {};
  const duracion = parseDuracionIso(v.contentDetails && v.contentDetails.duration);
  let motivo = null;
  if (snippet.categoryId !== '10') motivo = 'no_musica';
  else if (status.embeddable === false) motivo = 'no_embebible';
  else if (status.privacyStatus !== 'public') motivo = 'no_publico';
  else if (snippet.liveBroadcastContent !== 'none') motivo = 'en_vivo';
  else if (duracion === null) motivo = 'sin_duracion';
  return {
    youtube_video_id: v.id,
    titulo: snippet.title || '',
    artista_canal: snippet.channelTitle || '',
    duracion_segundos: duracion,
    url_miniatura: elegirMiniatura(snippet.thumbnails),
    disponibilidad: motivo ? 'no_disponible' : 'disponible',
    motivo_no_permitida: motivo,
  };
}

/**
 * @param {{pool:object, youtube:{obtenerVideo:Function}, ahora:()=>number}} deps
 */
function crearCatalogo({ pool, youtube, ahora }) {
  function veredicto(fila) {
    if (fila.disponibilidad === 'disponible') return fila;
    throw new ErrorApi(422, 'cancion_no_permitida', 'Esta canción no está permitida en el catálogo.',
      { motivo: fila.motivo_no_permitida });
  }

  /** Devuelve la fila de `cancion` si está permitida; si no, lanza ErrorApi (404/422) o el error de YouTube. */
  async function validar(youtubeVideoId) {
    const guardada = await repo.obtenerCancion(pool, youtubeVideoId);
    if (guardada && ahora() - guardada.consultado_en < VIGENCIA_MS) return veredicto(guardada);

    let item;
    try {
      item = await youtube.obtenerVideo(youtubeVideoId);
    } catch (err) {
      // YouTube no respondió: si la canción ya estaba guardada, se acepta con los datos guardados.
      if (guardada && err instanceof YoutubeError) return veredicto(guardada);
      throw err;
    }
    if (!item) throw new ErrorApi(404, 'cancion_inexistente', 'YouTube no tiene un video con ese identificador.');
    const fila = await repo.guardarCancion(pool, { ...evaluarVideo(item), consultado_en: ahora() });
    return veredicto(fila);
  }

  /** Guarda los videos que devolvió una búsqueda (para no gastar cuota al solicitarlos después). */
  async function guardarVideos(items) {
    for (const item of items) {
      if (item && item.id && item.snippet) await repo.guardarCancion(pool, { ...evaluarVideo(item), consultado_en: ahora() });
    }
  }

  return { validar, guardarVideos };
}

module.exports = { crearCatalogo, evaluarVideo, VIGENCIA_MS };
