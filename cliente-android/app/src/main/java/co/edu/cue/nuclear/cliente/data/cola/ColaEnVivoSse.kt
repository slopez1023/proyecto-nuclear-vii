package co.edu.cue.nuclear.cliente.data.cola

import co.edu.cue.nuclear.cliente.data.InterceptorDispositivo
import co.edu.cue.nuclear.cliente.data.sesion.SesionActiva
import co.edu.cue.nuclear.cliente.data.sesion.SesionActivaStore
import java.io.IOException
import java.util.concurrent.TimeUnit
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.channels.ProducerScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.delay
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.channelFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json
import okhttp3.Call
import okhttp3.Callback
import okhttp3.HttpUrl
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response

/**
 * Flujo SSE de la cola (contrato: `GET /api/sesiones/{idSesion}/cola/flujo`, docs/entregable-4/contrato-api-e4.md §9).
 *
 * - Usa su PROPIO cliente OkHttp ([crearClienteSse]): lectura de 30 s (el servidor manda `: ping` cada 10 s), sin el
 *   límite de 15 s del cliente de Retrofit.
 * - Lleva `Accept: text/event-stream` y `X-Dispositivo-Id` (el UUID de la sesión activa). Con la cabecera, el
 *   dispositivo cuenta como activo para el servidor mientras el flujo está abierto.
 * - Mensajes: `event: estado` (su `data` es el MISMO JSON que `GET /cola`) y `event: sesion_cerrada` (la sesión terminó:
 *   se termina sin reconectar). Cualquier otro tipo se ignora.
 * - Errores previos al flujo (JSON normal): 404/410 de sesión → [EventoFlujo.Terminado] con `SESION_NO_DISPONIBLE`;
 *   otros 4xx → `Terminado(SERVIDOR)`; 5xx o corte de red → reintenta.
 * - Reconecta tras [EventoFlujo.Reconectando] esperando lo que dijo el servidor en `retry:` (3 s por defecto).
 *   El servidor ignora `Last-Event-ID` y manda el estado completo al conectar, así que no hace falta pedir nada más.
 * - No se usa `okhttp-sse`: no se pudo descargar en el equipo de desarrollo (error de certificado) y esta lectura
 *   permite además obtener el `retry:` real. Se puede sustituir sin tocar a quien consume [ColaEnVivo].
 *
 * Cancelar la colección cancela la llamada HTTP y cierra el socket.
 */
