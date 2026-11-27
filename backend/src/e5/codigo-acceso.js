'use strict';
/**
 * Códigos numéricos de acceso de 6 dígitos (Fase 7).
 * Resuelven la misma sesión que el código QR sin exponer datos internos ni permitir enumeración.
 */
const crypto = require('node:crypto');
const { ErrorApi } = require('./comun-e5');

const CODIGO_REGEX = /^[0-9]{6}$/;

/** Genera un código criptográficamente seguro de 6 dígitos conservando ceros iniciales. */
function generarCodigoSeguro() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

function hashOrigen(ip) {
  return crypto.createHash('sha256').update(String(ip || 'desconocido')).digest('hex').slice(0, 10);
}

/**
 * Asigna un código único vigente dentro de la misma transacción en que se crea la sesión.
 * Si hay colisión con otro código vigente, reintenta hasta agotar `intentos`.
 */
async function asignarCodigoNuevo(client, { idSesion, t = Date.now(), generar = generarCodigoSeguro, intentos = 12 }) {
  for (let i = 0; i < intentos; i += 1) {
    const candidato = generar();
    if (typeof candidato !== 'string' || !CODIGO_REGEX.test(candidato)) {
      throw new ErrorApi(500, 'error_interno', 'El generador produjo un código de acceso inválido.');
    }
    const { rows } = await client.query(
      `INSERT INTO e5_codigo_acceso (id_sesion, codigo, creado_en)
       VALUES ($1, $2, $3)
       ON CONFLICT (codigo) WHERE vigente DO NOTHING
       RETURNING codigo`,
      [idSesion, candidato, t],
    );
    if (rows[0]) return rows[0].codigo;
  }
  throw new ErrorApi(503, 'codigos_agotados', 'No hay códigos de acceso disponibles; intenta de nuevo.');
}

/** Revoca el código vigente de la sesión (cierre definitivo o desactivación permanente de QR). */
async function revocarCodigo(client, { idSesion, motivo, t = Date.now() }) {
  const { rowCount } = await client.query(
    `UPDATE e5_codigo_acceso
     SET vigente = false, revocado_en = $2, motivo_revocacion = $3
     WHERE id_sesion = $1 AND vigente`,
    [idSesion, t, motivo],
  );
  return rowCount;
}

/**
 * Limitador en memoria contra fuerza bruta para resolución de códigos de 6 dígitos.
 * No bloquea códigos individualmente ni sesiones completas (evita DoS sobre terceros).
 */
