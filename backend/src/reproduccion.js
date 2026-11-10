'use strict';
/**
 * Estado lógico de la reproducción (R1 iniciar, R2 siguiente). Los llama el reproductor autorizado
 * (E5+) y, durante el E4, la simulación. Android NO los llama.
 * Misma estrategia de concurrencia que cola.js: transacción con bloqueo establecimiento → sesión, de modo
 * que dos "siguiente" simultáneos se ejecutan uno detrás de otro y nunca hay dos reproducciones en curso
 * (además, el índice único parcial reproduccion_en_curso_unica lo garantiza en la base de datos).
 */
const repo = require('./db/repositorio');
const { registrarEventoServidor } = require('./eventos');
const { ErrorApi, idTexto, restanteActual } = require('./comun-e4');

const RESULTADOS = new Set(['exitosa', 'fallida']); // ampliable (p. ej. 'saltada' en el E5)

/** Valida el cuerpo de R2. Devuelve { resultado, segundos, codigoError } o lanza 400 resultado_invalido. */
function validarCuerpoSiguiente(body) {
  const b = body && typeof body === 'object' ? body : {};
  const invalido = () => new ErrorApi(400, 'resultado_invalido', 'resultado debe ser "exitosa" o "fallida".');
  if (!RESULTADOS.has(b.resultado)) throw invalido();
  const segundos = b.segundos_reproducidos;
  if (segundos !== undefined && segundos !== null && !(Number.isInteger(segundos) && segundos >= 0)) throw invalido();
  if (b.codigo_error !== undefined && b.codigo_error !== null && (typeof b.codigo_error !== 'string' || b.codigo_error.length > 100)) {
    throw invalido();
  }
  return {
    resultado: b.resultado,
    segundos: segundos === undefined ? null : segundos,
    codigoError: b.resultado === 'fallida' && typeof b.codigo_error === 'string' ? b.codigo_error : null,
  };
}

/**
 * @param {{pool:object, cola:object, ahora:()=>number, almacenEventos:object, alCambiar:(idSesion:string)=>void}} deps
 */
function crearReproduccion({ pool, cola, ahora, almacenEventos, alCambiar: avisarCambio }) {
  const alCambiar = (idSesion) => {
    try { avisarCambio(idSesion); } catch (err) { console.error('[reproduccion] aviso de cambio falló:', err.message); }
  };
  const evento = (datos) => registrarEventoServidor(almacenEventos, datos, () => new Date(ahora()));

  /** Pasa la primera solicitud de la cola a 'en_reproduccion'. Devuelve la reproducción creada o null. */
  async function iniciarPrimera(client, sesion, origen) {
    const [primera] = await repo.leerColaPendiente(client, sesion.id_sesion);
    if (!primera) return null;
    await repo.cambiarEstadoSolicitud(client, primera.id_solicitud, 'en_reproduccion');
    await repo.insertarReproduccion(client, {
      idSesion: sesion.id_sesion, idEstablecimiento: sesion.id_establecimiento, idSolicitud: primera.id_solicitud,
      idCancion: primera.id_cancion, inicio: ahora(), origen,
    });
    return repo.reproduccionEnCurso(client, sesion.id_sesion);
  }

  const actualJson = (actual) => cola.reproduccionActualJson(actual, restanteActual(actual, ahora()));

  function eventoInicio(idSesion, actual, origen) {
    evento({ tipo: 'reproduccion_iniciada', sesion_id: idSesion,
      datos_evento: { id_reproduccion: idTexto('REP', actual.id_reproduccion), id_solicitud: idTexto('SOL', actual.id_solicitud),
        youtube_video_id: actual.youtube_video_id, total_votos: actual.total_votos, origen } });
  }

  /** Dentro de la transacción: bloqueo establecimiento → sesión y nueva comprobación de estado. */
  async function bloquear(client, previa) {
    return cola.verificarSesion(await repo.bloquearEstablecimientoYSesion(client, previa.id_establecimiento, previa.id_sesion));
  }

  /** R1. `origen`: 'simulacion' o 'reproductor'. */
  async function iniciar(idSesion, origen) {
    const previa = await cola.obtenerSesionActiva(idSesion); // 404 / 410, antes de abrir la transacción
    const actual = await repo.conTransaccion(pool, async (client) => {
      const sesion = await bloquear(client, previa);
      if (await repo.reproduccionEnCurso(client, idSesion)) {
        throw new ErrorApi(409, 'ya_hay_reproduccion', 'Ya hay una canción en reproducción.');
      }
      const nueva = await iniciarPrimera(client, sesion, origen);
      if (!nueva) throw new ErrorApi(409, 'cola_vacia', 'No hay canciones en la cola.');
      await repo.incrementarVersion(client, idSesion);
      return nueva;
    });
    eventoInicio(idSesion, actual, origen);
    alCambiar(idSesion);
    return { reproduccion_actual: actualJson(actual) };
  }

  /** R2: cierra la reproducción en curso con su resultado e inicia automáticamente la siguiente. */
  async function siguiente(idSesion, body, origen) {
    const { resultado, segundos, codigoError } = validarCuerpoSiguiente(body);
    const previa = await cola.obtenerSesionActiva(idSesion);
    const r = await repo.conTransaccion(pool, async (client) => {
      const sesion = await bloquear(client, previa);
      const anterior = await repo.reproduccionEnCurso(client, idSesion, { bloquear: true });
      if (!anterior) throw new ErrorApi(409, 'sin_reproduccion_actual', 'No hay ninguna canción en reproducción.');
      await repo.cerrarReproduccion(client, anterior.id_reproduccion, { fin: ahora(), resultado, segundos, codigoError });
      await repo.cambiarEstadoSolicitud(client, anterior.id_solicitud, resultado === 'exitosa' ? 'reproducida' : 'fallida');
      const nueva = await iniciarPrimera(client, sesion, origen);
      await repo.incrementarVersion(client, idSesion);
      return { anterior, nueva };
    });
    // Después del COMMIT. No hay contadores que actualizar: el intervalo se CALCULA (sección 5.3).
    const a = r.anterior;
    const comun = { id_reproduccion: idTexto('REP', a.id_reproduccion), id_solicitud: idTexto('SOL', a.id_solicitud), segundos_reproducidos: segundos };
    if (resultado === 'exitosa') {
      evento({ tipo: 'reproduccion_finalizada', sesion_id: idSesion, datos_evento: { ...comun, origen } });
    } else {
      evento({ tipo: 'reproduccion_fallida', sesion_id: idSesion, datos_evento: { ...comun, codigo_error: codigoError, origen } });
    }
    if (r.nueva) eventoInicio(idSesion, r.nueva, origen);
    alCambiar(idSesion);
    return {
      anterior: { id_reproduccion: comun.id_reproduccion, id_solicitud: comun.id_solicitud, resultado },
      reproduccion_actual: r.nueva ? actualJson(r.nueva) : null,
    };
  }

  /** Reproducción en curso (fila) o null. Lo usa la simulación automática. */
  const enCurso = (idSesion) => repo.reproduccionEnCurso(pool, idSesion);

  return { iniciar, siguiente, enCurso };
}

module.exports = { crearReproduccion, validarCuerpoSiguiente };
