'use strict';
/**
 * Evaluación PURA del horario de funcionamiento (sin SQL ni red, para poder probarla con cualquier fecha).
 *
 * Reglas:
 *  - Una franja por día de la semana (0 = domingo … 6 = sábado), en hora LOCAL del establecimiento.
 *  - Si cierre <= apertura, la franja cruza la medianoche y termina al día siguiente (p. ej. viernes 20:00 → 03:00).
 *  - Una excepción para una fecha local reemplaza la franja de ese día (cerrado, o con otra apertura/cierre).
 *  - La parte de madrugada de una franja que cruza la medianoche pertenece al día en que empezó.
 */

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const DIA_CORTO = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Partes de la fecha local en una zona horaria IANA. */
function partesLocales(ms, zona) {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23',
  });
  const p = Object.fromEntries(f.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  const hora = Number(p.hour) % 24;
  return {
    fecha: `${p.year}-${p.month}-${p.day}`,
    dia: DIA_CORTO[p.weekday],
    minutos: hora * 60 + Number(p.minute),
  };
}

function zonaValida(zona) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zona });
    return true;
  } catch {
    return false;
  }
}

/** "YYYY-MM-DD" del día anterior. */
function fechaAnterior(fecha) {
  const [y, m, d] = fecha.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
}

/**
 * Franja que aplica a una fecha local: { apertura, cierre, origen } o null si ese día está cerrado.
 * @param {{horarios:Array<{dia_semana:number,apertura_min:number,cierre_min:number,activo:boolean}>,
 *          excepciones:Array<{fecha:string,cerrado:boolean,apertura_min:number|null,cierre_min:number|null}>}} cfg
 */
function franjaDelDia(cfg, fecha, dia) {
  const exc = (cfg.excepciones || []).find((e) => e.fecha === fecha);
  if (exc) return exc.cerrado ? null : { apertura: exc.apertura_min, cierre: exc.cierre_min, origen: 'excepcion' };
  const h = (cfg.horarios || []).find((x) => x.dia_semana === dia);
  if (!h || !h.activo) return null;
  return { apertura: h.apertura_min, cierre: h.cierre_min, origen: 'semanal' };
}

const cruzaMedianoche = (f) => f.cierre <= f.apertura;

/**
 * ¿Está abierto el establecimiento en el instante `ms`?
 * @returns {{abierto:boolean, motivo:string, fecha_local:string, hora_local:string, franja:object|null}}
 */
function evaluarHorario(cfg, ms, zona) {
  const ahora = partesLocales(ms, zona);
  const horaLocal = `${String(Math.floor(ahora.minutos / 60)).padStart(2, '0')}:${String(ahora.minutos % 60).padStart(2, '0')}`;
  const base = { fecha_local: ahora.fecha, hora_local: horaLocal, dia_semana: ahora.dia };

  // 1) Madrugada de la franja de ayer que cruza la medianoche.
  const ayer = franjaDelDia(cfg, fechaAnterior(ahora.fecha), (ahora.dia + 6) % 7);
  if (ayer && cruzaMedianoche(ayer) && ahora.minutos < ayer.cierre) {
    return { ...base, abierto: true, motivo: 'franja_de_ayer', franja: ayer };
  }
  // 2) Franja de hoy.
  const hoy = franjaDelDia(cfg, ahora.fecha, ahora.dia);
  if (!hoy) return { ...base, abierto: false, motivo: 'dia_cerrado', franja: null };
  const dentro = cruzaMedianoche(hoy)
    ? ahora.minutos >= hoy.apertura
    : ahora.minutos >= hoy.apertura && ahora.minutos < hoy.cierre;
  return { ...base, abierto: dentro, motivo: dentro ? 'en_horario' : 'fuera_de_horario', franja: hoy };
}

module.exports = { DIAS, partesLocales, zonaValida, fechaAnterior, franjaDelDia, evaluarHorario };
