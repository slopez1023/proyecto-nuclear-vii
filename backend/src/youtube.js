'use strict';
/**
 * Cliente de YouTube Data API v3 (B16, B03, B05). La API key vive solo en el backend (YOUTUBE_API_KEY).
 * `fetchImpl` es inyectable para pruebas (los tests usan respuestas simuladas y se etiquetan como tales).
 */

const BASE = 'https://www.googleapis.com/youtube/v3';

class YoutubeError extends Error {
  constructor(codigo, mensaje, status = 502) {
    super(mensaje);
    this.codigo = codigo;
    this.status = status;
  }
}

/** Convierte duración ISO-8601 de YouTube (PT1H2M3S) a segundos. Devuelve null si no es válida. */
function parseDuracionIso(iso) {
  if (typeof iso !== 'string') return null;
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(iso);
  if (!m || iso === 'P' || iso === 'PT') return null;
  const [, d, h, min, s] = m.map((x) => (x === undefined ? 0 : Number(x)));
  return d * 86400 + h * 3600 + min * 60 + s;
}

function elegirMiniatura(thumbs = {}) {
  return (thumbs.medium || thumbs.high || thumbs.default || {}).url || null;
}

/** Combina resultados de search.list y videos.list en objetos con los campos de la entidad Canción. */
function mapearCanciones(searchItems, videoItems) {
  const detalle = new Map(videoItems.map((v) => [v.id, v]));
  const canciones = [];
  for (const item of searchItems) {
    const id = item.id && item.id.videoId;
    const v = detalle.get(id);
    if (!id || !v || !v.snippet) continue; // sin detalle: se descarta (información incompleta)
    const duracion = parseDuracionIso(v.contentDetails && v.contentDetails.duration);
    const embebible = !(v.status && v.status.embeddable === false);
    canciones.push({
      youtube_video_id: id,
      titulo: v.snippet.title,
      artista_canal: v.snippet.channelTitle,
      duracion_segundos: duracion,
      url_miniatura: elegirMiniatura(v.snippet.thumbnails),
      disponibilidad: embebible && duracion !== null ? 'disponible' : 'no_disponible',
    });
  }
  return canciones;
}

function crearClienteYoutube({ apiKey, fetchImpl = globalThis.fetch, ttlMs = 5 * 60 * 1000, ahora = Date.now } = {}) {
  const cache = new Map();

  async function getJson(endpoint, params) {
    const url = new URL(`${BASE}/${endpoint}`);
    for (const [k, val] of Object.entries(params)) url.searchParams.set(k, val);
    url.searchParams.set('key', apiKey);
    let resp;
    try {
      resp = await fetchImpl(url);
    } catch {
      throw new YoutubeError('youtube_no_disponible', 'No se pudo contactar a YouTube.');
    }
    if (!resp.ok) {
      const cuerpo = await resp.json().catch(() => ({}));
      const razon = cuerpo.error && cuerpo.error.errors && cuerpo.error.errors[0] && cuerpo.error.errors[0].reason;
      if (razon === 'quotaExceeded') throw new YoutubeError('cuota_excedida', 'Se agotó la cuota diaria de YouTube.', 503);
      throw new YoutubeError('youtube_error', `YouTube respondió ${resp.status}.`);
    }
    return resp.json();
  }

  async function buscar(q, maxResults = 10) {
    if (!apiKey) throw new YoutubeError('sin_api_key', 'YOUTUBE_API_KEY no está configurada en backend/.env.', 503);
    const clave = `${maxResults}:${q.toLowerCase()}`;
    const hit = cache.get(clave);
    if (hit && ahora() - hit.t < ttlMs) return hit.v;

    const busqueda = await getJson('search', {
      part: 'snippet', type: 'video', videoCategoryId: '10', videoEmbeddable: 'true',
      maxResults: String(maxResults), q,
    });
    const ids = (busqueda.items || []).map((i) => i.id && i.id.videoId).filter(Boolean);
    let canciones = [];
    if (ids.length > 0) {
      const detalles = await getJson('videos', { part: 'snippet,contentDetails,status', id: ids.join(',') });
      canciones = mapearCanciones(busqueda.items, detalles.items || []);
    }
    cache.set(clave, { t: ahora(), v: canciones });
    return canciones;
  }

  return { buscar };
}

module.exports = { YoutubeError, parseDuracionIso, mapearCanciones, crearClienteYoutube };
