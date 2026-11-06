package co.edu.cue.nuclear.cliente.data.busqueda

import co.edu.cue.nuclear.cliente.data.sesion.ErrorRespuestaDto
import java.io.IOException
import java.util.concurrent.ConcurrentHashMap
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json
import retrofit2.Response

/**
 * Búsqueda y autocompletado a través del backend (B03, B04, B05, B16).
 *
 * Caché en memoria con vencimiento: `search.list` tiene un cupo propio de 100 llamadas al día (1 unidad por
 * llamada), así que no se repite una consulta reciente. Los errores no se cachean.
 */
class BusquedaRepository(
    private val api: BusquedaApi,
    private val ahora: () -> Long = System::currentTimeMillis,
    private val ttlMs: Long = TTL_POR_DEFECTO_MS,
    private val json: Json = Json { ignoreUnknownKeys = true },
) {
    private class Entrada<T>(val guardadoEn: Long, val valor: T)

    private val cacheBusquedas = ConcurrentHashMap<String, Entrada<List<Cancion>>>()
    private val cacheSugerencias = ConcurrentHashMap<String, Entrada<List<String>>>()
    private val cancionesPorId = ConcurrentHashMap<String, Cancion>()

    suspend fun buscar(consulta: String): ResultadoBusqueda {
        val q = consulta.trim()
        cacheBusquedas.vigente(q)?.let { return ResultadoBusqueda.Exito(it, desdeCache = true) }

        return when (val r = llamar { api.buscar(q) }) {
            is Llamada.Fallo -> ResultadoBusqueda.Error(r.tipo)
            is Llamada.Cuerpo -> {
                val canciones = r.valor.resultados.map { it.aDominio() }
                cacheBusquedas[q.clave()] = Entrada(ahora(), canciones)
                canciones.forEach { cancionesPorId[it.youtubeVideoId] = it }
                ResultadoBusqueda.Exito(canciones)
            }
        }
    }

    suspend fun sugerir(consulta: String): ResultadoSugerencias {
        val q = consulta.trim()
        cacheSugerencias.vigente(q)?.let { return ResultadoSugerencias.Exito(it) }

        return when (val r = llamar { api.sugerencias(q) }) {
            is Llamada.Fallo -> ResultadoSugerencias.Error(r.tipo)
            is Llamada.Cuerpo -> {
                cacheSugerencias[q.clave()] = Entrada(ahora(), r.valor.sugerencias)
                ResultadoSugerencias.Exito(r.valor.sugerencias)
            }
        }
    }

    /** Canción vista en algún resultado de esta sesión de la app (para la pantalla de detalle). */
    fun cancionPorId(youtubeVideoId: String): Cancion? = cancionesPorId[youtubeVideoId]

    private fun String.clave() = lowercase()

    private fun <T> ConcurrentHashMap<String, Entrada<T>>.vigente(q: String): T? {
        val entrada = this[q.clave()] ?: return null
        return if (ahora() - entrada.guardadoEn < ttlMs) entrada.valor else null
    }

    private sealed interface Llamada<out T> {
        data class Cuerpo<T>(val valor: T) : Llamada<T>
        data class Fallo(val tipo: TipoErrorBusqueda) : Llamada<Nothing>
    }

    private suspend fun <T> llamar(peticion: suspend () -> Response<T>): Llamada<T> {
        val respuesta = try {
            peticion()
        } catch (_: IOException) {
            return Llamada.Fallo(TipoErrorBusqueda.CONEXION)
        } catch (_: SerializationException) {
            return Llamada.Fallo(TipoErrorBusqueda.SERVIDOR)
        }
        if (respuesta.isSuccessful) {
            val cuerpo = respuesta.body() ?: return Llamada.Fallo(TipoErrorBusqueda.SERVIDOR)
            return Llamada.Cuerpo(cuerpo)
        }
        return Llamada.Fallo(clasificar(respuesta.code(), respuesta.errorBody()?.string()))
    }

    /** Traduce `error.codigo` del backend; si no se puede leer, decide por el código HTTP. */
    private fun clasificar(status: Int, cuerpo: String?): TipoErrorBusqueda {
        val codigo = cuerpo?.let {
            runCatching { json.decodeFromString<ErrorRespuestaDto>(it).error.codigo }.getOrNull()
        }
        return when (codigo) {
            "cuota_excedida" -> TipoErrorBusqueda.CUOTA
            "sin_api_key", "api_key_invalida", "youtube_no_autorizado" -> TipoErrorBusqueda.SERVICIO_NO_DISPONIBLE
            "consulta_invalida" -> TipoErrorBusqueda.CONSULTA_INVALIDA
            else -> if (status == 400) TipoErrorBusqueda.CONSULTA_INVALIDA else TipoErrorBusqueda.SERVIDOR
        }
    }

    companion object {
        const val TTL_POR_DEFECTO_MS = 5 * 60 * 1000L
    }
}
