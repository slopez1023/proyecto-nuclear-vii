'use strict';
/**
 * Generador de informes PDF administrativos (PDF 1.4 estándar sin dependencias externas)
 * para copias de seguridad de PONGA PUES.
 */

const WINANSI_EXTRA = {
  0x20AC: 0x80, 0x201A: 0x82, 0x0192: 0x83, 0x201E: 0x84, 0x2026: 0x85,
  0x2020: 0x86, 0x2021: 0x87, 0x02C6: 0x88, 0x2030: 0x89, 0x0160: 0x8A,
  0x2039: 0x8B, 0x0152: 0x8C, 0x017D: 0x8E, 0x2018: 0x91, 0x2019: 0x92,
  0x201C: 0x93, 0x201D: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
  0x02DC: 0x98, 0x2122: 0x99, 0x0161: 0x9A, 0x203A: 0x9B, 0x0153: 0x9C,
  0x017E: 0x9E, 0x0178: 0x9F,
};

function aWinAnsiBytes(texto) {
  const s = String(texto == null ? '' : texto);
  const out = [];
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    if (code >= 0x20 && code <= 0x7E) {
      out.push(code);
    } else if (code >= 0xA0 && code <= 0xFF) {
      out.push(code);
    } else if (WINANSI_EXTRA[code] !== undefined) {
      out.push(WINANSI_EXTRA[code]);
    } else {
      out.push(0x20);
    }
  }
  return Buffer.from(out);
}

function pdfTextoLiteral(texto) {
  const buf = aWinAnsiBytes(texto);
  let res = '(';
  for (let i = 0; i < buf.length; i++) {
    const b = buf[i];
    if (b === 0x28 || b === 0x29 || b === 0x5C) {
      res += `\\${String.fromCharCode(b)}`;
    } else if (b < 0x20 || b > 0x7E) {
      res += `\\${b.toString(8).padStart(3, '0')}`;
    } else {
      res += String.fromCharCode(b);
    }
  }
  return `${res})`;
}

function truncar(texto, max) {
  const s = String(texto == null ? '' : texto).replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  return `${s.slice(0, Math.max(0, max - 3))}...`;
}

