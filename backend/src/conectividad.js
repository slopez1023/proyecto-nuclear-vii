'use strict';
/**
 * Dispositivos activos = conectividad actual (propuesta E4, sección 7).
 * Un dispositivo está activo en un establecimiento si tiene al menos una conexión SSE abierta con
 * X-Dispositivo-Id en alguna sesión de ese establecimiento, o se desconectó hace menos de `graciaMs`.
 * Registro en memoria: hay un solo proceso, así que es la fuente fiable.
 * Los dispositivos virtuales (simulación, nivel 3) se suman al conteo.
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
  const porEstablecimiento = new Map(); // idEst -> Map(uuid -> { abiertas, desconectadoEn })
  const virtuales = new Map(); // idEst -> número
  const ultimoIntervalo = new Map(); // idEst -> intervalo comunicado por última vez
  const oyentes = [];

  const dispositivos = (idEst) => {
    if (!porEstablecimiento.has(idEst)) porEstablecimiento.set(idEst, new Map());
    return porEstablecimiento.get(idEst);
  };

  function contarActivos(idEst) {
    const t = ahora();
    let n = 0;
    const mapa = porEstablecimiento.get(idEst);
    if (mapa) {
      for (const [uuid, d] of mapa) {
        if (d.abiertas > 0 || t - d.desconectadoEn < graciaMs) n++;
        else mapa.delete(uuid); // gracia vencida: se olvida
      }
    }
    return n + (virtuales.get(idEst) || 0);
  }

  /** Avisa a los oyentes si el intervalo del establecimiento cambió de rango. */
  function revisar(idEst) {
    const actual = intervaloPorActivos(contarActivos(idEst));
    const previo = ultimoIntervalo.has(idEst) ? ultimoIntervalo.get(idEst) : intervaloPorActivos(0);
    ultimoIntervalo.set(idEst, actual);
    if (actual !== previo) for (const fn of oyentes) fn(idEst);
  }

  function conectar(idEst, uuid) {
    const d = dispositivos(idEst).get(uuid) || { abiertas: 0, desconectadoEn: null };
    d.abiertas++;
    d.desconectadoEn = null;
    dispositivos(idEst).set(uuid, d);
    revisar(idEst);
  }

  function desconectar(idEst, uuid) {
    const d = dispositivos(idEst).get(uuid);
    if (!d || d.abiertas === 0) return;
    d.abiertas--;
    if (d.abiertas === 0) {
      d.desconectadoEn = ahora();
      // Al vencer la gracia el dispositivo deja de contar: puede cambiar el rango.
      programar(() => revisar(idEst), graciaMs + 1);
    }
    revisar(idEst);
  }

  function fijarVirtuales(idEst, cantidad) {
    virtuales.set(idEst, cantidad);
    revisar(idEst);
  }

  return {
    contarActivos,
    conectar,
    desconectar,
    fijarVirtuales,
    revisar,
    /** Registra una función que recibe idEst cuando el rango (intervalo) del establecimiento cambia. */
    alCambiarRango: (fn) => oyentes.push(fn),
  };
}

module.exports = { crearConectividad };
