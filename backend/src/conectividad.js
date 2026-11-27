'use strict';
/**
 * Dispositivos activos por sesión = conectividad actual.
 * Un dispositivo está activo en una sesión si tiene al menos una conexión SSE abierta con
 * X-Dispositivo-Id en esa sesión, o se desconectó hace menos de `graciaMs`.
 * Registro en memoria: hay un solo proceso, así que es la fuente fiable.
 * Los dispositivos virtuales (simulación, nivel 3) se suman al conteo de la sesión.
 */
const { intervaloPorActivos } = require('./comun-e4');

/**
 * @param {{ahora?:()=>number, graciaMs?:number, programar?:(fn:Function, ms:number)=>any}} opciones
 *   `programar` se inyecta en las pruebas para no usar temporizadores reales.
 */
function crearConectividad({
  ahora = Date.now,
  graciaMs = 20_000,
  programar = (fn, ms) => setTimeout(fn, ms).unref(),
} = {}) {
  const porSesion = new Map(); // idSesion -> Map(uuid -> { abiertas, desconectadoEn })
  const virtuales = new Map(); // idSesion -> número
  const ultimoIntervalo = new Map(); // idSesion -> intervalo comunicado por última vez
  const ultimoConteo = new Map(); // idSesion -> conteo neto comunicado por última vez
  const oyentesRango = [];
  const oyentesConteo = [];

  const dispositivos = (idSesion) => {
    if (!porSesion.has(idSesion)) porSesion.set(idSesion, new Map());
    return porSesion.get(idSesion);
  };

  function contarActivos(idSesion) {
    const t = ahora();
    let n = 0;
    const mapa = porSesion.get(idSesion);
    if (mapa) {
      for (const [uuid, d] of mapa) {
        if (d.abiertas > 0 || t - d.desconectadoEn < graciaMs) n++;
        else mapa.delete(uuid); // gracia vencida: se olvida
      }
    }
    return n + (virtuales.get(idSesion) || 0);
  }

  function listarActivos(idSesion) {
    const t = ahora();
    const uuids = [];
    const idsDispositivos = [];
    const mapa = porSesion.get(idSesion);
    if (mapa) {
      for (const [uuid, d] of mapa) {
        if (d.abiertas > 0 || t - d.desconectadoEn < graciaMs) {
          uuids.push(uuid);
          if (d.idDispositivo != null) idsDispositivos.push(d.idDispositivo);
        } else {
          mapa.delete(uuid);
        }
      }
    }
    return { uuids, idsDispositivos, virtuales: virtuales.get(idSesion) || 0 };
  }

  /** Avisa cuando cambia el conteo neto de dispositivos o cuando cambia el rango de votación de la sesión. */
  function revisar(idSesion) {
    const activos = contarActivos(idSesion);
    const previoConteo = ultimoConteo.has(idSesion) ? ultimoConteo.get(idSesion) : 0;
    const actual = intervaloPorActivos(activos);
    const previo = ultimoIntervalo.has(idSesion) ? ultimoIntervalo.get(idSesion) : intervaloPorActivos(0);
    ultimoConteo.set(idSesion, activos);
    ultimoIntervalo.set(idSesion, actual);
    if (activos !== previoConteo) for (const fn of oyentesConteo) fn(idSesion, activos, actual);
    if (actual !== previo) for (const fn of oyentesRango) fn(idSesion);
  }

  function conectar(idSesion, uuid, idDispositivo = null) {
    const d = dispositivos(idSesion).get(uuid) || { abiertas: 0, desconectadoEn: null, idDispositivo: null };
    d.abiertas++;
    d.desconectadoEn = null;
    if (idDispositivo != null) d.idDispositivo = Number(idDispositivo);
    dispositivos(idSesion).set(uuid, d);
    revisar(idSesion);
  }

  function desconectar(idSesion, uuid) {
    const d = dispositivos(idSesion).get(uuid);
    if (!d || d.abiertas === 0) return;
    d.abiertas--;
    if (d.abiertas === 0) {
      d.desconectadoEn = ahora();
      // Al vencer la gracia el dispositivo deja de contar: puede cambiar el conteo y/o el rango.
      programar(() => revisar(idSesion), graciaMs + 1);
    }
    revisar(idSesion);
  }

  function fijarVirtuales(idSesion, cantidad) {
    virtuales.set(idSesion, cantidad);
    revisar(idSesion);
  }

  return {
    contarActivos,
    listarActivos,
    conectar,
    desconectar,
    fijarVirtuales,
    revisar,
    /** Registra una función que recibe idSesion cuando el rango (intervalo) de la sesión cambia. */
    alCambiarRango: (fn) => oyentesRango.push(fn),
    /** Registra una función que recibe (idSesion, activos, intervalo) cuando cambia el conteo neto de la sesión. */
    alCambiarConteo: (fn) => oyentesConteo.push(fn),
  };
}

module.exports = { crearConectividad };
