'use strict';
/**
 * Flujo SSE de la cola (contrato C2): GET /api/sesiones/:idSesion/cola/flujo.
 * Cada mensaje `event: estado` trae el estado COMPLETO de la cola, personalizado por conexión.
 * El servidor ignora Last-Event-ID: al (re)conectar envía el estado actual.
 * Los envíos de una sesión van en cola (promesa encadenada) para que cada conexión reciba las
 * versiones en orden.
 */
const repo = require('./db/repositorio');

const RETRY_MS = 3000;

/**
 * @param {{pool:object, cola:object, conectividad:object, ahora:()=>number, pingMs?:number,
 *          programarIntervalo?:(fn:Function, ms:number)=>any, cancelarIntervalo?:(h:any)=>void}} deps
 *   `programarIntervalo` se inyecta en las pruebas (ping sin temporizadores reales).
 */
function crearFlujo({
  pool, cola, conectividad, ahora,
  pingMs = 10_000,
  programarIntervalo = (fn, ms) => setInterval(fn, ms),
  cancelarIntervalo = (h) => clearInterval(h),
}) {
  const conexiones = new Map(); // idSesion -> Set(conexion)
  const pendientes = new Map(); // idSesion -> Promise (envíos en orden)
  const escrituras = new Set(); // registros de conexión/desconexión en curso (no bloquean el flujo)
  const esperasConexiones = []; // { n, resolve }: quien espera a que queden exactamente n conexiones

  /** Guarda ultima_conexion / ultima_desconexion sin bloquear; un fallo solo se registra. */
  let apagado = false;
  function registrar(promesa) {
    const p = promesa.catch((err) => console.error('[flujo] no se pudo registrar la conexión:', err.message));
    escrituras.add(p);
    p.finally(() => escrituras.delete(p));
  }

  const escribir = (con, texto) => {
    if (con.res.writableEnded || con.res.destroyed) return;
    con.res.write(texto);
  };

  function mensajeEstado(estado) {
    return `id: ${estado.version}\nevent: estado\ndata: ${JSON.stringify(estado)}\n\n`;
  }

  /** Por qué una sesión ya no admite participación (null = sigue vigente). Mismos motivos que los códigos 404/410. */
  const motivoCierre = (sesion, { ignorarQrInactivo = false } = {}) => {
    if (!sesion) return 'sesion_inexistente';
    if (sesion.estado !== 'activa') return 'sesion_cerrada';
    if (!ignorarQrInactivo && sesion.qr_estado !== 'activo') return 'qr_desactivado';
    return null;
  };

  /**
   * Avisa a las conexiones de que la sesión terminó (`event: sesion_cerrada`) y cierra el flujo. Así Android no tiene
   * que esperar a su siguiente operación para enterarse. Es un tipo de evento NUEVO y aditivo: quien solo entiende
   * `estado` lo ignora.
   */
  function avisarCierre(idSesion, lista, motivo) {
    const datosBase = { sesion_id: idSesion, motivo };
    for (const con of lista) {
      const carga = con.proyectarEvento ? con.proyectarEvento('sesion_cerrada', datosBase) : datosBase;
      if (carga !== null && carga !== undefined) {
        escribir(con, `event: sesion_cerrada\ndata: ${JSON.stringify(carga)}\n\n`);
      }
      if (!con.res.writableEnded) con.res.end();
    }
  }

  /** Comprueba en la base las sesiones con conexiones abiertas y cierra el flujo de las que ya no están vigentes. */
  async function verificarSesiones() {
    for (const idSesion of [...conexiones.keys()]) {
      try {
        const sesion = await repo.obtenerSesion(pool, idSesion);
        for (const con of [...(conexiones.get(idSesion) || [])]) {
          const motivo = motivoCierre(sesion, { ignorarQrInactivo: con.ignorarQrInactivo });
          if (motivo) avisarCierre(idSesion, [con], motivo);
        }
      } catch (err) {
        console.error(`[flujo] no se pudo verificar la sesión ${idSesion}:`, err.message);
      }
    }
  }

  /** Encola un envío para la sesión: `destinatarios()` se evalúa al momento de enviar. */
  function encolar(idSesion, destinatarios) {
    const previa = pendientes.get(idSesion) || Promise.resolve();
    const siguiente = previa.then(async () => {
      const lista = destinatarios();
      if (lista.length === 0) return;
      const sesion = await repo.obtenerSesion(pool, idSesion);
      const activas = [];
      for (const con of lista) {
        const cierre = motivoCierre(sesion, { ignorarQrInactivo: con.ignorarQrInactivo });
        if (cierre) avisarCierre(idSesion, [con], cierre);
        else activas.push(con);
      }
      if (activas.length === 0) return;
      const necesitaBase = activas.some((c) => !c.proyectarEvento);
      const base = necesitaBase ? await cola.estadoBase(pool, sesion) : null;
      for (const con of activas) {
        if (con.res.writableEnded || con.res.destroyed) continue;
        if (con.proyectarEvento) {
          const carga = await con.proyectarEvento('estado', null, { sesion });
          if (carga !== null && carga !== undefined) {
            escribir(con, `event: estado\ndata: ${JSON.stringify(carga)}\n\n`);
          }
        } else {
          escribir(con, mensajeEstado(await cola.personalizar(pool, base, con.idDispositivo)));
        }
      }
    }).catch((err) => console.error(`[flujo] no se pudo enviar el estado de ${idSesion}:`, err.message));
    pendientes.set(idSesion, siguiente);
    siguiente.finally(() => { if (pendientes.get(idSesion) === siguiente) pendientes.delete(idSesion); });
    return siguiente;
  }

  /** Envía el estado actual a todas las conexiones de la sesión. */
  function notificarSesion(idSesion) {
    return encolar(idSesion, () => [...(conexiones.get(idSesion) || [])]);
  }

  /** Cambio de rango de dispositivos activos: reenvía a todas las sesiones con conexiones del establecimiento. */
  function notificarEstablecimiento(idEst) {
    const envios = [];
    for (const [idSesion, set] of conexiones) {
      const alguna = set.values().next().value;
      if (alguna && alguna.idEstablecimiento === idEst) envios.push(notificarSesion(idSesion));
    }
    return Promise.all(envios);
  }

  /**
   * Emite un evento SSE aditivo e independiente de la cola (p. ej. `reproductor` en pausa/reanudación)
   * a las conexiones abiertas de `idSesion`, sin incrementar `version_cola`.
   */
  function notificarEvento(idSesion, nombreEvento, datos = {}) {
    const lista = [...(conexiones.get(idSesion) || [])];
    if (lista.length === 0) return;
    const cargaBase = { sesion_id: idSesion, ...datos };
    for (const con of lista) {
      const carga = con.proyectarEvento ? con.proyectarEvento(nombreEvento, cargaBase) : cargaBase;
      if (carga === null || carga === undefined) continue;
      escribir(con, `event: ${nombreEvento}\ndata: ${JSON.stringify(carga)}\n\n`);
    }
  }

  /**
   * Abre el flujo. La sesión y el UUID ya se validaron (errores como JSON normal antes de llegar aquí).
   * Solo las conexiones con X-Dispositivo-Id cuentan como dispositivo activo.
   */
  function abrir(req, res, { sesion, uuid, idDispositivo, ignorarQrInactivo = false, proyectarEvento = null, tipo = null }) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write(`retry: ${RETRY_MS}\n\n`);
    const con = {
      res,
      uuid,
      idDispositivo,
      idSesion: sesion.id_sesion,
      idEstablecimiento: sesion.id_establecimiento,
      ignorarQrInactivo: Boolean(ignorarQrInactivo),
      proyectarEvento: typeof proyectarEvento === 'function' ? proyectarEvento : null,
      tipo: tipo || null,
    };
    if (!conexiones.has(con.idSesion)) conexiones.set(con.idSesion, new Set());
    conexiones.get(con.idSesion).add(con);
    if (uuid) {
      conectividad.conectar(con.idSesion, uuid, idDispositivo);
      if (!apagado) registrar(repo.registrarConexion(pool, idDispositivo, con.idSesion, ahora()));
    }
    // Estado inicial inmediato (en la misma cola que los avisos, para respetar el orden de versiones).
    encolar(con.idSesion, () => [con]);
    if (con.tipo === 'pantalla_publica' && !apagado) {
      const n = contarConexionesTipo(con.idSesion, 'pantalla_publica');
      notificarEvento(con.idSesion, 'display_estado', { sse_conectada: n > 0, sse_conexiones: n });
    }

    let cerrada = false;
    const cerrar = () => {
      if (cerrada) return;
      cerrada = true;
      const set = conexiones.get(con.idSesion);
      if (set) {
        set.delete(con);
        if (set.size === 0) conexiones.delete(con.idSesion);
      }
      avisarConexiones();
      if (uuid) {
        conectividad.desconectar(con.idSesion, uuid);
        if (!apagado) registrar(repo.registrarDesconexion(pool, idDispositivo, con.idSesion, ahora()));
      }
      if (con.tipo === 'pantalla_publica' && !apagado) {
        const n = contarConexionesTipo(con.idSesion, 'pantalla_publica');
        notificarEvento(con.idSesion, 'display_estado', { sse_conectada: n > 0, sse_conexiones: n });
      }
    };
    req.on('close', cerrar);
    res.on('close', cerrar);
  }

  /** Comentario `: ping` a todas las conexiones (mantiene viva la conexión en proxies). */
  function ping() {
    const t = ahora();
    const vistos = new Set();
    for (const set of conexiones.values()) {
      for (const con of set) {
        escribir(con, ': ping\n\n');
        if (con.uuid && con.idDispositivo && !apagado) {
          const clave = `${con.idDispositivo}:${con.idSesion}`;
          if (!vistos.has(clave)) {
            vistos.add(clave);
            registrar(repo.registrarActividadDispositivo(pool, con.idDispositivo, con.idSesion, t));
          }
        }
      }
    }
    return verificarSesiones(); // cada ping aprovecha para detectar sesiones cerradas
  }
  const temporizador = programarIntervalo(() => { ping(); }, pingMs);

  /** Se cumple cuando no quedan envíos ni registros de conexión pendientes. */
  async function inactivo() {
    while (pendientes.size > 0 || escrituras.size > 0) await Promise.all([...pendientes.values(), ...escrituras]);
  }

  /** Termina todas las conexiones y el ping (apagado del servidor y pruebas). */
  async function cerrar() {
    cancelarIntervalo(temporizador);
    await inactivo();
    apagado = true; // los cierres que lleguen ahora ya no escriben en la base (puede estar cerrándose)
    for (const set of conexiones.values()) for (const con of set) con.res.end();
    conexiones.clear();
  }

  const totalConexiones = () => [...conexiones.values()].reduce((n, s) => n + s.size, 0);

  const contarConexionesTipo = (idSesion, tipo) => {
    let n = 0;
    for (const con of conexiones.get(idSesion) || []) {
      if (con.tipo === tipo && !con.res.writableEnded && !con.res.destroyed) n++;
    }
    return n;
  };

  function cerrarConexionesTipo(idSesion, tipo) {
    const lista = [...(conexiones.get(idSesion) || [])].filter((c) => c.tipo === tipo);
    for (const con of lista) {
      if (!con.res.writableEnded) con.res.end();
    }
  }

  function avisarConexiones() {
    const total = totalConexiones();
    for (let i = esperasConexiones.length - 1; i >= 0; i--) {
      if (esperasConexiones[i].n === total) esperasConexiones.splice(i, 1)[0].resolve();
    }
  }

  /** Se cumple cuando quedan exactamente `n` conexiones abiertas (el servidor procesó los cierres). */
  function esperarConexiones(n) {
    if (totalConexiones() === n) return Promise.resolve();
    return new Promise((resolve) => esperasConexiones.push({ n, resolve }));
  }

  return {
    abrir, notificarSesion, notificarEstablecimiento, notificarEvento,
    ping, verificarSesiones, cerrar, inactivo, totalConexiones, esperarConexiones,
    contarConexionesTipo, cerrarConexionesTipo,
  };
}

module.exports = { crearFlujo, RETRY_MS };
