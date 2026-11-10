package co.edu.cue.nuclear.cliente.data.cola

import co.edu.cue.nuclear.cliente.data.busqueda.Cancion
import java.time.Instant
import java.time.format.DateTimeParseException

/** El servidor respondió algo que no cumple el contrato (estado desconocido, fecha ilegible…). Se traduce a `SERVIDOR`. */
internal class RespuestaInesperadaException(mensaje: String) : Exception(mensaje)

internal fun CancionColaDto.aDominio() = Cancion(
    youtubeVideoId = youtubeVideoId,
    titulo = titulo,
    artistaCanal = artistaCanal,
    duracionSegundos = duracionSegundos,
    urlMiniatura = urlMiniatura,
    // El backend solo entrega canciones permitidas (las demás se rechazan con 422): no manda este campo.
    disponible = true,
)

internal fun String.aEstadoSolicitud(): EstadoSolicitud = when (this) {
    "pendiente" -> EstadoSolicitud.PENDIENTE
    "en_reproduccion" -> EstadoSolicitud.EN_REPRODUCCION
    "reproducida" -> EstadoSolicitud.REPRODUCIDA
    "fallida" -> EstadoSolicitud.FALLIDA
    else -> throw RespuestaInesperadaException("Estado de solicitud desconocido: $this")
}

/** `voto.origen`: `solicitud` es el voto automático; `manual`, el voto sobre una solicitud ajena. */
internal fun String.aTipoVoto(): TipoVoto? = when (this) {
    "solicitud" -> TipoVoto.AUTOMATICO
    "manual" -> TipoVoto.MANUAL
    else -> null
}

/**
 * `ya_voto` y `es_mia` se conservan por separado y sin deducir nada del uno a partir del otro.
 * Sin la cabecera del dispositivo (vista pública) no vienen y se toman como `false`.
 */
internal fun SolicitudColaDto.aDominio() = SolicitudCola(
    idSolicitud = idSolicitud,
    cancion = cancion.aDominio(),
    estado = estado.aEstadoSolicitud(),
    posicion = posicion,
    totalVotos = totalVotos,
    esMia = esMia == true,
    yaVoto = yaVoto == true,
    esperaEstimadaSegundos = esperaEstimadaSegundos,
)

internal fun ReproduccionActualDto.aDominio() = ReproduccionActual(
    idSolicitud = idSolicitud,
    cancion = cancion.aDominio(),
    segundosRestantesEstimados = segundosRestantesEstimados,
    idReproduccion = idReproduccion,
    totalVotos = totalVotos,
)

internal fun MiVotacionDto.aDominio() = MiVotacion(puedeVotar, intervaloCanciones, reproduccionesContadas, cancionesRestantes)

internal fun ReglasVotacionDto.aDominio() = ReglasVotacion(dispositivosActivos, intervaloCanciones)

/** Mantiene el orden de `cola[]`: lo decide el servidor y Android no reordena. */
internal fun EstadoColaDto.aDominio() = EstadoCola(
    reproduccionActual = reproduccionActual?.aDominio(),
    cola = cola.map { it.aDominio() },
    version = version,
    generadoEn = generadoEn.aInstante(),
    reglasVotacion = reglasVotacion?.aDominio(),
    miVotacion = miVotacion?.aDominio(),
)

/** 201 `solicitud_creada` → nueva; 200 `voto_sumado` → se sumó a una solicitud existente. */
internal fun SolicitudRespuestaDto.aDominio(): ResultadoSolicitud.Aceptada = ResultadoSolicitud.Aceptada(
    solicitud = solicitud.aDominio(),
    sumoVotoAExistente = when (resultado) {
        "solicitud_creada" -> false
        "voto_sumado" -> true
        else -> throw RespuestaInesperadaException("Resultado de solicitud desconocido: $resultado")
    },
    origenVoto = voto.origen.aTipoVoto(),
    miVotacion = miVotacion?.aDominio(),
)

internal fun VotoRespuestaDto.aDominio() = ResultadoVoto.Registrado(
    solicitud = solicitud.aDominio(),
    origenVoto = voto.origen.aTipoVoto(),
    miVotacion = miVotacion?.aDominio(),
)

private fun String.aInstante(): Instant = try {
    Instant.parse(this)
} catch (_: DateTimeParseException) {
    throw RespuestaInesperadaException("Fecha ilegible: $this")
}
