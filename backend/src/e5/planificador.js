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

function crearPlanificador({ pool, sesionesAdmin, reproductor, ahora, intervaloMs = 15_000 }) {
  let ejecutando = false;
  let timer = null;

  async function ejecutarCiclo() {
    if (ejecutando) return;
    ejecutando = true;
    try {
      const t = ahora();
      const configs = await repo5.configsAutomaticas(pool);
      for (const cfg of configs) {
        const sesion = await repo5.obtenerSesionCompleta(pool, cfg.id_sesion_principal);
        if (!sesion) continue;
        const horarios = await repo5.leerHorarios(pool, cfg.id_establecimiento);
        const excepciones = await repo5.leerExcepciones(pool, cfg.id_establecimiento);
        const ev = evaluarHorario({ horarios, excepciones }, t, cfg.zona_horaria || 'America/Bogota');

        if (ev.abierto) {
          const qrEsperado = cfg.pausa_manual ? 'inactivo' : 'activo';
          if (sesion.estado !== 'activa') {
            await sesionesAdmin.activarSesion(cfg.id_establecimiento, sesion.id_sesion, null, { origen: 'horario', activarQr: !cfg.pausa_manual });
          } else if (sesion.qr_estado !== qrEsperado) {
            await sesionesAdmin.cambiarEstadoQr(cfg.id_establecimiento, sesion.id_sesion, !cfg.pausa_manual, null, { origen: 'horario' });
          }
        } else if (sesion.estado === 'activa' || sesion.qr_estado === 'activo') {
          await sesionesAdmin.desactivarSesion(cfg.id_establecimiento, sesion.id_sesion, null, { origen: 'horario', limpiarCola: true });
        }
      }
      await reproductor.verificarEspera();
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