class ColaEnVivoSse(
    private val cliente: OkHttpClient,
    private val baseUrl: HttpUrl,
    private val sesionActiva: SesionActivaStore,
    private val json: Json = Json { ignoreUnknownKeys = true },
    /** Espera entre reconexiones; se inyecta en las pruebas. */
    private val esperar: suspend (Long) -> Unit = { delay(it) },
) : ColaEnVivo {

    private sealed interface Fin {
        data class Reintentar(val enMs: Long) : Fin
        data class Terminar(val error: TipoErrorCola) : Fin
    }

    override fun flujo(): Flow<EventoFlujo> = channelFlow {
        var reintentoMs = RETRY_POR_DEFECTO_MS
        while (true) {
            val sesion = sesionActiva.actual
            if (sesion == null) {
                send(EventoFlujo.Terminado(TipoErrorCola.SESION_NO_DISPONIBLE))
                return@channelFlow
            }
            val fin = conectarUnaVez(sesion, reintentoMs)
            ensureActive() // si se canceló, el corte que provocó call.cancel() no es un motivo para reconectar
            when (fin) {
                is Fin.Terminar -> {
                    send(EventoFlujo.Terminado(fin.error))
                    return@channelFlow
                }
                is Fin.Reintentar -> {
                    reintentoMs = fin.enMs
                    send(EventoFlujo.Reconectando(reintentoMs))
                    esperar(reintentoMs)
                }
            }
        }
    }

    private fun urlFlujo(idSesion: String): HttpUrl = baseUrl.newBuilder()
        .addPathSegment("api").addPathSegment("sesiones").addPathSegment(idSesion)
        .addPathSegment("cola").addPathSegment("flujo")
        .build()

    /** Una conexión completa: abre, lee hasta que se corte y dice qué hacer después. */
    private suspend fun ProducerScope<EventoFlujo>.conectarUnaVez(sesion: SesionActiva, reintentoActualMs: Long): Fin {
        val peticion = Request.Builder()
            .url(urlFlujo(sesion.idSesion))
            .header("Accept", "text/event-stream")
            .header("Cache-Control", "no-cache")
            .header(InterceptorDispositivo.CABECERA, sesion.dispositivoId)
            .build()
        val llamada = cliente.newCall(peticion)
        val respuesta = try {
            llamada.esperarRespuesta()
        } catch (_: IOException) {
            return Fin.Reintentar(reintentoActualMs) // sin red o servidor caído
        }
        respuesta.use { r ->
            if (!r.isSuccessful) return clasificarError(r.code, runCatching { r.body?.string() }.getOrNull(), reintentoActualMs)
            if (r.body?.contentType()?.subtype != "event-stream") return Fin.Reintentar(reintentoActualMs)

            send(EventoFlujo.Conectado)
            val lector = LectorSse()
            var sesionCerrada = false
            // Cancelar la colección debe cerrar el socket: la lectura bloqueante solo termina así.
            val vigilante = launch(start = CoroutineStart.UNDISPATCHED) {
                try {
                    awaitCancellation()
                } finally {
                    llamada.cancel()
                }
            }
            try {
                withContext(Dispatchers.IO) {
                    val fuente = r.body!!.source()
                    while (true) {
                        val linea = fuente.readUtf8Line() ?: break
                        val mensaje = lector.linea(linea) ?: continue
                        when (mensaje.tipo) {
                            EVENTO_ESTADO -> estadoDe(mensaje.datos)?.let { send(EventoFlujo.Estado(it)) }
                            // El servidor avisa de que la sesión terminó (cerrada o QR desactivado) y cierra el flujo.
                            EVENTO_SESION_CERRADA -> {
                                sesionCerrada = true
                                break
                            }
                        }
                    }
                }
            } catch (_: IOException) {
                // Corte a mitad del flujo (timeout, reset): se reconecta.
            } finally {
                vigilante.cancel()
            }
            if (sesionCerrada) return Fin.Terminar(TipoErrorCola.SESION_NO_DISPONIBLE)
            return Fin.Reintentar((lector.reintentoMs ?: reintentoActualMs).coerceIn(RETRY_MIN_MS, RETRY_MAX_MS))
        }
    }

    /** `null` si el mensaje no cumple el contrato: se ignora ese mensaje sin cortar el flujo. */
    private fun estadoDe(datos: String): EstadoCola? = try {
        json.decodeFromString<EstadoColaDto>(datos).aDominio()
    } catch (_: SerializationException) {
        null
    } catch (_: RespuestaInesperadaException) {
        null
    }

    private fun clasificarError(status: Int, cuerpo: String?, reintentoMs: Long): Fin {
        val codigo = cuerpo?.let { runCatching { json.decodeFromString<ErrorColaRespuestaDto>(it).error.codigo }.getOrNull() }
        return when {
            codigo in CODIGOS_SESION -> Fin.Terminar(TipoErrorCola.SESION_NO_DISPONIBLE)
            status in 400..499 -> Fin.Terminar(TipoErrorCola.SERVIDOR) // reconectar no lo arregla
            else -> Fin.Reintentar(reintentoMs)
        }
    }

    private suspend fun Call.esperarRespuesta(): Response = suspendCancellableCoroutine { continuacion ->
        enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) = continuacion.resumeWithException(e)
            override fun onResponse(call: Call, response: Response) = continuacion.resume(response) { _, _, _ -> response.close() }
        })
        continuacion.invokeOnCancellation { cancel() }
    }

    companion object {
        const val EVENTO_ESTADO = "estado"
        const val EVENTO_SESION_CERRADA = "sesion_cerrada"
        const val RETRY_POR_DEFECTO_MS = 3_000L
        private const val RETRY_MIN_MS = 250L
        private const val RETRY_MAX_MS = 30_000L
        private val CODIGOS_SESION = setOf("sesion_inexistente", "sesion_cerrada", "qr_desactivado")

        /** Cliente aparte del de Retrofit: lectura de 30 s (> los 10 s entre pings del servidor), sin interceptores. */
        fun crearClienteSse(): OkHttpClient = OkHttpClient.Builder()
            .connectTimeout(10, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .build()
    }
}
