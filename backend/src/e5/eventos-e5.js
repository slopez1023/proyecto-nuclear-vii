'use strict';
/**
 * Eventos analíticos del Entregable 5.
 *
 * El conjunto TIPOS_SERVIDOR del E4 (src/eventos.js) es cerrado y no se modifica. Los eventos de reproducción que ya
 * existen (reproduccion_iniciada / _finalizada / _fallida) se siguen emitiendo con `registrarEventoServidor` del E4,
 * con la MISMA estructura. Los tipos nuevos usan el mismo sobre (evento_id, tipo, fecha_hora, sesion_id,
 * id_establecimiento, actor, dispositivo_id, version_esquema, datos_evento) y se guardan en el MISMO almacén JSONL,
 * para que el pipeline de Big Data (E6) los lea igual.
 */
const crypto = require('node:crypto');
const { registrarEventoServidor } = require('../eventos');

const VERSION_ESQUEMA_E5 = '1.3-e5'; // 1.3: actor 'administrador' | 'dj' | 'sistema' y eventos de operación

const TIPOS_E5 = new Set([
  // definidos en el documento del proyecto
  'reproduccion_saltada', 'sesion_iniciada', 'sesion_cerrada', 'lista_defecto_actualizada',
  // nuevos de la operación del E5
  'qr_activado', 'qr_desactivado', 'horario_actualizado', 'horario_excepcion_actualizada',
  'pausa_manual_iniciada', 'pausa_manual_finalizada', 'modo_automatico_actualizado',
  'reproduccion_pausada', 'reproduccion_reanudada', 'reproduccion_en_espera',
  'cancion_bloqueada', 'cancion_desbloqueada', 'solicitud_retirada',
  'lista_actualizada', 'mantenimiento_realizado', 'sesion_creada',
  // funcionalidades opcionales (bonificación)
  'voto_cambiado', 'respaldo_listas_generado', 'sonido_actualizado',
  // pantalla pública (e5_display)
  'display_creado', 'display_regenerado', 'display_revocado',
  'display_control_autorizado', 'display_control_reclamado', 'display_control_liberado', 'display_error_reproduccion',
]);

const actorDe = (usuario) => (!usuario ? 'sistema' : usuario.rol === 'admin' ? 'administrador' : 'dj');

function crearEventoE5({ tipo, sesion_id = null, id_establecimiento, usuario = null, dispositivo_id = null, datos_evento = {} }, ahora = () => new Date()) {
  if (!TIPOS_E5.has(tipo)) throw new Error(`Tipo de evento del E5 desconocido: ${tipo}`);
  return {
    evento_id: crypto.randomUUID(),
    tipo,
    fecha_hora: ahora().toISOString(),
    sesion_id,
    id_establecimiento,
    actor: dispositivo_id ? 'cliente' : actorDe(usuario),
    dispositivo_id,
    version_esquema: VERSION_ESQUEMA_E5,
    datos_evento: { ...datos_evento, id_usuario: usuario ? `USR-${usuario.id_usuario}` : null },
  };
}

/**
 * @param {{almacenEventos:{guardar:Function}, ahora:()=>number}} deps
 * Devuelve emisores que NUNCA lanzan: un fallo de analítica no deshace la operación (mismo criterio que el E4).
 */
function crearEmisorE5({ almacenEventos, ahora }) {
  const fecha = () => new Date(ahora());
  return {
    /** Evento nuevo del E5. */
    emitir(datos) {
      try {
        almacenEventos.guardar(crearEventoE5(datos, fecha));
      } catch (err) {
        console.error(`[e5/eventos] no se pudo registrar ${datos.tipo}:`, err.message);
      }
    },
    /** Evento ya definido por el E4 (reproduccion_iniciada, _finalizada, _fallida): mismo formato del E4. */
    emitirE4(datos) {
      registrarEventoServidor(almacenEventos, datos, fecha);
    },
  };
}

module.exports = { TIPOS_E5, VERSION_ESQUEMA_E5, crearEventoE5, crearEmisorE5, actorDe };
