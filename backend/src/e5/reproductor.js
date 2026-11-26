'use strict';
/**
 * Control de reproducción para el DJ y continuidad musical automática (E5).
 *
 * Decisiones de integración con el E4 (ver diagnóstico):
 *  1) Solicitudes de clientes: tienen PRIORIDAD sobre la lista predeterminada. Al iniciar/avanzar, primero se
 *     consulta `repo4.leerColaPendiente`, filtrando canciones bloqueadas temporalmente.
 *  2) Votaciones (sección 7): solo cuentan las canciones solicitadas (`id_solicitud IS NOT NULL`) con
 *     `resultado = 'exitosa'`. Las saltadas se registran con `resultado = 'fallida'`, `codigo_error = 'saltada_por_operador'`
 *     y la solicitud pasa a `'saltada'`. Las de la lista predeterminada se registran con `id_solicitud = NULL`.
 *  3) Regla de inactividad (H1): mientras suena una canción de la lista predeterminada, se sigue en
 *     `e5_estado_reproduccion` y se inserta en `reproduccion` al terminar; así los dispositivos con intervalo
 *     agotado pueden pedir la primera canción nueva sin quedar bloqueados.
 */
const repo4 = require('../db/repositorio');
const repo5 = require('./repositorio-e5');
const { ErrorApi, idTexto, iso, cancionJson } = require('./comun-e5');

const CODIGO_SALTADA = 'saltada_por_operador';

