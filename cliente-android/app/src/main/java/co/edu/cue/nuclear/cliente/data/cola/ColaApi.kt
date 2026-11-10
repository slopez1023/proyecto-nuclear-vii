package co.edu.cue.nuclear.cliente.data.cola

import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path

/**
 * Endpoints del E4 confirmados en docs/entregable-4/contrato-api-e4.md. Las rutas usan el `id_sesion`
 * (nunca el token del QR). La cabecera `X-Dispositivo-Id` la añade `InterceptorDispositivo`.
 */
interface ColaApi {
    @GET("api/sesiones/{idSesion}/cola")
    suspend fun obtenerCola(@Path("idSesion") idSesion: String): Response<EstadoColaDto>

    @POST("api/sesiones/{idSesion}/solicitudes")
    suspend fun solicitar(
        @Path("idSesion") idSesion: String,
        @Body cuerpo: SolicitudPeticionDto,
    ): Response<SolicitudRespuestaDto>

    /** Sin cuerpo. */
    @POST("api/sesiones/{idSesion}/solicitudes/{idSolicitud}/votos")
    suspend fun votar(
        @Path("idSesion") idSesion: String,
        @Path("idSolicitud") idSolicitud: String,
    ): Response<VotoRespuestaDto>
}
