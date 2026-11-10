package co.edu.cue.nuclear.cliente.data.cola

import co.edu.cue.nuclear.cliente.data.busqueda.Cancion
import co.edu.cue.nuclear.cliente.data.sesion.SesionActivaStore
import java.io.IOException
import java.net.ConnectException
import java.net.NoRouteToHostException
import java.net.SocketTimeoutException
import java.net.UnknownHostException
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.intOrNull
import retrofit2.Response

/**
 * Cola, solicitud y voto contra el backend real (contrato: docs/entregable-4/contrato-api-e4.md).
 *
 * - La ruta usa el `id_sesion` de [SesionActivaStore]; el UUID viaja en `X-Dispositivo-Id` (`InterceptorDispositivo`).
 * - Sin sesión activa no se llama a la red: se informa [TipoErrorCola.SESION_NO_DISPONIBLE].
 * - No aplica reglas: el servidor decide intervalo, duplicados y orden; aquí solo se traducen sus respuestas.
 * - Nunca reintenta por su cuenta. Si una operación termina sin respuesta (timeout) devuelve
 *   [TipoErrorCola.SIN_CONFIRMAR] y quien llama debe consultar la cola antes de repetir.
 */
class ColaRepositoryReal(
    private val api: ColaApi,
    private val sesionActiva: SesionActivaStore,
    private val json: Json = Json { ignoreUnknownKeys = true },
) : ColaRepository {

    override suspend fun obtenerCola(): ResultadoCola {
        val sesion = sesionActiva.actual ?: return ResultadoCola.Error(TipoErrorCola.SESION_NO_DISPONIBLE)
        return when (val r = llamar(esOperacion = false) { api.obtenerCola(sesion.idSesion) }) {
            is Llamada.Fallo -> ResultadoCola.Error(r.error)
            is Llamada.Rechazo -> ResultadoCola.Error(TipoErrorCola.SERVIDOR) // la cola no tiene rechazos de negocio
            is Llamada.Cuerpo -> r.convertir { it.aDominio() }?.let { ResultadoCola.Exito(it) }
                ?: ResultadoCola.Error(TipoErrorCola.SERVIDOR)
        }
    }

    override suspend fun solicitar(cancion: Cancion): ResultadoSolicitud {
        val sesion = sesionActiva.actual ?: return ResultadoSolicitud.Error(TipoErrorCola.SESION_NO_DISPONIBLE)
        return when (val r = llamar(esOperacion = true) { api.solicitar(sesion.idSesion, SolicitudPeticionDto(cancion.youtubeVideoId)) }) {
            is Llamada.Fallo -> ResultadoSolicitud.Error(r.error)
            is Llamada.Rechazo -> ResultadoSolicitud.Rechazada(r.motivo, r.faltantes)
            is Llamada.Cuerpo -> r.convertir { it.aDominio() } ?: ResultadoSolicitud.Error(TipoErrorCola.SERVIDOR)
        }
    }

    override suspend fun votar(idSolicitud: String): ResultadoVoto {
        val sesion = sesionActiva.actual ?: return ResultadoVoto.Error(TipoErrorCola.SESION_NO_DISPONIBLE)
        return when (val r = llamar(esOperacion = true) { api.votar(sesion.idSesion, idSolicitud) }) {
            is Llamada.Fallo -> ResultadoVoto.Error(r.error)
            is Llamada.Rechazo -> ResultadoVoto.Rechazado(r.motivo, r.faltantes)
            is Llamada.Cuerpo -> r.convertir { it.aDominio() } ?: ResultadoVoto.Error(TipoErrorCola.SERVIDOR)
        }
    }

    // ---------------------------------------------------------------- llamada y traducción de errores

    private sealed interface Llamada<out T> {
        data class Cuerpo<T>(val valor: T) : Llamada<T>
        data class Rechazo(val motivo: MotivoRechazoOperacion, val faltantes: Int?) : Llamada<Nothing>
        data class Fallo(val error: TipoErrorCola) : Llamada<Nothing>
    }

    /** Traduce el DTO al modelo; `null` si el servidor no cumplió el contrato (estado desconocido, fecha ilegible). */
    private inline fun <T, R> Llamada.Cuerpo<T>.convertir(transformar: (T) -> R): R? =
        try {
            transformar(valor)
        } catch (_: RespuestaInesperadaException) {
            null
        }

    private suspend fun <T> llamar(esOperacion: Boolean, peticion: suspend () -> Response<T>): Llamada<T> {
        val respuesta = try {
            peticion()
        } catch (e: IOException) {
            // En solicitar y votar, un corte DESPUÉS de enviar la petición no dice si el servidor la registró.
            return Llamada.Fallo(if (esOperacion && !e.noLlegoAlServidor()) TipoErrorCola.SIN_CONFIRMAR else TipoErrorCola.CONEXION)
        } catch (_: SerializationException) {
            return Llamada.Fallo(TipoErrorCola.SERVIDOR)
        }
        if (respuesta.isSuccessful) {
            val cuerpo = respuesta.body() ?: return Llamada.Fallo(TipoErrorCola.SERVIDOR)
            return Llamada.Cuerpo(cuerpo)
        }
        return traducirError(respuesta.code(), respuesta.errorBody()?.string())
    }

    /** Falló antes de que la petición saliera (no hay red, host inalcanzable, no se pudo abrir la conexión). */
    private fun IOException.noLlegoAlServidor(): Boolean =
        this is ConnectException || this is UnknownHostException || this is NoRouteToHostException ||
            (this is SocketTimeoutException && message?.contains("connect", ignoreCase = true) == true)

    /** Tabla de errores del contrato (sección 8). Se decide por `error.codigo`, no por el mensaje. */
    private fun traducirError(status: Int, cuerpo: String?): Llamada<Nothing> {
        val error = cuerpo?.let { runCatching { json.decodeFromString<ErrorColaRespuestaDto>(it).error }.getOrNull() }
        val faltantes = (error?.detalle?.get("canciones_restantes") as? JsonPrimitive)?.intOrNull
        return when (error?.codigo) {
            "intervalo_no_cumplido" -> Llamada.Rechazo(MotivoRechazoOperacion.INTERVALO_NO_CUMPLIDO, faltantes)
            "voto_duplicado" -> Llamada.Rechazo(MotivoRechazoOperacion.VOTO_DUPLICADO, null)
            "solicitud_no_votable" -> Llamada.Rechazo(MotivoRechazoOperacion.SOLICITUD_NO_VOTABLE, null)
            "cancion_no_permitida", "cancion_inexistente" -> Llamada.Rechazo(MotivoRechazoOperacion.CANCION_NO_DISPONIBLE, null)
            "sesion_inexistente", "sesion_cerrada", "qr_desactivado" -> Llamada.Fallo(TipoErrorCola.SESION_NO_DISPONIBLE)
            // Errores de formato o de programación (400) y solicitud inexistente: no son decisiones de negocio para el cliente.
            "dispositivo_id_invalido", "cancion_invalida", "solicitud_inexistente" -> Llamada.Fallo(TipoErrorCola.SERVIDOR)
            // 502/503: códigos de YouTube del E3 (cuota_excedida, youtube_no_disponible, sin_api_key…).
            else -> Llamada.Fallo(if (status == 502 || status == 503) TipoErrorCola.SERVICIO_NO_DISPONIBLE else TipoErrorCola.SERVIDOR)
        }
    }
}
