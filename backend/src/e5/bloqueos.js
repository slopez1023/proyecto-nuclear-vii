'use strict';
/**
 * Bloqueo temporal de contenido inapropiado (E5).
 * Al bloquear una canción:
 *  - Se registra el bloqueo con motivo y vigencia (`hasta`).
 *  - Se retiran ('retirada') las solicitudes pendientes de esa canción en las sesiones del establecimiento,
 *    notificando a la cola SSE (no se borra el historial ni se altera el algoritmo del E4).
 */
const repo4 = require('../db/repositorio');
const repo5 = require('./repositorio-e5');
const { ErrorApi, texto, entero, videoId, iso, cancionJson } = require('./comun-e5');

function crearBloqueos({ pool, catalogo, flujo, ahora, emisor }) {
  async function listar(idEst, { incluirVencidos = false } = {}) {
    const t = ahora();
    const filas = await repo5.listarBloqueos(pool, idEst, t, { incluirVencidos });
    return filas.map((b) => ({
      id_bloqueo: b.id_bloqueo,
      motivo: b.motivo,
      desde: iso(b.desde),
      hasta: iso(b.hasta),
      vigente: b.levantado_en === null && b.hasta > t,
      levantado_en: iso(b.levantado_en),
      creado_por: b.creado_por_nombre || null,
      cancion: cancionJson(b),
    }));
  }

  async function bloquear(idEst, body, usuario) {
    const b = body && typeof body === 'object' ? body : {};
    const ytId = videoId(b.youtube_video_id);
    const motivo = texto(b.motivo, 'motivo', { max: 300 });
    const minutos = entero(b.duracion_minutos ?? 120, 'duracion_minutos', { min: 1, max: 43200 }); // hasta 30 días
    const cancion = await catalogo.validar(ytId); // valida contra catálogo/YouTube fuera de transacción
    const t = ahora();
    const hasta = t + minutos * 60 * 1000;

    const { idBloqueo, sesionesAfectadas, retiradas } = await repo4.conTransaccion(pool, async (client) => {
      const id = await repo5.insertarBloqueo(client, {
        idEst, idCancion: cancion.id_cancion, motivo, desde: t, hasta, idUsuario: usuario.id_usuario,
      });
      const sesiones = await repo5.listarSesiones(client, idEst);
      const afectadas = [];
      let totalRetiradas = 0;
      for (const s of sesiones) {
        const ret = await repo5.retirarPendientes(client, s.id_sesion, cancion.id_cancion);
        if (ret.length > 0) {
          await repo4.incrementarVersion(client, s.id_sesion);
          afectadas.push(s.id_sesion);
          totalRetiradas += ret.length;
        }
      }
      await repo5.registrar(client, {
        idEst, idUsuario: usuario.id_usuario, accion: 'cancion_bloqueada',
        detalle: { id_bloqueo: id, youtube_video_id: ytId, motivo, duracion_minutos: minutos, solicitudes_retiradas: totalRetiradas },
        ahora: t,
      });
      return { idBloqueo: id, sesionesAfectadas: afectadas, retiradas: totalRetiradas };
    });

    emisor.emitir({
      tipo: 'cancion_bloqueada', id_establecimiento: idEst, usuario,
      datos_evento: { id_bloqueo: idBloqueo, youtube_video_id: ytId, motivo, duracion_minutos: minutos, solicitudes_retiradas: retiradas },
    });
    if (flujo && typeof flujo.notificarSesion === 'function') sesionesAfectadas.forEach((s) => flujo.notificarSesion(s));
    return {
      id_bloqueo: idBloqueo,
      cancion: cancionJson(cancion),
      motivo,
      desde: iso(t),
      hasta: iso(hasta),
      solicitudes_retiradas: retiradas,
    };
  }

  async function desbloquear(idEst, idBloqueo, usuario) {
    const t = ahora();
    const levantado = await repo4.conTransaccion(pool, async (client) => {
      const fila = await repo5.levantarBloqueo(client, idEst, idBloqueo, usuario.id_usuario, t);
      if (!fila) throw new ErrorApi(404, 'bloqueo_inexistente', 'El bloqueo no existe o ya fue levantado.');
      await repo5.registrar(client, {
        idEst, idUsuario: usuario.id_usuario, accion: 'cancion_desbloqueada',
        detalle: { id_bloqueo: idBloqueo, id_cancion: fila.id_cancion }, ahora: t,
      });
      return fila;
    });
    emisor.emitir({ tipo: 'cancion_desbloqueada', id_establecimiento: idEst, usuario, datos_evento: { id_bloqueo: levantado.id_bloqueo } });
    return { id_bloqueo: levantado.id_bloqueo, levantado_en: iso(t) };
  }

  return { listar, bloquear, desbloquear };
}

module.exports = { crearBloqueos };
