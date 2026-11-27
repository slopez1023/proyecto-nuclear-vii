'use strict';
/**
 * Generador de informes PDF administrativos (PDF 1.4 estándar sin dependencias externas)
 * para copias de seguridad de PONGA PUES, con logotipo oficial embebido, tarjetas ejecutivas,
 * ajuste de línea para títulos largos y paginación controlada.
 */
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const RUTA_LOGO_OFICIAL = path.join(__dirname, '..', '..', 'public', 'ponga-logo.png');

const WINANSI_EXTRA = {
  0x20AC: 0x80, 0x201A: 0x82, 0x0192: 0x83, 0x201E: 0x84, 0x2026: 0x85,
  0x2020: 0x86, 0x2021: 0x87, 0x02C6: 0x88, 0x2030: 0x89, 0x0160: 0x8A,
  0x2039: 0x8B, 0x0152: 0x8C, 0x017D: 0x8E, 0x2018: 0x91, 0x2019: 0x92,
  0x201C: 0x93, 0x201D: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
  0x02DC: 0x98, 0x2122: 0x99, 0x0161: 0x9A, 0x203A: 0x9B, 0x0153: 0x9C,
  0x017E: 0x9E, 0x0178: 0x9F,
};

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

let logoPdfCache = undefined;
/**
 * Decodifica `backend/public/ponga-logo.png` (PNG RGB 8-bit) usando `zlib` nativo,
 * lo reduce suavemente por promedio de bloque a ~156x156 px y lo comprime para PDF `/XObject /Image`.
 */
function obtenerLogoPdf() {
  if (logoPdfCache !== undefined) return logoPdfCache;
  try {
    const png = fs.readFileSync(RUTA_LOGO_OFICIAL);
    if (png.length < 33 || png.readUInt32BE(0) !== 0x89504E47) {
      logoPdfCache = null;
      return null;
    }
    const w = png.readUInt32BE(16);
    const h = png.readUInt32BE(20);
    const bitDepth = png[24];
    const colorType = png[25];
    const interlace = png[28];
    if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6) || interlace !== 0) {
      logoPdfCache = null;
      return null;
    }

    const idatChunks = [];
    let off = 8;
    while (off + 8 <= png.length) {
      const len = png.readUInt32BE(off);
      const tipo = png.slice(off + 4, off + 8).toString('ascii');
      if (tipo === 'IDAT') idatChunks.push(png.slice(off + 8, off + 8 + len));
      if (tipo === 'IEND') break;
      off += 12 + len;
    }
    const raw = zlib.inflateSync(Buffer.concat(idatChunks));
    const bpp = colorType === 6 ? 4 : 3;
    const stride = w * bpp;
    const decoded = Buffer.alloc(w * h * bpp);

    for (let y = 0; y < h; y++) {
      const f = raw[y * (1 + stride)];
      const srcOff = y * (1 + stride) + 1;
      const dstOff = y * stride;
      for (let x = 0; x < stride; x++) {
        const val = raw[srcOff + x];
        const left = x >= bpp ? decoded[dstOff + x - bpp] : 0;
        const up = y > 0 ? decoded[(y - 1) * stride + x] : 0;
        const upLeft = (y > 0 && x >= bpp) ? decoded[(y - 1) * stride + x - bpp] : 0;
        let out = val;
        if (f === 1) out = (val + left) & 0xFF;
        else if (f === 2) out = (val + up) & 0xFF;
        else if (f === 3) out = (val + ((left + up) >> 1)) & 0xFF;
        else if (f === 4) out = (val + paeth(left, up, upLeft)) & 0xFF;
        decoded[dstOff + x] = out;
      }
    }

    // Submuestreo 8x8 por promedio de bloque (~156x156 px nítido en 56pt y liviano en PDF)
    const step = Math.max(1, Math.floor(Math.min(w, h) / 160));
    const dw = Math.floor(w / step);
    const dh = Math.floor(h / step);
    const rgb = Buffer.alloc(dw * dh * 3);
    const area = step * step;

    for (let dy = 0; dy < dh; dy++) {
      for (let dx = 0; dx < dw; dx++) {
        let r = 0; let g = 0; let b = 0;
        for (let sy = 0; sy < step; sy++) {
          const rowBase = ((dy * step + sy) * w + dx * step) * bpp;
          for (let sx = 0; sx < step; sx++) {
            const p = rowBase + sx * bpp;
            r += decoded[p];
            g += decoded[p + 1];
            b += decoded[p + 2];
          }
        }
        const outIdx = (dy * dw + dx) * 3;
        rgb[outIdx] = Math.round(r / area);
        rgb[outIdx + 1] = Math.round(g / area);
        rgb[outIdx + 2] = Math.round(b / area);
      }
    }

    logoPdfCache = { w: dw, h: dh, data: zlib.deflateSync(rgb) };
    return logoPdfCache;
  } catch {
    logoPdfCache = null;
    return null;
  }
}

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

