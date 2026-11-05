'use strict';
/**
 * Instrumentación de eventos (E3). Solo los eventos exigidos por el Entregable 3 y definidos en el
 * documento del proyecto (sec. XVI): dispositivo_unido y busqueda_realizada.
 * Almacenamiento: JSONL local. NO es el pipeline de Big Data (E6, responsable: Karen).
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const VERSION_ESQUEMA = '1.0';
const TIPOS = new Set(['dispositivo_unido', 'busqueda_realizada']);
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Valida el evento recibido de un cliente y devuelve el registro normalizado, o {error}. */
function validarEvento(body, ahora = () => new Date()) {
  if (!body || typeof body !== 'object') return { error: 'cuerpo_invalido' };
  const { tipo, sesion_id, dispositivo_id, datos } = body;
  if (!TIPOS.has(tipo)) return { error: 'tipo_no_soportado' };
  if (typeof sesion_id !== 'string' || !sesion_id) return { error: 'sesion_id_requerido' };
  if (typeof dispositivo_id !== 'string' || !UUID_REGEX.test(dispositivo_id)) return { error: 'dispositivo_id_invalido' };

  const d = datos && typeof datos === 'object' ? datos : {};
  let datosEvento;
  if (tipo === 'dispositivo_unido') {
    datosEvento = { recurrente: d.recurrente === true };
  } else {
    if (typeof d.termino !== 'string' || !d.termino.trim()) return { error: 'termino_requerido' };
    if (!Number.isInteger(d.cantidad_resultados) || d.cantidad_resultados < 0) return { error: 'cantidad_resultados_invalida' };
    datosEvento = {
      termino: d.termino.trim().slice(0, 100),
      cantidad_resultados: d.cantidad_resultados,
      desde_cache: d.desde_cache === true,
    };
  }
  return {
    evento: {
      evento_id: crypto.randomUUID(),
      tipo,
      fecha_hora: ahora().toISOString(),
      sesion_id,
      actor: 'cliente',
      dispositivo_id,
      version_esquema: VERSION_ESQUEMA,
      datos_evento: datosEvento,
    },
  };
}

function crearAlmacen(ruta = path.join(__dirname, '..', 'data', 'eventos.jsonl')) {
  return {
    guardar(evento) {
      fs.mkdirSync(path.dirname(ruta), { recursive: true });
      fs.appendFileSync(ruta, JSON.stringify(evento) + '\n', 'utf8');
    },
    ruta,
  };
}

module.exports = { VERSION_ESQUEMA, TIPOS, UUID_REGEX, validarEvento, crearAlmacen };
