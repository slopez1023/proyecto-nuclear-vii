'use strict';
/**
 * Gestión de sesiones musicales, códigos QR, horarios, pausa manual y mantenimiento (HU-24+).
 * Reutiliza las tablas `sesion` y `solicitud` del E3/E4 y notifica cambios por `flujo.notificarSesion`.
 */
const crypto = require('node:crypto');
const QRCode = require('qrcode');
const repo4 = require('../db/repositorio');
const repo5 = require('./repositorio-e5');
const { TOKEN_REGEX } = require('../sesiones');
const { evaluarHorario, zonaValida } = require('./horarios');
const { ErrorApi, aMinutos, aHora, fechaValida, texto, booleano, iso } = require('./comun-e5');
const { asignarCodigoNuevo, revocarCodigo } = require('./codigo-acceso');

const ID_SESION_REGEX = /^[A-Za-z0-9_-]{4,40}$/;

function crearSesionesAdmin({ pool, flujo, ahora, emisor, publicBaseUrl = 'http://localhost:3000', generarCodigo }) {
  const registrarAccion = (client, { idEst, usuario, accion, detalle }) =>
    repo5.registrar(client, { idEst, idUsuario: usuario ? usuario.id_usuario : null, accion, detalle, ahora: ahora() });

  const notificar = (idSesion) => {
    if (flujo && typeof flujo.notificarSesion === 'function') flujo.notificarSesion(idSesion);
  };

  async function asegurarEstablecimiento(idEst) {
    const t = ahora();
    await repo5.asegurarConfig(pool, idEst, t);
    return repo5.obtenerConfig(pool, idEst);
  }

  async function resumenHorario(q, idEst, cfg) {
    const horarios = await repo5.leerHorarios(q, idEst);
    const excepciones = await repo5.leerExcepciones(q, idEst);
    const evalActual = evaluarHorario({ horarios, excepciones }, ahora(), cfg.zona_horaria || 'America/Bogota');
    return {
      horarios: horarios.map((h) => ({
        dia_semana: h.dia_semana,
        apertura: aHora(h.apertura_min),
        cierre: aHora(h.cierre_min),
        activo: h.activo,
      })),
      excepciones: excepciones.map((e) => ({
        id_excepcion: e.id_excepcion,
        fecha: e.fecha,
        cerrado: e.cerrado,
        apertura: aHora(e.apertura_min),
        cierre: aHora(e.cierre_min),
        motivo: e.motivo,
      })),
      evaluacion_actual: evalActual,
    };
  }

  async function listarSesiones(idEst) {
    await asegurarEstablecimiento(idEst);
    const filas = await repo5.listarSesiones(pool, idEst);
    const base = publicBaseUrl.replace(/\/+$/, '');
    return filas.map((s) => ({
      id_sesion: s.id_sesion,
      id_establecimiento: s.id_establecimiento,
      qr_token: s.qr_token,
      qr_url: `${base}/s/${s.qr_token}`,
      estado: s.estado,
      qr_estado: s.qr_estado,
      desactivado_permanente: Boolean(s.desactivado_permanente),
      codigo_acceso: s.codigo_acceso || null,
      version_cola: s.version_cola,
      pendientes: s.pendientes,
      solicitudes_historicas: s.solicitudes_historicas,
      jornada_actual: s.id_jornada ? { id_jornada: s.id_jornada, abierta_en: iso(s.abierta_en), origen_apertura: s.origen_apertura } : null,
    }));
  }

  async function crearSesionTx(client, {
    idEst, idSesion, qrToken, usuario = null,
    activar = false, pausaManual = false, origen = 'manual', principal = false, t = ahora(),
  }) {
    await repo5.asegurarConfig(client, idEst, t);
    if (await repo5.obtenerSesionCompleta(client, idSesion)) {
      throw new ErrorApi(409, 'sesion_duplicada', 'Ya existe una sesión con ese identificador.');
    }
    if (await repo5.existeQrToken(client, qrToken)) {
      throw new ErrorApi(409, 'qr_duplicado', 'Ese código QR ya fue utilizado. Todos los códigos QR deben ser diferentes.');
    }
    await repo5.insertarSesion(client, { idSesion, idEst, qrToken });
    await asignarCodigoNuevo(client, { idSesion, t, generar: generarCodigo });
    await repo5.asegurarEstadoReproduccion(client, idSesion, t);
    await registrarAccion(client, {
      idEst, usuario, accion: 'sesion_creada',
      detalle: { id_sesion: idSesion, qr_token: qrToken, origen },
    });
    let qrEstado = 'inactivo';
    let idJornada = null;
    if (activar) {
      qrEstado = pausaManual ? 'inactivo' : 'activo';
      await repo5.fijarEstadoSesion(client, idSesion, { estado: 'activa', qrEstado });
      idJornada = await repo5.abrirJornada(client, idSesion, origen, t);
      await registrarAccion(client, {
        idEst, usuario, accion: 'sesion_iniciada',
        detalle: { id_sesion: idSesion, origen, qr_estado: qrEstado },
      });
    }
    if (principal) {
      await repo5.actualizarConfig(client, idEst, { id_sesion_principal: idSesion }, t);
    }
    return { qrEstado, idJornada };
  }

  async function crearSesion(idEst, body, usuario) {
    const b = body && typeof body === 'object' ? body : {};
    const idSesion = b.id_sesion ? texto(b.id_sesion, 'id_sesion', { max: 40 }) : `SES-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    if (!ID_SESION_REGEX.test(idSesion)) {
      throw new ErrorApi(400, 'id_sesion_invalido', 'id_sesion debe tener 4-40 caracteres alfanuméricos, guion o guion bajo.');
    }
    const qrToken = b.qr_token ? texto(b.qr_token, 'qr_token', { max: 64 }) : `ponga-${crypto.randomBytes(6).toString('base64url')}`;
    if (!TOKEN_REGEX.test(qrToken)) {
      throw new ErrorApi(400, 'token_invalido', 'qr_token debe tener 8-64 caracteres A-Za-z0-9_-.');
    }
    const t = ahora();
    await repo4.conTransaccion(pool, async (client) => {
      await crearSesionTx(client, {
        idEst, idSesion, qrToken, usuario,
        activar: false, origen: 'manual', principal: b.principal === true, t,
      });
    });
    emisor.emitir({ tipo: 'sesion_creada', sesion_id: idSesion, id_establecimiento: idEst, usuario, datos_evento: { qr_token: qrToken } });
    return (await listarSesiones(idEst)).find((s) => s.id_sesion === idSesion);
  }

  async function verificarSesionDeEst(client, idEst, idSesion) {
    const s = await repo5.obtenerSesionCompleta(client, idSesion);
    if (!s || s.id_establecimiento !== idEst) throw new ErrorApi(404, 'sesion_inexistente', 'La sesión no existe en este establecimiento.');
    return s;
  }

  /** Abre la sesión (y activa el QR si no hay pausa manual o si se indica). */
  async function activarSesion(idEst, idSesion, usuario, { origen = 'manual', activarQr = true } = {}) {
    const t = ahora();
    const resultado = await repo4.conTransaccion(pool, async (client) => {
      const sesion = await verificarSesionDeEst(client, idEst, idSesion);
      if (await repo5.estaQrDesactivado(client, idSesion)) {
        throw new ErrorApi(409, 'sesion_desactivada_permanente',
          'Esta sesión o su código QR ya fue desactivado y no puede volver a activarse. Crea una nueva sesión con un QR diferente.');
      }
      await repo5.asegurarConfig(client, idEst, t);
      const cfg = await repo5.obtenerConfig(client, idEst, { bloquear: true });
      const qrDeseado = activarQr && !cfg.pausa_manual ? 'activo' : sesion.qr_estado;
      const cambio = sesion.estado !== 'activa' || sesion.qr_estado !== qrDeseado;
      if (cambio) {
        await repo5.fijarEstadoSesion(client, idSesion, { estado: 'activa', qrEstado: qrDeseado });
      }
      await repo5.asegurarEstadoReproduccion(client, idSesion, t);
      const idJornada = await repo5.abrirJornada(client, idSesion, origen, t);
      if (cambio || idJornada) {
        await registrarAccion(client, { idEst, usuario, accion: 'sesion_iniciada', detalle: { id_sesion: idSesion, origen, qr_estado: qrDeseado } });
      }
      return { cambio, qr_estado: qrDeseado, id_jornada: idJornada };
    });
    if (resultado.id_jornada) {
      emisor.emitir({ tipo: 'sesion_iniciada', sesion_id: idSesion, id_establecimiento: idEst, usuario, datos_evento: { origen } });
    }
    if (resultado.cambio) notificar(idSesion);
    return { id_sesion: idSesion, estado: 'activa', qr_estado: resultado.qr_estado };
  }

  /**
   * Desactiva la sesión, cierra el QR, retira solicitudes pendientes (conservar historial) y detiene el estado de reproducción.
   */
  async function desactivarSesion(idEst, idSesion, usuario, { origen = 'manual', motivo = null, limpiarCola = true } = {}) {
    const t = ahora();
    const motivoFinal = motivo || (origen === 'horario' ? 'cierre_programado' : 'cierre_manual');
    const res = await repo4.conTransaccion(pool, async (client) => {
      const sesion = await verificarSesionDeEst(client, idEst, idSesion);
      const enCurso = await repo4.reproduccionEnCurso(client, idSesion, { bloquear: true });
      if (enCurso) {
        await repo4.cerrarReproduccion(client, enCurso.id_reproduccion, {
          fin: t, resultado: 'fallida', segundos: Math.max(0, Math.floor((t - enCurso.inicio_en) / 1000)), codigoError: 'sesion_cerrada',
        });
        if (enCurso.id_solicitud) await repo4.cambiarEstadoSolicitud(client, enCurso.id_solicitud, 'saltada');
      }
      const retiradas = limpiarCola ? await repo5.retirarPendientes(client, idSesion) : [];
      const cambio = sesion.estado !== 'cerrada' || sesion.qr_estado !== 'inactivo';
      await repo5.fijarEstadoSesion(client, idSesion, { estado: 'cerrada', qrEstado: 'inactivo' });
      await repo5.asegurarEstadoReproduccion(client, idSesion, t);
      await repo5.actualizarEstadoReproduccion(client, idSesion, {
        estado: 'detenida', pausada_en: null, lista_cancion: null, lista_inicio_en: null,
        tiempo_pausado_ms: 0, reproduccion_uid: null,
      }, t);
      await repo5.cerrarJornada(client, idSesion, origen, t, retiradas.length, motivoFinal);
      // F8.2 Opción A: todo cierre (manual o programado) invalida de forma permanente el QR y el código de 6 dígitos.
      await repo5.marcarQrDesactivado(client, { idSesion, qrToken: sesion.qr_token, motivo: 'sesion_cerrada', ahora: t });
      await revocarCodigo(client, { idSesion, motivo: 'sesion_cerrada', t });
      await repo5.marcarJornadasProgramadasCerradasPorSesion(
        client,
        idSesion,
        origen === 'horario' ? 'cerrada_auto' : 'cerrada_manual',
        t,
        motivoFinal,
      );
      if (cambio || retiradas.length > 0) {
        await registrarAccion(client, {
          idEst, usuario, accion: 'sesion_cerrada',
          detalle: { id_sesion: idSesion, origen, motivo: motivoFinal, solicitudes_retiradas: retiradas.length }
        });
      }
      return { cambio, retiradas: retiradas.length };
    });
    if (res.cambio) {
      emisor.emitir({
        tipo: 'sesion_cerrada', sesion_id: idSesion, id_establecimiento: idEst, usuario,
        datos_evento: { origen, motivo: motivoFinal, solicitudes_retiradas: res.retiradas }
      });
      notificar(idSesion);
    }
    return { id_sesion: idSesion, estado: 'cerrada', qr_estado: 'inactivo', solicitudes_retiradas: res.retiradas };
  }

  async function cambiarEstadoQr(idEst, idSesion, activo, usuario, { origen = 'manual' } = {}) {
    booleano(activo, 'activo');
    const t = ahora();
    const res = await repo4.conTransaccion(pool, async (client) => {
      const sesion = await verificarSesionDeEst(client, idEst, idSesion);
      if (activo && await repo5.estaQrDesactivado(client, idSesion)) {
        throw new ErrorApi(409, 'qr_desactivado_permanente',
          'Este código QR ya fue desactivado y no puede volver a activarse. Crea una nueva sesión con un QR diferente.');
      }
      if (activo && sesion.estado !== 'activa') {
        throw new ErrorApi(409, 'sesion_cerrada', 'Activa la sesión musical antes de habilitar el código QR.');
      }
      const nuevo = activo ? 'activo' : 'inactivo';
      const cambio = sesion.qr_estado !== nuevo;
      if (cambio) {
        await repo5.fijarEstadoSesion(client, idSesion, { qrEstado: nuevo });
        await registrarAccion(client, {
          idEst, usuario, accion: activo ? 'qr_activado' : 'qr_desactivado',
          detalle: { id_sesion: idSesion, origen }
        });
      }
      if (!activo && origen !== 'horario') {
        await repo5.marcarQrDesactivado(client, { idSesion, qrToken: sesion.qr_token, motivo: 'qr_desactivado', ahora: t });
        await revocarCodigo(client, { idSesion, motivo: 'qr_desactivado', t });
      }
      return { cambio, qr_estado: nuevo };
    });
    if (res.cambio) {
      emisor.emitir({
        tipo: activo ? 'qr_activado' : 'qr_desactivado', sesion_id: idSesion, id_establecimiento: idEst, usuario,
        datos_evento: { origen }
      });
      notificar(idSesion);
    }
    return { id_sesion: idSesion, qr_estado: res.qr_estado };
  }

  /** Mantenimiento explícito: retira solicitudes pendientes y limpia estado temporal SIN borrar historial. */
  async function limpiarCola(idEst, idSesion, usuario, { reiniciarLista = false } = {}) {
    const t = ahora();
    const res = await repo4.conTransaccion(pool, async (client) => {
      await verificarSesionDeEst(client, idEst, idSesion);
      const retiradas = await repo5.retirarPendientes(client, idSesion);
      await repo5.fijarEstadoSesion(client, idSesion, {}); // sube version_cola para avisar por SSE
      await repo5.asegurarEstadoReproduccion(client, idSesion, t);
      if (reiniciarLista) {
        await repo5.actualizarEstadoReproduccion(client, idSesion, { lista_posicion: null, lista_cancion: null, lista_inicio_en: null }, t);
      }
      await registrarAccion(client, {
        idEst, usuario, accion: 'mantenimiento_cola',
        detalle: { id_sesion: idSesion, solicitudes_retiradas: retiradas.length, reiniciar_lista: reiniciarLista }
      });
      return { retiradas: retiradas.length };
    });
    emisor.emitir({
      tipo: 'mantenimiento_realizado', sesion_id: idSesion, id_establecimiento: idEst, usuario,
      datos_evento: { solicitudes_retiradas: res.retiradas, reiniciar_lista: reiniciarLista }
    });
    notificar(idSesion);
    return { id_sesion: idSesion, solicitudes_retiradas: res.retiradas, historial_conservado: true };
  }

  async function obtenerMantenimiento(idEst, idSesion) {
    await verificarSesionDeEst(pool, idEst, idSesion);
    return {
      resumen_solicitudes: await repo5.resumenSolicitudes(pool, idSesion),
      jornadas: (await repo5.listarJornadas(pool, idSesion)).map((j) => ({
        ...j, abierta_en: iso(j.abierta_en), cerrada_en: iso(j.cerrada_en),
      })),
    };
  }

  async function guardarHorarios(idEst, body, usuario) {
    const b = body && typeof body === 'object' ? body : {};
    const dias = Array.isArray(b.horarios) ? b.horarios : null;
    if (!dias) throw new ErrorApi(400, 'dato_invalido', 'horarios debe ser un arreglo.');
    if (b.zona_horaria !== undefined && !zonaValida(b.zona_horaria)) {
      throw new ErrorApi(400, 'zona_invalida', 'Zona horaria IANA no válida.');
    }
    const normalizados = dias.map((h) => {
      if (!h || !Number.isInteger(h.dia_semana) || h.dia_semana < 0 || h.dia_semana > 6) {
        throw new ErrorApi(400, 'dia_invalido', 'dia_semana debe ser un entero entre 0 (domingo) y 6 (sábado).');
      }
      const activo = booleano(h.activo, 'activo');
      const apertura = aMinutos(h.apertura, 'apertura');
      const cierre = aMinutos(h.cierre, 'cierre');
      if (apertura === cierre) throw new ErrorApi(400, 'hora_invalida', 'La apertura y el cierre no pueden ser iguales.');
      return { dia: h.dia_semana, apertura, cierre, activo };
    });
    const t = ahora();
    await repo4.conTransaccion(pool, async (client) => {
      await repo5.asegurarConfig(client, idEst, t);
      if (b.zona_horaria !== undefined) await repo5.actualizarConfig(client, idEst, { zona_horaria: b.zona_horaria }, t);
      for (const h of normalizados) await repo5.guardarHorario(client, idEst, h, t);
      await registrarAccion(client, { idEst, usuario, accion: 'horario_actualizado', detalle: { dias: normalizados.length } });
    });
    emisor.emitir({ tipo: 'horario_actualizado', id_establecimiento: idEst, usuario, datos_evento: { dias: normalizados.length } });
    const cfg = await asegurarEstablecimiento(idEst);
    return resumenHorario(pool, idEst, cfg);
  }

  async function guardarExcepcion(idEst, body, usuario) {
    const b = body && typeof body === 'object' ? body : {};
    if (!fechaValida(b.fecha)) throw new ErrorApi(400, 'fecha_invalida', 'fecha debe tener formato YYYY-MM-DD válido.');
    const cerrado = booleano(b.cerrado, 'cerrado');
    const apertura = cerrado ? null : aMinutos(b.apertura, 'apertura');
    const cierre = cerrado ? null : aMinutos(b.cierre, 'cierre');
    if (!cerrado && apertura === cierre) throw new ErrorApi(400, 'hora_invalida', 'La apertura y el cierre no pueden ser iguales.');
    const motivo = texto(b.motivo, 'motivo', { max: 200, obligatorio: false });
    const t = ahora();
    const idExcepcion = await repo4.conTransaccion(pool, async (client) => {
      const id = await repo5.guardarExcepcion(client, idEst, { fecha: b.fecha, cerrado, apertura, cierre, motivo }, t);
      await registrarAccion(client, { idEst, usuario, accion: 'horario_excepcion_actualizada', detalle: { fecha: b.fecha, cerrado } });
      return id;
    });
    emisor.emitir({ tipo: 'horario_excepcion_actualizada', id_establecimiento: idEst, usuario, datos_evento: { fecha: b.fecha, cerrado } });
    return { id_excepcion: idExcepcion, fecha: b.fecha, cerrado, apertura: aHora(apertura), cierre: aHora(cierre), motivo };
  }

  async function eliminarExcepcion(idEst, idExcepcion, usuario) {
    const eliminada = await repo5.eliminarExcepcion(pool, idEst, idExcepcion);
    if (!eliminada) throw new ErrorApi(404, 'excepcion_inexistente', 'La excepción no existe.');
    await repo5.registrar(pool, {
      idEst, idUsuario: usuario.id_usuario, accion: 'horario_excepcion_eliminada',
      detalle: { fecha: eliminada.fecha }, ahora: ahora()
    });
    return { eliminada: true, fecha: eliminada.fecha };
  }

  /** Pausa manual: desactiva el QR de la sesión principal (o todas las activas) sin cerrar el horario. */
  async function fijarPausaManual(idEst, pausada, motivo, usuario) {
    booleano(pausada, 'pausada');
    const motivoLimpio = texto(motivo, 'motivo', { max: 200, obligatorio: false });
    const t = ahora();
    const afectadas = [];
    await repo4.conTransaccion(pool, async (client) => {
      await repo5.asegurarConfig(client, idEst, t);
      await repo5.actualizarConfig(client, idEst, { pausa_manual: pausada, pausa_motivo: pausada ? motivoLimpio : null }, t);
      const sesiones = await repo5.listarSesiones(client, idEst);
      for (const s of sesiones) {
        if (s.estado === 'activa') {
          const qrDeseado = pausada ? 'inactivo' : 'activo';
          if (s.qr_estado !== qrDeseado) {
            await repo5.fijarEstadoSesion(client, s.id_sesion, { qrEstado: qrDeseado });
            afectadas.push(s.id_sesion);
          }
        }
      }
      await registrarAccion(client, {
        idEst, usuario, accion: pausada ? 'pausa_manual_iniciada' : 'pausa_manual_finalizada',
        detalle: { motivo: motivoLimpio, sesiones: afectadas }
      });
    });
    emisor.emitir({
      tipo: pausada ? 'pausa_manual_iniciada' : 'pausa_manual_finalizada', id_establecimiento: idEst, usuario,
      datos_evento: { motivo: motivoLimpio, sesiones: afectadas }
    });
    afectadas.forEach(notificar);
    return { pausa_manual: pausada, pausa_motivo: pausada ? motivoLimpio : null, sesiones_actualizadas: afectadas };
  }

  async function configurarAutomatico(idEst, body, usuario) {
    const b = body && typeof body === 'object' ? body : {};
    const cambios = {};
    if (b.modo_automatico !== undefined) cambios.modo_automatico = booleano(b.modo_automatico, 'modo_automatico');
    if (b.id_sesion_principal !== undefined) {
      if (b.id_sesion_principal !== null) await verificarSesionDeEst(pool, idEst, b.id_sesion_principal);
      cambios.id_sesion_principal = b.id_sesion_principal;
    }
    const t = ahora();
    await repo4.conTransaccion(pool, async (client) => {
      await repo5.asegurarConfig(client, idEst, t);
      await repo5.actualizarConfig(client, idEst, cambios, t);
      await registrarAccion(client, { idEst, usuario, accion: 'modo_automatico_actualizado', detalle: cambios });
    });
    emisor.emitir({ tipo: 'modo_automatico_actualizado', id_establecimiento: idEst, usuario, datos_evento: cambios });
    return asegurarEstablecimiento(idEst);
  }

  /**
   * F8.1 + Política de sesiones manuales:
   * - Idempotente por `(id_establecimiento, fecha_jornada)` + advisory lock.
   * - Si ya hay una sesión manual activa al llegar la apertura, registra `omitida_sesion_manual`
   *   sin crear segunda sesión ni vincular la manual ni cerrarla automáticamente después.
   * - Si no hay sesión activa y la jornada aún no ha sido procesada, crea y activa una nueva sesión
   *   con su QR y código de 6 dígitos mediante `crearSesionTx`.
   */
  async function procesarAperturaProgramada(idEst, evalHorario) {
    if (!evalHorario || !evalHorario.abierto || !evalHorario.fecha_jornada) {
      return { accion: 'fuera_de_horario' };
    }
    const t = ahora();
    const res = await repo4.conTransaccion(pool, async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext('f8_auto_' || $1))", [idEst]);
      await repo5.asegurarConfig(client, idEst, t);
      const cfg = await repo5.obtenerConfig(client, idEst, { bloquear: true });
      if (!cfg.modo_automatico) return { accion: 'modo_manual' };

      const jp = await repo5.obtenerJornadaProgramada(client, idEst, evalHorario.fecha_jornada);
      if (jp) {
        if (jp.estado === 'abierta' && jp.id_sesion) {
          const sesion = await repo5.obtenerSesionCompleta(client, jp.id_sesion);
          if (sesion && sesion.estado === 'activa') {
            const qrDeseado = cfg.pausa_manual ? 'inactivo' : 'activo';
            if (sesion.qr_estado !== qrDeseado && !(await repo5.estaQrDesactivado(client, sesion.id_sesion))) {
              await repo5.fijarEstadoSesion(client, sesion.id_sesion, { qrEstado: qrDeseado });
              return { accion: 'qr_sincronizado', id_sesion: sesion.id_sesion, notificarId: sesion.id_sesion };
            }
            return { accion: 'ya_activa', id_sesion: sesion.id_sesion };
          }
          await repo5.actualizarEstadoJornadaProgramada(client, {
            idEstablecimiento: idEst,
            fechaJornada: evalHorario.fecha_jornada,
            estado: 'cerrada_manual',
            ahora: t,
            motivo: 'cerrada_antes_de_cierre_programado',
          });
          return { accion: 'ya_cerrada_manual', id_sesion: jp.id_sesion };
        }
        return { accion: 'ya_procesada', estado: jp.estado };
      }

      const activas = await repo5.sesionesActivasDeEstablecimiento(client, idEst);
      if (activas.length > 0) {
        await repo5.registrarJornadaProgramada(client, {
          idEstablecimiento: idEst,
          fechaJornada: evalHorario.fecha_jornada,
          idSesion: null,
          estado: 'omitida_sesion_manual',
          aperturaProgramadaEn: evalHorario.apertura_programada_en,
          cierreProgramadoEn: evalHorario.cierre_programado_en,
          ahora: t,
          motivo: `sesion_manual_activa:${activas[0].id_sesion}`,
        });
        await registrarAccion(client, {
          idEst,
          usuario: null,
          accion: 'jornada_automatica_omitida',
          detalle: {
            fecha_jornada: evalHorario.fecha_jornada,
            motivo: 'sesion_manual_activa',
            id_sesion_manual: activas[0].id_sesion,
          },
        });
        return { accion: 'omitida_sesion_manual', id_sesion_manual: activas[0].id_sesion };
      }

      const idSesion = `SES-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
      const qrToken = `ponga-${crypto.randomBytes(6).toString('base64url')}`;
      await crearSesionTx(client, {
        idEst,
        idSesion,
        qrToken,
        usuario: null,
        activar: true,
        pausaManual: cfg.pausa_manual,
        origen: 'horario',
        principal: true,
        t,
      });
      await repo5.registrarJornadaProgramada(client, {
        idEstablecimiento: idEst,
        fechaJornada: evalHorario.fecha_jornada,
        idSesion,
        estado: 'abierta',
        aperturaProgramadaEn: evalHorario.apertura_programada_en,
        cierreProgramadoEn: evalHorario.cierre_programado_en,
        ahora: t,
        motivo: 'apertura_programada',
      });
      return { accion: 'creada_automatica', id_sesion: idSesion, qr_token: qrToken, notificarId: idSesion };
    });

    if (res.accion === 'creada_automatica') {
      emisor.emitir({ tipo: 'sesion_creada', sesion_id: res.id_sesion, id_establecimiento: idEst, usuario: null, datos_evento: { qr_token: res.qr_token, origen: 'horario' } });
      emisor.emitir({ tipo: 'sesion_iniciada', sesion_id: res.id_sesion, id_establecimiento: idEst, usuario: null, datos_evento: { origen: 'horario' } });
    }
    if (res.notificarId) notificar(res.notificarId);
    return res;
  }

  /**
   * F8.2 Opción A: cierra únicamente sesiones vinculadas a `e5_jornada_programada`
   * cuya hora de cierre llegó o cuyo horario dejó de estar abierto. Nunca cierra sesiones manuales.
   */
  async function procesarCierreProgramado(idEst, evalHorario) {
    const t = ahora();
    const activasProg = await repo5.jornadasProgramadasPorCerrar(pool, idEst, t);
    const cerradas = [];
    for (const jp of activasProg) {
      const vencioCierre = jp.cierre_programado_en != null && t >= Number(jp.cierre_programado_en);
      const fueraDeJornada = !evalHorario || !evalHorario.abierto || evalHorario.fecha_jornada !== jp.fecha_jornada;
      if (!vencioCierre && !fueraDeJornada) continue;
      await desactivarSesion(idEst, jp.id_sesion, null, {
        origen: 'horario',
        motivo: 'cierre_programado',
        limpiarCola: true,
      });
      cerradas.push(jp.id_sesion);
    }
    return { cerradas };
  }

  async function generarQrPng(idEst, idSesion) {
    const s = await verificarSesionDeEst(pool, idEst, idSesion);
    const base = publicBaseUrl.replace(/\/+$/, '');
    const url = `${base}/s/${s.qr_token}`;
    return { url, png: await QRCode.toBuffer(url, { width: 512, margin: 2, errorCorrectionLevel: 'M' }) };
  }

  return {
    asegurarEstablecimiento, resumenHorario, listarSesiones, crearSesion,
    activarSesion, desactivarSesion, cambiarEstadoQr, limpiarCola, obtenerMantenimiento,
    guardarHorarios, guardarExcepcion, eliminarExcepcion, fijarPausaManual, configurarAutomatico,
    procesarAperturaProgramada, procesarCierreProgramado,
    generarQrPng,
  };
}

module.exports = { crearSesionesAdmin };
