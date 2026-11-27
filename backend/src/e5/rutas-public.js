'use strict';
/**
 * API Pública de solo lectura para Pantalla Pública (FASE 2).
 * Expone exclusivamente:
 *  - GET /api/public/:displayToken/estado
 *  - GET /api/public/:displayToken/flujo
 * Utiliza una única proyección pública (proyectarEstadoPublico) tanto en REST como en SSE.
 * No cuenta como dispositivo participante ni expone identificadores internos o datos administrativos.
 */
const path = require('node:path');
const express = require('express');
const { manejar, ErrorApi } = require('./comun-e5');

function proyectarCancionPublica(c) {
  if (!c) return null;
  return {
    youtube_video_id: c.youtube_video_id,
    titulo: c.titulo,
    artista_canal: c.artista_canal,
    duracion_segundos: c.duracion_segundos ?? null,
    url_miniatura: c.url_miniatura ?? null,
  };
}

function proyectarSonidoPublico(sonido) {
  const s = sonido || {};
  return {
    volumen: typeof s.volumen === 'number' ? s.volumen : 80,
    silenciado: Boolean(s.silenciado),
    salida: s.salida || 'panel',
  };
}

/**
 * Proyección pública única para /estado y SSE `event: estado`.
 * Excluye explícitamente: sesion_id, id_sesion, id_establecimiento, id_solicitud, id_reproduccion,
 * qr_token, dispositivos_activos, intervalo_canciones, version, historial_reciente y ultimo_latido.
 */
function proyectarEstadoPublico({ establecimiento, sesionEstado, qrEstado, estadoRep, sonido }) {
  const activa = sesionEstado === 'activa';
  const actualBruto = activa && estadoRep ? estadoRep.actual : null;
  const actual = actualBruto && actualBruto.cancion
    ? {
        fuente: actualBruto.fuente,
        reproduccion_uid: actualBruto.reproduccion_uid ?? null,
        ...proyectarCancionPublica(actualBruto.cancion),
        total_votos: actualBruto.total_votos ?? 0,
        inicio_en: actualBruto.inicio_en ?? null,
        ...(actualBruto.lista_nombre ? { lista_nombre: actualBruto.lista_nombre } : {}),
      }
    : null;

  const cola = activa && estadoRep && Array.isArray(estadoRep.cola)
    ? estadoRep.cola.map((item) => ({
        posicion: item.posicion,
        total_votos: item.total_votos,
        cancion: proyectarCancionPublica(item.cancion),
      }))
    : [];

  return {
    establecimiento: { nombre: establecimiento },
    sesion: {
      estado: sesionEstado,
      qr_activo: qrEstado === 'activo',
    },
    estado_reproduccion: activa && estadoRep ? estadoRep.estado_reproduccion : 'detenida',
    pausada_en: activa && estadoRep ? (estadoRep.pausada_en ?? null) : null,
    actual,
    cola,
    sonido: proyectarSonidoPublico(sonido),
  };
}

function montarRutasPublicas(app, { display, reproductor, bonus, flujo }) {
  async function consultarEstadoProyectado(d, sesionOverride = null) {
    const sesionEstado = sesionOverride ? sesionOverride.estado : d.sesion_estado;
    const qrEstado = sesionOverride ? sesionOverride.qr_estado : d.qr_estado;
    const sonido = await bonus.leerSonido(d.id_establecimiento);
    const estadoRep = sesionEstado === 'activa'
      ? await reproductor.estadoActual(d.id_establecimiento, d.id_sesion)
      : null;
    return proyectarEstadoPublico({
      establecimiento: d.establecimiento,
      sesionEstado,
      qrEstado,
      estadoRep,
      sonido,
    });
  }

  function crearProyectorSse(d) {
    return (nombreEvento, datos, ctx) => {
      if (nombreEvento === 'conectividad' || nombreEvento === 'incidente_reproductor') return null;
      if (nombreEvento === 'estado') {
        return consultarEstadoProyectado(d, ctx && ctx.sesion ? ctx.sesion : null);
      }
      if (nombreEvento === 'reproductor') {
        return {
          estado_reproduccion: datos.estado_reproduccion,
          pausada_en: datos.pausada_en ?? null,
        };
      }
      if (nombreEvento === 'sonido') {
        return proyectarSonidoPublico(datos);
      }
      if (nombreEvento === 'control_display') {
        return { liberado: Boolean(datos && datos.liberado) };
      }
      if (nombreEvento === 'sesion_cerrada') {
        return { motivo: datos.motivo };
      }
      return null;
    };
  }

  const dirPublico = path.join(__dirname, '..', '..', 'public', 'public');
  app.use('/public-assets', express.static(dirPublico));

  app.get('/public/:displayToken', manejar(async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const d = await display.resolverDisplay(req.params.displayToken);
    if (!d) throw new ErrorApi(404, 'display_invalido', 'Pantalla pública no disponible.');
    res.sendFile(path.join(dirPublico, 'display.html'));
  }));

  app.get('/api/public/:displayToken/estado', manejar(async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const d = await display.resolverDisplay(req.params.displayToken);
    if (!d) throw new ErrorApi(404, 'display_invalido', 'Pantalla pública no disponible.');
    res.json(await consultarEstadoProyectado(d));
  }));

  app.get('/api/public/:displayToken/flujo', manejar(async (req, res) => {
    const d = await display.resolverDisplay(req.params.displayToken);
    if (!d) throw new ErrorApi(404, 'display_invalido', 'Pantalla pública no disponible.');
    if (d.sesion_estado !== 'activa') {
      throw new ErrorApi(409, 'sesion_cerrada', 'La sesión está cerrada.');
    }
    flujo.abrir(req, res, {
      sesion: { id_sesion: d.id_sesion, id_establecimiento: d.id_establecimiento },
      uuid: null,
      idDispositivo: null,
      ignorarQrInactivo: true,
      proyectarEvento: crearProyectorSse(d),
      tipo: 'pantalla_publica',
    });
  }));

  app.post('/api/public/:displayToken/reproduccion/reclamar', manejar(async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const claimCode = req.body && typeof req.body === 'object' ? req.body.claim_code : '';
    const r = await display.reclamarControl(req.params.displayToken, {
      claimCode,
      ip: req.ip || (req.socket && req.socket.remoteAddress) || '',
    });
    res.json(r);
  }));

  app.post('/api/public/:displayToken/latido', manejar(async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const controlToken = req.get('X-Display-Control') || '';
    res.json(await display.latidoControl(req.params.displayToken, controlToken));
  }));

  app.post('/api/public/:displayToken/reproduccion/avanzar', manejar(async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const controlToken = req.get('X-Display-Control') || '';
    res.json(await reproductor.avanzarDesdeDisplay({
      displayToken: req.params.displayToken,
      controlToken,
      body: req.body,
      verificarControlEnTx: display.verificarControlEnTx,
    }));
  }));
}

module.exports = {
  proyectarCancionPublica,
  proyectarSonidoPublico,
  proyectarEstadoPublico,
  montarRutasPublicas,
};
