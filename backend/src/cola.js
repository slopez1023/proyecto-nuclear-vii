'use strict';
/**
 * Cola, solicitudes (P1) y votos (P2) del E4.
 * Atomicidad en PostgreSQL: cada operación es una transacción READ COMMITTED que primero bloquea
 * (FOR UPDATE) el establecimiento y luego la sesión. Así el cálculo del intervalo y la escritura de la
 * solicitud y su voto no se pueden intercalar con otra petición del mismo establecimiento.
 * Eventos analíticos y avisos SSE se emiten DESPUÉS del COMMIT.
 */
const repo = require('./db/repositorio');
const { registrarEventoServidor } = require('./eventos');
const {
  ErrorApi, idTexto, iso, intervaloPorActivos, calcularMiVotacion, restanteActual, esperasEstimadas,
} = require('./comun-e4');

const CODIGO_UNICO_VIOLADO = '23505';

// ---------------------------------------------------------------- presentación (JSON del contrato, sección 6.1)

const cancionJson = (f) => ({
  youtube_video_id: f.youtube_video_id,
  titulo: f.titulo,
  artista_canal: f.artista_canal,
  duracion_segundos: f.duracion_segundos,
  url_miniatura: f.url_miniatura,
});

function reproduccionActualJson(actual, restante) {
  if (!actual) return null;
  return {
    id_reproduccion: idTexto('REP', actual.id_reproduccion),
    id_solicitud: idTexto('SOL', actual.id_solicitud),
    cancion: cancionJson(actual),
    total_votos: actual.total_votos,
    inicio_en: iso(actual.inicio_en),
    segundos_restantes_estimados: restante,
  };
}

/** Elemento de cola / solicitud. `personal` = { yaVoto, esMia } o null (vista pública). */
function solicitudJson(f, { posicion, espera }, personal) {
  const json = {
    posicion,
    id_solicitud: idTexto('SOL', f.id_solicitud),
    estado: f.estado,
    total_votos: f.total_votos,
    fecha_solicitud: iso(f.fecha_solicitud),
    cancion: cancionJson(f),
  };
  if (personal) {
    json.ya_voto = personal.yaVoto;
    json.es_mia = personal.esMia;
  }
  json.espera_estimada_segundos = espera;
  return json;
}

const votoJson = (v) => ({
  id_voto: idTexto('VOT', v.id_voto),
  id_solicitud: idTexto('SOL', v.id_solicitud),
  origen: v.origen,
  fecha_hora: iso(v.fecha_hora),
});

// ---------------------------------------------------------------- servicio

/**
 * @param {{pool:object, catalogo:object, conectividad:object, ahora:()=>number,
 *          almacenEventos:{guardar:Function}, alCambiar:(idSesion:string)=>void}} deps
 */