function formatearFechaBogota(isoStr) {
  const ms = Date.parse(isoStr);
  if (!Number.isFinite(ms)) return String(isoStr || '—');
  return new Intl.DateTimeFormat('es-CO', {
    timeZone: 'America/Bogota',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(ms));
}

function formatearDuracion(seg) {
  const n = Number(seg);
  if (!Number.isFinite(n) || n < 0) return '—';
  const m = Math.floor(n / 60);
  const s = Math.floor(n % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Construye un Buffer PDF válido con el informe administrativo de copia de seguridad.
 * @param {{establecimientoNombre:string, respaldo:object}} datos
 * @returns {Buffer}
 */
function generarPdfRespaldo({ establecimientoNombre, respaldo }) {
  const W = 595.28; // A4 ancho pt
  const H = 841.89; // A4 alto pt
  const M = 44;      // margen horizontal
  const paginas = [];
  let cmds = [];
  let y = H - 50;

  const nuevaPagina = () => {
    if (cmds.length) paginas.push(cmds);
    cmds = [];
    // Encabezado superior sutil en páginas siguientes
    cmds.push('0.96 0.96 0.98 rg');
    cmds.push(`0 ${H - 36} ${W} 36 re f`);
    cmds.push('0.36 0.25 0.78 rg');
    cmds.push(`0 ${H - 38} ${W} 2 re f`);
    cmds.push('0.20 0.20 0.28 rg');
    cmds.push(`BT /F2 9 Tf ${M} ${H - 23} Td ${pdfTextoLiteral('PONGA PUES · Informe de copia de seguridad')} Tj ET`);
    cmds.push('0.45 0.45 0.55 rg');
    cmds.push(`BT /F1 9 Tf ${W - M - 160} ${H - 23} Td ${pdfTextoLiteral(truncar(establecimientoNombre, 32))} Tj ET`);
    y = H - 62;
  };

  const asegurarEspacio = (altoNecesario) => {
    if (y - altoNecesario < 56) nuevaPagina();
  };

  const texto = (x, posY, str, { font = 'F1', size = 10, color = '0.14 0.14 0.20' } = {}) => {
    cmds.push(`${color} rg`);
    cmds.push(`BT /${font} ${size} Tf ${x.toFixed(2)} ${posY.toFixed(2)} Td ${pdfTextoLiteral(str)} Tj ET`);
  };

  const tituloSeccion = (str) => {
    asegurarEspacio(32);
    y -= 8;
    texto(M, y, str, { font: 'F2', size: 12, color: '0.32 0.22 0.72' });
    y -= 6;
    cmds.push('0.85 0.84 0.93 RG 0.8 w');
    cmds.push(`${M} ${y.toFixed(2)} m ${(W - M).toFixed(2)} ${y.toFixed(2)} l S`);
    y -= 16;
  };

  // --- Página 1: Encabezado con identidad PONGA PUES ---
  cmds.push('0.07 0.07 0.13 rg');
  cmds.push(`0 ${H - 110} ${W} 110 re f`);
  cmds.push('0.55 0.49 1.00 rg');
  cmds.push(`0 ${H - 114} ${W} 4 re f`);

  texto(M, H - 38, 'PONGA PUES', { font: 'F2', size: 11, color: '0.67 0.62 1.00' });
  texto(M, H - 64, 'Informe de copia de seguridad', { font: 'F2', size: 20, color: '1 1 1' });
  texto(M, H - 86, `Establecimiento: ${truncar(establecimientoNombre, 58)}`, { font: 'F1', size: 11, color: '0.84 0.84 0.94' });

  y = H - 138;

  // --- Metadatos y confirmación ---
  const origenTexto = respaldo.origen === 'automatico' ? 'Automática (programada cada 24 h)' : 'Manual (solicitada por administrador)';
  const canciones = Array.isArray(respaldo.canciones_mas_populares) ? respaldo.canciones_mas_populares : [];
  const listas = Array.isArray(respaldo.listas_predeterminadas) ? respaldo.listas_predeterminadas : [];
  const totalVotosRespaldo = canciones.reduce((acc, c) => acc + (Number(c.total_votos) || 0), 0);
  const totalCancionesListas = listas.reduce((acc, l) => acc + (Array.isArray(l.canciones) ? l.canciones.length : 0), 0);

  cmds.push('0.96 0.96 0.99 rg');
  cmds.push(`${M} ${y - 68} ${W - 2 * M} 76 re f`);
  cmds.push('0.84 0.82 0.94 RG 0.8 w');
  cmds.push(`${M} ${y - 68} ${W - 2 * M} 76 re S`);

  texto(M + 14, y - 12, 'Estado: Copia de seguridad generada y verificada correctamente', { font: 'F2', size: 10.5, color: '0.10 0.52 0.32' });
  texto(M + 14, y - 30, `Fecha y hora de generación: ${formatearFechaBogota(respaldo.generado_en)}`, { font: 'F1', size: 10 });
  texto(M + 14, y - 46, `Tipo de respaldo: ${origenTexto}`, { font: 'F1', size: 10 });
  texto(M + 14, y - 61, `Referencia del informe: #${respaldo.id_respaldo}`, { font: 'F1', size: 9.5, color: '0.38 0.38 0.48' });
  y -= 92;

  // --- Tarjetas de resumen ---
  tituloSeccion('Resumen de información respaldada');
  const cards = [
    { label: 'Canciones populares', val: String(canciones.length) },
    { label: 'Votos incluidos', val: String(totalVotosRespaldo) },
    { label: 'Listas musicales', val: String(listas.length) },
    { label: 'Canciones en listas', val: String(totalCancionesListas) },
  ];
  const gap = 10;
  const cw = (W - 2 * M - gap * 3) / 4;
  cards.forEach((c, idx) => {
    const cx = M + idx * (cw + gap);
    cmds.push('0.97 0.97 0.99 rg');
    cmds.push(`${cx.toFixed(2)} ${(y - 46).toFixed(2)} ${cw.toFixed(2)} 50 re f`);
    cmds.push('0.86 0.85 0.93 RG 0.7 w');
    cmds.push(`${cx.toFixed(2)} ${(y - 46).toFixed(2)} ${cw.toFixed(2)} 50 re S`);
    texto(cx + 10, y - 14, c.label, { font: 'F1', size: 8.5, color: '0.40 0.40 0.50' });
    texto(cx + 10, y - 36, c.val, { font: 'F2', size: 16, color: '0.28 0.20 0.68' });
  });
  y -= 68;

  // --- Principales canciones respaldadas ---
  tituloSeccion('Canciones más populares incluidas');
  if (canciones.length === 0) {
    texto(M, y, 'No se registraron canciones con solicitudes en este período.', { font: 'F1', size: 10, color: '0.45 0.45 0.55' });
    y -= 20;
  } else {
    const colX = [M + 6, M + 34, M + 286, M + 412, M + 462];
    const dibujarHeaderCanciones = () => {
      cmds.push('0.92 0.91 0.97 rg');
      cmds.push(`${M} ${(y - 16).toFixed(2)} ${W - 2 * M} 20 re f`);
      texto(colX[0], y - 10, '#', { font: 'F2', size: 9 });
      texto(colX[1], y - 10, 'Título', { font: 'F2', size: 9 });
      texto(colX[2], y - 10, 'Artista / Canal', { font: 'F2', size: 9 });
      texto(colX[3], y - 10, 'Votos', { font: 'F2', size: 9 });
      texto(colX[4], y - 10, 'Solicitudes', { font: 'F2', size: 9 });
      y -= 22;
    };
    asegurarEspacio(46);
    dibujarHeaderCanciones();
    canciones.forEach((c, idx) => {
      if (y - 20 < 56) {
        nuevaPagina();
        dibujarHeaderCanciones();
      }
      if (idx % 2 === 1) {
        cmds.push('0.98 0.98 0.995 rg');
        cmds.push(`${M} ${(y - 14).toFixed(2)} ${W - 2 * M} 18 re f`);
      }
      texto(colX[0], y - 9, String(c.posicion || idx + 1), { font: 'F1', size: 9 });
      texto(colX[1], y - 9, truncar(c.titulo, 40), { font: 'F1', size: 9 });
      texto(colX[2], y - 9, truncar(c.artista_canal, 20), { font: 'F1', size: 9, color: '0.35 0.35 0.45' });
      texto(colX[3], y - 9, String(c.total_votos ?? 0), { font: 'F2', size: 9 });
      texto(colX[4], y - 9, String(c.total_solicitudes ?? 0), { font: 'F1', size: 9 });
      y -= 18;
    });
    y -= 10;
  }

  // --- Listas musicales incluidas ---
  tituloSeccion('Listas musicales incluidas');
  if (listas.length === 0) {
    texto(M, y, 'El establecimiento aún no tiene listas musicales configuradas.', { font: 'F1', size: 10, color: '0.45 0.45 0.55' });
    y -= 20;
  } else {
    listas.forEach((l) => {
      asegurarEspacio(48);
      const items = Array.isArray(l.canciones) ? l.canciones : [];
      const estadoRot = l.en_rotacion ? 'En rotación' : 'Guardada';
      texto(M, y, `${truncar(l.nombre, 52)} (${items.length} canciones · ${estadoRot})`, { font: 'F2', size: 10.5 });
      y -= 16;
      if (items.length === 0) {
        texto(M + 14, y, 'Sin canciones agregadas.', { font: 'F1', size: 9, color: '0.45 0.45 0.55' });
        y -= 16;
      } else {
        items.forEach((c, idx) => {
          asegurarEspacio(20);
          texto(M + 14, y, `${idx + 1}. ${truncar(c.titulo, 48)} — ${truncar(c.artista_canal, 22)} (${formatearDuracion(c.duracion_segundos)})`, {
            font: 'F1', size: 9, color: '0.25 0.25 0.35',
          });
          y -= 15;
        });
      }
      y -= 8;
    });
  }

  if (cmds.length) paginas.push(cmds);

  // Añadir pie de página con numeración a cada página
  const totalPaginas = paginas.length;
  const streams = paginas.map((pagCmds, i) => {
    const pie = [
      '0.85 0.85 0.92 RG 0.6 w',
      `${M} 38 m ${(W - M).toFixed(2)} 38 l S`,
      '0.45 0.45 0.55 rg',
      `BT /F1 8.5 Tf ${M} 24 Td ${pdfTextoLiteral(`Generado el ${formatearFechaBogota(respaldo.generado_en)} · PONGA PUES`)} Tj ET`,
      `BT /F1 8.5 Tf ${W - M - 74} 24 Td ${pdfTextoLiteral(`Página ${i + 1} de ${totalPaginas}`)} Tj ET`,
    ];
    return [...pagCmds, ...pie].join('\n');
  });

  // Ensamblar objetos PDF 1.4
  // 1: Catalog, 2: Pages, 3: Font F1 (Helvetica), 4: Font F2 (Helvetica-Bold)
  // Por página i: Page obj (5 + i*2), Content stream obj (6 + i*2)
  const objetos = [];
  const pageIds = [];
  for (let i = 0; i < totalPaginas; i++) pageIds.push(5 + i * 2);

  objetos.push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  objetos.push(`2 0 obj\n<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${totalPaginas} >>\nendobj\n`);
  objetos.push('3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n');
  objetos.push('4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\nendobj\n');

  for (let i = 0; i < totalPaginas; i++) {
    const pageId = 5 + i * 2;
    const contentId = 6 + i * 2;
    const streamStr = streams[i];
    const streamLen = Buffer.byteLength(streamStr, 'latin1');
    objetos.push(
      `${pageId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] ` +
      `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>\nendobj\n`,
    );
    objetos.push(
      `${contentId} 0 obj\n<< /Length ${streamLen} >>\nstream\n${streamStr}\nendstream\nendobj\n`,
    );
  }

  const partes = ['%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'];
  const offsets = [0];
  let pos = Buffer.byteLength(partes[0], 'latin1');

  for (const obj of objetos) {
    offsets.push(pos);
    partes.push(obj);
    pos += Buffer.byteLength(obj, 'latin1');
  }

  const xrefPos = pos;
  let xref = `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objetos.length; i++) {
    xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  const trailer = `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`;
  partes.push(xref, trailer);

  return Buffer.concat(partes.map((p) => Buffer.from(p, 'latin1')));
}

module.exports = { generarPdfRespaldo };
