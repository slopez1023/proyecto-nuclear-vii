'use strict';
/**
 * Piezas comunes del E4: error de API, identificadores opacos, fechas ISO, reglas puras de votación
 * (sección 5.2/5.3) y tiempo estimado (sección 10). Sin SQL ni red.
 */

/** Error de negocio con código estable. Se responde como { error: { codigo, mensaje, detalle? } }. */
class ErrorApi extends Error {
  constructor(status, codigo, mensaje, detalle) {
    super(mensaje);
    this.status = status;
    this.codigo = codigo;
    this.detalle = detalle;
  }
}

const UUID_REGEX = require('./eventos').UUID_REGEX;
const VIDEO_ID_REGEX = /^[A-Za-z0-9_-]{11}$/;

// ---------------------------------------------------------------- identificadores y fechas

/** Identificadores opacos con prefijo ("SOL-42"). Android no debe interpretarlos. */
const idTexto = (prefijo, n) => (n === null || n === undefined ? null : `${prefijo}-${n}`);

/** "SOL-42" → 42; cualquier otra cosa → null. */
function idNumero(prefijo, texto) {
  const m = new RegExp(`^${prefijo}-(\\d{1,15})$`).exec(texto || '');
  return m ? Number(m[1]) : null;
}

/** epoch ms → ISO-8601 UTC con milisegundos (mismo formato que los eventos del E3). */
const iso = (ms) => (ms === null || ms === undefined ? null : new Date(ms).toISOString());

// ---------------------------------------------------------------- reglas de votación

/** Intervalo vigente según los dispositivos activos (1–3: 1, 4–10: 2, 11–30: 4, 31–60: 6, >60: 8). */
function intervaloPorActivos(activos) {
  if (activos <= 3) return 1;
  if (activos <= 10) return 2;
  if (activos <= 30) return 4;
  if (activos <= 60) return 6;
  return 8;
}

/**
 * Estado de votación del dispositivo (`mi_votacion`) a partir del contador de la sección 5.3.
 * @param {{ultimoVoto:number|null, contadas:number}} contador
 */
function calcularMiVotacion({ ultimoVoto, contadas }, intervalo, { ocioso = false } = {}) {
  // H1 (decisión de cierre del E4): si no suena nada y no hay nada en espera, el intervalo no tiene a quién proteger
  // (nadie puede acaparar una cola vacía) y bloquear a todos dejaría el sistema detenido cuando participan pocos
  // dispositivos. En ese estado de inactividad se puede pedir. Los votos siguen siendo definitivos y, tras pedir,
  // el contador vuelve a cero y el intervalo se aplica con normalidad.
  if (ocioso) {
    return {
      puede_votar: true,
      intervalo_canciones: intervalo,
      reproducciones_contadas: ultimoVoto === null || ultimoVoto === undefined ? 0 : contadas,
      canciones_restantes: 0,
    };
  }
  // H4: un dispositivo que nunca votó en el establecimiento tiene voto disponible.
  if (ultimoVoto === null || ultimoVoto === undefined) {
    return { puede_votar: true, intervalo_canciones: intervalo, reproducciones_contadas: 0, canciones_restantes: 0 };
  }
  // H1: con la regla tal como está escrita, si los dispositivos que participan son <= intervalo la cola
  // podía quedar vacía sin que nadie recuperara el voto: se resuelve con la regla de inactividad de arriba.
  const restantes = Math.max(0, intervalo - contadas);
  return {
    puede_votar: restantes === 0,
    intervalo_canciones: intervalo,
    reproducciones_contadas: contadas,
    canciones_restantes: restantes,
  };
}

// ---------------------------------------------------------------- tiempo estimado (sección 10)

/**
 * Segundos que le faltan a la canción actual. 0 si no suena nada; null si no tiene duración.
 * @param {{duracion_segundos:number|null, inicio_en:number}|null} actual
 */
function restanteActual(actual, ahoraMs) {
  if (!actual) return 0;
  if (actual.duracion_segundos === null || actual.duracion_segundos === undefined) return null;
  return Math.max(0, actual.duracion_segundos - Math.floor((ahoraMs - actual.inicio_en) / 1000));
}

/**
 * Espera estimada de cada posición de la cola: restante de la actual + duraciones de las anteriores.
 * Si falta cualquier duración del cálculo, esa posición (y las siguientes) quedan en null.
 */
function esperasEstimadas(restante, cola) {
  const esperas = [];
  let acumulado = restante;
  for (const item of cola) {
    esperas.push(acumulado);
    if (acumulado === null || item.duracion_segundos === null || item.duracion_segundos === undefined) acumulado = null;
    else acumulado += item.duracion_segundos;
  }
  return esperas;
}

module.exports = {
  ErrorApi, UUID_REGEX, VIDEO_ID_REGEX,
  idTexto, idNumero, iso,
  intervaloPorActivos, calcularMiVotacion,
  restanteActual, esperasEstimadas,
};
