'use strict';
/**
 * Piezas comunes del Entregable 5. Reutiliza ErrorApi e idTexto del E4 (sin modificarlos) para que los errores del
 * panel tengan el MISMO formato { error: { codigo, mensaje, detalle? } } que el resto del backend.
 */
const { ErrorApi, idTexto, idNumero, iso, VIDEO_ID_REGEX } = require('../comun-e4');
const { YoutubeError } = require('../youtube');

const HORA_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;
const FECHA_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/** "HH:MM" → minutos del día; lanza 400 si el formato no es válido. */
function aMinutos(texto, campo = 'hora') {
  const m = typeof texto === 'string' ? HORA_REGEX.exec(texto) : null;
  if (!m) throw new ErrorApi(400, 'hora_invalida', `${campo} debe tener el formato HH:MM (24 horas).`);
  return Number(m[1]) * 60 + Number(m[2]);
}

/** minutos del día → "HH:MM" */
const aHora = (min) => (min === null || min === undefined ? null
  : `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`);

function fechaValida(texto) {
  if (typeof texto !== 'string' || !FECHA_REGEX.test(texto)) return false;
  const [y, m, d] = texto.split('-').map(Number);
  const f = new Date(Date.UTC(y, m - 1, d));
  return f.getUTCFullYear() === y && f.getUTCMonth() === m - 1 && f.getUTCDate() === d;
}

/** Texto obligatorio y acotado. */
function texto(valor, campo, { max = 200, obligatorio = true } = {}) {
  if (valor === undefined || valor === null || (typeof valor === 'string' && valor.trim() === '')) {
    if (!obligatorio) return null;
    throw new ErrorApi(400, 'dato_invalido', `${campo} es obligatorio.`);
  }
  if (typeof valor !== 'string') throw new ErrorApi(400, 'dato_invalido', `${campo} debe ser texto.`);
  const limpio = valor.trim();
  if (limpio.length > max) throw new ErrorApi(400, 'dato_invalido', `${campo} admite máximo ${max} caracteres.`);
  return limpio;
}

function booleano(valor, campo) {
  if (typeof valor !== 'boolean') throw new ErrorApi(400, 'dato_invalido', `${campo} debe ser true o false.`);
  return valor;
}

function entero(valor, campo, { min = -Infinity, max = Infinity } = {}) {
  if (!Number.isInteger(valor) || valor < min || valor > max) {
    throw new ErrorApi(400, 'dato_invalido', `${campo} debe ser un número entero entre ${min} y ${max}.`);
  }
  return valor;
}

function videoId(valor) {
  if (typeof valor !== 'string' || !VIDEO_ID_REGEX.test(valor)) {
    throw new ErrorApi(400, 'cancion_invalida', 'youtube_video_id falta o no tiene un formato válido.');
  }
  return valor;
}

function enviarError(res, err) {
  if (err instanceof ErrorApi) {
    const error = { codigo: err.codigo, mensaje: err.message };
    if (err.detalle !== undefined) error.detalle = err.detalle;
    return res.status(err.status).json({ error });
  }
  if (err instanceof YoutubeError) return res.status(err.status).json({ error: { codigo: err.codigo, mensaje: err.message } });
  console.error('[e5] error inesperado:', err);
  return res.status(500).json({ error: { codigo: 'error_interno', mensaje: 'Error inesperado.' } });
}

/** Envuelve un manejador async: cualquier excepción se responde con el formato de error común. */
const manejar = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch((err) => enviarError(res, err));

const cancionJson = (f) => (f ? {
  youtube_video_id: f.youtube_video_id,
  titulo: f.titulo,
  artista_canal: f.artista_canal,
  duracion_segundos: f.duracion_segundos,
  url_miniatura: f.url_miniatura,
} : null);

module.exports = {
  ErrorApi, idTexto, idNumero, iso,
  HORA_REGEX, aMinutos, aHora, fechaValida,
  texto, booleano, entero, videoId,
  enviarError, manejar, cancionJson,
};
