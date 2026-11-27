package co.edu.cue.nuclear.cliente.data.sesion

import java.io.IOException
import java.net.SocketTimeoutException
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json

class SesionRepository(
    private val api: SesionApi,
    private val json: Json = Json { ignoreUnknownKeys = true },
) {
    /**
     * Valida el token del QR. El formato se comprueba localmente (sin red) y la existencia/estado
     * de la sesión los decide el backend.
     */
    suspend fun validar(token: String?): ResultadoAcceso {
        if (!TokenQr.esValido(token)) return ResultadoAcceso.Rechazado(MotivoRechazo.TOKEN_INVALIDO)
        val respuesta = try {
            api.obtener(token!!)
        } catch (_: IOException) {
            return ResultadoAcceso.ErrorConexion
        } catch (_: SerializationException) {
            return ResultadoAcceso.ErrorServidor
        }

        if (respuesta.isSuccessful) {
            val cuerpo = respuesta.body() ?: return ResultadoAcceso.ErrorServidor
            return ResultadoAcceso.Valido(
                Sesion(cuerpo.idSesion, cuerpo.establecimiento.nombre, cuerpo.provisional, cuerpo.establecimiento.idEstablecimiento),
            )
        }
        return mapearError(respuesta.code(), respuesta.errorBody()?.string())
    }

    /** Resuelve un código numérico de 6 dígitos al token QR vigente de la misma sesión. */
    suspend fun resolverCodigo(codigo: String, dispositivoId: String? = null): ResultadoCodigo {
        if (!CodigoAcceso.esValido(codigo)) return ResultadoCodigo.NoDisponible
        val respuesta = try {
            api.resolverCodigo(CodigoAccesoPeticionDto(codigo), dispositivoId)
        } catch (_: SocketTimeoutException) {
            return ResultadoCodigo.TiempoAgotado
        } catch (_: IOException) {
            return ResultadoCodigo.ErrorConexion
        } catch (_: SerializationException) {
            return ResultadoCodigo.ErrorServidor
        }

        if (respuesta.isSuccessful) {
            val cuerpo = respuesta.body() ?: return ResultadoCodigo.ErrorServidor
            if (!TokenQr.esValido(cuerpo.qrToken)) return ResultadoCodigo.ErrorServidor
            return ResultadoCodigo.Valido(cuerpo.qrToken)
        }

        val status = respuesta.code()
        val cuerpoError = respuesta.errorBody()?.string()
        val detalle = cuerpoError?.let {
            runCatching { json.decodeFromString<ErrorRespuestaDto>(it).error }.getOrNull()
        }
        return when (status) {
            400, 404 -> ResultadoCodigo.NoDisponible
            429 -> {
                val retryHeader = respuesta.headers()["Retry-After"]?.toIntOrNull()
                ResultadoCodigo.DemasiadosIntentos(retryHeader ?: detalle?.reintentarEnS)
            }
            else -> ResultadoCodigo.ErrorServidor
        }
    }

    private fun mapearError(status: Int, cuerpo: String?): ResultadoAcceso {
        if (status !in STATUS_RECHAZO) return ResultadoAcceso.ErrorServidor
        val codigo = cuerpo?.let {
            runCatching { json.decodeFromString<ErrorRespuestaDto>(it).error.codigo }.getOrNull()
        }
        val motivo = MotivoRechazo.desdeCodigo(codigo) ?: return ResultadoAcceso.ErrorServidor
        return ResultadoAcceso.Rechazado(motivo)
    }

    private companion object {
        val STATUS_RECHAZO = setOf(400, 404, 410)
    }
}
