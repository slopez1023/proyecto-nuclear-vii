'use strict';
/**
 * Planificador del E5:
 *  - Revisa los establecimientos con `modo_automatico = true`: abre o cierra su sesión principal y QR según el
 *    horario y excepciones vigentes (respetando la pausa manual para el QR).
 *  - Despierta sesiones que estaban `en_espera` cuando llegan nuevas solicitudes de clientes o se agregan canciones
 *    a la lista predeterminada.
 */
const repo5 = require('./repositorio-e5');
const { evaluarHorario } = require('./horarios');

const MAX_REINTENTOS = 2;
const CODIGOS_TRANSITORIOS = new Set(['40001', '40P01', '57P01', '57P02', '57P03', 'ECONNRESET']);

function esErrorTransitorio(err) {
  return Boolean(err && (CODIGOS_TRANSITORIOS.has(err.code) || /deadlock|serialize|terminating connection/i.test(err.message || '')));
}

function crearPlanificador({ pool, sesionesAdmin, reproductor, bonus = null, ahora, intervaloMs = 15_000 }) {
  let ejecutando = false;
  let timer = null;

  async function procesarEstablecimiento(cfg, t) {
    const horarios = await repo5.leerHorarios(pool, cfg.id_establecimiento);
    const excepciones = await repo5.leerExcepciones(pool, cfg.id_establecimiento);
    const ev = evaluarHorario({ horarios, excepciones }, t, cfg.zona_horaria || 'America/Bogota');

    // Siempre revisar primero si hay jornadas programadas activas que deban cerrarse
    await sesionesAdmin.procesarCierreProgramado(cfg.id_establecimiento, ev);

    if (ev.abierto) {
      await sesionesAdmin.procesarAperturaProgramada(cfg.id_establecimiento, ev);
    }
  }

  async function ejecutarCiclo() {
    if (ejecutando) return;
    ejecutando = true;
    try {
      const t = ahora();
      const configs = await repo5.configsAutomaticas(pool);
      for (const cfg of configs) {
        let intento = 0;
        while (true) {
          try {
            await procesarEstablecimiento(cfg, t);
            break;
          } catch (err) {
            if (esErrorTransitorio(err) && intento < MAX_REINTENTOS) {
              intento++;
              continue;
            }
            console.error(`[e5/planificador] establecimiento ${cfg.id_establecimiento}:`, err.message);
            break;
          }
        }
      }
      await reproductor.verificarEspera();
      if (bonus && typeof bonus.cicloRespaldo === 'function') await bonus.cicloRespaldo();
    } catch (err) {
      console.error('[e5/planificador]', err.message);
    } finally {
      ejecutando = false;
    }
  }

  function iniciar() {
    if (timer) return;
    timer = setInterval(ejecutarCiclo, intervaloMs);
    if (timer.unref) timer.unref();
    ejecutarCiclo();
  }

  function detener() {
    if (timer) { clearInterval(timer); timer = null; }
  }

  return { ejecutarCiclo, iniciar, detener };
}

module.exports = { crearPlanificador };
