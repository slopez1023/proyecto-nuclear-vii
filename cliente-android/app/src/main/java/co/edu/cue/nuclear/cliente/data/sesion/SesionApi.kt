package co.edu.cue.nuclear.cliente.data.sesion

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.POST
import retrofit2.http.Path

/** Contrato real del backend: GET /api/sesiones/:token y POST /api/sesiones/acceso-codigo. */
interface SesionApi {
    @GET("api/sesiones/{token}")
    suspend fun obtener(@Path("token") token: String): Response<SesionDto>

    @POST("api/sesiones/acceso-codigo")
    suspend fun resolverCodigo(
        @Body peticion: CodigoAccesoPeticionDto,
        @Header("X-Dispositivo-Id") dispositivoId: String? = null,
    ): Response<CodigoAccesoRespuestaDto>
}

@Serializable
data class CodigoAccesoPeticionDto(val codigo: String)

@Serializable
data class CodigoAccesoRespuestaDto(@SerialName("qr_token") val qrToken: String)

@Serializable
data class SesionDto(
    @SerialName("id_sesion") val idSesion: String,
    val establecimiento: EstablecimientoDto,
    val estado: String,
    /** true mientras el backend use sesiones simuladas (data/sesiones.mock.json). */
    val provisional: Boolean = false,
)

@Serializable
data class EstablecimientoDto(
    @SerialName("id_establecimiento") val idEstablecimiento: String,
    val nombre: String,
)

/** Cuerpo de error del backend: { "error": { "codigo": "...", "mensaje": "..." } }. */
@Serializable
data class ErrorRespuestaDto(val error: ErrorDetalleDto)

@Serializable
data class ErrorDetalleDto(
    val codigo: String,
    val mensaje: String = "",
    @SerialName("reintentar_en_s") val reintentarEnS: Int? = null,
)
