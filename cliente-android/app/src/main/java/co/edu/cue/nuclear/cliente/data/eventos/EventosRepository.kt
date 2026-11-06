package co.edu.cue.nuclear.cliente.data.eventos

import java.io.IOException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * Envía los eventos de E3 al backend (POST /api/eventos), sin bloquear la interfaz.
 *
 * Es "mejor esfuerzo": un intento por evento, sin reintentos ni cola persistente. Si no hay red
 * el evento se pierde. Para E3 se acepta esa limitación; la entrega confiable es parte del pipeline
 * de datos (Entregable 6). Nunca lanza excepciones hacia la interfaz.
 */
class EventosRepository(
    private val api: EventosApi,
    private val alcance: CoroutineScope,
) : RegistradorEventos {

    override fun registrar(evento: Evento) {
        alcance.launch { enviar(evento) }
    }

    /** @return true si el servidor aceptó el evento (HTTP 2xx). */
    suspend fun enviar(evento: Evento): Boolean = try {
        api.enviar(aJson(evento)).isSuccessful
    } catch (_: IOException) {
        false
    } catch (_: SerializationException) {
        false
    }

    internal companion object {
        /** Cuerpo exacto que espera el backend (backend/src/eventos.js, validarEvento). */
        fun aJson(evento: Evento): JsonObject = buildJsonObject {
            when (evento) {
                is Evento.DispositivoUnido -> {
                    put("tipo", "dispositivo_unido")
                    put("sesion_id", evento.sesionId)
                    put("dispositivo_id", evento.dispositivoId)
                    put("datos", buildJsonObject { put("recurrente", evento.recurrente) })
                }
                is Evento.BusquedaRealizada -> {
                    put("tipo", "busqueda_realizada")
                    put("sesion_id", evento.sesionId)
                    put("dispositivo_id", evento.dispositivoId)
                    put(
                        "datos",
                        buildJsonObject {
                            put("termino", evento.termino)
                            put("cantidad_resultados", evento.cantidadResultados)
                            put("desde_cache", evento.desdeCache)
                        },
                    )
                }
            }
        }
    }
}
