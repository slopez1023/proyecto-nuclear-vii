'use strict';
/**
 * Administración de listas de reproducción predeterminadas (continuidad musical).
 */
const repo4 = require('../db/repositorio');
const repo5 = require('./repositorio-e5');
const { ErrorApi, texto, booleano, videoId, iso, cancionJson } = require('./comun-e5');

function crearListas({ pool, catalogo, ahora, emisor }) {
  async function exigirLista(q, idEst, idLista) {
    const lista = await repo5.obtenerLista(q, idEst, idLista);
    if (!lista) throw new ErrorApi(404, 'lista_inexistente', 'La lista de reproducción no existe.');
    return lista;
  }

  async function detalle(idEst, idLista) {
    const l = await exigirLista(pool, idEst, idLista);
    await repo5.asegurarConfig(pool, idEst, ahora());
    const cfg = await repo5.obtenerConfig(pool, idEst);
    const canciones = await repo5.cancionesDeLista(pool, idLista);
    return {
      id_lista: l.id_lista,
      nombre: l.nombre,
      descripcion: l.descripcion,
      en_rotacion: l.en_rotacion,
      es_predeterminada: cfg.id_lista_defecto === l.id_lista,
      creada_en: iso(l.creada_en),
      actualizada_en: iso(l.actualizada_en),
      canciones: canciones.map((c) => ({ posicion: c.posicion, ...cancionJson(c) })),
    };
  }

  async function listar(idEst) {
    await repo5.asegurarConfig(pool, idEst, ahora());
    const cfg = await repo5.obtenerConfig(pool, idEst);
    const filas = await repo5.listarListas(pool, idEst);
    return {
      id_lista_defecto: cfg.id_lista_defecto,
      rotacion_listas: cfg.rotacion_listas,
      listas: filas.map((l) => ({
        id_lista: l.id_lista,
        nombre: l.nombre,
        descripcion: l.descripcion,
        en_rotacion: l.en_rotacion,
        es_predeterminada: cfg.id_lista_defecto === l.id_lista,
        total_canciones: l.total_canciones,
        duracion_total_segundos: l.duracion_total,
        actualizada_en: iso(l.actualizada_en),
      })),
    };
  }

  async function crear(idEst, body, usuario) {
    const b = body && typeof body === 'object' ? body : {};
    const nombre = texto(b.nombre, 'nombre', { max: 120 });
    const descripcion = texto(b.descripcion, 'descripcion', { max: 400, obligatorio: false });
    const t = ahora();
    const idLista = await repo4.conTransaccion(pool, async (client) => {
      await repo5.asegurarConfig(client, idEst, t);
      const id = await repo5.insertarLista(client, { idEst, nombre, descripcion, ahora: t });
      const cfg = await repo5.obtenerConfig(client, idEst, { bloquear: true });
      if (b.predeterminada === true || cfg.id_lista_defecto === null) {
        await repo5.actualizarConfig(client, idEst, { id_lista_defecto: id }, t);
      }
      await repo5.registrar(client, { idEst, idUsuario: usuario.id_usuario, accion: 'lista_creada', detalle: { id_lista: id, nombre }, ahora: t });
      return id;
    });
    emisor.emitir({ tipo: 'lista_actualizada', id_establecimiento: idEst, usuario, datos_evento: { id_lista: idLista, accion: 'creada' } });
    return detalle(idEst, idLista);
  }

  async function actualizar(idEst, idLista, body, usuario) {
    const b = body && typeof body === 'object' ? body : {};
    const nombre = b.nombre !== undefined ? texto(b.nombre, 'nombre', { max: 120 }) : null;
    const descripcion = b.descripcion !== undefined ? texto(b.descripcion, 'descripcion', { max: 400, obligatorio: false }) : null;
    const enRotacion = b.en_rotacion !== undefined ? booleano(b.en_rotacion, 'en_rotacion') : null;
    const t = ahora();
    await repo4.conTransaccion(pool, async (client) => {
      await exigirLista(client, idEst, idLista);
      await repo5.actualizarLista(client, idLista, { nombre, descripcion, enRotacion }, t);
      await repo5.registrar(client, { idEst, idUsuario: usuario.id_usuario, accion: 'lista_actualizada', detalle: { id_lista: idLista }, ahora: t });
    });
    emisor.emitir({ tipo: 'lista_actualizada', id_establecimiento: idEst, usuario, datos_evento: { id_lista: idLista, accion: 'editada' } });
    return detalle(idEst, idLista);
  }

  async function eliminar(idEst, idLista, usuario) {
    const t = ahora();
    await repo4.conTransaccion(pool, async (client) => {
      await exigirLista(client, idEst, idLista);
      const cfg = await repo5.obtenerConfig(client, idEst, { bloquear: true });
      if (cfg && cfg.id_lista_defecto === idLista) {
        await repo5.actualizarConfig(client, idEst, { id_lista_defecto: null }, t);
      }
      await repo5.eliminarLista(client, idLista, t);
      await repo5.registrar(client, { idEst, idUsuario: usuario.id_usuario, accion: 'lista_eliminada', detalle: { id_lista: idLista }, ahora: t });
    });
    emisor.emitir({ tipo: 'lista_actualizada', id_establecimiento: idEst, usuario, datos_evento: { id_lista: idLista, accion: 'eliminada' } });
    return { eliminada: true, id_lista: idLista };
  }

  async function agregarCancion(idEst, idLista, body, usuario) {
    const b = body && typeof body === 'object' ? body : {};
    const ytId = videoId(b.youtube_video_id);
    await exigirLista(pool, idEst, idLista);
    const cancion = await catalogo.validar(ytId);
    const t = ahora();
    const pos = await repo4.conTransaccion(pool, async (client) => {
      await exigirLista(client, idEst, idLista);
      const p = await repo5.agregarCancionALista(client, idLista, cancion.id_cancion, t);
      if (p === null) throw new ErrorApi(409, 'cancion_duplicada_en_lista', 'La canción ya está en esta lista.');
      await repo5.registrar(client, { idEst, idUsuario: usuario.id_usuario, accion: 'lista_cancion_agregada',
        detalle: { id_lista: idLista, youtube_video_id: ytId, posicion: p }, ahora: t });
      return p;
    });
    emisor.emitir({ tipo: 'lista_actualizada', id_establecimiento: idEst, usuario,
      datos_evento: { id_lista: idLista, accion: 'cancion_agregada', youtube_video_id: ytId, posicion: pos } });
    return detalle(idEst, idLista);
  }

  async function quitarCancion(idEst, idLista, ytId, usuario) {
    videoId(ytId);
    const t = ahora();
    await repo4.conTransaccion(pool, async (client) => {
      await exigirLista(client, idEst, idLista);
      const cancion = await repo4.obtenerCancion(client, ytId);
      if (!cancion || !(await repo5.quitarCancionDeLista(client, idLista, cancion.id_cancion, t))) {
        throw new ErrorApi(404, 'cancion_no_en_lista', 'La canción no está en esta lista.');
      }
      await repo5.registrar(client, { idEst, idUsuario: usuario.id_usuario, accion: 'lista_cancion_quitada',
        detalle: { id_lista: idLista, youtube_video_id: ytId }, ahora: t });
    });
    emisor.emitir({ tipo: 'lista_actualizada', id_establecimiento: idEst, usuario,
      datos_evento: { id_lista: idLista, accion: 'cancion_quitada', youtube_video_id: ytId } });
    return detalle(idEst, idLista);
  }

  async function reordenar(idEst, idLista, body, usuario) {
    const b = body && typeof body === 'object' ? body : {};
    if (!Array.isArray(b.orden)) throw new ErrorApi(400, 'dato_invalido', 'orden debe ser un arreglo de youtube_video_id.');
    const t = ahora();
    await repo4.conTransaccion(pool, async (client) => {
      await exigirLista(client, idEst, idLista);
      const actuales = await repo5.cancionesDeLista(client, idLista);
      if (b.orden.length !== actuales.length) {
        throw new ErrorApi(400, 'orden_incompleto', 'El nuevo orden debe incluir exactamente todas las canciones de la lista.');
      }
      const porYt = new Map(actuales.map((c) => [c.youtube_video_id, c.id_cancion]));
      const ids = [];
      const vistos = new Set();
      for (const yt of b.orden) {
        if (!porYt.has(yt) || vistos.has(yt)) throw new ErrorApi(400, 'orden_invalido', 'La lista de IDs no coincide con las canciones actuales.');
        vistos.add(yt);
        ids.push(porYt.get(yt));
      }
      await repo5.reordenarLista(client, idLista, ids, t);
      await repo5.registrar(client, { idEst, idUsuario: usuario.id_usuario, accion: 'lista_reordenada', detalle: { id_lista: idLista }, ahora: t });
    });
    emisor.emitir({ tipo: 'lista_actualizada', id_establecimiento: idEst, usuario, datos_evento: { id_lista: idLista, accion: 'reordenada' } });
    return detalle(idEst, idLista);
  }

  async function configurarPredeterminada(idEst, body, usuario) {
    const b = body && typeof body === 'object' ? body : {};
    const cambios = {};
    if (b.id_lista_defecto !== undefined) {
      if (b.id_lista_defecto !== null) await exigirLista(pool, idEst, b.id_lista_defecto);
      cambios.id_lista_defecto = b.id_lista_defecto;
    }
    if (b.rotacion_listas !== undefined) cambios.rotacion_listas = booleano(b.rotacion_listas, 'rotacion_listas');
    if (Object.keys(cambios).length === 0) throw new ErrorApi(400, 'dato_invalido', 'Indica id_lista_defecto o rotacion_listas.');
    const t = ahora();
    await repo4.conTransaccion(pool, async (client) => {
      await repo5.asegurarConfig(client, idEst, t);
      await repo5.actualizarConfig(client, idEst, cambios, t);
      await repo5.registrar(client, { idEst, idUsuario: usuario.id_usuario, accion: 'lista_defecto_actualizada', detalle: cambios, ahora: t });
    });
    emisor.emitir({ tipo: 'lista_defecto_actualizada', id_establecimiento: idEst, usuario, datos_evento: cambios });
    return listar(idEst);
  }

  return {
    listar, detalle, crear, actualizar, eliminar,
    agregarCancion, quitarCancion, reordenar, configurarPredeterminada,
  };
}

module.exports = { crearListas };
