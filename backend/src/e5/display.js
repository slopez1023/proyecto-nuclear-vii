'use strict';
/**
 * Gestión de tokens de Pantalla Pública (e5_display) — FASE 1 y FASE 4.
 * - Genera tokens criptográficamente seguros e independientes del qr_token de clientes.
 * - Garantiza un único display activo por sesión mediante bloqueo transaccional FOR UPDATE + índice único parcial.
 * - Administra autorización efímera (claim_code) y lease exclusivo (control_token) sin exponer secretos.
 */
const crypto = require('node:crypto');
const repo4 = require('../db/repositorio');
const repo5 = require('./repositorio-e5');
const { ErrorApi, iso } = require('./comun-e5');

const DISPLAY_TOKEN_REGEX = /^disp-[A-Za-z0-9_-]{16,64}$/;
const ACCESO_THROTTLE_MS = 60_000;
const CLAIM_TTL_MS = 120_000;
const CLAIM_MAX_INTENTOS = 5;
const LEASE_TTL_MS = 25_000;
const LEASE_LATIDO_S = 10;
const RL_VENTANA_MS = 15 * 60_000;
const RL_MAX_FALLOS = 10;

function sha256Hex(valor) {
  return crypto.createHash('sha256').update(String(valor), 'utf8').digest('hex');
}

function hashIgual(hexA, hexB) {
  if (typeof hexA !== 'string' || typeof hexB !== 'string' || hexA.length !== hexB.length || hexA.length === 0) {
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(hexA, 'hex'), Buffer.from(hexB, 'hex'));
}

function generarDisplayToken() {
  const token = `disp-${crypto.randomBytes(18).toString('base64url')}`;
  if (!DISPLAY_TOKEN_REGEX.test(token)) throw new Error('Error interno al generar display_token.');
  return token;
}

function esFormatoDisplayToken(token) {
  return typeof token === 'string' && DISPLAY_TOKEN_REGEX.test(token);
}

function enmascararDisplayToken(token) {
  const s = String(token || '');
  if (s.length <= 12) return '***';
  return `${s.slice(0, 9)}...${s.slice(-4)}`;
}