function crearLimitadorIntentos({
  ahora = Date.now,
  maxFallosDispositivo = 5,
  maxFallosIp = 20,
  ventanaMs = 15 * 60_000,
  maxPeticionesIpMinuto = 60,
  maxClaves = 10_000,
} = {}) {
  const fallosDisp = new Map();
  const fallosIp = new Map();
  const peticionesIpMin = new Map();
  let seq = 0;

  function podarMapa(mapa, t, ventana) {
    for (const [clave, entradas] of mapa) {
      const vigentes = entradas.filter((e) => t - e.ts < ventana);
      if (vigentes.length === 0) mapa.delete(clave);
      else if (vigentes.length !== entradas.length) mapa.set(clave, vigentes);
    }
  }

  function leerVigentes(mapa, clave, t, ventana) {
    const lista = mapa.get(clave);
    if (!lista) return [];
    const vigentes = lista.filter((e) => t - e.ts < ventana);
    if (vigentes.length === 0) mapa.delete(clave);
    else if (vigentes.length !== lista.length) mapa.set(clave, vigentes);
    return vigentes;
  }

  function empujarEntrada(mapa, clave, entrada, t, ventana) {
    const vigentes = leerVigentes(mapa, clave, t, ventana);
    vigentes.push(entrada);
    if (!mapa.has(clave) && mapa.size >= maxClaves) {
      podarMapa(mapa, t, ventana);
      while (mapa.size >= maxClaves) {
        const masAntigua = mapa.keys().next().value;
        if (masAntigua === undefined) break;
        mapa.delete(masAntigua);
      }
    }
    mapa.set(clave, vigentes);
    return vigentes.length;
  }

  function segundosHastaLiberar(entradas, t, ventana) {
    if (!entradas.length) return 1;
    const ms = Math.max(1000, entradas[0].ts + ventana - t);
    return Math.ceil(ms / 1000);
  }

  function comprobar({ ip, dispositivo } = {}) {
    const t = ahora();
    if (dispositivo) {
      const fd = leerVigentes(fallosDisp, `d:${dispositivo}`, t, ventanaMs);
      if (fd.length >= maxFallosDispositivo) {
        return { bloqueado: true, reintentarEnS: segundosHastaLiberar(fd, t, ventanaMs), tipo: 'dispositivo' };
      }
    }
    if (ip) {
      const fi = leerVigentes(fallosIp, `i:${ip}`, t, ventanaMs);
      if (fi.length >= maxFallosIp) {
        return { bloqueado: true, reintentarEnS: segundosHastaLiberar(fi, t, ventanaMs), tipo: 'ip_fallos' };
      }
      const pi = leerVigentes(peticionesIpMin, `p:${ip}`, t, 60_000);
      if (pi.length >= maxPeticionesIpMinuto) {
        return { bloqueado: true, reintentarEnS: segundosHastaLiberar(pi, t, 60_000), tipo: 'ip_frecuencia' };
      }
    }
    return { bloqueado: false, reintentarEnS: 0, tipo: null };
  }

  /** Registra un fallo provisional y el pulso de petición por minuto antes de consultar la BD. */
  function reservar({ ip, dispositivo } = {}) {
    const t = ahora();
    const id = ++seq;
    const entrada = { ts: t, id };
    if (dispositivo) empujarEntrada(fallosDisp, `d:${dispositivo}`, entrada, t, ventanaMs);
    if (ip) {
      empujarEntrada(fallosIp, `i:${ip}`, entrada, t, ventanaMs);
      empujarEntrada(peticionesIpMin, `p:${ip}`, { ts: t, id }, t, 60_000);
    }
    return { id, ip, dispositivo };
  }

  function quitarReserva(mapa, clave, id) {
    const lista = mapa.get(clave);
    if (!lista) return;
    const filtrada = lista.filter((e) => e.id !== id);
    if (filtrada.length === 0) mapa.delete(clave);
    else mapa.set(clave, filtrada);
  }

  function liberar(reserva) {
    if (!reserva) return;
    if (reserva.dispositivo) quitarReserva(fallosDisp, `d:${reserva.dispositivo}`, reserva.id);
    if (reserva.ip) quitarReserva(fallosIp, `i:${reserva.ip}`, reserva.id);
  }

  function retardoMs({ ip, dispositivo } = {}) {
    const t = ahora();
    const fallosD = dispositivo ? leerVigentes(fallosDisp, `d:${dispositivo}`, t, ventanaMs).length : 0;
    const fallosI = ip ? leerVigentes(fallosIp, `i:${ip}`, t, ventanaMs).length : 0;
    const fallos = Math.max(fallosD, fallosI);
    if (fallos < 3) return 0;
    return Math.min(250 * (fallos - 2), 2000);
  }

  function podarTodo() {
    const t = ahora();
    podarMapa(fallosDisp, t, ventanaMs);
    podarMapa(fallosIp, t, ventanaMs);
    podarMapa(peticionesIpMin, t, 60_000);
  }

  return {
    comprobar,
    reservar,
    liberar,
    retardoMs,
    podarTodo,
    _tamano: () => ({
      dispositivos: fallosDisp.size,
      ips: fallosIp.size,
      peticionesIp: peticionesIpMin.size,
    }),
  };
}

/**
 * Resuelve un código de 6 dígitos hacia el `qr_token` de la sesión vigente sin crear sesiones ni revelar detalles.
 */
function crearResolutorCodigo({
  pool,
  limitador = crearLimitadorIntentos(),
  esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  registrar = console.warn,
}) {
  async function resolver({ codigo, ip, dispositivo }) {
    const ipNorm = ip ? String(ip) : 'desconocido';
    const estadoLimite = limitador.comprobar({ ip: ipNorm, dispositivo });
    if (estadoLimite.bloqueado) {
      registrar('[codigo-acceso] limite alcanzado', { origen: hashOrigen(ipNorm), tipo: estadoLimite.tipo });
      return {
        ok: false,
        status: 429,
        codigoError: 'demasiados_intentos',
        mensaje: `Demasiados intentos fallidos. Espera ${estadoLimite.reintentarEnS} segundos antes de volver a intentar.`,
        reintentarEnS: estadoLimite.reintentarEnS,
      };
    }

    const reserva = limitador.reservar({ ip: ipNorm, dispositivo });
    const retardo = limitador.retardoMs({ ip: ipNorm, dispositivo });
    if (retardo > 0) await esperar(retardo);

    if (typeof codigo !== 'string' || !CODIGO_REGEX.test(codigo)) {
      return {
        ok: false,
        status: 400,
        codigoError: 'codigo_invalido',
        mensaje: 'Ingresa exactamente seis dígitos numéricos.',
      };
    }

    const { rows } = await pool.query(
      `SELECT s.qr_token, s.estado, s.qr_estado
       FROM e5_codigo_acceso ca
       JOIN sesion s ON s.id_sesion = ca.id_sesion
       WHERE ca.codigo = $1 AND ca.vigente
       LIMIT 1`,
      [codigo],
    );
    const fila = rows[0];
    if (!fila || fila.estado !== 'activa' || fila.qr_estado !== 'activo') {
      return {
        ok: false,
        status: 404,
        codigoError: 'codigo_no_disponible',
        mensaje: 'El código no es válido o la sesión no está disponible en este momento.',
      };
    }

    limitador.liberar(reserva);
    return { ok: true, qr_token: fila.qr_token };
  }

  return { resolver, limitador };
}

module.exports = {
  CODIGO_REGEX,
  generarCodigoSeguro,
  asignarCodigoNuevo,
  revocarCodigo,
  crearLimitadorIntentos,
  crearResolutorCodigo,
};