function crearCola({ pool, catalogo, conectividad, ahora, almacenEventos, alCambiar }) {
  const ahoraDate = () => new Date(ahora());
  const emitir = (datos) => registrarEventoServidor(almacenEventos, datos, ahoraDate);
  const avisar = (idSesion) => {
    try { alCambiar(idSesion); } catch (err) { console.error('[cola] aviso de cambio falló:', err.message); }
  };

  /** Comprueba que la sesión existe y admite participación (404 / 410). Devuelve la fila. */
  function verificarSesion(sesion) {
    if (!sesion) throw new ErrorApi(404, 'sesion_inexistente', 'La sesión no existe.');
    if (sesion.estado !== 'activa') throw new ErrorApi(410, 'sesion_cerrada', 'La sesión está cerrada.');
    if (sesion.qr_estado !== 'activo') throw new ErrorApi(410, 'qr_desactivado', 'El código QR de esta sesión está desactivado.');
    return sesion;
  }

  async function obtenerSesionActiva(idSesion) {
    return verificarSesion(await repo.obtenerSesion(pool, idSesion));
  }

  const intervaloVigente = (idEst) => intervaloPorActivos(conectividad.contarActivos(idEst));

  async function miVotacion(q, idDispositivo, idEst, { ocioso = false } = {}) {
    return calcularMiVotacion(await repo.contadorIntervalo(q, idDispositivo, idEst), intervaloVigente(idEst), { ocioso });
  }

  // ------------------------------------------------------------ estado de la cola (C1 y SSE)

  /** Parte común a todos los dispositivos. */
  async function estadoBase(q, sesion) {
    const t = ahora();
    const actual = await repo.reproduccionEnCurso(q, sesion.id_sesion);
    const pendientes = await repo.leerColaPendiente(q, sesion.id_sesion);
    const restante = restanteActual(actual, t);
    const activos = conectividad.contarActivos(sesion.id_establecimiento);
    return {
      sesion, t, actual, restante, pendientes,
      esperas: esperasEstimadas(restante, pendientes),
      reglas: { dispositivos_activos: activos, intervalo_canciones: intervaloPorActivos(activos) },
    };
  }

  /** Arma `estado_cola` (sección 6.1). Con `idDispositivo` añade ya_voto, es_mia y mi_votacion. */
  async function personalizar(q, base, idDispositivo) {
    const personal = idDispositivo !== null && idDispositivo !== undefined;
    const votadas = personal ? await repo.solicitudesVotadasPor(q, idDispositivo, base.sesion.id_sesion) : null;
    const estado = {
      sesion_id: base.sesion.id_sesion,
      version: base.sesion.version_cola,
      generado_en: iso(base.t),
      reproduccion_actual: reproduccionActualJson(base.actual, base.restante),
      reglas_votacion: base.reglas,
    };
    if (personal) {
      // H1: sin nada sonando ni en espera, el intervalo no bloquea (ver calcularMiVotacion).
      const ocioso = !base.actual && base.pendientes.length === 0;
      estado.mi_votacion = calcularMiVotacion(
        await repo.contadorIntervalo(q, idDispositivo, base.sesion.id_establecimiento),
        base.reglas.intervalo_canciones,
        { ocioso },
      );
    }
    estado.cola = base.pendientes.map((f, i) => solicitudJson(f, { posicion: i + 1, espera: base.esperas[i] },
      personal ? { yaVoto: votadas.has(f.id_solicitud), esMia: f.id_dispositivo === idDispositivo } : null));
    return estado;
  }

  /**
   * Estado completo de una sesión. La versión se lee ANTES que los datos: los datos nunca son más viejos
   * que la versión que los acompaña.
   */
  async function estadoCola(idSesion, idDispositivo = null) {
    const sesion = await repo.obtenerSesion(pool, idSesion);
    return personalizar(pool, await estadoBase(pool, sesion), idDispositivo);
  }

  /** Registro implícito del dispositivo (primera llamada con un UUID nuevo). */
  const registrarDispositivo = (uuid, idSesion) => repo.asegurarDispositivo(pool, uuid, idSesion, ahora());

  /** Una solicitud tal como la ve el dispositivo, leída dentro de la transacción. */
  async function vistaSolicitud(client, sesion, idSolicitud, idDispositivo) {
    const base = await estadoBase(client, sesion);
    const i = base.pendientes.findIndex((f) => f.id_solicitud === idSolicitud);
    const fila = i >= 0 ? base.pendientes[i] : await repo.obtenerSolicitud(client, sesion.id_sesion, idSolicitud);
    const json = solicitudJson(fila,
      { posicion: i >= 0 ? i + 1 : null, espera: i >= 0 ? base.esperas[i] : null },
      { yaVoto: await repo.existeVoto(client, idSolicitud, idDispositivo), esMia: fila.id_dispositivo === idDispositivo });
    return { json, posicion: json.posicion, totalVotos: fila.total_votos };
  }

  const posicionDe = (pendientes, idSolicitud) => {
    const i = pendientes.findIndex((f) => f.id_solicitud === idSolicitud);
    return i >= 0 ? i + 1 : null;
  };

  function errorIntervalo(mv, mensaje) {
    return new ErrorApi(409, 'intervalo_no_cumplido', mensaje, {
      intervalo_canciones: mv.intervalo_canciones,
      reproducciones_contadas: mv.reproducciones_contadas,
      canciones_restantes: mv.canciones_restantes,
    });
  }

  // ------------------------------------------------------------ P1: solicitar (con voto automático)

  async function solicitarEnTransaccion(client, sesionPrevia, idDispositivo, cancion) {
    const idSesion = sesionPrevia.id_sesion;
    const idEst = sesionPrevia.id_establecimiento;
    const sesion = verificarSesion(await repo.bloquearEstablecimientoYSesion(client, idEst, idSesion));
    const t = ahora();
    const antes = await repo.leerColaPendiente(client, idSesion);

    // 4.1 Solicitud viva (pendiente o en reproducción) de esa canción: no se duplica (decisión 1B).
    // H3c: por P1 SÍ se suma voto a una canción que está sonando; por P2 no (ver votarEnTransaccion).
    const viva = await repo.solicitudVivaDeCancion(client, idSesion, cancion.id_cancion);
    // 4.3 Voto duplicado
    if (viva && await repo.existeVoto(client, viva.id_solicitud, idDispositivo)) {
      throw new ErrorApi(409, 'voto_duplicado', 'Este dispositivo ya votó por esta canción.',
        { id_solicitud: idTexto('SOL', viva.id_solicitud) });
    }
    // 4.4 Intervalo (con la regla de inactividad de H1: cola vacía y nada sonando → se puede pedir)
    const ocioso = !viva && antes.length === 0 && !(await repo.reproduccionEnCurso(client, idSesion));
    const mvNormal = await miVotacion(client, idDispositivo, idEst);
    const mvAntes = ocioso ? await miVotacion(client, idDispositivo, idEst, { ocioso: true }) : mvNormal;
    if (!mvAntes.puede_votar) {
      throw errorIntervalo(mvAntes, 'Todavía no tienes otro voto disponible, por eso no puedes solicitar otra canción.');
    }
    // 4.5 Escritura. H3a: pedir una canción que ya está en cola es SOLICITUD (origen 'solicitud'):
    // su canción no cuenta para quien la pide. H3b: una solicitud 'fallida' no está viva → se crea otra.
    const idSolicitud = viva ? viva.id_solicitud
      : await repo.insertarSolicitud(client, { idSesion, idCancion: cancion.id_cancion, idDispositivo, fecha: t });
    const voto = await repo.insertarVoto(client, { idSolicitud, idDispositivo, idEstablecimiento: idEst, fecha: t, origen: 'solicitud' });
    sesion.version_cola = await repo.incrementarVersion(client, idSesion);

    const vista = await vistaSolicitud(client, sesion, idSolicitud, idDispositivo);
    return {
      creada: !viva,
      respuesta: {
        resultado: viva ? 'voto_sumado' : 'solicitud_creada',
        solicitud: vista.json,
        voto: votoJson(voto),
        mi_votacion: await miVotacion(client, idDispositivo, idEst),
      },
      analitica: {
        idSolicitud,
        posicionAntes: posicionDe(antes, idSolicitud),
        posicionDespues: vista.posicion,
        totalVotos: vista.totalVotos,
        intervalo: mvAntes.intervalo_canciones,
        activos: conectividad.contarActivos(idEst),
        espera: vista.json.espera_estimada_segundos,
        estadoSolicitud: vista.json.estado,
        porInactividad: mvAntes.puede_votar && !mvNormal.puede_votar,
      },
    };
  }

  /**
   * P1. Orden de comprobaciones (sección 5.1): UUID y formato del video (en la ruta) → sesión →
   * catálogo (fuera de la transacción, puede llamar a YouTube) → transacción.
   * @returns {{status:number, cuerpo:object}}
   */
  async function solicitar({ idSesion, uuid, youtubeVideoId }) {
    const sesion = await obtenerSesionActiva(idSesion);
    const evento = (datos) => emitir({ ...datos, id_establecimiento: sesion.id_establecimiento }); // A1
    let cancion;
    try {
      cancion = await catalogo.validar(youtubeVideoId);
    } catch (err) {
      if (err instanceof ErrorApi && err.codigo === 'cancion_no_permitida') {
        evento({ tipo: 'solicitud_rechazada', sesion_id: idSesion, dispositivo_id: uuid,
          datos_evento: { youtube_video_id: youtubeVideoId, motivo: err.codigo, canciones_restantes: null,
            motivo_catalogo: err.detalle && err.detalle.motivo ? err.detalle.motivo : null } }); // A6
      }
      throw err;
    }
    const idDispositivo = await registrarDispositivo(uuid, idSesion);

    let r;
    try {
      try {
        r = await repo.conTransaccion(pool, (c) => solicitarEnTransaccion(c, sesion, idDispositivo, cancion));
      } catch (err) {
        // Defensa final: el índice único parcial detectó una solicitud viva creada en paralelo.
        // Se repite UNA vez; el segundo intento la encuentra y suma el voto.
        if (err.code !== CODIGO_UNICO_VIOLADO) throw err;
        r = await repo.conTransaccion(pool, (c) => solicitarEnTransaccion(c, sesion, idDispositivo, cancion));
      }
    } catch (err) {
      if (err instanceof ErrorApi && (err.codigo === 'intervalo_no_cumplido' || err.codigo === 'voto_duplicado')) {
        evento({ tipo: 'solicitud_rechazada', sesion_id: idSesion, dispositivo_id: uuid,
          datos_evento: { youtube_video_id: youtubeVideoId, motivo: err.codigo,
            canciones_restantes: err.detalle && err.detalle.canciones_restantes !== undefined ? err.detalle.canciones_restantes : null } });
      }
      throw err;
    }

    // Después del COMMIT: analítica y SSE.
    const a = r.analitica;
    if (r.creada) {
      evento({ tipo: 'solicitud_creada', sesion_id: idSesion, dispositivo_id: uuid,
        datos_evento: { id_solicitud: idTexto('SOL', a.idSolicitud), youtube_video_id: cancion.youtube_video_id,
          duracion_segundos: cancion.duracion_segundos, posicion_inicial: a.posicionDespues, dispositivos_activos: a.activos,
          espera_estimada_segundos: a.espera } }); // A5
    }
    // A2: sumado_a_existente distingue el voto de una solicitud NUEVA del voto sumado a una que ya existía (200).
    evento({ tipo: 'voto_registrado', sesion_id: idSesion, dispositivo_id: uuid,
      datos_evento: { id_solicitud: idTexto('SOL', a.idSolicitud), origen: 'solicitud', total_votos: a.totalVotos,
        posicion_antes: a.posicionAntes, posicion_despues: a.posicionDespues, intervalo_canciones: a.intervalo,
        sumado_a_existente: !r.creada, estado_solicitud: a.estadoSolicitud, por_inactividad: a.porInactividad } });
    avisar(idSesion);
    return { status: r.creada ? 201 : 200, cuerpo: r.respuesta };
  }

  // ------------------------------------------------------------ P2: voto manual

  async function votarEnTransaccion(client, sesionPrevia, idSolicitud, idDispositivo) {
    const idSesion = sesionPrevia.id_sesion;
    const idEst = sesionPrevia.id_establecimiento;
    const sesion = verificarSesion(await repo.bloquearEstablecimientoYSesion(client, idEst, idSesion));
    const t = ahora();
    // 4.2 La solicitud es de esta sesión y está pendiente
    const solicitud = idSolicitud === null ? null : await repo.obtenerSolicitud(client, idSesion, idSolicitud);
    if (!solicitud) throw new ErrorApi(404, 'solicitud_inexistente', 'La solicitud no existe en esta sesión.');
    // H3c (decisión de cierre del E4): se puede votar una solicitud pendiente O la que está sonando, igual que pedir una
    // canción que suena ya suma voto (decisión 1B). Así las dos vías son coherentes y no hay un 409 por perder la
    // carrera contra el inicio de la canción. Terminada (reproducida) o fallida: ya no se puede votar.
    if (solicitud.estado !== 'pendiente' && solicitud.estado !== 'en_reproduccion') {
      throw new ErrorApi(409, 'solicitud_no_votable', 'Esta canción ya no se puede votar.');
    }
    // 4.3 Voto duplicado (incluye votar la solicitud propia, caso A9)
    if (await repo.existeVoto(client, idSolicitud, idDispositivo)) {
      throw new ErrorApi(409, 'voto_duplicado', 'Este dispositivo ya votó por esta solicitud.',
        { id_solicitud: idTexto('SOL', idSolicitud) });
    }
    // 4.4 Intervalo
    const mvAntes = await miVotacion(client, idDispositivo, idEst);
    if (!mvAntes.puede_votar) throw errorIntervalo(mvAntes, 'Aún no puedes votar de nuevo.');

    const antes = await repo.leerColaPendiente(client, idSesion);
    const voto = await repo.insertarVoto(client, { idSolicitud, idDispositivo, idEstablecimiento: idEst, fecha: t, origen: 'manual' });
    sesion.version_cola = await repo.incrementarVersion(client, idSesion);
    const vista = await vistaSolicitud(client, sesion, idSolicitud, idDispositivo);
    return {
      respuesta: { voto: votoJson(voto), solicitud: vista.json, mi_votacion: await miVotacion(client, idDispositivo, idEst) },
      analitica: { posicionAntes: posicionDe(antes, idSolicitud), posicionDespues: vista.posicion,
        totalVotos: vista.totalVotos, intervalo: mvAntes.intervalo_canciones, estadoSolicitud: vista.json.estado },
    };
  }

  /** P2. `idSolicitud` es el número ya extraído de "SOL-n" (null si el texto no tenía ese formato). */
  async function votar({ idSesion, idSolicitud, uuid }) {
    const sesion = await obtenerSesionActiva(idSesion);
    const evento = (datos) => emitir({ ...datos, id_establecimiento: sesion.id_establecimiento }); // A1
    const idDispositivo = await registrarDispositivo(uuid, idSesion);
    let r;
    try {
      r = await repo.conTransaccion(pool, (c) => votarEnTransaccion(c, sesion, idSolicitud, idDispositivo));
    } catch (err) {
      if (err instanceof ErrorApi && err.status === 409) {
        evento({ tipo: 'voto_rechazado', sesion_id: idSesion, dispositivo_id: uuid,
          datos_evento: { id_solicitud: idTexto('SOL', idSolicitud), motivo: err.codigo,
            canciones_restantes: err.detalle && err.detalle.canciones_restantes !== undefined ? err.detalle.canciones_restantes : null } });
      }
      throw err;
    }
    const a = r.analitica;
    evento({ tipo: 'voto_registrado', sesion_id: idSesion, dispositivo_id: uuid,
      datos_evento: { id_solicitud: idTexto('SOL', idSolicitud), origen: 'manual', total_votos: a.totalVotos,
        posicion_antes: a.posicionAntes, posicion_despues: a.posicionDespues, intervalo_canciones: a.intervalo,
        sumado_a_existente: false, estado_solicitud: a.estadoSolicitud, por_inactividad: false } });
    avisar(idSesion);
    return { status: 201, cuerpo: r.respuesta };
  }

  return {
    obtenerSesionActiva, verificarSesion, registrarDispositivo,
    estadoBase, personalizar, estadoCola,
    solicitar, votar,
    reproduccionActualJson,
  };
}

module.exports = { crearCola };
