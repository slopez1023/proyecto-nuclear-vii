'use strict';
/**
 * Pruebas unitarias de proyección pública — Fase 2 (sin PostgreSQL ni red).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { proyectarEstadoPublico, proyectarSonidoPublico } = require('../src/e5/rutas-public');

const CLAVES_PROHIBIDAS = [
  'sesion_id', 'id_sesion', 'id_establecimiento', 'id_solicitud', 'id_reproduccion',
  'qr_token', 'dispositivos_activos', 'intervalo_canciones', 'historial_reciente',
  'ultimo_latido', 'actualizado_en', 'version',
];

function verificarSinClavesPrivadas(obj) {
  const json = JSON.stringify(obj);
  for (const k of CLAVES_PROHIBIDAS) {
    assert.equal(json.includes(`"${k}"`), false, `No debe exponer la clave privada "${k}"`);
  }
}

test('proyectarSonidoPublico expone únicamente volumen, silenciado y salida', () => {
  const s = proyectarSonidoPublico({
    volumen: 65,
    silenciado: true,
    salida: 'equipo_local',
    salida_conectada: true,
    ultimo_latido: '2026-11-26T18:00:00.000Z',
    actualizado_en: '2026-11-26T18:00:00.000Z',
  });
  assert.deepEqual(s, { volumen: 65, silenciado: true, salida: 'equipo_local' });
  verificarSinClavesPrivadas(s);
});

test('proyectarEstadoPublico proyecta solicitud actual y cola sin identificadores internos', () => {
  const estadoRep = {
    id_sesion: 'SES-MOCK-001',
    estado_reproduccion: 'reproduciendo',
    pausada_en: null,
    actual: {
      fuente: 'solicitud',
      reproduccion_uid: '11111111-2222-4333-8444-555555555555',
      id_reproduccion: 'REP-9',
      id_solicitud: 'SOL-9',
      total_votos: 4,
      inicio_en: '2026-11-26T18:00:00.000Z',
      cancion: {
        youtube_video_id: 'Zi_XLOBDo_Y',
        titulo: 'Billie Jean',
        artista_canal: 'Michael Jackson',
        duracion_segundos: 294,
        url_miniatura: 'https://img.example/1.jpg',
      },
    },
    cola: [
      {
        posicion: 1,
        id_solicitud: 'SOL-10',
        total_votos: 2,
        fecha_solicitud: '2026-11-26T18:01:00.000Z',
        cancion: {
          youtube_video_id: 'abc123def45',
          titulo: 'La Camisa Negra',
          artista_canal: 'Juanes',
          duracion_segundos: 215,
          url_miniatura: null,
        },
      },
    ],
    historial_reciente: [{ id_reproduccion: 'REP-1' }],
  };

  const out = proyectarEstadoPublico({
    establecimiento: 'Estación AXM',
    sesionEstado: 'activa',
    qrEstado: 'activo',
    estadoRep,
    sonido: { volumen: 80, silenciado: false, salida: 'equipo_local', ultimo_latido: 'x' },
  });

  assert.equal(out.establecimiento.nombre, 'Estación AXM');
  assert.deepEqual(out.sesion, { estado: 'activa', qr_activo: true });
  assert.equal(out.estado_reproduccion, 'reproduciendo');
  assert.equal(out.actual.reproduccion_uid, '11111111-2222-4333-8444-555555555555');
  assert.equal(out.actual.titulo, 'Billie Jean');
  assert.equal(out.actual.total_votos, 4);
  assert.equal(out.cola.length, 1);
  assert.deepEqual(out.cola[0], {
    posicion: 1,
    total_votos: 2,
    cancion: {
      youtube_video_id: 'abc123def45',
      titulo: 'La Camisa Negra',
      artista_canal: 'Juanes',
      duracion_segundos: 215,
      url_miniatura: null,
    },
  });
  verificarSinClavesPrivadas(out);
});

test('proyectarEstadoPublico oculta actual y cola cuando la sesión está cerrada', () => {
  const out = proyectarEstadoPublico({
    establecimiento: 'Estación AXM',
    sesionEstado: 'cerrada',
    qrEstado: 'inactivo',
    estadoRep: { estado_reproduccion: 'reproduciendo', actual: { cancion: { titulo: 'X' } }, cola: [{ posicion: 1 }] },
    sonido: { volumen: 50, silenciado: false, salida: 'panel' },
  });

  assert.deepEqual(out.sesion, { estado: 'cerrada', qr_activo: false });
  assert.equal(out.estado_reproduccion, 'detenida');
  assert.equal(out.actual, null);
  assert.deepEqual(out.cola, []);
  verificarSinClavesPrivadas(out);
});