/** Divide un texto largo en múltiples líneas respetando palabras (sin truncamientos arbitrarios). */
function envolverTexto(texto, maxChars) {
  const limpio = String(texto == null ? '' : texto).replace(/\s+/g, ' ').trim();
  if (!limpio) return ['—'];
  if (limpio.length <= maxChars) return [limpio];

  const palabras = limpio.split(' ');
  const lineas = [];
  let actual = '';

  for (const pal of palabras) {
    if (pal.length > maxChars) {
      if (actual) {
        lineas.push(actual);
        actual = '';
      }
      for (let i = 0; i < pal.length; i += maxChars) {
        lineas.push(pal.slice(i, i + maxChars));
      }
      continue;
    }
    const candidato = actual ? `${actual} ${pal}` : pal;
    if (candidato.length <= maxChars) {
      actual = candidato;
    } else {
      lineas.push(actual);
      actual = pal;
    }
  }
  if (actual) lineas.push(actual);
  return lineas.length ? lineas : ['—'];
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
  const M = 42;      // margen horizontal
  const logo = obtenerLogoPdf();
  const paginas = [];
  let cmds = [];
  let y = H - 50;

  const texto = (x, posY, str, { font = 'F1', size = 10, color = '0.13 0.14 0.21' } = {}) => {
    cmds.push(`${color} rg`);
    cmds.push(`BT /${font} ${size} Tf ${x.toFixed(2)} ${posY.toFixed(2)} Td ${pdfTextoLiteral(str)} Tj ET`);
  };

  const nuevaPagina = () => {
    if (cmds.length) paginas.push(cmds);
    cmds = [];
    // Encabezado compacto en páginas siguientes con identidad PONGA PUES
    cmds.push('0.067 0.075 0.122 rg');
    cmds.push(`0 ${H - 42} ${W} 42 re f`);
    cmds.push('0.545 0.486 1.00 rg');
    cmds.push(`0 ${H - 44.5} ${W} 2.5 re f`);
    if (logo) {
      cmds.push(`q 24 0 0 24 ${M} ${H - 33} cm /Im1 Do Q`);
    }
    const textX = logo ? M + 34 : M;
    texto(textX, H - 24, 'PONGA PUES · Informe de copia de seguridad', { font: 'F2', size: 9.5, color: '1 1 1' });
    const estLineas = envolverTexto(establecimientoNombre, 34);
    texto(W - M - 165, H - 24, estLineas[0], { font: 'F1', size: 9, color: '0.78 0.79 0.90' });
    y = H - 68;
  };

  const asegurarEspacio = (altoNecesario) => {
    if (y - altoNecesario < 58) nuevaPagina();
  };

  const tituloSeccion = (str) => {
    asegurarEspacio(54);
    y -= 6;
    cmds.push('0.545 0.486 1.00 rg');
    cmds.push(`${M} ${(y - 2).toFixed(2)} 4 14 re f`);
    texto(M + 12, y, str, { font: 'F2', size: 12.5, color: '0.13 0.14 0.21' });
    y -= 9;
    cmds.push('0.89 0.89 0.94 RG 0.8 w');
    cmds.push(`${M} ${y.toFixed(2)} m ${(W - M).toFixed(2)} ${y.toFixed(2)} l S`);
    y -= 16;
  };

  // --- Página 1: Encabezado principal con logotipo oficial ---
  const estLineas = envolverTexto(establecimientoNombre, 46);
  const headerH = estLineas.length > 1 ? 132 : 118;
  cmds.push('0.067 0.075 0.122 rg');
  cmds.push(`0 ${H - headerH} ${W} ${headerH} re f`);
  cmds.push('0.545 0.486 1.00 rg');
  cmds.push(`0 ${H - headerH - 4} ${W} 4 re f`);

  if (logo) {
    // Marco morado sutil + logotipo oficial
    cmds.push('0.545 0.486 1.00 RG 1 w');
    cmds.push(`${M} ${H - 86} 58 58 re S`);
    cmds.push(`q 56 0 0 56 ${M + 1} ${H - 85} cm /Im1 Do Q`);
  }

  const hdrX = logo ? M + 74 : M;
  texto(hdrX, H - 34, 'PONGA PUES · COPIA DE SEGURIDAD', { font: 'F2', size: 8.5, color: '0.65 0.61 1.00' });
  texto(hdrX, H - 56, 'Informe de copia de seguridad', { font: 'F2', size: 19, color: '1 1 1' });
  estLineas.forEach((ln, idx) => {
    texto(hdrX, H - 76 - idx * 14, ln, { font: 'F1', size: 10.5, color: '0.86 0.87 0.95' });
  });

  // Badge verde solo para estado satisfactorio
  cmds.push('0.10 0.52 0.34 rg');
  cmds.push(`${W - M - 88} ${H - 46} 88 20 re f`);
  texto(W - M - 74, H - 39, 'Verificada', { font: 'F2', size: 9, color: '1 1 1' });

  y = H - headerH - 22;

  // --- Ficha de metadatos del informe ---
  const origenTexto = respaldo.origen === 'automatico'
    ? 'Automática (programada cada 24 h)'
    : 'Manual (generada por administrador)';
  const canciones = Array.isArray(respaldo.canciones_mas_populares) ? respaldo.canciones_mas_populares : [];
  const listas = Array.isArray(respaldo.listas_predeterminadas) ? respaldo.listas_predeterminadas : [];
  const totalVotosRespaldo = canciones.reduce((acc, c) => acc + (Number(c.total_votos) || 0), 0);
  const totalCancionesListas = listas.reduce((acc, l) => acc + (Array.isArray(l.canciones) ? l.canciones.length : 0), 0);

  cmds.push('0.968 0.968 0.985 rg');
  cmds.push(`${M} ${(y - 54).toFixed(2)} ${W - 2 * M} 60 re f`);
  cmds.push('0.88 0.88 0.93 RG 0.8 w');
  cmds.push(`${M} ${(y - 54).toFixed(2)} ${W - 2 * M} 60 re S`);

  texto(M + 14, y - 12, 'Fecha y hora de generación', { font: 'F2', size: 8.5, color: '0.42 0.43 0.52' });
  texto(M + 14, y - 27, formatearFechaBogota(respaldo.generado_en), { font: 'F1', size: 10 });
  texto(M + 230, y - 12, 'Tipo de respaldo', { font: 'F2', size: 8.5, color: '0.42 0.43 0.52' });
  texto(M + 230, y - 27, origenTexto, { font: 'F1', size: 10 });
  texto(M + 14, y - 45, `Referencia del informe: #${respaldo.id_respaldo} · Información extraída del respaldo oficial`, {
    font: 'F1', size: 8.5, color: '0.45 0.46 0.56',
  });
  y -= 78;

  // --- Resumen ejecutivo (4 tarjetas) ---
  tituloSeccion('Resumen ejecutivo');
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
    cmds.push('0.975 0.975 0.99 rg');
    cmds.push(`${cx.toFixed(2)} ${(y - 50).toFixed(2)} ${cw.toFixed(2)} 54 re f`);
    cmds.push('0.88 0.88 0.94 RG 0.7 w');
    cmds.push(`${cx.toFixed(2)} ${(y - 50).toFixed(2)} ${cw.toFixed(2)} 54 re S`);
    cmds.push('0.545 0.486 1.00 rg');
    cmds.push(`${cx.toFixed(2)} ${(y + 1).toFixed(2)} ${cw.toFixed(2)} 3 re f`);
    texto(cx + 10, y - 14, c.label, { font: 'F1', size: 8.5, color: '0.42 0.43 0.52' });
    texto(cx + 10, y - 38, c.val, { font: 'F2', size: 17, color: '0.35 0.25 0.80' });
  });
  y -= 74;

  // --- Canciones populares (tabla con salto de línea sin truncar títulos) ---
  tituloSeccion('Canciones populares respaldadas');
  if (canciones.length === 0) {
    texto(M, y, 'No se registraron canciones populares en este respaldo.', { font: 'F1', size: 10, color: '0.45 0.46 0.56' });
    y -= 20;
  } else {
    const colX = [M + 8, M + 34, M + 286, M + 416, M + 464];
    const dibujarHeaderCanciones = () => {
      cmds.push('0.935 0.93 0.98 rg');
      cmds.push(`${M} ${(y - 16).toFixed(2)} ${W - 2 * M} 22 re f`);
      texto(colX[0], y - 9, '#', { font: 'F2', size: 8.8, color: '0.28 0.22 0.62' });
      texto(colX[1], y - 9, 'Título', { font: 'F2', size: 8.8, color: '0.28 0.22 0.62' });
      texto(colX[2], y - 9, 'Artista o canal', { font: 'F2', size: 8.8, color: '0.28 0.22 0.62' });
      texto(colX[3], y - 9, 'Votos', { font: 'F2', size: 8.8, color: '0.28 0.22 0.62' });
      texto(colX[4], y - 9, 'Solicitudes', { font: 'F2', size: 8.8, color: '0.28 0.22 0.62' });
      y -= 24;
    };
    asegurarEspacio(56);
    dibujarHeaderCanciones();

    canciones.forEach((c, idx) => {
      const titLineas = envolverTexto(c.titulo, 44);
      const artLineas = envolverTexto(c.artista_canal, 22);
      const maxLineas = Math.max(titLineas.length, artLineas.length);
      const rowH = 10 + maxLineas * 12;

      if (y - rowH < 58) {
        nuevaPagina();
        dibujarHeaderCanciones();
      }
      if (idx % 2 === 1) {
        cmds.push('0.982 0.982 0.992 rg');
        cmds.push(`${M} ${(y - rowH + 6).toFixed(2)} ${W - 2 * M} ${rowH.toFixed(2)} re f`);
      }
      texto(colX[0], y - 8, String(c.posicion || idx + 1), { font: 'F2', size: 9, color: '0.35 0.25 0.80' });
      titLineas.forEach((ln, li) => texto(colX[1], y - 8 - li * 12, ln, { font: 'F1', size: 9 }));
      artLineas.forEach((ln, li) => texto(colX[2], y - 8 - li * 12, ln, { font: 'F1', size: 8.8, color: '0.38 0.40 0.50' }));
      texto(colX[3], y - 8, String(c.total_votos ?? 0), { font: 'F2', size: 9 });
      texto(colX[4], y - 8, String(c.total_solicitudes ?? 0), { font: 'F1', size: 9, color: '0.38 0.40 0.50' });
      y -= rowH;
    });
    y -= 12;
  }

  // --- Listas musicales incluidas (bloques visuales independientes) ---
  tituloSeccion('Listas musicales incluidas');
  if (listas.length === 0) {
    texto(M, y, 'El establecimiento aún no tiene listas musicales configuradas.', { font: 'F1', size: 10, color: '0.45 0.46 0.56' });
    y -= 20;
  } else {
    listas.forEach((l) => {
      const items = Array.isArray(l.canciones) ? l.canciones : [];
      const estadoRot = l.en_rotacion ? 'En rotación' : 'Guardada';
      const nomLineas = envolverTexto(l.nombre, 48);
      const cardHdrH = 18 + nomLineas.length * 13;

      asegurarEspacio(cardHdrH + 24);
      cmds.push('0.968 0.968 0.988 rg');
      cmds.push(`${M} ${(y - cardHdrH + 10).toFixed(2)} ${W - 2 * M} ${cardHdrH.toFixed(2)} re f`);
      cmds.push('0.545 0.486 1.00 rg');
      cmds.push(`${M} ${(y - cardHdrH + 10).toFixed(2)} 3.5 ${cardHdrH.toFixed(2)} re f`);

      nomLineas.forEach((ln, li) => texto(M + 12, y - 5 - li * 13, ln, { font: 'F2', size: 10.5 }));
      texto(W - M - 142, y - 5, `${items.length} canciones · ${estadoRot}`, { font: 'F1', size: 8.8, color: '0.35 0.25 0.80' });
      y -= cardHdrH + 4;

      if (items.length === 0) {
        texto(M + 14, y, 'Sin canciones agregadas en esta lista.', { font: 'F1', size: 9, color: '0.45 0.46 0.56' });
        y -= 18;
      } else {
        items.forEach((c, idx) => {
          const titLineas = envolverTexto(`${idx + 1}. ${c.titulo || 'Sin título'}`, 52);
          const artDur = `${c.artista_canal || 'Artista no especificado'} · ${formatearDuracion(c.duracion_segundos)}`;
          const artLineas = envolverTexto(artDur, 32);
          const maxLn = Math.max(titLineas.length, artLineas.length);
          const itemH = 7 + maxLn * 11.5;

          if (y - itemH < 58) {
            nuevaPagina();
            texto(M, y, `${nomLineas[0]} (continuación)`, { font: 'F2', size: 9.5, color: '0.35 0.25 0.80' });
            y -= 16;
          }
          titLineas.forEach((ln, li) => texto(M + 14, y - 4 - li * 11.5, ln, { font: 'F1', size: 9 }));
          artLineas.forEach((ln, li) => texto(M + 318, y - 4 - li * 11.5, ln, { font: 'F1', size: 8.5, color: '0.40 0.42 0.52' }));
          y -= itemH;
        });
      }
      y -= 10;
    });
  }

  if (cmds.length) paginas.push(cmds);

  // Pie de página consistente en todas las páginas
  const totalPaginas = paginas.length;
  const streams = paginas.map((pagCmds, i) => {
    const pie = [
      '0.87 0.87 0.92 RG 0.7 w',
      `${M} 40 m ${(W - M).toFixed(2)} 40 l S`,
      '0.42 0.43 0.52 rg',
      `BT /F2 8.2 Tf ${M} 24 Td ${pdfTextoLiteral('PONGA PUES')} Tj ET`,
      `BT /F1 8.2 Tf ${M + 62} 24 Td ${pdfTextoLiteral(`· Informe #${respaldo.id_respaldo} · Generado el ${formatearFechaBogota(respaldo.generado_en)}`)} Tj ET`,
      `BT /F1 8.2 Tf ${W - M - 74} 24 Td ${pdfTextoLiteral(`Página ${i + 1} de ${totalPaginas}`)} Tj ET`,
    ];
    return [...pagCmds, ...pie].join('\n');
  });

  // Ensamblar objetos PDF 1.4
  // 1: Catalog, 2: Pages, 3: F1 Helvetica, 4: F2 Helvetica-Bold, (opcional) 5: Im1 Logo
  const logoObjId = logo ? 5 : null;
  const firstPageObjId = logo ? 6 : 5;
  const xObjRes = logo ? `/XObject << /Im1 ${logoObjId} 0 R >>` : '';

  const objetos = [];
  const pageIds = [];
  for (let i = 0; i < totalPaginas; i++) pageIds.push(firstPageObjId + i * 2);

  objetos.push(Buffer.from('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n', 'latin1'));
  objetos.push(Buffer.from(`2 0 obj\n<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${totalPaginas} >>\nendobj\n`, 'latin1'));
  objetos.push(Buffer.from('3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n', 'latin1'));
  objetos.push(Buffer.from('4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\nendobj\n', 'latin1'));

  if (logo) {
    const imgHeader = Buffer.from(
      `${logoObjId} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${logo.w} /Height ${logo.h} ` +
      `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${logo.data.length} >>\nstream\n`,
      'latin1',
    );
    const imgFooter = Buffer.from('\nendstream\nendobj\n', 'latin1');
    objetos.push(Buffer.concat([imgHeader, logo.data, imgFooter]));
  }

  for (let i = 0; i < totalPaginas; i++) {
    const pageId = firstPageObjId + i * 2;
    const contentId = pageId + 1;
    const streamStr = streams[i];
    const streamLen = Buffer.byteLength(streamStr, 'latin1');
    objetos.push(Buffer.from(
      `${pageId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] ` +
      `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> ${xObjRes} >> /Contents ${contentId} 0 R >>\nendobj\n`,
      'latin1',
    ));
    objetos.push(Buffer.from(
      `${contentId} 0 obj\n<< /Length ${streamLen} >>\nstream\n${streamStr}\nendstream\nendobj\n`,
      'latin1',
    ));
  }

  const cabecera = Buffer.from('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n', 'latin1');
  const partes = [cabecera];
  const offsets = [0];
  let pos = cabecera.length;

  for (const objBuf of objetos) {
    offsets.push(pos);
    partes.push(objBuf);
    pos += objBuf.length;
  }

  const xrefPos = pos;
  let xref = `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objetos.length; i++) {
    xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  const trailer = `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`;
  partes.push(Buffer.from(xref, 'latin1'), Buffer.from(trailer, 'latin1'));

  return Buffer.concat(partes);
}

module.exports = { generarPdfRespaldo, obtenerLogoPdf };