function crearDisplayServicio({ pool, flujo = null, ahora = Date.now, emisor = null }) {
  const fallosPorOrigen = new Map();

  function limpiarVentana(clave, t) {
    const lista = fallosPorOrigen.get(clave);
    if (!lista) return [];
    const vigentes = lista.filter((ts) => t - ts < RL_VENTANA_MS);
    if (vigentes.length === 0) fallosPorOrigen.delete(clave);
    else fallosPorOrigen.set(clave, vigentes);
    return vigentes;
  }

  function estaLimitado(clave, t) {
    return limpiarVentana(clave, t).length >= RL_MAX_FALLOS;
  }

  function registrarFalloRl(clave, t) {
    const vigentes = limpiarVentana(clave, t);
    vigentes.push(t);
    fallosPorOrigen.set(clave, vigentes);
  }

  async function bloquearSesionDeEst(client, idEst, idSesion) {
    const { rows } = await client.query(
      'SELECT id_sesion, id_establecimiento, estado, qr_estado FROM sesion WHERE id_sesion = $1 FOR UPDATE',
      [idSesion],
    );
    const s = rows[0];
    if (!s || s.id_establecimiento !== idEst) {
      throw new ErrorApi(404, 'sesion_inexistente', 'La sesión no existe en este establecimiento.');
    }
    return s;
  }

  function registrarAuditoria(client, { idEst, usuario, accion, idSesion, idDisplay, token, t }) {
    return repo5.registrar(client, {
      idEst,
      idUsuario: usuario ? usuario.id_usuario : null,
      accion,
      detalle: {
        id_sesion: idSesion,
        id_display: idDisplay,
        token_enmascarado: enmascararDisplayToken(token),
      },
      ahora: t,
    });
  }

  function notificarEstadoDisplay(idSesion, extra = {}) {
    if (flujo && typeof flujo.notificarEvento === 'function') {
      flujo.notificarEvento(idSesion, 'display_estado', extra);
    }
  }

  /** Devuelve el estado administrativo de pantalla pública separando conexión SSE de propiedad del lease. */
  async function obtenerEstadoDisplay(idEst, idSesion) {
    const sesion = await repo5.obtenerSesionCompleta(pool, idSesion);
    if (!sesion || sesion.id_establecimiento !== idEst) {
      throw new ErrorApi(404, 'sesion_inexistente', 'La sesión no existe en este establecimiento.');
    }
    const t = ahora();
    const d = await repo5.obtenerDisplayActivoPorSesion(pool, idSesion);
    const huboRevocado = d ? false : await repo5.existeDisplayRevocadoEnSesion(pool, idSesion);
    const sseConexiones = flujo && typeof flujo.contarConexionesTipo === 'function'
      ? flujo.contarConexionesTipo(idSesion, 'pantalla_publica')
      : 0;
    const sseConectada = sseConexiones > 0;

    const leaseExpiraMs = d && d.control_expira_en !== null ? Number(d.control_expira_en) : null;
    const claimExpiraMs = d && d.claim_expira_en !== null ? Number(d.claim_expira_en) : null;
    const leaseVigente = Boolean(d && d.control_hash && leaseExpiraMs !== null && leaseExpiraMs > t);
    const claimPendiente = Boolean(d && d.claim_hash && claimExpiraMs !== null && claimExpiraMs > t);

    let estadoControl = 'sin_control';
    if (leaseVigente) estadoControl = 'control_autorizado';
    else if (d && d.control_hash && leaseExpiraMs !== null && leaseExpiraMs <= t) estadoControl = 'control_perdido';
    else if (d && !d.control_hash && d.ultimo_latido_display !== null) estadoControl = 'control_liberado';

    let estadoPantalla = 'pantalla_creada';
    if (sesion.estado !== 'activa') estadoPantalla = 'sesion_cerrada';
    else if (!d) estadoPantalla = huboRevocado ? 'pantalla_revocada' : 'sin_crear';
    else if (estadoControl !== 'sin_control') estadoPantalla = estadoControl;
    else if (sseConectada) estadoPantalla = 'pantalla_conectada';

    return {
      id_sesion: sesion.id_sesion,
      sesion_estado: sesion.estado,
      qr_estado: sesion.qr_estado,
      existe: Boolean(d),
      display_token: d ? d.display_token : null,
      ruta_publica: d ? `/public/${d.display_token}` : null,
      creado_en: d ? iso(d.creado_en) : null,
      ultimo_acceso: d ? iso(d.ultimo_acceso) : null,
      ultimo_latido_display: d ? iso(d.ultimo_latido_display) : null,
      sse_conectada: sseConectada,
      sse_conexiones: sseConexiones,
      lease_vigente: leaseVigente,
      lease_expira_en: leaseVigente ? iso(leaseExpiraMs) : null,
      claim_pendiente: claimPendiente,
      claim_expira_en: claimPendiente ? iso(claimExpiraMs) : null,
      estado_control: estadoControl,
      estado_pantalla: estadoPantalla,
    };
  }

  /** Devuelve el display activo de la sesión o crea uno nuevo de forma segura y concurrente. */
  async function asegurarDisplay(idEst, idSesion, usuario = null) {
    const t = ahora();
    const res = await repo4.conTransaccion(pool, async (client) => {
      await bloquearSesionDeEst(client, idEst, idSesion);
      const existente = await repo5.obtenerDisplayActivoPorSesion(client, idSesion);
      if (existente) return { display: existente, creado: false };

      const displayToken = generarDisplayToken();
      const nuevo = await repo5.insertarDisplay(client, { idEst, idSesion, displayToken, ahora: t });
      await registrarAuditoria(client, {
        idEst, usuario, accion: 'display_creado', idSesion, idDisplay: nuevo.id_display, token: displayToken, t,
      });
      return { display: nuevo, creado: true };
    });

    if (res.creado) {
      if (emisor) {
        emisor.emitir({
          tipo: 'display_creado',
          sesion_id: idSesion,
          id_establecimiento: idEst,
          usuario,
          datos_evento: { id_display: res.display.id_display, token_enmascarado: enmascararDisplayToken(res.display.display_token) },
        });
      }
      notificarEstadoDisplay(idSesion, { evento: 'creado' });
    }
    return res.display;
  }

  /** Revoca el token anterior (si existe) y crea uno nuevo en una única transacción atómica. */
  async function regenerarDisplay(idEst, idSesion, usuario = null) {
    const t = ahora();
    const { anterior, nuevo } = await repo4.conTransaccion(pool, async (client) => {
      await bloquearSesionDeEst(client, idEst, idSesion);
      const revocados = await repo5.revocarDisplaysDeSesion(client, idSesion, t);
      const displayToken = generarDisplayToken();
      const creado = await repo5.insertarDisplay(client, { idEst, idSesion, displayToken, ahora: t });
      await registrarAuditoria(client, {
        idEst, usuario, accion: 'display_regenerado', idSesion, idDisplay: creado.id_display, token: displayToken, t,
      });
      return { anterior: revocados[0] || null, nuevo: creado };
    });

    if (flujo && typeof flujo.cerrarConexionesTipo === 'function') {
      flujo.cerrarConexionesTipo(idSesion, 'pantalla_publica');
    }
    if (emisor) {
      emisor.emitir({
        tipo: 'display_regenerado',
        sesion_id: idSesion,
        id_establecimiento: idEst,
        usuario,
        datos_evento: {
          id_display: nuevo.id_display,
          revocado_id_display: anterior ? anterior.id_display : null,
          token_enmascarado: enmascararDisplayToken(nuevo.display_token),
        },
      });
    }
    notificarEstadoDisplay(idSesion, { evento: 'regenerado' });
    return nuevo;
  }

  /** Revoca el display activo de la sesión sin crear uno nuevo. */
  async function revocarDisplay(idEst, idSesion, usuario = null) {
    const t = ahora();
    const revocado = await repo4.conTransaccion(pool, async (client) => {
      await bloquearSesionDeEst(client, idEst, idSesion);
      const filas = await repo5.revocarDisplaysDeSesion(client, idSesion, t);
      if (filas.length === 0) return null;
      await registrarAuditoria(client, {
        idEst, usuario, accion: 'display_revocado', idSesion, idDisplay: filas[0].id_display, token: filas[0].display_token, t,
      });
      return filas[0];
    });
    if (revocado) {
      if (flujo && typeof flujo.cerrarConexionesTipo === 'function') {
        flujo.cerrarConexionesTipo(idSesion, 'pantalla_publica');
      }
      notificarEstadoDisplay(idSesion, { evento: 'revocado' });
    }
    return { revocado: Boolean(revocado) };
  }

  /** Resuelve un display_token público (solo lectura). Verifica que esté activo y actualiza ultimo_acceso con throttle de 60 s. */
  async function resolverDisplay(displayToken) {
    if (!esFormatoDisplayToken(displayToken)) return null;
    const fila = await repo5.obtenerDisplayPorToken(pool, displayToken);
    if (!fila || !fila.activo) return null;
    const t = ahora();
    if (fila.ultimo_acceso === null || t - fila.ultimo_acceso >= ACCESO_THROTTLE_MS) {
      await repo5.registrarAccesoDisplay(pool, fila.id_display, t);
    }
    return fila;
  }

  async function validarLeaseEnTx(client, displayToken, controlToken, t) {
    if (!esFormatoDisplayToken(displayToken)) {
      throw new ErrorApi(404, 'display_invalido', 'Pantalla pública no disponible.');
    }
    if (typeof controlToken !== 'string' || !controlToken.trim()) {
      throw new ErrorApi(401, 'control_requerido', 'Falta el token de control de la pantalla.');
    }
    const d = await repo5.obtenerDisplayPorToken(client, displayToken, { bloquear: true });
    if (!d || !d.activo) {
      throw new ErrorApi(404, 'display_invalido', 'Pantalla pública no disponible.');
    }
    if (d.sesion_estado !== 'activa') {
      throw new ErrorApi(409, 'sesion_cerrada', 'La sesión está cerrada.');
    }
    const { rows: sndRows } = await client.query(
      'SELECT salida FROM e5_sonido WHERE id_establecimiento = $1',
      [d.id_establecimiento],
    );
    if (!sndRows[0] || sndRows[0].salida !== 'pantalla_publica') {
      throw new ErrorApi(409, 'salida_no_autorizada', 'La salida de audio no está asignada a la pantalla pública.');
    }
    if (!d.control_hash || d.control_expira_en === null || Number(d.control_expira_en) <= t) {
      throw new ErrorApi(401, 'control_expirado', 'La autorización de control expiró o fue liberada.');
    }
    if (!hashIgual(d.control_hash, sha256Hex(controlToken.trim()))) {
      throw new ErrorApi(403, 'control_invalido', 'El control activo pertenece a otra pantalla.');
    }
    return d;
  }

  /** Genera un código efímero de un solo uso para autorizar control de pantalla pública (panel DJ/Admin). */
  async function autorizarControl(idEst, idSesion, usuario = null) {
    const t = ahora();
    const res = await repo4.conTransaccion(pool, async (client) => {
      const sesion = await bloquearSesionDeEst(client, idEst, idSesion);
      if (sesion.estado !== 'activa') {
        throw new ErrorApi(409, 'sesion_cerrada', 'La sesión está cerrada.');
      }
      const d = await repo5.obtenerDisplayActivoPorSesion(client, idSesion, { bloquear: true });
      if (!d) {
        throw new ErrorApi(404, 'display_inexistente', 'No hay pantalla pública activa para esta sesión.');
      }
      const claimCode = crypto.randomBytes(12).toString('base64url');
      const claimHash = sha256Hex(claimCode);
      const expiraEn = t + CLAIM_TTL_MS;
      await client.query(
        'UPDATE e5_display SET claim_hash = $2, claim_expira_en = $3, claim_intentos = 0 WHERE id_display = $1',
        [d.id_display, claimHash, expiraEn],
      );
      await repo5.registrar(client, {
        idEst,
        idUsuario: usuario ? usuario.id_usuario : null,
        accion: 'display_control_autorizado',
        detalle: { id_sesion: idSesion, id_display: d.id_display, expira_en: iso(expiraEn) },
        ahora: t,
      });
      return { idDisplay: d.id_display, claimCode, expiraEn };
    });

    if (emisor) {
      emisor.emitir({
        tipo: 'display_control_autorizado',
        sesion_id: idSesion,
        id_establecimiento: idEst,
        usuario,
        datos_evento: { id_display: res.idDisplay, expira_en: iso(res.expiraEn) },
      });
    }
    notificarEstadoDisplay(idSesion, { evento: 'control_autorizado_pendiente' });
    return {
      claim_code: res.claimCode,
      expira_en: iso(res.expiraEn),
      ttl_segundos: Math.round(CLAIM_TTL_MS / 1000),
    };
  }

  /** Libera explícitamente el control y cualquier código pendiente de la pantalla pública (panel DJ/Admin). */
  async function liberarControl(idEst, idSesion, usuario = null) {
    const t = ahora();
    const fila = await repo4.conTransaccion(pool, async (client) => {
      await bloquearSesionDeEst(client, idEst, idSesion);
      const { rows } = await client.query(
        `UPDATE e5_display
         SET claim_hash = NULL, claim_expira_en = NULL, claim_intentos = 0,
             control_hash = NULL, control_expira_en = NULL
         WHERE id_sesion = $1 AND activo = true
         RETURNING id_display`,
        [idSesion],
      );
      if (!rows[0]) return null;
      await repo5.registrar(client, {
        idEst,
        idUsuario: usuario ? usuario.id_usuario : null,
        accion: 'display_control_liberado',
        detalle: { id_sesion: idSesion, id_display: rows[0].id_display },
        ahora: t,
      });
      return rows[0];
    });

    if (fila && emisor) {
      emisor.emitir({
        tipo: 'display_control_liberado',
        sesion_id: idSesion,
        id_establecimiento: idEst,
        usuario,
        datos_evento: { id_display: fila.id_display },
      });
    }
    if (fila && flujo && typeof flujo.notificarEvento === 'function') {
      flujo.notificarEvento(idSesion, 'control_display', { liberado: true });
      notificarEstadoDisplay(idSesion, { evento: 'control_liberado' });
    }
    return { liberado: Boolean(fila) };
  }

  /** Reclama el lease exclusivo usando un claim_code válido; nunca desplaza a un líder vigente. */
  async function reclamarControl(displayToken, { claimCode, ip = '' } = {}) {
    if (!esFormatoDisplayToken(displayToken)) {
      throw new ErrorApi(404, 'display_invalido', 'Pantalla pública no disponible.');
    }
    const t = ahora();
    const claveRl = `${displayToken}|${ip || 'desconocido'}`;
    if (estaLimitado(claveRl, t)) {
      throw new ErrorApi(429, 'demasiados_intentos', 'Demasiados intentos fallidos. Espera antes de volver a intentar.');
    }
    if (typeof claimCode !== 'string' || !claimCode.trim()) {
      registrarFalloRl(claveRl, t);
      throw new ErrorApi(400, 'claim_requerido', 'Debes ingresar el código de autorización.');
    }
    const claimTrim = claimCode.trim();

    const res = await repo4.conTransaccion(pool, async (client) => {
      const d = await repo5.obtenerDisplayPorToken(client, displayToken, { bloquear: true });
      if (!d || !d.activo) {
        return { ok: false, status: 404, codigo: 'display_invalido', mensaje: 'Pantalla pública no disponible.' };
      }
      if (d.sesion_estado !== 'activa') {
        return { ok: false, status: 409, codigo: 'sesion_cerrada', mensaje: 'La sesión está cerrada.' };
      }
      const { rows: sndRows } = await client.query(
        'SELECT salida FROM e5_sonido WHERE id_establecimiento = $1',
        [d.id_establecimiento],
      );
      if (!sndRows[0] || sndRows[0].salida !== 'pantalla_publica') {
        return { ok: false, status: 409, codigo: 'salida_no_autorizada', mensaje: 'La salida de audio no está asignada a la pantalla pública.' };
      }
      if (d.control_hash && d.control_expira_en !== null && Number(d.control_expira_en) > t) {
        return { ok: false, status: 409, codigo: 'control_en_uso', mensaje: 'Otra pantalla pública ya tiene el control activo.' };
      }
      const claimVigente = Boolean(d.claim_hash && d.claim_expira_en !== null && Number(d.claim_expira_en) > t);
      if (!claimVigente) {
        if (d.claim_hash) {
          await client.query(
            'UPDATE e5_display SET claim_hash = NULL, claim_expira_en = NULL, claim_intentos = 0 WHERE id_display = $1',
            [d.id_display],
          );
        }
        return { ok: false, status: 401, codigo: 'claim_expirado', mensaje: 'El código de autorización no es válido o expiró.', contarRl: true };
      }
      if (!hashIgual(d.claim_hash, sha256Hex(claimTrim))) {
        const intentos = (Number(d.claim_intentos) || 0) + 1;
        if (intentos >= CLAIM_MAX_INTENTOS) {
          await client.query(
            'UPDATE e5_display SET claim_hash = NULL, claim_expira_en = NULL, claim_intentos = $2 WHERE id_display = $1',
            [d.id_display, intentos],
          );
          return { ok: false, status: 429, codigo: 'claim_bloqueado', mensaje: 'Código invalidado por exceso de intentos fallidos.', contarRl: true };
        }
        await client.query('UPDATE e5_display SET claim_intentos = $2 WHERE id_display = $1', [d.id_display, intentos]);
        return { ok: false, status: 401, codigo: 'claim_invalido', mensaje: 'Código de autorización incorrecto.', contarRl: true };
      }

      const controlToken = crypto.randomBytes(24).toString('base64url');
      const controlHash = sha256Hex(controlToken);
      const expiraEn = t + LEASE_TTL_MS;
      await client.query(
        `UPDATE e5_display
         SET claim_hash = NULL, claim_expira_en = NULL, claim_intentos = 0,
             control_hash = $2, control_expira_en = $3, ultimo_latido_display = $4
         WHERE id_display = $1`,
        [d.id_display, controlHash, expiraEn, t],
      );
      await repo5.registrar(client, {
        idEst: d.id_establecimiento,
        idUsuario: null,
        accion: 'display_control_reclamado',
        detalle: {
          id_sesion: d.id_sesion,
          id_display: d.id_display,
          token_enmascarado: enmascararDisplayToken(displayToken),
          expira_en: iso(expiraEn),
        },
        ahora: t,
      });
      return { ok: true, idEst: d.id_establecimiento, idSesion: d.id_sesion, idDisplay: d.id_display, controlToken, expiraEn };
    });

    if (!res.ok) {
      if (res.contarRl) registrarFalloRl(claveRl, t);
      throw new ErrorApi(res.status, res.codigo, res.mensaje);
    }

    if (emisor) {
      emisor.emitir({
        tipo: 'display_control_reclamado',
        sesion_id: res.idSesion,
        id_establecimiento: res.idEst,
        datos_evento: { id_display: res.idDisplay, expira_en: iso(res.expiraEn) },
      });
    }
    notificarEstadoDisplay(res.idSesion, { evento: 'control_reclamado' });
    return {
      control_token: res.controlToken,
      expira_en: iso(res.expiraEn),
      ttl_segundos: Math.round(LEASE_TTL_MS / 1000),
      intervalo_latido_segundos: LEASE_LATIDO_S,
    };
  }

  /** Renueva el lease del navegador líder sin tocar e5_sonido.ultimo_latido. */
  async function latidoControl(displayToken, controlToken) {
    const t = ahora();
    const expiraEn = t + LEASE_TTL_MS;
    await repo4.conTransaccion(pool, async (client) => {
      const d = await validarLeaseEnTx(client, displayToken, controlToken, t);
      await client.query(
        'UPDATE e5_display SET control_expira_en = $2, ultimo_latido_display = $3 WHERE id_display = $1',
        [d.id_display, expiraEn, t],
      );
    });
    return {
      vigente: true,
      salida: 'pantalla_publica',
      expira_en: iso(expiraEn),
      ttl_segundos: Math.round(LEASE_TTL_MS / 1000),
      intervalo_latido_segundos: LEASE_LATIDO_S,
    };
  }

  return {
    obtenerEstadoDisplay,
    asegurarDisplay,
    regenerarDisplay,
    revocarDisplay,
    resolverDisplay,
    autorizarControl,
    liberarControl,
    reclamarControl,
    latidoControl,
    verificarControlEnTx: validarLeaseEnTx,
  };
}

module.exports = {
  DISPLAY_TOKEN_REGEX,
  generarDisplayToken,
  esFormatoDisplayToken,
  enmascararDisplayToken,
  crearDisplayServicio,
};
