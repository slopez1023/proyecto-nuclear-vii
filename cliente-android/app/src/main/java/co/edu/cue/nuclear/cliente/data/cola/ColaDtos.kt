package co.edu.cue.nuclear.cliente.data.cola

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject

/*
 * DTO del contrato del E4 (docs/entregable-4/contrato-api-e4.md, backend/test/fixtures/contrato-e4.json).
 * Solo lo que el backend envía: nada inventado. Los campos opcionales del contrato son nulables con valor
 * por defecto (la vista pública no trae ya_voto, es_mia ni mi_votacion). `ignoreUnknownKeys` está activo
 * en el JSON de la app, así que un campo nuevo del servidor no rompe nada.
 */

@Serializable
data class CancionColaDto(
    @SerialName("youtube_video_id") val youtubeVideoId: String,
    val titulo: String,
    @SerialName("artista_canal") val artistaCanal: String,
    @SerialName("duracion_segundos") val duracionSegundos: Int? = null,
    @SerialName("url_miniatura") val urlMiniatura: String? = null,
)

/** Cada elemento de `cola[]` y el campo `solicitud` de las respuestas de solicitar y votar. */
@Serializable
data class SolicitudColaDto(
    val posicion: Int? = null,
    @SerialName("id_solicitud") val idSolicitud: String,
    val estado: String,
    @SerialName("total_votos") val totalVotos: Int,
    @SerialName("fecha_solicitud") val fechaSolicitud: String,
    val cancion: CancionColaDto,
    /** Solo con la cabecera `X-Dispositivo-Id`. */
    @SerialName("ya_voto") val yaVoto: Boolean? = null,
    /** Solo con la cabecera `X-Dispositivo-Id`. */
    @SerialName("es_mia") val esMia: Boolean? = null,
    @SerialName("espera_estimada_segundos") val esperaEstimadaSegundos: Int? = null,
)

@Serializable
data class ReproduccionActualDto(
    @SerialName("id_reproduccion") val idReproduccion: String,
    @SerialName("id_solicitud") val idSolicitud: String,
    val cancion: CancionColaDto,
    @SerialName("total_votos") val totalVotos: Int,
    @SerialName("inicio_en") val inicioEn: String,
    @SerialName("segundos_restantes_estimados") val segundosRestantesEstimados: Int? = null,
)

@Serializable
data class ReglasVotacionDto(
    @SerialName("dispositivos_activos") val dispositivosActivos: Int,
    @SerialName("intervalo_canciones") val intervaloCanciones: Int,
)

@Serializable
data class MiVotacionDto(
    @SerialName("puede_votar") val puedeVotar: Boolean,
    @SerialName("intervalo_canciones") val intervaloCanciones: Int,
    @SerialName("reproducciones_contadas") val reproduccionesContadas: Int,
    @SerialName("canciones_restantes") val cancionesRestantes: Int,
)

/** Respuesta de `GET /cola` y `data` de cada mensaje SSE (`estado_cola`). */
@Serializable
data class EstadoColaDto(
    @SerialName("sesion_id") val sesionId: String,
    val version: Long,
    @SerialName("generado_en") val generadoEn: String,
    @SerialName("reproduccion_actual") val reproduccionActual: ReproduccionActualDto? = null,
    @SerialName("reglas_votacion") val reglasVotacion: ReglasVotacionDto? = null,
    /** Solo con la cabecera `X-Dispositivo-Id`. */
    @SerialName("mi_votacion") val miVotacion: MiVotacionDto? = null,
    val cola: List<SolicitudColaDto>,
)

@Serializable
data class VotoDto(
    @SerialName("id_voto") val idVoto: String,
    @SerialName("id_solicitud") val idSolicitud: String,
    /** `solicitud` o `manual`. */
    val origen: String,
    @SerialName("fecha_hora") val fechaHora: String,
)

/** Cuerpo de `POST /solicitudes`: solo el id del video. El backend usa sus propios datos de la canción. */
@Serializable
data class SolicitudPeticionDto(@SerialName("youtube_video_id") val youtubeVideoId: String)

/** Respuesta de `POST /solicitudes` (201 `solicitud_creada` o 200 `voto_sumado`). */
@Serializable
data class SolicitudRespuestaDto(
    /** `solicitud_creada` o `voto_sumado`; coincide siempre con el código HTTP (201 / 200). */
    val resultado: String,
    val solicitud: SolicitudColaDto,
    val voto: VotoDto,
    @SerialName("mi_votacion") val miVotacion: MiVotacionDto? = null,
)

/** Respuesta de `POST /solicitudes/{id}/votos` (201). */
@Serializable
data class VotoRespuestaDto(
    val voto: VotoDto,
    val solicitud: SolicitudColaDto,
    @SerialName("mi_votacion") val miVotacion: MiVotacionDto? = null,
)

/** Error del E4: `{ "error": { "codigo", "mensaje", "detalle"? } }`. `detalle` varía según el código. */
@Serializable
data class ErrorColaRespuestaDto(val error: ErrorColaDto)

@Serializable
data class ErrorColaDto(
    val codigo: String,
    val mensaje: String = "",
    val detalle: JsonObject? = null,
)
