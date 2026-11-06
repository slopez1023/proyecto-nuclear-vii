package co.edu.cue.nuclear.cliente.data.busqueda

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import retrofit2.Response
import retrofit2.http.GET
import retrofit2.http.Query

/** Contrato real del backend (backend/src/app.js). Android nunca consulta YouTube directamente. */
interface BusquedaApi {
    @GET("api/busqueda")
    suspend fun buscar(@Query("q") consulta: String): Response<BusquedaRespuestaDto>

    @GET("api/busqueda/sugerencias")
    suspend fun sugerencias(@Query("q") consulta: String): Response<SugerenciasRespuestaDto>
}

@Serializable
data class BusquedaRespuestaDto(val resultados: List<CancionDto>)

@Serializable
data class SugerenciasRespuestaDto(val sugerencias: List<String>)

/** Campos de la entidad Canción del modelo ER. */
@Serializable
data class CancionDto(
    @SerialName("youtube_video_id") val youtubeVideoId: String,
    val titulo: String,
    @SerialName("artista_canal") val artistaCanal: String,
    @SerialName("duracion_segundos") val duracionSegundos: Int? = null,
    @SerialName("url_miniatura") val urlMiniatura: String? = null,
    val disponibilidad: String = DISPONIBLE,
) {
    companion object {
        const val DISPONIBLE = "disponible"
    }
}