function crearReproductor({ pool, cola, flujo, ahora, emisor }) {
  const notificar = (idSesion) => {
    if (flujo && typeof flujo.notificarSesion === 'function') flujo.notificarSesion(idSesion);
  };
  const notificarReproductor = (idSesion, estado) => {
    if (flujo && typeof flujo.notificarEvento === 'function') flujo.notificarEvento(idSesion, 'reproductor', estado);
  };

  async function verificarSesionDeEst(client, idEst, idSesion) {
    const s = await repo5.obtenerSesionCompleta(client, idSesion);
    if (!s || s.id_establecimiento !== idEst) throw new ErrorApi(404, 'sesion_inexistente', 'La sesión no existe en este establecimiento.');
    if (s.estado !== 'activa') throw new ErrorApi(409, 'sesion_cerrada', 'La sesión está cerrada.');
    return s;
  }

  /** Selecciona la primera solicitud pendiente NO bloqueada; retira automáticamente las bloqueadas que encuentre. */
  async function tomarSiguienteSolicitud(client, idEst, idSesion, bloqueadas) {
    const pendientes = await repo4.leerColaPendiente(client, idSesion);
    for (const s of pendientes) {
      if (bloqueadas.has(s.id_cancion)) {
        await repo4.cambiarEstadoSolicitud(client, s.id_solicitud, 'retirada');
        continue;
      }
      await repo4.cambiarEstadoSolicitud(client, s.id_solicitud, 'en_reproduccion');
      await repo4.insertarReproduccion(client, {
        idSesion, idEstablecimiento: idEst, idSolicitud: s.id_solicitud, idCancion: s.id_cancion,
        inicio: ahora(), origen: 'reproductor',
      });
      return repo4.reproduccionEnCurso(client, idSesion);
    }
    return null;
  }

  /** Selecciona la siguiente canción NO bloqueada de la lista predeterminada (con rotación opcional). */
  async function seleccionarDeLista(client, idEst, estadoRep, cfg, saltarActual = false) {
    let listaId = estadoRep.lista_id || cfg.id_lista_defecto;
    if (!listaId) return null;
    let lista = await repo5.obtenerLista(client, idEst, listaId);
    if (!lista) {
      listaId = cfg.id_lista_defecto;
      lista = listaId ? await repo5.obtenerLista(client, idEst, listaId) : null;
    }
    if (!lista) return null;

    const bloqueadas = await repo5.idsBloqueados(client, idEst, ahora());
    let canciones = await repo5.cancionesDeLista(client, listaId);
    let pos = estadoRep.lista_id === listaId && estadoRep.lista_posicion ? estadoRep.lista_posicion : 0;

    // Si terminó la lista y está activada la rotación, avanza a la siguiente lista habilitada.
    if (cfg.rotacion_listas && canciones.length > 0 && pos >= canciones.length) {
      const rot = await repo5.listasEnRotacion(client, idEst);
      if (rot.length > 1) {
        const idx = rot.indexOf(listaId);
        listaId = rot[(idx + 1) % rot.length];
        canciones = await repo5.cancionesDeLista(client, listaId);
        pos = 0;
      }
    }
    if (canciones.length === 0) return null;

    const inicioIdx = pos % canciones.length;
    for (let i = 0; i < canciones.length; i++) {
      const idx = (inicioIdx + i + (saltarActual && i === 0 ? 1 : 0)) % canciones.length;
      const c = canciones[idx];
      if (!bloqueadas.has(c.id_cancion) && c.disponibilidad === 'disponible') {
        return { id_lista: listaId, lista_nombre: lista.nombre, posicion: c.posicion, cancion: c };
      }
    }
    return null;
  }

  /** Inicia lo siguiente disponible: primero cola de solicitudes, si no hay, lista predeterminada. */
  async function avanzarInterno(client, sesion, estadoRep, { origen = 'reproductor' } = {}) {
    const t = ahora();
    const idEst = sesion.id_establecimiento;
    const bloqueadas = await repo5.idsBloqueados(client, idEst, t);
    const nuevaSol = await tomarSiguienteSolicitud(client, idEst, sesion.id_sesion, bloqueadas);
    if (nuevaSol) {
      await repo5.actualizarEstadoReproduccion(client, sesion.id_sesion, {
        estado: 'reproduciendo', pausada_en: null, lista_cancion: null, lista_inicio_en: null,
      }, t);
      return { modo: 'solicitud', actual: nuevaSol };
    }
    const cfg = await repo5.obtenerConfig(client, idEst);
    const deLista = await seleccionarDeLista(client, idEst, estadoRep, cfg || {});
    if (deLista) {
      await repo5.actualizarEstadoReproduccion(client, sesion.id_sesion, {
        estado: 'reproduciendo', pausada_en: null,
        lista_id: deLista.id_lista, lista_posicion: deLista.posicion,
        lista_cancion: deLista.cancion.id_cancion, lista_inicio_en: t,
      }, t);
      return { modo: 'lista', lista: deLista, inicio_en: t };
    }
    await repo5.actualizarEstadoReproduccion(client, sesion.id_sesion, {
      estado: 'en_espera', pausada_en: null, lista_cancion: null, lista_inicio_en: null,
    }, t);
    return { modo: 'en_espera', origen };
  }

  function emitirInicio(idSesion, idEst, avance, usuario) {
    if (avance.modo === 'solicitud') {
      const a = avance.actual;
      const enCola = a.fecha_solicitud ? Math.max(0, Math.floor((a.inicio_en - a.fecha_solicitud) / 1000)) : null;
      emisor.emitirE4({
        tipo: 'reproduccion_iniciada', sesion_id: idSesion, id_establecimiento: idEst,
        datos_evento: {
          id_reproduccion: idTexto('REP', a.id_reproduccion), id_solicitud: idTexto('SOL', a.id_solicitud),
          youtube_video_id: a.youtube_video_id, total_votos: a.total_votos, origen: 'reproductor', segundos_en_cola: enCola,
        },
      });
    } else if (avance.modo === 'lista') {
      emisor.emitirE4({
        tipo: 'reproduccion_iniciada', sesion_id: idSesion, id_establecimiento: idEst,
        datos_evento: {
          id_reproduccion: null, id_solicitud: null, youtube_video_id: avance.lista.cancion.youtube_video_id,
          total_votos: 0, origen: 'lista_defecto', segundos_en_cola: null,
        },
      });
    } else {
      emisor.emitir({ tipo: 'reproduccion_en_espera', sesion_id: idSesion, id_establecimiento: idEst, usuario, datos_evento: {} });
    }
  }

  async function estadoActual(idEst, idSesion) {
    await repo5.asegurarConfig(pool, idEst, ahora());
    const sesion = await repo5.obtenerSesionCompleta(pool, idSesion);
    if (!sesion || sesion.id_establecimiento !== idEst) throw new ErrorApi(404, 'sesion_inexistente', 'La sesión no existe en este establecimiento.');
    await repo5.asegurarEstadoReproduccion(pool, idSesion, ahora());
    const estRep = await repo5.obtenerEstadoReproduccion(pool, idSesion);
    const enCurso = await repo4.reproduccionEnCurso(pool, idSesion);
    const bloqueadas = await repo5.idsBloqueados(pool, idEst, ahora());
    const pendientes = (await repo4.leerColaPendiente(pool, idSesion)).filter((s) => !bloqueadas.has(s.id_cancion));

    let actual = null;
    if (enCurso) {
      actual = {
        fuente: 'solicitud',
        id_reproduccion: idTexto('REP', enCurso.id_reproduccion),
        id_solicitud: idTexto('SOL', enCurso.id_solicitud),
        total_votos: enCurso.total_votos,
        inicio_en: iso(enCurso.inicio_en),
        cancion: cancionJson(enCurso),
      };
    } else if (estRep.lista_cancion && (estRep.estado === 'reproduciendo' || estRep.estado === 'pausada')) {
      actual = {
        fuente: 'lista_defecto',
        id_lista: estRep.lista_id,
        lista_nombre: estRep.lista_nombre,
        posicion_lista: estRep.lista_posicion,
        inicio_en: iso(estRep.lista_inicio_en),
        cancion: cancionJson(estRep),
      };
    }

    return {
      id_sesion: idSesion,
      sesion_estado: sesion.estado,
      qr_estado: sesion.qr_estado,
      estado_reproduccion: estRep.estado,
      pausada_en: iso(estRep.pausada_en),
      actual,
      cola: pendientes.map((s, i) => ({
        posicion: i + 1,
        id_solicitud: idTexto('SOL', s.id_solicitud),
        total_votos: s.total_votos,
        fecha_solicitud: iso(s.fecha_solicitud),
        cancion: cancionJson(s),
      })),
      historial_reciente: (await repo5.historialReproducciones(pool, idSesion, 15)).map((r) => ({
        id_reproduccion: idTexto('REP', r.id_reproduccion),
        fuente: r.id_solicitud ? 'solicitud' : 'lista_defecto',
        resultado: r.resultado,
        codigo_error: r.codigo_error,
        total_votos: r.total_votos,
        inicio_en: iso(r.inicio_en),
        fin_en: iso(r.fin_en),
        cancion: cancionJson(r),
      })),
    };
  }

  async function iniciar(idEst, idSesion, usuario) {
    const t = ahora();
    const res = await repo4.conTransaccion(pool, async (client) => {
      const sesion = await verificarSesionDeEst(client, idEst, idSesion);
      await repo5.asegurarConfig(client, idEst, t);
      await repo5.asegurarEstadoReproduccion(client, idSesion, t);
      await repo4.bloquearEstablecimientoYSesion(client, idEst, idSesion);
      const estRep = await repo5.obtenerEstadoReproduccion(client, idSesion, { bloquear: true });
      const enCurso = await repo4.reproduccionEnCurso(client, idSesion);
      if (enCurso || (estRep.lista_cancion && estRep.estado === 'reproduciendo')) {
        throw new ErrorApi(409, 'ya_hay_reproduccion', 'Ya hay una canción en reproducción.');
      }
      const avance = await avanzarInterno(client, sesion, estRep, {});
      await repo4.incrementarVersion(client, idSesion);
      await repo5.registrar(client, { idEst, idUsuario: usuario.id_usuario, accion: 'reproduccion_iniciada',
        detalle: { id_sesion: idSesion, modo: avance.modo }, ahora: t });
      return avance;
    });
    emitirInicio(idSesion, idEst, res, usuario);
    notificar(idSesion);
    return estadoActual(idEst, idSesion);
  }

  async function pausar(idEst, idSesion, usuario) {
    const t = ahora();
    await repo4.conTransaccion(pool, async (client) => {
      await verificarSesionDeEst(client, idEst, idSesion);
      await repo5.asegurarEstadoReproduccion(client, idSesion, t);
      const estRep = await repo5.obtenerEstadoReproduccion(client, idSesion, { bloquear: true });
      if (estRep.estado !== 'reproduciendo') throw new ErrorApi(409, 'no_esta_reproduciendo', 'No hay reproducción activa para pausar.');
      await repo5.actualizarEstadoReproduccion(client, idSesion, { estado: 'pausada', pausada_en: t }, t);
      await repo5.registrar(client, { idEst, idUsuario: usuario.id_usuario, accion: 'reproduccion_pausada', detalle: { id_sesion: idSesion }, ahora: t });
    });
    emisor.emitir({ tipo: 'reproduccion_pausada', sesion_id: idSesion, id_establecimiento: idEst, usuario, datos_evento: {} });
    notificarReproductor(idSesion, { estado_reproduccion: 'pausada', pausada_en: iso(t) });
    return estadoActual(idEst, idSesion);
  }

  async function reanudar(idEst, idSesion, usuario) {
    const t = ahora();
    await repo4.conTransaccion(pool, async (client) => {
      await verificarSesionDeEst(client, idEst, idSesion);
      await repo5.asegurarEstadoReproduccion(client, idSesion, t);
      const estRep = await repo5.obtenerEstadoReproduccion(client, idSesion, { bloquear: true });
      if (estRep.estado !== 'pausada') throw new ErrorApi(409, 'no_esta_pausada', 'La reproducción no está pausada.');
      await repo5.actualizarEstadoReproduccion(client, idSesion, { estado: 'reproduciendo', pausada_en: null }, t);
      await repo5.registrar(client, { idEst, idUsuario: usuario.id_usuario, accion: 'reproduccion_reanudada', detalle: { id_sesion: idSesion }, ahora: t });
    });
    emisor.emitir({ tipo: 'reproduccion_reanudada', sesion_id: idSesion, id_establecimiento: idEst, usuario, datos_evento: {} });
    notificarReproductor(idSesion, { estado_reproduccion: 'reproduciendo', pausada_en: null });
    return estadoActual(idEst, idSesion);
  }

  /** Cierra la canción actual (finalizada, saltada o fallida) y arranca automáticamente la siguiente. */
  async function finalizarYAvanzar(idEst, idSesion, { resultado, segundos = null, codigoError = null }, usuario) {
    const t = ahora();
    const res = await repo4.conTransaccion(pool, async (client) => {
      const sesion = await verificarSesionDeEst(client, idEst, idSesion);
      await repo5.asegurarConfig(client, idEst, t);
      await repo5.asegurarEstadoReproduccion(client, idSesion, t);
      await repo4.bloquearEstablecimientoYSesion(client, idEst, idSesion);
      const estRep = await repo5.obtenerEstadoReproduccion(client, idSesion, { bloquear: true });
      const enCurso = await repo4.reproduccionEnCurso(client, idSesion, { bloquear: true });

      let cerrada = null;
      if (enCurso) {
        const seg = segundos ?? Math.max(0, Math.floor((t - enCurso.inicio_en) / 1000));
        // Para el contador de votaciones del E4, una canción saltada NO es 'exitosa': se guarda 'fallida' + código.
        const resultadoBd = resultado === 'exitosa' ? 'exitosa' : 'fallida';
        const cod = resultado === 'saltada' ? CODIGO_SALTADA : (resultado === 'fallida' ? (codigoError || 'error_reproductor') : null);
        await repo4.cerrarReproduccion(client, enCurso.id_reproduccion, { fin: t, resultado: resultadoBd, segundos: seg, codigoError: cod });
        await repo4.cambiarEstadoSolicitud(client, enCurso.id_solicitud,
          resultado === 'exitosa' ? 'reproducida' : (resultado === 'saltada' ? 'saltada' : 'fallida'));
        cerrada = { fuente: 'solicitud', fila: enCurso, segundos: seg, codigoError: cod };
      } else if (estRep.lista_cancion) {
        const seg = segundos ?? Math.max(0, Math.floor((t - (estRep.lista_inicio_en || t)) / 1000));
        const resultadoBd = resultado === 'exitosa' ? 'exitosa' : 'fallida';
        const cod = resultado === 'saltada' ? CODIGO_SALTADA : (resultado === 'fallida' ? (codigoError || 'error_reproductor') : null);
        const idRep = await repo5.insertarReproduccionLista(client, {
          idSesion, idEst, idCancion: estRep.lista_cancion, inicio: estRep.lista_inicio_en || t, fin: t,
          resultado: resultadoBd, segundos: seg, codigoError: cod,
        });
        cerrada = { fuente: 'lista', idReproduccion: idRep, fila: estRep, segundos: seg, codigoError: cod };
      } else {
        throw new ErrorApi(409, 'sin_reproduccion_actual', 'No hay ninguna canción sonando en este momento.');
      }

      if (resultado === 'fallida' && /^yt_error_(100|101|150)$|^no_disponible$/.test(codigoError || '')) {
        const idCancionFallida = enCurso ? enCurso.id_cancion : estRep.lista_cancion;
        await client.query(`UPDATE cancion SET disponibilidad = 'no_disponible' WHERE id_cancion = $1`, [idCancionFallida]);
      }

      const avance = await avanzarInterno(client, sesion, estRep, {});
      await repo4.incrementarVersion(client, idSesion);
      await repo5.registrar(client, {
        idEst, idUsuario: usuario ? usuario.id_usuario : null,
        accion: resultado === 'saltada' ? 'reproduccion_saltada' : (resultado === 'fallida' ? 'reproduccion_fallida' : 'reproduccion_finalizada'),
        detalle: { id_sesion: idSesion, fuente: cerrada.fuente, codigo_error: cerrada.codigoError, siguiente_modo: avance.modo },
        ahora: t,
      });
      return { cerrada, avance };
    });

    const c = res.cerrada;
    const idRep = c.fuente === 'solicitud' ? idTexto('REP', c.fila.id_reproduccion) : idTexto('REP', c.idReproduccion);
    const idSol = c.fuente === 'solicitud' ? idTexto('SOL', c.fila.id_solicitud) : null;
    if (resultado === 'exitosa') {
      emisor.emitirE4({ tipo: 'reproduccion_finalizada', sesion_id: idSesion, id_establecimiento: idEst,
        datos_evento: { id_reproduccion: idRep, id_solicitud: idSol, segundos_reproducidos: c.segundos,
          youtube_video_id: c.fila.youtube_video_id, total_votos: c.fila.total_votos || 0, origen: 'reproductor' } });
    } else if (resultado === 'saltada') {
      emisor.emitir({ tipo: 'reproduccion_saltada', sesion_id: idSesion, id_establecimiento: idEst, usuario,
        datos_evento: { id_reproduccion: idRep, id_solicitud: idSol, youtube_video_id: c.fila.youtube_video_id, segundos_reproducidos: c.segundos } });
    } else {
      emisor.emitirE4({ tipo: 'reproduccion_fallida', sesion_id: idSesion, id_establecimiento: idEst,
        datos_evento: { id_reproduccion: idRep, id_solicitud: idSol, segundos_reproducidos: c.segundos,
          youtube_video_id: c.fila.youtube_video_id, total_votos: c.fila.total_votos || 0,
          codigo_error: c.codigoError, origen: 'reproductor' } });
    }
    emitirInicio(idSesion, idEst, res.avance, usuario);
    notificar(idSesion);
    return estadoActual(idEst, idSesion);
  }

  /** Despierta sesiones que estaban 'en_espera' cuando llega una solicitud nueva de un cliente. */
  async function verificarEspera() {
    const ids = await repo5.sesionesEnEspera(pool);
    for (const idSesion of ids) {
      const t = ahora();
      const res = await repo4.conTransaccion(pool, async (client) => {
        const sesion = await repo5.obtenerSesionCompleta(client, idSesion);
        if (!sesion || sesion.estado !== 'activa') return null;
        await repo4.bloquearEstablecimientoYSesion(client, sesion.id_establecimiento, idSesion);
        const estRep = await repo5.obtenerEstadoReproduccion(client, idSesion, { bloquear: true });
        if (!estRep || estRep.estado !== 'en_espera') return null;
        if (await repo4.reproduccionEnCurso(client, idSesion)) return null;
        const avance = await avanzarInterno(client, sesion, estRep, {});
        if (avance.modo === 'en_espera') return null;
        await repo4.incrementarVersion(client, idSesion);
        return { sesion, avance };
      });
      if (res) {
        emitirInicio(idSesion, res.sesion.id_establecimiento, res.avance, null);
        notificar(idSesion);
      }
    }
  }

  return {
    estadoActual, iniciar, pausar, reanudar,
    siguiente: (idEst, idSesion, body, usuario) => finalizarYAvanzar(idEst, idSesion, {
      resultado: 'exitosa', segundos: body && Number.isInteger(body.segundos_reproducidos) ? body.segundos_reproducidos : null,
    }, usuario),
    saltar: (idEst, idSesion, body, usuario) => finalizarYAvanzar(idEst, idSesion, {
      resultado: 'saltada', segundos: body && Number.isInteger(body.segundos_reproducidos) ? body.segundos_reproducidos : null,
    }, usuario),
    reportarError: (idEst, idSesion, body, usuario) => finalizarYAvanzar(idEst, idSesion, {
      resultado: 'fallida',
      segundos: body && Number.isInteger(body.segundos_reproducidos) ? body.segundos_reproducidos : 0,
      codigoError: body && typeof body.codigo_error === 'string' ? body.codigo_error.slice(0, 100) : 'error_youtube',
    }, usuario),
    verificarEspera,
  };
}

module.exports = { crearReproductor, CODIGO_SALTADA };
