package co.edu.cue.nuclear.cliente.data.sesion

import java.io.IOException
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
                Sesion(cuerpo.idSesion, cuerpo.establecimiento.nombre, cuerpo.provisional),
            )
        }
        return mapearError(respuesta.code(), respuesta.errorBody()?.string())
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
