'use strict';
/**
 * Simulación de reproducciones del E4 (propuesta, sección 11). Temporal: NO es la reproducción real
 * de un DJ. Solo existe con SIMULACION_HABILITADA=true.
 *  - Nivel 2: modo automático por sesión, con tiempo acelerado y probabilidad de fallo.
 *  - Nivel 3: dispositivos activos virtuales por establecimiento (para probar los rangos).
 * (El nivel 1 son los endpoints R1/R2 reales; ver scripts/simular.js.)
 */
const { ErrorApi } = require('./comun-e4');

const DURACION_POR_DEFECTO_S = 180; // solo si una canción no tuviera duración (el catálogo las rechaza)

/** Valida el cuerpo del modo automático. Lanza 400 cuerpo_invalido. */
function validarCuerpoAuto(body) {
  const b = body && typeof body === 'object' ? body : {};
  const invalido = () => new ErrorApi(400, 'cuerpo_invalido',
    'Se espera { activo: boolean, factor_tiempo > 0, probabilidad_fallo entre 0 y 1 }.');
  if (typeof b.activo !== 'boolean') throw invalido();
  if (!b.activo) return { activo: false };
  const factor = b.factor_tiempo === undefined ? 1 : b.factor_tiempo;
  const prob = b.probabilidad_fallo === undefined ? 0 : b.probabilidad_fallo;
  if (typeof factor !== 'number' || !(factor > 0) || !Number.isFinite(factor)) throw invalido();
  if (typeof prob !== 'number' || prob < 0 || prob > 1) throw invalido();
  return { activo: true, factor_tiempo: factor, probabilidad_fallo: prob };
}

function validarCantidadVirtuales(body) {
  const cantidad = body && body.cantidad;
  if (!Number.isInteger(cantidad) || cantidad < 0 || cantidad > 10_000) {
    throw new ErrorApi(400, 'cuerpo_invalido', 'Se espera { cantidad: entero entre 0 y 10000 }.');
  }
  return cantidad;
}

/**
 * @param {{reproduccion:object, cola:object, conectividad:object,
 *          programar?:Function, cancelar?:Function, aleatorio?:()=>number}} deps
 */
function crearSimulacion({
  reproduccion, cola, conectividad,
  programar = (fn, ms) => setTimeout(fn, ms),
  cancelar = (h) => clearTimeout(h),
  aleatorio = Math.random,
}) {
  const autos = new Map(); // idSesion -> { factor, prob, temporizador, idReproduccion }

  const colas = new Map(); // idSesion -> Promise: las operaciones de una sesión se ejecutan de una en una

  const registrarError = (err) => {
    if (!(err instanceof ErrorApi)) console.error('[simulacion]', err.message);
  };

  /**
   * Serializa por sesión. Sin esto, un `avanzar` disparado por un aviso de cambio podía leer la
   * reproducción ANTERIOR mientras `terminar` la estaba cerrando y programar su fin con datos viejos.
   */
  function enOrden(idSesion, fn) {
    const resultado = (colas.get(idSesion) || Promise.resolve()).then(fn);
    const cola = resultado.catch(() => {});
    colas.set(idSesion, cola);
    cola.then(() => { if (colas.get(idSesion) === cola) colas.delete(idSesion); });
    return resultado;
  }

  /** Si el modo automático está activo: inicia la primera de la cola o programa el fin de la actual. */
  async function avanzar(idSesion) {
    const auto = autos.get(idSesion);
    if (!auto || auto.temporizador) return;
    let actual = await reproduccion.enCurso(idSesion);
    if (!actual) {
      try {
        await reproduccion.iniciar(idSesion, 'simulacion');
      } catch (err) {
        if (err instanceof ErrorApi && err.codigo === 'cola_vacia') return; // espera una solicitud
        if (!(err instanceof ErrorApi && err.codigo === 'ya_hay_reproduccion')) throw err;
      }
      actual = await reproduccion.enCurso(idSesion);
      if (!actual) return;
    }
    // Otra llamada concurrente ya programó el fin, o el modo se desactivó mientras se esperaba.
    if (autos.get(idSesion) !== auto || auto.temporizador) return;
    const duracion = actual.duracion_segundos ?? DURACION_POR_DEFECTO_S;
    auto.idReproduccion = actual.id_reproduccion;
    auto.temporizador = programar(
      () => enOrden(idSesion, () => terminar(idSesion, actual)).catch(registrarError),
      (duracion * 1000) / auto.factor,
    );
  }

  async function terminar(idSesion, actual) {
    const auto = autos.get(idSesion);
    if (!auto || !auto.temporizador) return;
    auto.temporizador = null;
    const vigente = await reproduccion.enCurso(idSesion);
    // Si alguien avanzó la cola a mano mientras tanto, no se cierra una canción distinta.
    if (vigente && vigente.id_reproduccion === auto.idReproduccion) {
      const falla = aleatorio() < auto.prob;
      await reproduccion.siguiente(idSesion, falla
        ? { resultado: 'fallida', segundos_reproducidos: 0, codigo_error: 'fallo_simulado' }
        : { resultado: 'exitosa', segundos_reproducidos: actual.duracion_segundos ?? DURACION_POR_DEFECTO_S }, 'simulacion');
    }
    await avanzar(idSesion);
  }

  /** POST /api/simulacion/sesiones/:idSesion/auto */
  async function configurarAuto(idSesion, body) {
    const cfg = validarCuerpoAuto(body);
    await cola.obtenerSesionActiva(idSesion); // 404 / 410
    await enOrden(idSesion, async () => {
      const previo = autos.get(idSesion);
      if (previo && previo.temporizador) cancelar(previo.temporizador);
      autos.delete(idSesion);
      if (cfg.activo) {
        autos.set(idSesion, { factor: cfg.factor_tiempo, prob: cfg.probabilidad_fallo, temporizador: null, idReproduccion: null });
        await avanzar(idSesion);
      }
    });
    return { sesion_id: idSesion, ...cfg };
  }

  /** Aviso de cambio en una sesión (p. ej. llegó una solicitud con la cola vacía). */
  function alCambiar(idSesion) {
    if (autos.has(idSesion)) enOrden(idSesion, () => avanzar(idSesion)).catch(registrarError);
  }

  /** Promesa que se cumple cuando la sesión no tiene operaciones de simulación pendientes. */
  const inactiva = (idSesion) => colas.get(idSesion) || Promise.resolve();

  /** POST /api/simulacion/establecimientos/:idEstablecimiento/dispositivos-activos-virtuales */
  function fijarVirtuales(idSesion, body, { idEstablecimiento = idSesion, soloValidar = false } = {}) {
    const cantidad = validarCantidadVirtuales(body);
    if (!soloValidar) conectividad.fijarVirtuales(idSesion, cantidad);
    return {
      id_establecimiento: idEstablecimiento,
      cantidad,
      dispositivos_activos: soloValidar ? cantidad : conectividad.contarActivos(idSesion),
    };
  }

  /** Cancela los temporizadores y espera a que terminen las operaciones en curso (apagado). */
  async function detener() {
    for (const auto of autos.values()) if (auto.temporizador) cancelar(auto.temporizador);
    autos.clear();
    await Promise.all([...colas.values()]);
  }


  return { configurarAuto, alCambiar, fijarVirtuales, detener, inactiva, autos };
}

module.exports = { crearSimulacion, validarCuerpoAuto };
